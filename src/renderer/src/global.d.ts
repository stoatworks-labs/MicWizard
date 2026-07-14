import type { CompanionStatus, CrosspointRequest, DiscoveredDevice, MainToRendererEvent } from '../../shared/types'

declare global {
  interface Window {
    micMonitor: {
      listDevices: () => Promise<DiscoveredDevice[]>
      onEvent: (callback: (event: MainToRendererEvent) => void) => () => void
      companionStatus: () => Promise<CompanionStatus>
      makeCrosspoint: (request: CrosspointRequest) => Promise<void>
      clearCrosspoint: (destinationChannel: string, destinationDevice: string) => Promise<void>
    }
  }
}

export {}
