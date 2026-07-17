import net from 'node:net'
import type { DeviceRegistry } from '../deviceRegistry'
import type { DeviceChannel } from '../../shared/types'

/**
 * UNVERIFIED SKELETON - more uncertain than the Shure adapter.
 *
 * Sennheiser's newer digital wireless (EW-DX, Digital 6000/9000) exposes
 * "SSC" (Sennheiser Control Protocol): newline-delimited JSON over TCP
 * port 45, where the JSON's own nested keys act as an address path (e.g.
 * `{"osc":{"rx":{"1":{"audio":{"out1":{"level":null}}}}}}` reads that
 * path, non-null values set it). This project's mDNS module already
 * browses `_ssc._tcp` for discovery. What's genuinely unverified here:
 *  - The exact path names for battery/RF/audio metering per product line
 *    (they differ between EW-DX and Digital 6000, and Sennheiser's public
 *    SSC docs require a developer-portal registration this project hasn't
 *    done) - the paths below are best-effort guesses from public SSC
 *    examples, not confirmed against a real receiver.
 *  - Whether metering needs an explicit subscribe message or streams once
 *    a path is read.
 * Treat this file as a starting point to correct against a real device's
 * SSC traffic (capture with Wireshark, same approach as Dante-BabelBox's
 * capture guides), not as working code yet.
 */
const SSC_PORT = 45

export interface SennheiserDiscoveryHandle {
  stop: () => void
}

/**
 * onDisconnected fires exactly once, on error OR close (whichever comes
 * first - the other is a no-op via the `disconnected` guard), so callers
 * tracking active connections by address (see main/index.ts) can drop
 * their reference and allow a future mDNS re-discovery to reconnect. Without
 * this, a device that drops for any reason (reboot, brief network blip)
 * would stay permanently un-monitored until the app restarts.
 */
export function connectSennheiserDevice(
  address: string,
  registry: DeviceRegistry,
  onDisconnected: () => void
): SennheiserDiscoveryHandle {
  const deviceId = `sennheiser:${address}`
  const socket = net.createConnection({ host: address, port: SSC_PORT })
  let buffer = ''
  let disconnected = false

  const handleDisconnect = (): void => {
    if (disconnected) return
    disconnected = true
    registry.remove(deviceId)
    onDisconnected()
  }

  socket.on('connect', () => {
    sendPath(socket, { osc: { rx: { 1: { identity: { name: null, product: null } } } } })
    sendPath(socket, { osc: { rx: { 1: { battery: { gauge: null, lifetime: null } } } } })
    sendPath(socket, { osc: { rx: { 1: { audio: { out1: { level: null } } } } } })
    sendPath(socket, { osc: { rx: { 1: { rf: { rsqi: null, level: null } } } } })
  })

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      handleMessage(line, deviceId, address, registry)
      newlineIndex = buffer.indexOf('\n')
    }
  })

  socket.on('error', handleDisconnect)
  socket.on('close', handleDisconnect)

  return { stop: () => socket.end() }
}

function sendPath(socket: net.Socket, path: Record<string, unknown>): void {
  socket.write(JSON.stringify(path) + '\n')
}

function handleMessage(line: string, deviceId: string, address: string, registry: DeviceRegistry): void {
  if (!line.trim()) return
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return
  }

  const rx1 = dig(parsed, ['osc', 'rx', '1'])
  if (!rx1 || typeof rx1 !== 'object') return

  const channel: DeviceChannel = {
    id: `${deviceId}:1`,
    name: String(dig(rx1, ['identity', 'name']) ?? 'Sennheiser RX'),
    rfLevel: numeric(dig(rx1, ['rf', 'level'])),
    audioLevelDb: numeric(dig(rx1, ['audio', 'out1', 'level'])),
    batteryPercent: numeric(dig(rx1, ['battery', 'gauge'])),
    batteryMinutesRemaining: numeric(dig(rx1, ['battery', 'lifetime'])),
    antenna: null
  }

  const existing = registry.get(deviceId)
  const channels = existing?.channels.filter((c) => c.id !== channel.id) ?? []
  channels.push(channel)

  registry.upsert({
    id: deviceId,
    vendor: 'sennheiser',
    model: String(dig(rx1, ['identity', 'product']) ?? '') || null,
    name: channel.name,
    address,
    port: SSC_PORT,
    transport: 'none',
    identified: true,
    channels
  })
}

function dig(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}
