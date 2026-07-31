import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractFramedMessages,
  parseAntenna,
  parseNumber,
  parseShureAudioLevel,
  parseShureMessage,
  subnetHostsFor
} from '../src/main/discovery/shureProtocol.ts'

test('extractFramedMessages: parses a single complete message', () => {
  const { messages, remainder } = extractFramedMessages('< REP 1 BATT_CHARGE 087 >')
  assert.deepEqual(messages, ['REP 1 BATT_CHARGE 087'])
  assert.equal(remainder, '')
})

test('extractFramedMessages: parses multiple messages arriving in one chunk', () => {
  const { messages, remainder } = extractFramedMessages('< REP 1 ALL >< SAMPLE 1 AUDIO_LVL 054 >')
  assert.deepEqual(messages, ['REP 1 ALL', 'SAMPLE 1 AUDIO_LVL 054'])
  assert.equal(remainder, '')
})

test('extractFramedMessages: holds an incomplete trailing message for the next chunk', () => {
  const { messages, remainder } = extractFramedMessages('< REP 1 ALL >< SAMPLE 1 AUDIO')
  assert.deepEqual(messages, ['REP 1 ALL'])
  assert.equal(remainder, '< SAMPLE 1 AUDIO')
})

test('extractFramedMessages: the remainder concatenates correctly with the next chunk', () => {
  const first = extractFramedMessages('< REP 1 AUDIO')
  assert.deepEqual(first.messages, [])
  assert.equal(first.remainder, '< REP 1 AUDIO')
  const second = extractFramedMessages(first.remainder + '_LVL 054 >')
  assert.deepEqual(second.messages, ['REP 1 AUDIO_LVL 054'])
})

test('extractFramedMessages: drops stray bytes with no "<" pending rather than growing forever', () => {
  const { messages, remainder } = extractFramedMessages('garbage with no brackets')
  assert.deepEqual(messages, [])
  assert.equal(remainder, '')
})

test('extractFramedMessages: a stray ">" before the first "<" does not stall parsing (regression)', () => {
  // Real bug this project shipped: searching for '>' from the top of the
  // buffer instead of from the found '<' made `end < start`, and the old
  // loop condition silently did nothing forever on buffers shaped like this.
  const { messages, remainder } = extractFramedMessages('stray>junk< REP 1 ALL >')
  assert.deepEqual(messages, ['REP 1 ALL'])
  assert.equal(remainder, '')
})

test('parseShureMessage: parses a REP message into a channel', () => {
  const parsed = parseShureMessage('REP 1 CHAN_NAME Vocal1 BATT_CHARGE 078 BATT_RUN_TIME 312', 'shure:10.0.0.5')
  assert.ok(parsed)
  assert.equal(parsed.channelNum, '1')
  assert.equal(parsed.channel.id, 'shure:10.0.0.5:1')
  assert.equal(parsed.channel.name, 'Vocal1')
  assert.equal(parsed.channel.batteryPercent, 78)
  assert.equal(parsed.channel.batteryMinutesRemaining, 312)
})

test('parseShureMessage: parses a SAMPLE message with RF and audio fields', () => {
  const parsed = parseShureMessage('SAMPLE 2 RF_LVL_A 072 AUDIO_LVL 054 ANTENNA DIVERSITY', 'shure:10.0.0.5')
  assert.ok(parsed)
  assert.equal(parsed.channel.rfLevel, 72)
  assert.equal(parsed.channel.audioLevelDb, -46) // 54 - 100
  assert.equal(parsed.channel.antenna, 'diversity')
})

test('parseShureMessage: falls back to a generated channel name when CHAN_NAME is absent', () => {
  const parsed = parseShureMessage('REP 3 BATT_CHARGE 050', 'shure:10.0.0.5')
  assert.ok(parsed)
  assert.equal(parsed.channel.name, 'Channel 3')
})

test('parseShureMessage: returns null for a message kind that is neither REP nor SAMPLE', () => {
  assert.equal(parseShureMessage('ACK 1', 'shure:10.0.0.5'), null)
})

test('parseShureMessage: returns null for an empty message', () => {
  assert.equal(parseShureMessage('', 'shure:10.0.0.5'), null)
})

test('parseShureMessage: an odd number of trailing tokens drops the unpaired one rather than crashing', () => {
  const parsed = parseShureMessage('REP 1 BATT_CHARGE 078 DANGLING', 'shure:10.0.0.5')
  assert.ok(parsed)
  assert.equal(parsed.channel.batteryPercent, 78)
})

