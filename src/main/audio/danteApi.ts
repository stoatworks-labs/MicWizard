/**
 * BLOCKED: full Dante API integration requires Audinate's Dante API SDK,
 * which is not publicly downloadable. It's distributed only to developers
 * accepted into Audinate's Dante Developer Program (a manual application +
 * NDA + license agreement - see https://developer.audinate.com), and the
 * license restricts redistribution of the SDK itself. Nobody, including an
 * AI assistant, can fetch or bundle it on your behalf; this is a business
 * step only you can complete.
 *
 * What you get from the Dante API that AES67 (src/main/audio/aes67.ts)
 * doesn't cover:
 *  - Devices that never enable AES67 mode (older/cheaper Dante gear)
 *  - Routing/subscription control, not just passive level monitoring
 *  - Device labels, sample-rate/clock status, and Dante Domain Manager info
 *
 * Until the SDK is in hand, this file defines the interface AES67 already
 * satisfies (see Aes67StreamHandle in aes67.ts), so a real Dante API
 * client can be dropped in later without touching the registry, IPC, or
 * renderer layers. Implementing this requires the native Dante API's C++
 * headers wrapped via a Node native addon (N-API) - the SDK ships as a
 * native library, not JS/TS.
 */
export interface DanteApiTransport {
  connect(): Promise<void>
  disconnect(): Promise<void>
  listDevices(): Promise<{ id: string; name: string; address: string }[]>
}

export function createDanteApiTransport(): DanteApiTransport {
  throw new Error(
    'Dante API transport is not implemented. Apply to https://developer.audinate.com for SDK access, ' +
      'then implement this against the SDK headers. Use AES67 monitoring (src/main/audio/aes67.ts) until then.'
  )
}
