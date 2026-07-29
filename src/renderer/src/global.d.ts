import type { CompanionStatus, CrosspointRequest, DiscoveredDevice, MainToRendererEvent } from '../../shared/types'

declare global {
  interface Window {
    micMonitor: {
      listDevices: () => Promise<DiscoveredDevice[]>
      onEvent: (callback: (event: MainToRendererEvent) => void) => () => void
      companionStatus: () => Promise<CompanionStatus>
      makeCrosspoint: (request: CrosspointRequest) => Promise<void>
      clearCrosspoint: (destinationChannel: string, destinationDevice: string) => Promise<void>
      startAudioMonitor: (channelId: string) => Promise<void>
      stopAudioMonitor: (channelId: string) => Promise<void>
      diag: {
        /** Write one JSON file describing the app's state and return its path. */
        collect: () => Promise<string>
        /** Reveal the log folder in the OS file manager. */
        openLogFolder: () => Promise<string>
      }
    }
  }
}

export {}
