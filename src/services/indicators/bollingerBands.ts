export interface BollingerBandsResult {
  upper: Array<number | null>
  middle: Array<number | null>
  lower: Array<number | null>
}

/**
 * Classic Bollinger Bands: an SMA middle band plus/minus `multiplier`
 * standard deviations. `null` for the warm-up period before a full
 * `period`-length window is available.
 */
export function calculateBollingerBands(closes: number[], period = 20, multiplier = 2): BollingerBandsResult {
  const upper: Array<number | null> = new Array(closes.length).fill(null)
  const middle: Array<number | null> = new Array(closes.length).fill(null)
  const lower: Array<number | null> = new Array(closes.length).fill(null)

  for (let i = period - 1; i < closes.length; i += 1) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j += 1) {
      sum += closes[j]
    }
    const mean = sum / period

    let variance = 0
    for (let j = i - period + 1; j <= i; j += 1) {
      variance += (closes[j] - mean) ** 2
    }
    const stdDev = Math.sqrt(variance / period)

    middle[i] = mean
    upper[i] = mean + multiplier * stdDev
    lower[i] = mean - multiplier * stdDev
  }

  return { upper, middle, lower }
}
