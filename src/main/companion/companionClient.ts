import type { CompanionCrosspointConfig, CrosspointRequest } from '../../shared/types'

const REQUEST_TIMEOUT_MS = 3000

/**
 * Thin wrapper around Companion's own documented HTTP remote-control API
 * (https://companion.free/user-guide/v4.1/remote-control/http-remote-control/):
 * setting custom variables and pressing a button by location. Nothing
 * Dante-specific here - this app has no idea what a button does, it just
 * sets four named variables and presses it. Whatever Companion module and
 * configuration the user has behind that button (Dante Controller, DDM, or
 * anything else) is entirely their own setup, running in their own
 * Companion instance, under whatever terms they've accepted for it.
 */
export class CompanionClient {
  constructor(private readonly config: CompanionCrosspointConfig) {}

  private baseUrl(): string {
    return `http://${this.config.host}:${this.config.port}`
  }

  async makeCrosspoint(request: CrosspointRequest): Promise<void> {
    const prefix = this.config.variablePrefix
    await this.setCustomVariable(`${prefix}_src_channel`, request.sourceChannel)
    await this.setCustomVariable(`${prefix}_src_device`, request.sourceDevice)
    await this.setCustomVariable(`${prefix}_dst_channel`, request.destinationChannel)
    await this.setCustomVariable(`${prefix}_dst_device`, request.destinationDevice)
    await this.pressButton(this.config.makeCrosspointButton)
  }

  async clearCrosspoint(destinationChannel: string, destinationDevice: string): Promise<void> {
    if (!this.config.clearCrosspointButton) {
      throw new Error('No clearCrosspointButton configured in companion-routes.json')
    }
    const prefix = this.config.variablePrefix
    await this.setCustomVariable(`${prefix}_dst_channel`, destinationChannel)
    await this.setCustomVariable(`${prefix}_dst_device`, destinationDevice)
    await this.pressButton(this.config.clearCrosspointButton)
  }

  async checkReachable(): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(`${this.baseUrl()}/api/custom-variable/micwizard-reachability-check/value`, {
        method: 'GET'
      })
      // Any HTTP response at all - even a 404 for an unknown variable -
      // means Companion is up and answering requests.
      return res.status > 0
    } catch {
      return false
    }
  }

  private async setCustomVariable(name: string, value: string): Promise<void> {
    const url = `${this.baseUrl()}/api/custom-variable/${encodeURIComponent(name)}/value`
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: value
    })
    if (!res.ok) {
      throw new Error(`Companion returned ${res.status} setting variable ${name}`)
    }
  }

  private async pressButton(location: { page: number; row: number; column: number }): Promise<void> {
    const url = `${this.baseUrl()}/api/location/${location.page}/${location.row}/${location.column}/press`
    const res = await fetchWithTimeout(url, { method: 'POST' })
    if (!res.ok) {
      throw new Error(`Companion returned ${res.status} for ${url}`)
    }
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}
