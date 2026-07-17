import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractSdp, parseSdp } from '../src/main/audio/sap.ts'

const VALID_SDP = [
  'v=0',
  'o=- 999888 0 IN IP4 192.168.1.50',
  's=Console Output',
  'c=IN IP4 239.1.1.1/32',
  'm=audio 6004 RTP/AVP 97',
  'a=rtpmap:97 L16/48000/2',
  ''
].join('\r\n')

test('extractSdp: finds the v=0 boundary and drops the SAP header bytes before it', () => {
  const result = extractSdp('\x00\x00garbage-bytes' + VALID_SDP)
  assert.equal(result, VALID_SDP)
})

test('extractSdp: returns null when there is no v=0 anywhere', () => {
  assert.equal(extractSdp('not an sdp payload at all'), null)
})

test('parseSdp: extracts every field from a well-formed AES67 announcement', () => {
  const session = parseSdp(VALID_SDP)
  assert.ok(session)
  assert.equal(session.sessionId, '999888')
  assert.equal(session.name, 'Console Output')
  assert.equal(session.originAddress, '192.168.1.50')
  assert.equal(session.multicastAddress, '239.1.1.1')
  assert.equal(session.port, 6004)
  assert.equal(session.payloadType, 97)
  assert.equal(session.encoding, 'L16')
  assert.equal(session.sampleRate, 48000)
  assert.equal(session.channelCount, 2)
})

test('parseSdp: defaults channel count to 1 when the rtpmap omits it', () => {
  const sdp = VALID_SDP.replace('L16/48000/2', 'L16/48000')
  const session = parseSdp(sdp)
  assert.ok(session)
  assert.equal(session.channelCount, 1)
})

test('parseSdp: strips the /32 (or any) subnet suffix from the connection address', () => {
  const sdp = VALID_SDP.replace('239.1.1.1/32', '239.1.1.1')
  const session = parseSdp(sdp)
  assert.ok(session)
  assert.equal(session.multicastAddress, '239.1.1.1')
})

test('parseSdp: falls back to the session id as the name when s= is missing', () => {
  const sdp = VALID_SDP.split('\r\n').filter((l) => !l.startsWith('s=')).join('\r\n')
  const session = parseSdp(sdp)
  assert.ok(session)
  assert.equal(session.name, '999888')
})

test('parseSdp: rejects L24 without exploding (accepted encoding, just a different byte width elsewhere)', () => {
  const sdp = VALID_SDP.replace('L16/48000/2', 'L24/48000/2')
  const session = parseSdp(sdp)
  assert.ok(session)
  assert.equal(session.encoding, 'L24')
})

test('parseSdp: returns null for an unsupported codec', () => {
  const sdp = VALID_SDP.replace('L16/48000/2', 'opus/48000/2')
  assert.equal(parseSdp(sdp), null)
})

test('parseSdp: returns null when required lines are missing entirely', () => {
  assert.equal(parseSdp('v=0\r\no=- 1 0 IN IP4 1.2.3.4\r\n'), null)
})

test('parseSdp: returns null for garbage input', () => {
  assert.equal(parseSdp('not sdp at all'), null)
})
