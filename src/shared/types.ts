export type DeviceVendor = 'shure' | 'sennheiser' | 'unknown-dante'

export type TransportKind = 'aes67' | 'dante-api' | 'usb' | 'none'

export interface DeviceChannel {
  id: string
  name: string
  /** RF signal strength 0-100 (vendor-normalized), null if not reported/connected */
  rfLevel: number | null
  /** Audio level in dBFS, null if not currently metering */
  audioLevelDb: number | null
  batteryPercent: number | null
  /** Minutes of battery runtime remaining, if the receiver reports it */
  batteryMinutesRemaining: number | null
  antenna: 'A' | 'B' | 'diversity' | null
}

export interface DiscoveredDevice {
  id: string
  vendor: DeviceVendor
  model: string | null
  name: string
  address: string
  port: number | null
  transport: TransportKind
  /** True once a vendor adapter has completed its identify/handshake, not just been seen on the network */
  identified: boolean
  channels: DeviceChannel[]
  lastSeen: number
}

export interface UsbRoute {
  id: string
  inputDeviceId: string
  inputChannel: number
  label: string
  levelDb: number | null
}

export type MainToRendererEvent =
  | { type: 'device-updated'; device: DiscoveredDevice }
  | { type: 'device-removed'; deviceId: string }
  | { type: 'usb-route-updated'; route: UsbRoute }
  | { type: 'discovery-status'; scanning: boolean; message?: string }
  | { type: 'audio-chunk'; channelId: string; samples: Float32Array; sampleRate: number }

export interface CompanionButtonLocation {
  page: number
  row: number
  column: number
}

/**
 * Points at ONE pre-configured button in the user's own Bitfocus Companion
 * instance running the "Make Crosspoint" action from
 * companion-module-audinate-dantecontroller, with its four text-input
 * options bound to Companion custom variables named
 * `<variablePrefix>_src_channel`, `<variablePrefix>_src_device`,
 * `<variablePrefix>_dst_channel`, `<variablePrefix>_dst_device` (that
 * module's action fields are declared `useVariables: true`, so this is
 * standard, documented Companion behavior - verified against the module's
 * own source, not guessed). This app sets those four variables then
 * presses the button - one button covers every possible route, no
 * per-route configuration needed. clearCrosspointButton is the same idea
 * for the "Clear Crosspoint" action, which only needs the two destination
 * fields. See src/main/companion/routesConfig.ts and the README.
 */
export interface CompanionCrosspointConfig {
  host: string
  port: number
  variablePrefix: string
  makeCrosspointButton: CompanionButtonLocation
  clearCrosspointButton: CompanionButtonLocation | null
}

export interface CompanionStatus {
  /** False if no companion-routes.json exists yet - the default, expected state */
  configured: boolean
  host: string | null
  port: number | null
  /** Null until a reachability check has run */
  reachable: boolean | null
  canClear: boolean
}

export interface CrosspointRequest {
  sourceChannel: string
  sourceDevice: string
  destinationChannel: string
  destinationDevice: string
}
