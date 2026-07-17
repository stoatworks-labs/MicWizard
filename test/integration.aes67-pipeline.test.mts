import { test } from 'node:test'
import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import { SapListener } from '../src/main/audio/sap.ts'
import { monitorAes67Stream } from '../src/main/audio/aes67.ts'

/**
 * Full end-to-end validation of the AES67 pipeline against real UDP
 * multicast sockets (loopback) - not mocks. This is the only piece of the
 * app that talks a real network protocol without any real hardware
 * available to test against, so it's worth the extra weight of an actual
 * socket-level test: hand-crafts a SAP announcement and RTP packets the
 * same way a real Dante/AES67 sender would put them on the wire, and
 * checks the decoded sample amplitude matches exactly.
 */
const MULTICAST_ADDR = '239.5.5.5' // distinct from other tests' groups in case they ever run concurrently
const RTP_PORT = 16004
const SAMPLE_RATE = 48000
const CHANNEL_COUNT = 2
const TONE_HZ = 440
const TONE_PEAK = 16000 // out of 32768 -> expect |sample| ~= 0.48828125

function buildSapPacket(): Buffer {
  const sdp = [
    'v=0',
    'o=- 424242 0 IN IP4 192.168.1.50',
    's=Integration Test Stream',
    `c=IN IP4 ${MULTICAST_ADDR}/32`,
    `m=audio ${RTP_PORT} RTP/AVP 97`,
    `a=rtpmap:97 L16/${SAMPLE_RATE}/${CHANNEL_COUNT}`,
    ''
  ].join('\r\n')
  const header = Buffer.from([0x00, 0x00, 0x00, 0x01, 127, 0, 0, 1])
  return Buffer.concat([header, Buffer.from(sdp, 'utf8')])
}

function buildRtpPacket(seq: number, frameCount: number): Buffer {
  const header = Buffer.alloc(12)
  header[0] = 0x80
  header[1] = 97
  header.writeUInt16BE(seq, 2)
  header.writeUInt32BE(seq * frameCount, 4)
  header.writeUInt32BE(0xdeadbeef, 8)

  const payload = Buffer.alloc(frameCount * 2 * CHANNEL_COUNT)
  for (let i = 0; i < frameCount; i++) {
    const t = (seq * frameCount + i) / SAMPLE_RATE
    const sample = Math.round(Math.sin(2 * Math.PI * TONE_HZ * t) * TONE_PEAK)
    payload.writeInt16BE(sample, i * 4) // channel 0: tone
    payload.writeInt16BE(0, i * 4 + 2) // channel 1: silence
  }
  return Buffer.concat([header, payload])
}

test('SAP announcement + RTP stream decode end-to-end over real UDP multicast', { timeout: 8000 }, async () => {
  const sapListener = new SapListener()
  const sender = dgram.createSocket('udp4')

  try {
    const sessionSeen = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for SAP session')), 5000)
      sapListener.on('session', (session) => {
        clearTimeout(timer)
        resolve(session)
      })
      sapListener.start()

      sender.bind(() => {
        sender.setMulticastLoopback(true)
        sender.setMulticastTTL(1)
        sender.send(buildSapPacket(), 9875, '224.2.127.254')
      })
    })

    assert.equal(sessionSeen.sessionId, '424242')
    assert.equal(sessionSeen.multicastAddress, MULTICAST_ADDR)
    assert.equal(sessionSeen.encoding, 'L16')
    assert.equal(sessionSeen.channelCount, 2)

    const { levelsReceived, samplesReceived, maxAbsSample } = await new Promise((resolve) => {
      let levelsReceived = 0
      let samplesReceived = 0
      let maxAbsSample = 0

      const handle = monitorAes67Stream(
        sessionSeen,
        () => {
          levelsReceived++
        },
        (channelIndex, samples) => {
          samplesReceived++
          for (const s of samples) maxAbsSample = Math.max(maxAbsSample, Math.abs(s))
        }
      )
      handle.setSampleStreaming(0, true) // only channel 0 carries the tone

      let seq = 0
      const rtpInterval = setInterval(() => {
        sender.send(buildRtpPacket(seq++, 480), RTP_PORT, MULTICAST_ADDR)
      }, 20)

      setTimeout(() => {
        clearInterval(rtpInterval)
        handle.stop()
        resolve({ levelsReceived, samplesReceived, maxAbsSample })
      }, 1500)
    })

    assert.ok(levelsReceived > 0, 'expected at least one level update')
    assert.ok(samplesReceived > 0, 'expected at least one sample chunk (streaming was enabled for channel 0)')
    const expectedPeak = TONE_PEAK / 32768
    assert.ok(
      Math.abs(maxAbsSample - expectedPeak) < 0.01,
      `expected decoded peak amplitude ~${expectedPeak.toFixed(4)}, got ${maxAbsSample.toFixed(4)}`
    )
  } finally {
    sapListener.stop()
    sender.close()
  }
})
