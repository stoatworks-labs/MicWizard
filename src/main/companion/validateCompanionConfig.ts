import type { CompanionButtonLocation, CompanionCrosspointConfig } from '../../shared/types'

/**
 * Pure validation, deliberately split out from routesConfig.ts: that file
 * imports Electron's `app` (for the userData path), which makes it
 * unloadable outside a running Electron process - including from a plain
 * Node test runner. This half has no such dependency, so it's directly
 * unit-testable (see test/validateCompanionConfig.test.ts).
 */
export function validateCompanionConfig(raw: unknown): CompanionCrosspointConfig | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>

  const companion = obj.companion
  if (typeof companion !== 'object' || companion === null) return null
  const { host, port } = companion as Record<string, unknown>
  if (typeof host !== 'string' || typeof port !== 'number') return null

  if (typeof obj.variablePrefix !== 'string' || obj.variablePrefix.length === 0) return null

  const makeCrosspointButton = validateLocation(obj.makeCrosspointButton)
  if (!makeCrosspointButton) return null

  let clearCrosspointButton: CompanionButtonLocation | null = null
  if (obj.clearCrosspointButton !== undefined && obj.clearCrosspointButton !== null) {
    clearCrosspointButton = validateLocation(obj.clearCrosspointButton)
    if (!clearCrosspointButton) return null
  }

  return {
    host,
    port,
    variablePrefix: obj.variablePrefix,
    makeCrosspointButton,
    clearCrosspointButton
  }
}

function validateLocation(raw: unknown): CompanionButtonLocation | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { page, row, column } = raw as Record<string, unknown>
  if (typeof page !== 'number' || typeof row !== 'number' || typeof column !== 'number') return null
  return { page, row, column }
}
