/**
 * Persists which USB audio input device feeds a given channel, for
 * receivers with no network audio at all (analog-only Shure/Sennheiser
 * units patched into a USB interface). Renderer-only, localStorage-backed -
 * this is a monitoring convenience, not something the main process or
 * device registry needs to know about.
 */
const STORAGE_KEY = 'wireless-mic-monitor:usb-channel-map'

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function getUsbDeviceForChannel(channelId: string): string | null {
  return readAll()[channelId] ?? null
}

export function setUsbDeviceForChannel(channelId: string, usbDeviceId: string): void {
  const map = readAll()
  map[channelId] = usbDeviceId
  writeAll(map)
}

export function clearUsbDeviceForChannel(channelId: string): void {
  const map = readAll()
  delete map[channelId]
  writeAll(map)
}
