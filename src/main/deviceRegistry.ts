import { EventEmitter } from 'node:events'
import type { DiscoveredDevice, MainToRendererEvent } from '../shared/types'

/**
 * Single source of truth for every device any discovery/audio module has
 * seen. Adapters call upsert()/remove() with partial info as they learn
 * more (e.g. mDNS sees an address first, a vendor adapter identifies
 * model/channels later) - callers merge rather than replace.
 */
export class DeviceRegistry extends EventEmitter {
  private devices = new Map<string, DiscoveredDevice>()

  upsert(partial: Pick<DiscoveredDevice, 'id'> & Partial<DiscoveredDevice>): DiscoveredDevice {
    const existing = this.devices.get(partial.id)
    const merged: DiscoveredDevice = {
      vendor: 'unknown-dante',
      model: null,
      name: partial.id,
      address: '',
      port: null,
      transport: 'none',
      identified: false,
      channels: [],
      ...existing,
      ...partial,
      lastSeen: Date.now()
    }
    this.devices.set(merged.id, merged)
    this.emit('event', { type: 'device-updated', device: merged } satisfies MainToRendererEvent)
    return merged
  }

  remove(deviceId: string): void {
    if (this.devices.delete(deviceId)) {
      this.emit('event', { type: 'device-removed', deviceId } satisfies MainToRendererEvent)
    }
  }

  list(): DiscoveredDevice[] {
    return [...this.devices.values()]
  }

  get(deviceId: string): DiscoveredDevice | undefined {
    return this.devices.get(deviceId)
  }

  /** Drop devices not seen within maxAgeMs, e.g. after mDNS goodbye packets go missing */
  pruneStale(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs
    for (const device of this.devices.values()) {
      if (device.lastSeen < cutoff) this.remove(device.id)
    }
  }
}
