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

  return {
    stop: () => {
      sscBrowser.stop()
      for (const b of danteBrowsers) b.stop()
      bonjour.destroy()
    }
  }
}

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
