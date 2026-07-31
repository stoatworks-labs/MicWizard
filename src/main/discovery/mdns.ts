import { Bonjour, Service } from 'bonjour-service'
import type { DeviceRegistry } from '../deviceRegistry'

type ServiceInfo = InstanceType<typeof Service>

/**
 * Dante's own mDNS/DNS-SD advertisement, verified against real Dante gear
 * in this author's Dante-BabelBox project (crates/discovery). Dante carries
 * no control-plane info over mDNS - this only confirms "a Dante device
 * exists at this address"; vendor/model/battery identity comes from a
 * vendor adapter (Shure/Sennheiser) separately, keyed on the same address.
 * These are UDP services only - Dante doesn't advertise them over TCP.
 */
const DANTE_SERVICE_TYPES = ['netaudio-arc', 'netaudio-chan'] as const

/**
 * Sennheiser digital wireless receivers (EW-DX, Digital 6000/9000) expose
 * SSC control over mDNS as `_ssc._tcp`, per Sennheiser's published SSC
 * third-party integration notes. NOT independently verified against real
 * hardware in this project yet - see docs/protocols.md. mDNS only tells us
 * an address/port exists; the caller is expected to open the actual SSC
 * connection (see discovery/sennheiser.ts's connectSennheiserDevice) to get
 * real channel/battery/RF data, which is why this only reports a callback
 * rather than upserting a bare registry entry itself.
 */
const SENNHEISER_SSC_SERVICE_TYPE = 'ssc'

export interface MdnsDiscoveryHandle {
  stop: () => void
}

export function startMdnsDiscovery(
  registry: DeviceRegistry,
  onSennheiserFound: (address: string, port: number) => void
): MdnsDiscoveryHandle {
  const bonjour = new Bonjour()
  const seenSennheiser = new Set<string>()

  const sscBrowser = bonjour.find({ type: SENNHEISER_SSC_SERVICE_TYPE, protocol: 'tcp' })
  sscBrowser.on('up', (service: ServiceInfo) => {
    const address = service.referer?.address ?? service.addresses?.[0]
    if (!address || seenSennheiser.has(address)) return
    seenSennheiser.add(address)
    onSennheiserFound(address, service.port)
  })

  const danteBrowsers = DANTE_SERVICE_TYPES.map((type) => {
    const browser = bonjour.find({ type, protocol: 'udp' })
    browser.on('up', (service: ServiceInfo) => handleDanteService(registry, service))
    browser.on('down', (service: ServiceInfo) => registry.remove(serviceId(service)))
    return browser
  })

  /**
   * Re-assert every service still being advertised, and re-query for them.
   *
   * `up` fires once per service, but the registry's pruneStale() drops anything not
   * re-upserted within its window - so a Dante device that was still sitting there
   * happily advertising itself would silently disappear from the list a couple of
   * minutes after it was found. Vendor adapters never hit this because their metering
   * re-upserts constantly; an mDNS-only device has nothing else touching it.
   *
   * Reading the browser's own list rather than a cache of our own is what keeps this
   * honest: bonjour expires a service on TTL or a goodbye packet and stops returning
   * it, so a device that really has gone stops being refreshed and is pruned as
   * intended.
   */
  const refreshTimer = setInterval(() => {
    for (const browser of danteBrowsers) {
      browser.update()
      for (const service of browser.services) handleDanteService(registry, service)
    }
  }, REFRESH_INTERVAL_MS)

  return {
    stop: () => {
      clearInterval(refreshTimer)
      sscBrowser.stop()
      for (const b of danteBrowsers) b.stop()
      bonjour.destroy()
    }
  }
}

/** Comfortably inside the registry's 120s staleness window, so a live device never
 *  gets close to being pruned, without re-querying the network constantly. */
const REFRESH_INTERVAL_MS = 30_000

function serviceId(service: ServiceInfo): string {
  return `mdns:${service.fqdn}`
}

function handleDanteService(registry: DeviceRegistry, service: ServiceInfo): void {
  const address = service.referer?.address ?? service.addresses?.[0]
  if (!address) return

  registry.upsert({
    id: serviceId(service),
    vendor: 'unknown-dante',
    name: service.name,
    address,
    port: service.port,
    transport: 'aes67'
  })
}
