import { contextBridge, ipcRenderer } from 'electron'
import type { CompanionStatus, CrosspointRequest, DiscoveredDevice, MainToRendererEvent } from '../shared/types'

const api = {
  listDevices: (): Promise<DiscoveredDevice[]> => ipcRenderer.invoke('mic-monitor:list-devices'),
  onEvent: (callback: (event: MainToRendererEvent) => void): (() => void) => {
    const listener = (_: unknown, event: MainToRendererEvent) => callback(event)
    ipcRenderer.on('mic-monitor:event', listener)
    return () => ipcRenderer.removeListener('mic-monitor:event', listener)
  },
  companionStatus: (): Promise<CompanionStatus> => ipcRenderer.invoke('mic-monitor:companion-status'),
  makeCrosspoint: (request: CrosspointRequest): Promise<void> =>
    ipcRenderer.invoke('mic-monitor:make-crosspoint', request),
  clearCrosspoint: (destinationChannel: string, destinationDevice: string): Promise<void> =>
    ipcRenderer.invoke('mic-monitor:clear-crosspoint', destinationChannel, destinationDevice)
}

export type MicMonitorApi = typeof api

contextBridge.exposeInMainWorld('micMonitor', api)
