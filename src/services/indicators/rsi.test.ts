import { describe, expect, it } from 'vitest'
import { calculateRSI } from './rsi'

describe('calculateRSI', () => {
  it('returns null for the warm-up period', () => {
    const closes = Array.from({ length: 10 }, (_, i) => 100 + i)
    const rsi = calculateRSI(closes, 14)
    expect(rsi.every((value) => value === null)).toBe(true)
  })

  it('returns 100 when there are no losses in the window', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    const rsi = calculateRSI(closes, 14)
    expect(rsi[14]).toBe(100)
  })

  it('returns 0 when there are no gains in the window', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i)
    const rsi = calculateRSI(closes, 14)
    expect(rsi[14]).toBe(0)
  })

  it('stays within 0-100 for mixed data', () => {
    const closes = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.85, 47.25, 47.09, 46.5, 46.66, 46.16, 46.9, 46.41]
    const rsi = calculateRSI(closes, 14)
    const last = rsi[rsi.length - 1]
    expect(last).not.toBeNull()
    expect(last as number).toBeGreaterThan(0)
    expect(last as number).toBeLessThan(100)
  })
})
