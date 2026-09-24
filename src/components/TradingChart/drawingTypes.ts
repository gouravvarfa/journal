import type { Time } from 'lightweight-charts'

export type DrawingKind = 'horizontal' | 'vertical' | 'trend' | 'fib'

export interface DrawingPoint {
  time: Time
  price: number
}

/**
 * A user-created chart drawing. Anchored purely by time+price (never raw
 * pixel coordinates) so it stays correctly positioned across zoom, pan and
 * resize — the primitive recomputes pixels from these anchors every frame.
 *
 * `horizontal`/`vertical` use only `points[0]`. `trend`/`fib` use both.
 */
export interface Drawing {
  id: string
  kind: DrawingKind
  points: DrawingPoint[]
}

export interface DateRangeMeasurement {
  startTime: Time
  endTime: Time
  startPrice: number
  endPrice: number
  candleCount: number
  days: number
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const
