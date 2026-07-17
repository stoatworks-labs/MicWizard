import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeLevels, dbFromLinear, LevelSmoother } from '../src/main/audio/levels.ts'

test('dbFromLinear: silence floors at -96dB', () => {
  assert.equal(dbFromLinear(0), -96)
  assert.equal(dbFromLinear(-1), -96) // negative input treated as silence too
})

test('dbFromLinear: full scale is 0dB', () => {
  assert.equal(dbFromLinear(1), 0)
})

test('dbFromLinear: half amplitude is about -6dB', () => {
  const db = dbFromLinear(0.5)
  assert.ok(Math.abs(db - -6.02) < 0.01, `expected ~-6.02dB, got ${db}`)
})

test('computeLevels: silent buffer reports floor for both rms and peak', () => {
  const { rmsDb, peakDb } = computeLevels(new Float32Array(480))
  assert.equal(rmsDb, -96)
  assert.equal(peakDb, -96)
})

test('computeLevels: full-scale square wave reports 0dB peak and rms', () => {
  const samples = new Float32Array(480).fill(1)
  const { rmsDb, peakDb } = computeLevels(samples)
  assert.equal(peakDb, 0)
  assert.equal(rmsDb, 0)
})

test('computeLevels: known sine amplitude matches expected dBFS', () => {
  // A -6dBFS sine (0.5 peak amplitude) has RMS = 0.5/sqrt(2) ~= 0.3536, i.e. ~-9.03dBFS RMS
  const frameCount = 480
  const samples = new Float32Array(frameCount)
  for (let i = 0; i < frameCount; i++) {
    samples[i] = 0.5 * Math.sin((2 * Math.PI * 37 * i) / frameCount)
  }
  const { rmsDb, peakDb } = computeLevels(samples)
  assert.ok(Math.abs(peakDb - -6.02) < 0.1, `expected peak ~-6.02dB, got ${peakDb}`)
  assert.ok(Math.abs(rmsDb - -9.03) < 0.2, `expected rms ~-9.03dB, got ${rmsDb}`)
})

test('LevelSmoother: attacks fast, releases slow (asymmetric, not just averaging)', () => {
  const smoother = new LevelSmoother(0.6, 0.1)
  const afterAttack = smoother.push(0) // jump from floor (-96) toward 0
  const attackMove = afterAttack - -96
  const afterRelease = smoother.push(-96) // drop back toward floor
  const releaseMove = Math.abs(afterRelease - afterAttack)
  assert.ok(attackMove > 0, 'should move toward the louder value on attack')
  assert.ok(releaseMove < attackMove, 'release step should be smaller than attack step given release < attack')
})

test('LevelSmoother: converges toward a sustained input over repeated pushes', () => {
  const smoother = new LevelSmoother()
  let value = -96
  for (let i = 0; i < 50; i++) value = smoother.push(-20)
  assert.ok(Math.abs(value - -20) < 0.5, `expected convergence near -20dB, got ${value}`)
})
