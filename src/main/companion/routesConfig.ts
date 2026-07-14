import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { CompanionButtonLocation, CompanionCrosspointConfig } from '../../shared/types'

/**
 * Where the user's own companion-routes.json lives. Absence of this file
 * is the default, expected state - this app ships with no Dante routing
 * capability until the user opts in by creating it. See
 * companion-routes.example.json at the repo root and the README section
 * on Companion integration.
 */
export function companionConfigPath(): string {
  return path.join(app.getPath('userData'), 'companion-routes.json')
}

export function loadCompanionConfig(): CompanionCrosspointConfig | null {
  const configPath = companionConfigPath()
  if (!fs.existsSync(configPath)) return null

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (err) {
    console.error(`[companion] failed to parse ${configPath}`, err)
    return null
  }

  const parsed = validate(raw)
  if (!parsed) {
    console.error(`[companion] ${configPath} does not match the expected shape - see companion-routes.example.json`)
    return null
  }
  return parsed
}

function validate(raw: unknown): CompanionCrosspointConfig | null {
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
