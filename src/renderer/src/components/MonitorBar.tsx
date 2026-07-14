import { useEffect, useState } from 'react'
import { listAudioOutputs } from '../audio/usbAudio'
import { monitorEngine } from '../audio/monitorEngine'

export function MonitorBar(): JSX.Element {
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([])
  const [outputId, setOutputId] = useState<string>('')
  const [solo, setSolo] = useState(monitorEngine.getSoloMode())

  useEffect(() => {
    listAudioOutputs().then((devices) => {
      setOutputs(devices)
      const preferred = devices.find((d) => d.deviceId === 'default') ?? devices[0]
      if (preferred) {
        setOutputId(preferred.deviceId)
        void monitorEngine.setOutputDevice(preferred.deviceId)
      }
    })
  }, [])

  const changeOutput = (deviceId: string): void => {
    setOutputId(deviceId)
    void monitorEngine.setOutputDevice(deviceId)
  }

  const toggleSolo = (): void => {
    const next = !solo
    setSolo(next)
    monitorEngine.setSoloMode(next)
    if (next) monitorEngine.stopAll()
  }

  return (
    <div className="monitor-bar">
      <label className="monitor-bar__field">
        Headphone/monitor output
        <select value={outputId} onChange={(e) => changeOutput(e.target.value)}>
          {outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || d.deviceId}
            </option>
          ))}
        </select>
      </label>
      <label className="monitor-bar__toggle">
        <input type="checkbox" checked={solo} onChange={toggleSolo} />
        Solo (one channel at a time)
      </label>
    </div>
  )
}
