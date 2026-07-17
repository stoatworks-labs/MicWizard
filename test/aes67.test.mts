import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeRtpAudio } from '../src/main/audio/aes67.ts'

function buildRtpPacket(payload: Buffer): Buffer {
  const header = Buffer.alloc(12)
  header[0] = 0x80 // version 2, no padding/extension/CSRC
  header[1] = 97 // payload type
  return Buffer.concat([header, payload])
}

test('decodeRtpAudio: rejects packets with no payload beyond the RTP header', () => {
  assert.equal(decodeRtpAudio(buildRtpPacket(Buffer.alloc(0)), 2, 2), null)
})

test('decodeRtpAudio: rejects a packet shorter than the RTP header itself', () => {
  assert.equal(decodeRtpAudio(Buffer.alloc(8), 2, 2), null)
})

test('decodeRtpAudio: rejects a non-v2 RTP packet', () => {
  const header = Buffer.alloc(12)
  header[0] = 0x00 // version 0
  const packet = Buffer.concat([header, Buffer.alloc(8)])
  assert.equal(decodeRtpAudio(packet, 2, 2), null)
})

test('decodeRtpAudio: deinterleaves L16 (16-bit BE) stereo correctly', () => {
  // frame 0: ch0=+16384 (0.5 fs), ch1=-16384 (-0.5 fs); frame 1: ch0=0, ch1=full-scale-ish
  const payload = Buffer.alloc(8)
  payload.writeInt16BE(16384, 0)
  payload.writeInt16BE(-16384, 2)
  payload.writeInt16BE(0, 4)
  payload.writeInt16BE(32767, 6)

  const channels = decodeRtpAudio(buildRtpPacket(payload), 2, 2)
  assert.ok(channels)
  assert.equal(channels.length, 2)
  assert.equal(channels[0].length, 2)
  assert.ok(Math.abs(channels[0][0] - 0.5) < 0.001)
  assert.ok(Math.abs(channels[1][0] - -0.5) < 0.001)
  assert.equal(channels[0][1], 0)
  assert.ok(Math.abs(channels[1][1] - 32767 / 32768) < 0.001)
})

test('decodeRtpAudio: deinterleaves L24 (24-bit BE) mono, including negative sign extension', () => {
  const payload = Buffer.alloc(6) // two 3-byte frames, 1 channel
  payload.writeUIntBE(0x400000, 0, 3) // +0.5 fs (0x400000 / 0x800000)
  payload.writeUIntBE(0xc00000, 3, 3) // -0.5 fs (0xc00000 - 0x1000000 = -0x400000)

  const channels = decodeRtpAudio(buildRtpPacket(payload), 3, 1)
  assert.ok(channels)
  assert.equal(channels.length, 1)
  assert.ok(Math.abs(channels[0][0] - 0.5) < 0.0001)
  assert.ok(Math.abs(channels[0][1] - -0.5) < 0.0001)
})

test('decodeRtpAudio: truncates a partial trailing frame rather than reading out of bounds', () => {
  // 2 channels * 2 bytes = 4 bytes/frame; 5 bytes of payload = 1 full frame + 1 stray byte
  const payload = Buffer.alloc(5)
  payload.writeInt16BE(1000, 0)
  payload.writeInt16BE(-1000, 2)

  const channels = decodeRtpAudio(buildRtpPacket(payload), 2, 2)
  assert.ok(channels)
  assert.equal(channels[0].length, 1)
  assert.equal(channels[1].length, 1)
})
