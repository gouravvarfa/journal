import { useCallback, useEffect, useRef, useState } from 'react'
import type { IChartApiBase, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import type { DrawingsPrimitive } from '../components/TradingChart/DrawingsPrimitive'
import type { DateRangeMeasurement, Drawing, DrawingKind, DrawingPoint } from '../components/TradingChart/drawingTypes'

export type MeasureTool = DrawingKind | 'range'

/**
 * idle    — normal TradingView-style chart navigation (pan/scroll/zoom).
 * drawing — a measure tool is armed or a new drawing is being dragged out;
 *           editing — an existing drawing's handle is being dragged.
 * Both non-idle states disable the chart's own pan/scroll/zoom handling so
 * a drawing drag can never also move the chart underneath it.
 */
export type DrawingInteractionMode = 'idle' | 'drawing' | 'editing'

interface HitTarget {
  drawingId: string
  handle: 'whole' | 'p0' | 'p1'
}

const HIT_TOLERANCE_PX = 10
const DRAFT_ID = '__draft__'

let nextId = 1
const makeId = (): string => `drawing-${Date.now()}-${nextId++}`

/** Reads the primary pointer position from a mouse or single-touch event. */
function pointerPosition(event: MouseEvent | TouchEvent): { clientX: number; clientY: number } | null {
  if ('touches' in event) {
    const touch = event.touches[0] ?? event.changedTouches[0]
    return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null
  }
  return { clientX: event.clientX, clientY: event.clientY }
}

/**
 * Owns drawing creation, selection, dragging and the date-range measure
 * tool — TradingView-style press-drag-release interaction for both mouse
 * and touch. Talks to the chart only through `chart`/`series` refs handed
 * in by the caller (from useTradingChart) plus a container element for
 * pointer events — it never reaches into React-chart internals directly.
 *
 * Every anchor is stored as chart time+price (see drawingTypes.ts), never
 * screen pixels, so drawings stay correctly positioned across zoom, pan,
 * resize and timeframe changes — pixels are only ever computed on demand
 * for hit-testing and live-preview rendering.
 */
export function useChartDrawings(
  containerRef: React.RefObject<HTMLDivElement | null>,
  chartRef: React.RefObject<IChartApiBase<Time> | null>,
  seriesRef: React.RefObject<ISeriesApi<SeriesType> | null>,
  primitive: DrawingsPrimitive,
) {
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [activeTool, setActiveTool] = useState<MeasureTool | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftDrawing, setDraftDrawing] = useState<Drawing | null>(null)
  const [rangeMeasurement, setRangeMeasurement] = useState<DateRangeMeasurement | null>(null)
  const [interactionMode, setInteractionMode] = useState<DrawingInteractionMode>('idle')

  const dragRef = useRef<HitTarget | null>(null)
  const creatingRef = useRef<{ tool: MeasureTool; start: DrawingPoint; moved: boolean } | null>(null)
  const drawingsRef = useRef(drawings)
  drawingsRef.current = drawings
  const activeToolRef = useRef(activeTool)
  activeToolRef.current = activeTool

  useEffect(() => {
    const preview = draftDrawing ? [draftDrawing] : []
    primitive.setDrawings([...drawings, ...preview], selectedId)
  }, [drawings, selectedId, draftDrawing, primitive])

  // A tool being armed always means "drawing" — covers both the pre-press
  // wait and the actual creation drag, since the tool stays set the whole
  // time (see handlePressEnd, which clears it once the drawing is placed).
  useEffect(() => {
    if (activeTool) {
      setInteractionMode('drawing')
    } else {
      setInteractionMode((current) => (current === 'drawing' ? 'idle' : current))
    }
  }, [activeTool])

  // Chart pan/scroll/zoom must never fight a drawing drag for the same
  // pointer events — disable them entirely for the duration of any
  // non-idle interaction, and restore whatever the chart's own defaults
  // are the instant we're back to idle. Also drives the crosshair cursor
  // and blocks native touch scrolling/pinch on iPad while drawing.
  useEffect(() => {
    const chart = chartRef.current
    const container = containerRef.current
    const locked = interactionMode !== 'idle'
    if (chart) {
      chart.applyOptions({ handleScroll: !locked, handleScale: !locked })
    }
    if (container) {
      container.style.cursor = locked ? 'crosshair' : ''
      container.style.touchAction = locked ? 'none' : ''
    }
    return () => {
      if (container) {
        container.style.cursor = ''
        container.style.touchAction = ''
      }
    }
  }, [interactionMode, chartRef, containerRef])

  const pointFromPosition = useCallback(
    (clientX: number, clientY: number): DrawingPoint | null => {
      const chart = chartRef.current
      const series = seriesRef.current
      const container = containerRef.current
      if (!chart || !series || !container) {
        return null
      }
      const rect = container.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const time = chart.timeScale().coordinateToTime(x)
      const price = series.coordinateToPrice(y)
      if (time === null || price === null) {
        return null
      }
      return { time, price }
    },
    [chartRef, seriesRef, containerRef],
  )

  const pixelOf = useCallback(
    (point: DrawingPoint): { x: number; y: number } | null => {
      const chart = chartRef.current
      const series = seriesRef.current
      if (!chart || !series) {
        return null
      }
      const x = chart.timeScale().timeToCoordinate(point.time)
      const y = series.priceToCoordinate(point.price)
      if (x === null || y === null) {
        return null
      }
      return { x, y }
    },
    [chartRef, seriesRef],
  )

  const hitTest = useCallback(
    (clientX: number, clientY: number): HitTarget | null => {
      const container = containerRef.current
      if (!container) {
        return null
      }
      const rect = container.getBoundingClientRect()
      const mx = clientX - rect.left
      const my = clientY - rect.top

      for (const drawing of drawingsRef.current) {
        if (drawing.kind === 'horizontal') {
          const p0 = pixelOf(drawing.points[0])
          if (p0 && Math.abs(my - p0.y) <= HIT_TOLERANCE_PX) {
            return { drawingId: drawing.id, handle: 'whole' }
          }
        } else if (drawing.kind === 'vertical') {
          const p0 = pixelOf(drawing.points[0])
          if (p0 && Math.abs(mx - p0.x) <= HIT_TOLERANCE_PX) {
            return { drawingId: drawing.id, handle: 'whole' }
          }
        } else {
          const p0 = pixelOf(drawing.points[0])
          const p1 = drawing.points[1] ? pixelOf(drawing.points[1]) : null
          if (p0 && Math.hypot(mx - p0.x, my - p0.y) <= HIT_TOLERANCE_PX) {
            return { drawingId: drawing.id, handle: 'p0' }
          }
          if (p1 && Math.hypot(mx - p1.x, my - p1.y) <= HIT_TOLERANCE_PX) {
            return { drawingId: drawing.id, handle: 'p1' }
          }
        }
      }
      return null
    },
    [containerRef, pixelOf],
  )

  /**
   * Imperatively flips the chart's own pan/scroll/zoom handling, bypassing
   * React state+effect entirely. Must run synchronously inside the same
   * mousedown/touchstart dispatch that starts a drawing/reposition drag —
   * lightweight-charts' own pan handler runs off that same event, so if the
   * lock only lands via a later effect (after this handler returns), the
   * library has already begun panning for this gesture and the chart still
   * moves alongside the drawing. The event listener below is registered in
   * the capture phase specifically so this fires before the chart's own
   * (bubble-phase) handler ever sees the event.
   */
  const lockChartNavImmediately = useCallback(
    (locked: boolean) => {
      chartRef.current?.applyOptions({ handleScroll: !locked, handleScale: !locked })
    },
    [chartRef],
  )

  const rangeMeasurementFrom = (start: DrawingPoint, end: DrawingPoint): DateRangeMeasurement => {
    const [lo, hi] = start.time <= end.time ? [start, end] : [end, start]
    const startMs = typeof lo.time === 'number' ? lo.time * 1000 : Date.parse(String(lo.time))
    const endMs = typeof hi.time === 'number' ? hi.time * 1000 : Date.parse(String(hi.time))
    const days = Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)))
    return { startTime: lo.time, endTime: hi.time, startPrice: lo.price, endPrice: hi.price, candleCount: days, days }
  }

  // ---- Press → drag → release creation, mouse + touch ----

  const handlePressStart = useCallback(
    (event: MouseEvent | TouchEvent): void => {
      const pos = pointerPosition(event)
      if (!pos) {
        return
      }

      const tool = activeToolRef.current
      if (tool) {
        const point = pointFromPosition(pos.clientX, pos.clientY)
        if (!point) {
          return
        }
        // Already locked from the moment the tool was armed (see the
        // activeTool effect), but re-assert synchronously here too in case
        // this is the very first press right after selecting the tool.
        lockChartNavImmediately(true)
        creatingRef.current = { tool, start: point, moved: false }
        if (tool === 'range') {
          setDraftDrawing(null)
        } else {
          setDraftDrawing({ id: DRAFT_ID, kind: tool, points: tool === 'horizontal' || tool === 'vertical' ? [point] : [point, point] })
        }
        return
      }

      // Not in a tool: pressing on an existing drawing starts a reposition drag.
      const hit = hitTest(pos.clientX, pos.clientY)
      if (hit) {
        lockChartNavImmediately(true)
        dragRef.current = hit
        setSelectedId(hit.drawingId)
        setInteractionMode('editing')
      }
    },
    [hitTest, pointFromPosition, lockChartNavImmediately],
  )

  const handlePressMove = useCallback(
    (event: MouseEvent | TouchEvent): void => {
      const creating = creatingRef.current
      const drag = dragRef.current
      if (!creating && !drag) {
        return
      }
      const pos = pointerPosition(event)
      if (!pos) {
        return
      }
      const point = pointFromPosition(pos.clientX, pos.clientY)
      if (!point) {
        return
      }

      if ('touches' in event) {
        event.preventDefault()
      }

      if (creating) {
        creating.moved = true
        if (creating.tool === 'range') {
          setDraftDrawing({ id: DRAFT_ID, kind: 'trend', points: [creating.start, point] })
        } else if (creating.tool === 'horizontal') {
          setDraftDrawing({ id: DRAFT_ID, kind: 'horizontal', points: [point] })
        } else if (creating.tool === 'vertical') {
          setDraftDrawing({ id: DRAFT_ID, kind: 'vertical', points: [point] })
        } else {
          setDraftDrawing({ id: DRAFT_ID, kind: creating.tool, points: [creating.start, point] })
        }
        return
      }

      if (drag) {
        setDrawings((current) =>
          current.map((drawing) => {
            if (drawing.id !== drag.drawingId) {
              return drawing
            }
            if (drag.handle === 'whole') {
              return { ...drawing, points: [point] }
            }
            if (drag.handle === 'p0') {
              return { ...drawing, points: [point, drawing.points[1]] }
            }
            return { ...drawing, points: [drawing.points[0], point] }
          }),
        )
      }
    },
    [pointFromPosition],
  )

  const handlePressEnd = useCallback(
    (event: MouseEvent | TouchEvent): void => {
      const creating = creatingRef.current
      const wasDragging = dragRef.current !== null
      creatingRef.current = null
      dragRef.current = null
      setDraftDrawing(null)

      // Every gesture this hook starts (tool-armed creation or dragging an
      // existing drawing's handle) ends the interaction — restore normal
      // chart navigation immediately rather than waiting on React's effect
      // cycle, mirroring the synchronous lock taken in handlePressStart.
      if (creating || wasDragging) {
        lockChartNavImmediately(false)
        setInteractionMode('idle')
      }

      if (!creating) {
        return
      }

      const pos = pointerPosition(event)
      const endPoint = pos ? pointFromPosition(pos.clientX, pos.clientY) : null

      if (creating.tool === 'range') {
        if (endPoint) {
          setRangeMeasurement(rangeMeasurementFrom(creating.start, creating.moved ? endPoint : creating.start))
        }
        setActiveTool(null)
        return
      }

      if (creating.tool === 'horizontal' || creating.tool === 'vertical') {
        const finalPoint = creating.moved && endPoint ? endPoint : creating.start
        setDrawings((current) => [...current, { id: makeId(), kind: creating.tool as 'horizontal' | 'vertical', points: [finalPoint] }])
        setActiveTool(null)
        return
      }

      // trend / fib — need a real second point; a plain tap with no drag doesn't create anything.
      if (creating.moved && endPoint) {
        setDrawings((current) => [...current, { id: makeId(), kind: creating.tool as 'trend' | 'fib', points: [creating.start, endPoint] }])
      }
      setActiveTool(null)
    },
    [pointFromPosition, lockChartNavImmediately],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const handleClick = (event: MouseEvent): void => {
      // Selection only — creation happens on press/drag/release above.
      if (activeToolRef.current || creatingRef.current) {
        return
      }
      const hit = hitTest(event.clientX, event.clientY)
      setSelectedId(hit?.drawingId ?? null)
    }

    const onMouseDown = (event: MouseEvent): void => handlePressStart(event)
    const onMouseMove = (event: MouseEvent): void => handlePressMove(event)
    const onMouseUp = (event: MouseEvent): void => handlePressEnd(event)
    const onTouchStart = (event: TouchEvent): void => handlePressStart(event)
    const onTouchMove = (event: TouchEvent): void => handlePressMove(event)
    const onTouchEnd = (event: TouchEvent): void => handlePressEnd(event)

    container.addEventListener('click', handleClick)
    // Capture phase: must run BEFORE lightweight-charts' own mousedown/
    // touchstart handler (bound to its inner canvas, deeper in the DOM) so
    // the chart-nav lock this triggers is in effect before the library's
    // pan/zoom tracking can start for the same gesture — otherwise the
    // chart has already begun panning by the time our lock lands.
    container.addEventListener('mousedown', onMouseDown, { capture: true })
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    container.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)

    return () => {
      container.removeEventListener('click', handleClick)
      container.removeEventListener('mousedown', onMouseDown, { capture: true })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('touchstart', onTouchStart, { capture: true })
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [containerRef, hitTest, handlePressStart, handlePressMove, handlePressEnd])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'

      if (event.key === 'Escape') {
        creatingRef.current = null
        dragRef.current = null
        setDraftDrawing(null)
        setActiveTool(null)
        return
      }
      if (!isTyping && (event.key === 'Delete' || event.key === 'Backspace')) {
        setSelectedId((current) => {
          if (current) {
            setDrawings((drawingsList) => drawingsList.filter((drawing) => drawing.id !== current))
          }
          return null
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const startTool = useCallback((tool: MeasureTool) => {
    setActiveTool(tool)
    creatingRef.current = null
    setDraftDrawing(null)
    setSelectedId(null)
  }, [])

  const cancelTool = useCallback(() => {
    creatingRef.current = null
    setDraftDrawing(null)
    setActiveTool(null)
  }, [])

  const deleteSelected = useCallback(() => {
    if (!selectedId) {
      return
    }
    setDrawings((current) => current.filter((drawing) => drawing.id !== selectedId))
    setSelectedId(null)
  }, [selectedId])

  const clearDrawings = useCallback(() => {
    setDrawings([])
    setSelectedId(null)
    setRangeMeasurement(null)
  }, [])

  const clearMeasurement = useCallback(() => setRangeMeasurement(null), [])

  return {
    drawings,
    activeTool,
    pendingPoint: draftDrawing ? draftDrawing.points[0] : null,
    isDragCreating: creatingRef.current !== null,
    selectedId,
    rangeMeasurement,
    startTool,
    cancelTool,
    deleteSelected,
    clearDrawings,
    clearMeasurement,
  }
}
