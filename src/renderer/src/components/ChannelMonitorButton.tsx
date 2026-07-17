import { useEffect, useState } from 'react'
import type { DeviceChannel } from '../../../shared/types'
import { monitorEngine } from '../audio/monitorEngine'
import { listUsbAudioInputs } from '../audio/usbAudio'
import { clearUsbDeviceForChannel, getUsbDeviceForChannel, setUsbDeviceForChannel } from '../audio/usbChannelMap'

/**
 * Local headphone cue button - separate from the Companion/Dante-routing
 * panel. AES67 channels play directly. Channels with no network audio
 * (Shure/Sennheiser without Dante) need a one-time mapping to whichever
 * USB interface input they've been physically patched into.
 */
export function ChannelMonitorButton({
  channel,
  hasNetworkAudio
}: {
  channel: DeviceChannel
  hasNetworkAudio: boolean
}): JSX.Element {
  const [monitoring, setMonitoring] = useState(monitorEngine.isMonitoring(channel.id))
  const [mappedDevice, setMappedDevice] = useState<string | null>(
    hasNetworkAudio ? null : getUsbDeviceForChannel(channel.id)
  )
  const [usbInputs, setUsbInputs] = useState<MediaDeviceInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => monitorEngine.onChange(() => setMonitoring(monitorEngine.isMonitoring(channel.id))), [channel.id])

  const toggle = async (): Promise<void> => {
    setError(null)
    try {
      if (hasNetworkAudio) {
        await monitorEngine.toggleAes67(channel.id)
        return
      }
      if (mappedDevice) {
        await monitorEngine.toggleUsb(channel.id, mappedDevice)
        return
      }
      setUsbInputs(await listUsbAudioInputs())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const pickUsbDevice = async (deviceId: string): Promise<void> => {
    if (!deviceId) {
      setUsbInputs(null)
      return
    }
    setUsbDeviceForChannel(channel.id, deviceId)
    setMappedDevice(deviceId)
    setUsbInputs(null)
    setError(null)
    try {
      await monitorEngine.toggleUsb(channel.id, deviceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const removeMapping = (): void => {
    clearUsbDeviceForChannel(channel.id)
    if (monitoring) monitorEngine.stop(channel.id)
    setMappedDevice(null)
  }

  const title = error
    ? error
    : hasNetworkAudio
      ? 'Listen on headphones'
      : mappedDevice
        ? 'Listen on headphones'
        : 'Map to a USB input first'

  return (
    <div className="channel-monitor">
      <button
        className={`channel-monitor__button ${monitoring ? 'channel-monitor__button--active' : ''} ${error ? 'channel-monitor__button--error' : ''}`}
        onClick={toggle}
        title={title}
      >
        🎧
      </button>
      {usbInputs && (
        <select autoFocus onChange={(e) => pickUsbDevice(e.target.value)} onBlur={() => setUsbInputs(null)}>
          <option value="">Map to USB input…</option>
          {usbInputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || d.deviceId}
            </option>
          ))}
        </select>
      )}
      {!hasNetworkAudio && mappedDevice && (
        <button className="channel-monitor__unmap" onClick={removeMapping} title="Remove USB mapping">
          ×
        </button>
      )}
    </div>
  )
}
