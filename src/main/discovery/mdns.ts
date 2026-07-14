import { Bonjour, Service } from 'bonjour-service'
import type { DeviceRegistry } from '../deviceRegistry'

type ServiceInfo = InstanceType<typeof Service>

/**
 * Dante's own mDNS/DNS-SD advertisement, verified against real Dante gear
 * in this author's Dante-BabelBox project (crates/discovery). Dante carries
 * no control-plane info over mDNS - this only confirms "a Dante device
 * exists at this address"; vendor/model/battery identity comes from a
 * vendor adapter (Shure/Sennheiser) separately, keyed on the same address.
 */
const DANTE_SERVICE_TYPES = ['netaudio-arc', 'netaudio-chan'] as const

/**
 * Sennheiser digital wireless receivers (EW-DX, Digital 6000/9000) expose
 * SSC control over mDNS as `_ssc._tcp`, per Sennheiser's published SSC
 * third-party integration notes. NOT independently verified against real
 * hardware in this project yet - see docs/protocols.md.
 */
const SENNHEISER_SSC_SERVICE_TYPE = 'ssc'

export interface MdnsDiscoveryHandle {
  stop: () => void
}

export function startMdnsDiscovery(registry: DeviceRegistry): MdnsDiscoveryHandle {
  const bonjour = new Bonjour()
  const browsers = [...DANTE_SERVICE_TYPES, SENNHEISER_SSC_SERVICE_TYPE].map((type) => {
    const browser = bonjour.find({ type, protocol: 'tcp' })
    browser.on('up', (service: ServiceInfo) => handleService(registry, type, service))
    browser.on('down', (service: ServiceInfo) => {
      registry.remove(serviceId(service))
    })
    return browser
  })

  // Dante's own services are UDP, not TCP
  const danteUdpBrowsers = DANTE_SERVICE_TYPES.map((type) => {
    const browser = bonjour.find({ type, protocol: 'udp' })
    browser.on('up', (service: ServiceInfo) => handleService(registry, type, service))
    browser.on('down', (service: ServiceInfo) => {
      registry.remove(serviceId(service))
    })
    return browser
  })

  return {
    stop: () => {
      for (const b of [...browsers, ...danteUdpBrowsers]) b.stop()
      bonjour.destroy()
    }
  }
}

function serviceId(service: ServiceInfo): string {
  return `mdns:${service.fqdn}`
}

function handleService(registry: DeviceRegistry, serviceType: string, service: ServiceInfo): void {
  const address = service.referer?.address ?? service.addresses?.[0]
  if (!address) return

  const isSennheiser = serviceType === SENNHEISER_SSC_SERVICE_TYPE
  registry.upsert({
    id: serviceId(service),
    vendor: isSennheiser ? 'sennheiser' : 'unknown-dante',
    name: service.name,
    address,
    port: service.port,
    transport: isSennheiser ? 'none' : 'aes67'
  })
}
