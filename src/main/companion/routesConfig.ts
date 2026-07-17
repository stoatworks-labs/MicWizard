import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { CompanionCrosspointConfig } from '../../shared/types'
import { validateCompanionConfig } from './validateCompanionConfig'

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

  const parsed = validateCompanionConfig(raw)
  if (!parsed) {
    console.error(`[companion] ${configPath} does not match the expected shape - see companion-routes.example.json`)
    return null
  }
  return parsed
}
