import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import { FIB_LEVELS, type Drawing } from './drawingTypes'

const LINE_COLOR = '#2563EB'
const FIB_COLORS = ['#DC2626', '#F59E0B', '#16A34A', '#0D9488', '#2563EB', '#7C3AED', '#94A3B8']

class DrawingRenderer implements IPrimitivePaneRenderer {
  private readonly drawing: Drawing
  private readonly selected: boolean
  private readonly chart: IChartApiBase<Time>
  private readonly series: ISeriesApi<SeriesType>

  constructor(drawing: Drawing, selected: boolean, chart: IChartApiBase<Time>, series: ISeriesApi<SeriesType>) {
    this.drawing = drawing
    this.selected = selected
    this.chart = chart
    this.series = series
  }

  draw(target: CanvasRenderingTarget2D): void {
    const { chart, series, drawing, selected } = this
    const timeScale = chart.timeScale()

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const toXY = (point: Drawing['points'][number]): { x: number; y: number } | null => {
        const x = timeScale.timeToCoordinate(point.time)
        const y = series.priceToCoordinate(point.price)
        if (x === null || y === null) {
          return null
        }
        return { x, y }
      }

      ctx.save()
      ctx.lineWidth = selected ? 2 : 1.5
      ctx.strokeStyle = LINE_COLOR
      ctx.fillStyle = LINE_COLOR
      ctx.font = '11px Inter, system-ui, sans-serif'

      if (drawing.kind === 'horizontal') {
        const p0 = toXY(drawing.points[0])
        if (!p0) {
          ctx.restore()
          return
        }
        drawDashedLine(ctx, 0, p0.y, mediaSize.width, p0.y)
        drawEndpoint(ctx, p0.x, p0.y, selected)
        drawLabel(ctx, mediaSize.width - 4, p0.y, drawing.points[0].price.toFixed(2), 'right')
      }

      if (drawing.kind === 'vertical') {
        const p0 = toXY(drawing.points[0])
        if (!p0) {
          ctx.restore()
          return
        }
        drawDashedLine(ctx, p0.x, 0, p0.x, mediaSize.height)
        drawEndpoint(ctx, p0.x, p0.y, selected)
      }

      if (drawing.kind === 'trend') {
        const p0 = toXY(drawing.points[0])
        const p1 = drawing.points[1] ? toXY(drawing.points[1]) : null
        if (!p0) {
          ctx.restore()
          return
        }
        if (p1) {
          ctx.beginPath()
          ctx.moveTo(p0.x, p0.y)
          ctx.lineTo(p1.x, p1.y)
          ctx.stroke()
          drawEndpoint(ctx, p1.x, p1.y, selected)
        }
        drawEndpoint(ctx, p0.x, p0.y, selected)
      }

      if (drawing.kind === 'fib') {
        const p0 = toXY(drawing.points[0])
        const p1 = drawing.points[1] ? toXY(drawing.points[1]) : null
        if (!p0 || !p1) {
          if (p0) drawEndpoint(ctx, p0.x, p0.y, selected)
          ctx.restore()
          return
        }
        const startPrice = drawing.points[0].price
        const endPrice = drawing.points[1].price
        const left = Math.min(p0.x, p1.x)

        FIB_LEVELS.forEach((level, index) => {
          const price = startPrice + (endPrice - startPrice) * (1 - level)
          const y = series.priceToCoordinate(price)
          if (y === null) {
            return
          }
          ctx.strokeStyle = FIB_COLORS[index % FIB_COLORS.length]
          ctx.fillStyle = FIB_COLORS[index % FIB_COLORS.length]
          drawDashedLine(ctx, left, y, mediaSize.width, y)
          drawLabel(ctx, left + 4, y, `${(level * 100).toFixed(1)}% (${price.toFixed(2)})`, 'left')
        })

        ctx.strokeStyle = LINE_COLOR
        drawEndpoint(ctx, p0.x, p0.y, selected)
        drawEndpoint(ctx, p1.x, p1.y, selected)
      }

      ctx.restore()
    })
  }
}

function drawDashedLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.save()
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.restore()
}

function drawEndpoint(ctx: CanvasRenderingContext2D, x: number, y: number, selected: boolean): void {
  ctx.beginPath()
  ctx.arc(x, y, selected ? 5 : 3.5, 0, Math.PI * 2)
  ctx.fill()
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, align: 'left' | 'right'): void {
  ctx.save()
  const metrics = ctx.measureText(text)
  const paddingX = 4
  const boxWidth = metrics.width + paddingX * 2
  const boxX = align === 'right' ? x - boxWidth : x
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillRect(boxX, y - 9, boxWidth, 16)
  ctx.fillStyle = ctx.strokeStyle as string
  ctx.textBaseline = 'middle'
  ctx.fillText(text, boxX + paddingX, y - 1)
  ctx.restore()
}

class DrawingPaneView implements IPrimitivePaneView {
  private readonly drawing: Drawing
  private readonly selected: boolean
  private readonly chart: IChartApiBase<Time>
  private readonly series: ISeriesApi<SeriesType>

  constructor(drawing: Drawing, selected: boolean, chart: IChartApiBase<Time>, series: ISeriesApi<SeriesType>) {
    this.drawing = drawing
    this.selected = selected
    this.chart = chart
    this.series = series
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new DrawingRenderer(this.drawing, this.selected, this.chart, this.series)
  }
}

/**
 * A single ISeriesPrimitive instance holding every drawing for the chart.
 * Anchors are stored as time+price (see drawingTypes.ts) and converted to
 * pixels fresh on every draw call, so drawings track zoom/pan/resize
 * automatically instead of relying on fragile cached screen coordinates.
 */
export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null
  private series: ISeriesApi<SeriesType> | null = null
  private drawings: Drawing[] = []
  private selectedId: string | null = null
  private requestUpdateFn: (() => void) | null = null

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart
    this.series = param.series
    this.requestUpdateFn = param.requestUpdate
  }

  detached(): void {
    this.chart = null
    this.series = null
    this.requestUpdateFn = null
  }

  setDrawings(drawings: Drawing[], selectedId: string | null): void {
    this.drawings = drawings
    this.selectedId = selectedId
    this.requestUpdateFn?.()
  }

  paneViews(): readonly IPrimitivePaneView[] {
    if (!this.chart || !this.series) {
      return []
    }
    return this.drawings.map((drawing) => new DrawingPaneView(drawing, drawing.id === this.selectedId, this.chart!, this.series!))
  }
}
