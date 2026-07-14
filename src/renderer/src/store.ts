import { create } from 'zustand'
import type { DiscoveredDevice } from '../../shared/types'

interface DeviceStoreState {
  devices: Map<string, DiscoveredDevice>
  scanning: boolean
  upsert: (device: DiscoveredDevice) => void
  remove: (deviceId: string) => void
  setScanning: (scanning: boolean) => void
}

export const useDeviceStore = create<DeviceStoreState>((set) => ({
  devices: new Map(),
  scanning: false,
  upsert: (device) =>
    set((state) => {
      const devices = new Map(state.devices)
      devices.set(device.id, device)
      return { devices }
    }),
  remove: (deviceId) =>
    set((state) => {
      const devices = new Map(state.devices)
      devices.delete(deviceId)
      return { devices }
    }),
  setScanning: (scanning) => set({ scanning })
}))

export function connectDeviceStore(): () => void {
  window.micMonitor.listDevices().then((devices) => {
    for (const device of devices) useDeviceStore.getState().upsert(device)
  })

  return window.micMonitor.onEvent((event) => {
    const store = useDeviceStore.getState()
    switch (event.type) {
      case 'device-updated':
        store.upsert(event.device)
        break
      case 'device-removed':
        store.remove(event.deviceId)
        break
      case 'discovery-status':
        store.setScanning(event.scanning)
        break
    }
  })
}