test('parseNumber: parses numeric strings, null for undefined or non-numeric', () => {
  assert.equal(parseNumber('42'), 42)
  assert.equal(parseNumber(undefined), null)
  assert.equal(parseNumber('not-a-number'), null)
})

test('parseShureAudioLevel: shifts the 0-100+ code down by 100 to approximate dBFS', () => {
  assert.equal(parseShureAudioLevel('100'), 0)
  assert.equal(parseShureAudioLevel('54'), -46)
  assert.equal(parseShureAudioLevel(undefined), null)
})

test('parseAntenna: maps known codes, null for anything else', () => {
  assert.equal(parseAntenna('A'), 'A')
  assert.equal(parseAntenna('B'), 'B')
  assert.equal(parseAntenna('DIVERSITY'), 'diversity')
  assert.equal(parseAntenna('WEIRD'), null)
  assert.equal(parseAntenna(undefined), null)
})

test('subnetHostsFor: sweeps every attached subnet, not just the first', () => {
  // The regression this guards: taking only the first non-internal interface meant a
  // Parallels bridge (or any VPN) shadowed the real LAN and discovery found nothing.
  const hosts = subnetHostsFor([
    { family: 'IPv4', address: '10.211.55.2', netmask: '255.255.255.0', internal: false },
    { family: 'IPv4', address: '192.168.1.90', netmask: '255.255.255.0', internal: false }
  ])
  assert.equal(hosts.length, 253 * 2)
  assert.ok(hosts.includes('10.211.55.1'))
  assert.ok(hosts.includes('192.168.1.90'))
  assert.ok(hosts.includes('192.168.1.253'))
})

test('subnetHostsFor: skips loopback, IPv6 and point-to-point interfaces', () => {
  const hosts = subnetHostsFor([
    { family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', internal: true },
    { family: 'IPv6', address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', internal: false },
    // A VPN tunnel: a /32 has no neighbours to sweep.
    { family: 'IPv4', address: '100.111.187.92', netmask: '255.255.255.255', internal: false }
  ])
  assert.deepEqual(hosts, [])
})

test('subnetHostsFor: does not scan the same /24 twice when two interfaces share it', () => {
  const hosts = subnetHostsFor([
    { family: 'IPv4', address: '192.168.1.90', netmask: '255.255.255.0', internal: false },
    { family: 'IPv4', address: '192.168.1.91', netmask: '255.255.255.0', internal: false }
  ])
  assert.equal(hosts.length, 253)
})

test('parseShureMessage: a SAMPLE keeps fields it does not mention (regression)', () => {
  // A receiver answers GET ALL with everything, but its periodic SAMPLE carries only
  // the metered fields. Rebuilding the channel from the SAMPLE alone used to blank the
  // name back to "Channel 1" and drop the battery twice a second.
  const full = parseShureMessage(
    'REP 1 CHAN_NAME Lectern BATT_CHARGE 018 BATT_RUN_TIME 046 RF_LVL_A 055 ANTENNA B AUDIO_LVL 054',
    'shure:10.0.0.5'
  )
  assert.ok(full)

  const sampled = parseShureMessage('SAMPLE 1 RF_LVL_A 072 AUDIO_LVL 090', 'shure:10.0.0.5', full.channel)
  assert.ok(sampled)
  assert.equal(sampled.channel.name, 'Lectern')
  assert.equal(sampled.channel.batteryPercent, 18)
  assert.equal(sampled.channel.batteryMinutesRemaining, 46)
  assert.equal(sampled.channel.antenna, 'B')
  // ...while the metered fields in the message do update.
  assert.equal(sampled.channel.rfLevel, 72)
  assert.equal(sampled.channel.audioLevelDb, -10)
})

test('parseShureMessage: a field present in the message wins over what was known', () => {
  const known = parseShureMessage('REP 1 CHAN_NAME Old BATT_CHARGE 090', 'shure:10.0.0.5')
  const next = parseShureMessage('REP 1 CHAN_NAME New BATT_CHARGE 012', 'shure:10.0.0.5', known!.channel)
  assert.equal(next!.channel.name, 'New')
  assert.equal(next!.channel.batteryPercent, 12)
})

test('parseShureMessage: with nothing known, absent fields are still null', () => {
  const parsed = parseShureMessage('SAMPLE 2 AUDIO_LVL 054', 'shure:10.0.0.5')
  assert.ok(parsed)
  assert.equal(parsed.channel.name, 'Channel 2')
  assert.equal(parsed.channel.batteryPercent, null)
  assert.equal(parsed.channel.rfLevel, null)
})
