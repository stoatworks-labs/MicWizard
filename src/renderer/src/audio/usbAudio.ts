/**
 * PHASE 2 - STUB. Deliberately lives in the renderer, not main: Electron's
 * renderer is a full Chromium page, so USB audio capture can use the
 * standard Web Audio API (`navigator.mediaDevices.getUserMedia` +
 * `AnalyserNode`) instead of a native addon like naudiodon/PortAudio -
 * no native module to compile/rebuild against Electron's Node ABI.
 *
 * Known limitation to flag before building this out: Web Audio treats
 * input devices as generic stereo/multichannel streams via the OS's own
 * audio subsystem, not raw ASIO-style per-channel access. For a USB
 * interface with more than 2 inputs, `getUserMedia` typically only
 * exposes it as the OS-configured input (often just channels 1-2) unless
 * the OS driver exposes each channel as a separate device. This is
 * workable for "route one non-Dante mic receiver's balanced/USB output
 * into the app," which is the stated use case, but not for a full
 * multitrack interface without further research into per-platform
 * multichannel WebRTC constraints.
 */
export interface UsbInputLevel {
  deviceId: string
  label: string
  rmsDb: number
  peakDb: number
}

export async function listUsbAudioInputs(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'audioinput')
}

export class UsbInputMonitor {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private rafHandle: number | null = null

  async start(deviceId: string, onLevel: (level: UsbInputLevel) => void, label: string): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    })
    this.audioContext = new AudioContext()
    const source = this.audioContext.createMediaStreamSource(this.stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 1024
    source.connect(this.analyser)

    const buffer = new Float32Array(this.analyser.fftSize)
    const tick = () => {
      if (!this.analyser) return
      this.analyser.getFloatTimeDomainData(buffer)
      let sumSquares = 0
      let peak = 0
      for (const sample of buffer) {
        sumSquares += sample * sample
        peak = Math.max(peak, Math.abs(sample))
      }
      const rms = Math.sqrt(sumSquares / buffer.length)
      onLevel({
        deviceId,
        label,
        rmsDb: rms > 0 ? 20 * Math.log10(rms) : -96,
        peakDb: peak > 0 ? 20 * Math.log10(peak) : -96
      })
      this.rafHandle = requestAnimationFrame(tick)
    }
    tick()
  }

  stop(): void {
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle)
    this.stream?.getTracks().forEach((t) => t.stop())
    this.audioContext?.close()
    this.audioContext = null
    this.analyser = null
    this.stream = null
  }
}
