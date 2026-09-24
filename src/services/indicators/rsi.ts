/**
 * Wilder-style RSI (the original/standard RSI formula), computed from an
 * array of closing prices. Returns one value per input close, with `null`
 * for the warm-up period before the first full `period`-length window is
 * available (matches how RSI is conventionally undefined until then).
 */
export function calculateRSI(closes: number[], period = 14): Array<number | null> {
  const result: Array<number | null> = new Array(closes.length).fill(null)
  if (closes.length <= period) {
    return result
  }

  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1]
    if (change >= 0) {
      avgGain += change
    } else {
      avgLoss -= change
    }
  }
  avgGain /= period
  avgLoss /= period

  result[period] = rsiFromAverages(avgGain, avgLoss)

  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    result[i] = rsiFromAverages(avgGain, avgLoss)
  }

  return result
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) {
    return 100
  }
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}
