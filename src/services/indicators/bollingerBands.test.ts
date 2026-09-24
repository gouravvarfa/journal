import { describe, expect, it } from 'vitest'
import { calculateBollingerBands } from './bollingerBands'

describe('calculateBollingerBands', () => {
  it('returns null for the warm-up period', () => {
    const closes = Array.from({ length: 10 }, () => 100)
    const { upper, middle, lower } = calculateBollingerBands(closes, 20, 2)
    expect(upper.every((v) => v === null)).toBe(true)
    expect(middle.every((v) => v === null)).toBe(true)
    expect(lower.every((v) => v === null)).toBe(true)
  })

  it('collapses upper/middle/lower to the same value for constant prices', () => {
    const closes = Array.from({ length: 25 }, () => 50)
    const { upper, middle, lower } = calculateBollingerBands(closes, 20, 2)
    expect(middle[19]).toBe(50)
    expect(upper[19]).toBe(50)
    expect(lower[19]).toBe(50)
  })

  it('widens bands with higher volatility', () => {
    const flat = Array.from({ length: 25 }, () => 50)
    const volatile = Array.from({ length: 25 }, (_, i) => 50 + (i % 2 === 0 ? 5 : -5))
    const flatBands = calculateBollingerBands(flat, 20, 2)
    const volatileBands = calculateBollingerBands(volatile, 20, 2)
    const flatWidth = (flatBands.upper[19] ?? 0) - (flatBands.lower[19] ?? 0)
    const volatileWidth = (volatileBands.upper[19] ?? 0) - (volatileBands.lower[19] ?? 0)
    expect(volatileWidth).toBeGreaterThan(flatWidth)
  })
})
