import type { DeviceChannel } from '../../shared/types'

/**
 * Pure parsing for Shure's Command Strings protocol, split out from
 * shure.ts's socket-handling class so it's directly unit-testable (see
 * test/shureProtocol.test.ts) without spinning up a real TCP connection.
 */

/**
 * Splits a growing TCP buffer into complete `< ... >`-framed messages.
 * Searches for '>' starting from the found '<', not from the top of the
 * buffer - a stray '>' earlier than the first '<' would otherwise make the
 * closing index land before the opening one and stall parsing forever on
 * that leftover byte (a real bug this project shipped and fixed once).
 * If no '<' is pending, any stray leading bytes are dropped rather than
 * left to grow the buffer unbounded.
 */
export function extractFramedMessages(buffer: string): { messages: string[]; remainder: string } {
  const messages: string[] = []
  let remaining = buffer
  for (;;) {
    const start = remaining.indexOf('<')
    if (start === -1) {
      return { messages, remainder: '' }
    }
    const end = remaining.indexOf('>', start)
    if (end === -1) {
      return { messages, remainder: remaining.slice(start) }
    }
    messages.push(remaining.slice(start + 1, end).trim())
    remaining = remaining.slice(end + 1)
  }
}

export interface ParsedShureMessage {
  channelNum: string
  channel: DeviceChannel
}

/** Parses one already-unframed message body, e.g. "REP 1 BATT_CHARGE 087" or "SAMPLE 1 RF_LVL_A 072 AUDIO_LVL 054" */
export function parseShureMessage(message: string, deviceId: string): ParsedShureMessage | null {
  const parts = message.split(/\s+/)
  const [kind, channelNum, ...rest] = parts
  if (kind !== 'REP' && kind !== 'SAMPLE') return null
  if (!channelNum) return null

  const fields = new Map<string, string>()
  for (let i = 0; i < rest.length - 1; i += 2) {
    fields.set(rest[i], rest[i + 1])
  }

  const channel: DeviceChannel = {
    id: `${deviceId}:${channelNum}`,
    name: fields.get('CHAN_NAME') ?? `Channel ${channelNum}`,
    rfLevel: parseNumber(fields.get('RF_LVL_A') ?? fields.get('RF_LVL')),
    audioLevelDb: parseShureAudioLevel(fields.get('AUDIO_LVL')),
    batteryPercent: parseNumber(fields.get('BATT_CHARGE')),
    batteryMinutesRemaining: parseNumber(fields.get('BATT_RUN_TIME')),
    antenna: parseAntenna(fields.get('ANTENNA'))
  }

  return { channelNum, channel }
}

export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** Shure reports AUDIO_LVL as a 0-100+ code, not literal dBFS - this is an approximation pending real-hardware calibration */
export function parseShureAudioLevel(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return value - 100
}

export function parseAntenna(raw: string | undefined): DeviceChannel['antenna'] {
  if (raw === 'A') return 'A'
  if (raw === 'B') return 'B'
  if (raw === 'DIVERSITY') return 'diversity'
  return null
}
