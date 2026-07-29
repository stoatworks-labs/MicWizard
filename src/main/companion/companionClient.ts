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

  /**
   * Ask the user's Companion to make a route: set the four `<prefix>_*` custom
   * variables describing it, then press the configured button.
   *
   * RESOLVING PROVES THE BUTTON WAS PRESSED, NOT THAT A ROUTE HAPPENED. What
   * the button does is entirely the user's own Companion configuration, and a
   * button that is unconfigured, mis-wired, or reading a different variable
   * prefix succeeds here and changes nothing. There is no feedback path — this
   * app cannot read back whether the crosspoint exists.
   *
   * Order matters: all four variables are set before the press, because the
   * button reads them at press time.
   */
  async makeCrosspoint(request: CrosspointRequest): Promise<void> {
    const prefix = this.config.variablePrefix
    await this.setCustomVariable(`${prefix}_src_channel`, request.sourceChannel)
    await this.setCustomVariable(`${prefix}_src_device`, request.sourceDevice)
    await this.setCustomVariable(`${prefix}_dst_channel`, request.destinationChannel)
    await this.setCustomVariable(`${prefix}_dst_device`, request.destinationDevice)
    await this.pressButton(this.config.makeCrosspointButton)
  }

  /**
   * Ask Companion to clear a route. Only the destination is set, since that is
   * what identifies a crosspoint to remove.
   *
   * Unlike makeCrosspoint this one CAN fail usefully: a missing
   * `clearCrosspointButton` throws rather than pressing something arbitrary.
   * The same "pressed, not necessarily routed" caveat otherwise applies.
   */
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
