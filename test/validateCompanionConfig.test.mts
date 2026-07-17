import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateCompanionConfig } from '../src/main/companion/validateCompanionConfig.ts'

// Shape of the raw JSON file (companion-routes.example.json) - nested "companion" block.
const VALID = {
  companion: { host: '127.0.0.1', port: 8000 },
  variablePrefix: 'dante',
  makeCrosspointButton: { page: 1, row: 0, column: 0 },
  clearCrosspointButton: { page: 1, row: 0, column: 1 }
}

// Shape validateCompanionConfig() returns - host/port flattened onto the top-level CompanionCrosspointConfig.
const EXPECTED = {
  host: '127.0.0.1',
  port: 8000,
  variablePrefix: 'dante',
  makeCrosspointButton: { page: 1, row: 0, column: 0 },
  clearCrosspointButton: { page: 1, row: 0, column: 1 }
}

test('accepts a fully-formed config matching companion-routes.example.json, flattening host/port', () => {
  const result = validateCompanionConfig(VALID)
  assert.deepEqual(result, EXPECTED)
})

test('accepts a config with no clearCrosspointButton (optional)', () => {
  const { clearCrosspointButton, ...withoutClear } = VALID
  const result = validateCompanionConfig(withoutClear)
  assert.ok(result)
  assert.equal(result.clearCrosspointButton, null)
})

test('accepts an explicit null clearCrosspointButton', () => {
  const result = validateCompanionConfig({ ...VALID, clearCrosspointButton: null })
  assert.ok(result)
  assert.equal(result.clearCrosspointButton, null)
})

test('rejects non-object input', () => {
  assert.equal(validateCompanionConfig(null), null)
  assert.equal(validateCompanionConfig('a string'), null)
  assert.equal(validateCompanionConfig(42), null)
  assert.equal(validateCompanionConfig(undefined), null)
})

test('rejects a missing companion block', () => {
  const { companion, ...rest } = VALID
  assert.equal(validateCompanionConfig(rest), null)
})

test('rejects a non-numeric port', () => {
  assert.equal(
    validateCompanionConfig({ ...VALID, companion: { host: '127.0.0.1', port: '8000' } }),
    null
  )
})

test('rejects an empty variablePrefix', () => {
  assert.equal(validateCompanionConfig({ ...VALID, variablePrefix: '' }), null)
})

test('rejects a missing variablePrefix', () => {
  const { variablePrefix, ...rest } = VALID
  assert.equal(validateCompanionConfig(rest), null)
})

test('rejects a missing makeCrosspointButton', () => {
  const { makeCrosspointButton, ...rest } = VALID
  assert.equal(validateCompanionConfig(rest), null)
})

test('rejects a makeCrosspointButton missing a field', () => {
  assert.equal(
    validateCompanionConfig({ ...VALID, makeCrosspointButton: { page: 1, row: 0 } }),
    null
  )
})

test('rejects a malformed clearCrosspointButton rather than silently ignoring it', () => {
  assert.equal(
    validateCompanionConfig({ ...VALID, clearCrosspointButton: { page: 'one', row: 0, column: 1 } }),
    null
  )
})
