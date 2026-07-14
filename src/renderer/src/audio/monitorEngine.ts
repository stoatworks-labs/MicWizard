/**
 * Local headphone/speaker cueing - NOT the Companion/Dante-routing feature.
 * This never touches the network audio matrix; it just plays a channel's
 * audio out of a local output device you pick (headphones, a Bluetooth
 * speaker, whatever macOS/Windows/Linux shows as an audio output).
 *
 * Two source kinds, both ending up in the same Web Audio graph:
 *  - AES67 channels: the main process already decodes RTP into PCM for
 *    level metering (src/main/audio/aes67.ts) - it only forwards the raw
 *    samples here once asked to, via start/stopAudioMonitor IPC, to avoid
 *    paying that cost for channels nobody's listening to. Chunks arrive as
 *    'audio-chunk' events and get scheduled back-to-back as short
 *    AudioBufferSourceNodes. This is simple, not glitch-free (an
 *    AudioWorklet ring buffer would be smoother) - fine for cueing/checking
 *    a mic, not claimed to be broadcast-grade monitoring.
 *  - USB-mapped channels (non-Dante receivers patched into an interface):
 *    captured directly here via getUserMedia, no main-process involvement.
 */
import type { MainToRendererEvent } from '../../../shared/types'

interface ActiveMonitor {
  stop: () => void
}

type AudioContextWithSink = AudioContext & {
  setSinkId?: (deviceId: string) => Promise<void>
}

class MonitorEngine {
  private audioContext: AudioContextWithSink | null = null
  private masterGain: GainNode | null = null
  private active = new Map<string, ActiveMonitor>()
  private soloMode = true
  private listeners = new Set<() => void>()
  private outputDeviceId: string | null = null

  private ensureContext(): { ctx: AudioContextWithSink; master: GainNode } {
    if (!this.audioContext || !this.masterGain) {
      const ctx: AudioContextWithSink = new AudioContext()
      const master = ctx.createGain()
      master.connect(ctx.destination)
      this.audioContext = ctx
      this.masterGain = master
    }
    return { ctx: this.audioContext, master: this.masterGain }
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  private notify(): void {
    for (const cb of this.listeners) cb()
  }

  isMonitoring(channelId: string): boolean {
    return this.active.has(channelId)
  }

  getSoloMode(): boolean {
    return this.soloMode
  }

  setSoloMode(solo: boolean): void {
    this.soloMode = solo
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId
    const { ctx } = this.ensureContext()
    if (typeof ctx.setSinkId === 'function') {
      // setSinkId() doesn't accept the 'default' sentinel enumerateDevices()
      // reports - the system default sink is selected with '' instead.
      await ctx.setSinkId(deviceId === 'default' ? '' : deviceId)
    }
  }

  getOutputDevice(): string | null {
    return this.outputDeviceId
  }

  async toggleAes67(channelId: string): Promise<void> {
    if (this.active.has(channelId)) {
      this.stop(channelId)
      return
    }
    if (this.soloMode) this.stopAll()

    const { ctx, master } = this.ensureContext()
    await ctx.resume()
    await window.micMonitor.startAudioMonitor(channelId)

    const gain = ctx.createGain()
    gain.connect(master)
    let nextStartTime = ctx.currentTime

    const unsubscribe = window.micMonitor.onEvent((event: MainToRendererEvent) => {
      if (event.type !== 'audio-chunk' || event.channelId !== channelId) return
      const buffer = ctx.createBuffer(1, event.samples.length, event.sampleRate)
      buffer.copyToChannel(new Float32Array(event.samples), 0)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(gain)
      const startAt = Math.max(nextStartTime, ctx.currentTime)
      source.start(startAt)
      nextStartTime = startAt + buffer.duration
    })

    this.active.set(channelId, {
      stop: () => {
        unsubscribe()
        gain.disconnect()
        void window.micMonitor.stopAudioMonitor(channelId)
      }
    })
    this.notify()
  }

  async toggleUsb(channelId: string, usbDeviceId: string): Promise<void> {
    if (this.active.has(channelId)) {
      this.stop(channelId)
      return
    }
    if (this.soloMode) this.stopAll()

    const { ctx, master } = this.ensureContext()
    await ctx.resume()

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: usbDeviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })
    const source = ctx.createMediaStreamSource(stream)
    const gain = ctx.createGain()
    source.connect(gain)
    gain.connect(master)

    this.active.set(channelId, {
      stop: () => {
        stream.getTracks().forEach((track) => track.stop())
        source.disconnect()
        gain.disconnect()
      }
    })
    this.notify()
  }

  stop(channelId: string): void {
    this.active.get(channelId)?.stop()
    this.active.delete(channelId)
    this.notify()
  }

  stopAll(): void {
    for (const channelId of [...this.active.keys()]) this.stop(channelId)
  }
}

export const monitorEngine = new MonitorEngine()
