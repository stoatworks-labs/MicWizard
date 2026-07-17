import net from 'node:net'
import os from 'node:os'
import { EventEmitter } from 'node:events'
import type { DeviceRegistry } from '../deviceRegistry'
import type { DeviceChannel } from '../../shared/types'

/**
 * Shure's "Command Strings" protocol: a plaintext ASCII protocol over TCP
 * port 2202, documented per-product by Shure (e.g. "ULXD Command Strings",
 * "Axient Digital Command Strings" - PDFs on shure.com support pages, not
 * an HTTP API). Framing and the metering keys below (BATT_CHARGE, RF_LVL,
 * AUDIO_LVL, ANTENNA) match that documented format across ULX-D/QLX-D/
 * Axient Digital. NOT yet tested against real hardware in this project -
 * verify against your specific receiver's command-strings PDF before
 * relying on this. See docs/protocols.md.
 *
 * Shure receivers don't advertise via mDNS in a documented way, so
 * discovery here is a TCP connect-scan of the local /24 on port 2202,
 * confirmed by a real protocol handshake (GET ALL must get a REP back).
 * This only covers one local subnet: fine for a single-room rack, not for
 * multi-subnet venues.
 */
const SHURE_COMMAND_PORT = 2202
const CONNECT_TIMEOUT_MS = 300
const SCAN_CONCURRENCY = 32

export interface ShureDiscoveryHandle {
  stop: () => void
}

export function startShureDiscovery(registry: DeviceRegistry): ShureDiscoveryHandle {
  let stopped = false
  const activeClients = new Map<string, ShureDeviceClient>()

  const scan = async () => {
    const hosts = localSubnetHosts()
    for (let i = 0; i < hosts.length && !stopped; i += SCAN_CONCURRENCY) {
      const batch = hosts.slice(i, i + SCAN_CONCURRENCY)
      await Promise.all(
        batch.map(async (host) => {
          if (activeClients.has(host)) return
          const reachable = await probe(host)
          if (!reachable || stopped) return
          const client = new ShureDeviceClient(host, registry)
          // Without this, a device that drops for any reason (reboot, a
          // brief network blip) stays permanently un-monitored: the stale
          // Map entry would block every future rescan from ever retrying
          // this host, even once it's reachable again.
          client.once('disconnected', () => activeClients.delete(host))
          activeClients.set(host, client)
          client.start()
        })
      )
    }
  }

  scan()
  const rescanTimer = setInterval(scan, 60_000)

  return {
    stop: () => {
      stopped = true
      clearInterval(rescanTimer)
      for (const client of activeClients.values()) client.stop()
    }
  }
}

function localSubnetHosts(): string[] {
  const interfaces = os.networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      const prefix = entry.address.split('.').slice(0, 3).join('.')
      return Array.from({ length: 253 }, (_, i) => `${prefix}.${i + 1}`)
    }
  }
  return []
}

function probe(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: SHURE_COMMAND_PORT, timeout: CONNECT_TIMEOUT_MS })
    socket.once('connect', () => {
      socket.end()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(false))
  })
}

class ShureDeviceClient extends EventEmitter {
  private socket: net.Socket | null = null
  private buffer = ''
  private disconnected = false

  constructor(private readonly host: string, private readonly registry: DeviceRegistry) {
    super()
  }

  start(): void {
    const socket = net.createConnection({ host: this.host, port: SHURE_COMMAND_PORT })
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => this.handleData(chunk))
    socket.on('error', () => this.handleDisconnect())
    socket.on('close', () => this.handleDisconnect())
    socket.on('connect', () => {
      // Ask for full state, then subscribe to periodic samples (documented
      // Shure command; period is in ms, 500ms is a conservative default).
      socket.write('< GET 1 ALL >')
      socket.write('< SET 1 METER_RATE 00500 >')
    })
    this.socket = socket
  }

  stop(): void {
    this.socket?.end()
    this.socket = null
  }

  private get deviceId(): string {
    return `shure:${this.host}`
  }

  /** Fires once on error OR close, whichever comes first - see the comment at the call site in startShureDiscovery */
  private handleDisconnect(): void {
    if (this.disconnected) return
    this.disconnected = true
    this.registry.remove(this.deviceId)
    this.emit('disconnected')
  }

  private handleData(chunk: string): void {
    this.buffer += chunk
    for (;;) {
      const start = this.buffer.indexOf('<')
      if (start === -1) {
        this.buffer = '' // no message start pending - drop any stray leading garbage
        return
      }
      // Search for '>' from `start`, not from the top of the buffer: a
      // stray '>' earlier than the first '<' would otherwise make `end`
      // land before `start` and stall parsing forever on that leftover byte.
      const end = this.buffer.indexOf('>', start)
      if (end === -1) return // incomplete message, wait for more data
      this.handleMessage(this.buffer.slice(start + 1, end).trim())
      this.buffer = this.buffer.slice(end + 1)
    }
  }

  private handleMessage(message: string): void {
    // e.g. "REP 1 BATT_CHARGE 087" or "SAMPLE 1 RF_LVL_A 072 RF_LVL_B 065 AUDIO_LVL 054"
    const parts = message.split(/\s+/)
    const [kind, channelNum, ...rest] = parts
    if (kind !== 'REP' && kind !== 'SAMPLE') return

    const fields = new Map<string, string>()
    for (let i = 0; i < rest.length - 1; i += 2) {
      fields.set(rest[i], rest[i + 1])
    }

    const channel: DeviceChannel = {
      id: `${this.deviceId}:${channelNum}`,
      name: fields.get('CHAN_NAME') ?? `Channel ${channelNum}`,
      rfLevel: parseNumber(fields.get('RF_LVL_A') ?? fields.get('RF_LVL')),
      audioLevelDb: parseShureAudioLevel(fields.get('AUDIO_LVL')),
      batteryPercent: parseNumber(fields.get('BATT_CHARGE')),
      batteryMinutesRemaining: parseNumber(fields.get('BATT_RUN_TIME')),
      antenna: parseAntenna(fields.get('ANTENNA'))
    }

    const existing = this.registry.get(this.deviceId)
    const channels = existing?.channels.filter((c) => c.id !== channel.id) ?? []
    channels.push(channel)

    this.registry.upsert({
      id: this.deviceId,
      vendor: 'shure',
      name: `Shure receiver (${this.host})`,
      address: this.host,
      port: SHURE_COMMAND_PORT,
      transport: 'none',
      identified: true,
      channels
    })
  }
}

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** Shure reports AUDIO_LVL as a 0-100+ code, not literal dBFS - this is an approximation pending real-hardware calibration */
function parseShureAudioLevel(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return value - 100
}

function parseAntenna(raw: string | undefined): DeviceChannel['antenna'] {
  if (raw === 'A') return 'A'
  if (raw === 'B') return 'B'
  if (raw === 'DIVERSITY') return 'diversity'
  return null
}
