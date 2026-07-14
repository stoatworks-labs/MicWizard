import type { DiscoveredDevice } from '../../../shared/types'
import { LevelMeter } from './LevelMeter'
import { BatteryIndicator } from './BatteryIndicator'
import { ChannelMonitorButton } from './ChannelMonitorButton'

const VENDOR_LABEL: Record<DiscoveredDevice['vendor'], string> = {
  shure: 'Shure',
  sennheiser: 'Sennheiser',
  'unknown-dante': 'Dante / AES67'
}

export function DeviceList({ devices }: { devices: DiscoveredDevice[] }): JSX.Element {
  if (devices.length === 0) {
    return <p className="device-list__empty">No devices found yet. Scanning the local network…</p>
  }

  return (
    <div className="device-list">
      {devices.map((device) => (
        <div className="device-card" key={device.id}>
          <div className="device-card__header">
            <span className={`device-card__badge device-card__badge--${device.vendor}`}>
              {VENDOR_LABEL[device.vendor]}
            </span>
            <h3>{device.name}</h3>
            <span className="device-card__address">
              {device.address}
              {device.port ? `:${device.port}` : ''}
            </span>
            {!device.identified && <span className="device-card__unidentified">seen, not yet identified</span>}
          </div>
          <div className="device-card__channels">
            {device.channels.length === 0 && <p className="device-card__no-channels">No channel data yet</p>}
            {device.channels.map((channel) => (
              <div className="channel-row" key={channel.id}>
                <span className="channel-row__name">{channel.name}</span>
                <LevelMeter label="Audio" db={channel.audioLevelDb} />
                {channel.rfLevel !== null && <LevelMeter label="RF" db={channel.rfLevel - 100} />}
                <BatteryIndicator percent={channel.batteryPercent} minutesRemaining={channel.batteryMinutesRemaining} />
                <ChannelMonitorButton channel={channel} hasNetworkAudio={device.transport === 'aes67'} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
