'use client'

import React, { useMemo, useState } from 'react'
import type { Granularity, SalesBucket } from '@/lib/analytics'
import { formatCompactNaira, niceTicks } from '@/lib/analytics'
import { formatNaira } from '@/lib/defaults'
import { useElementWidth } from '@/lib/useElementWidth'
import { CHART, SERIES_META, type SeriesKey } from './chartTheme'

interface Props {
  buckets: SalesBucket[]
  /** Visible series, in stacking order (bottom first). */
  series: SeriesKey[]
  granularity: Granularity
  /** Period totals per series, shown in the legend (the split at a glance). */
  totals?: Partial<Record<SeriesKey, number>>
}

const HEIGHT = 260 // includes the x-axis band, so the card never scrolls internally
const MARGIN = { top: 28, right: 12, bottom: 34, left: 58 }
const MAX_BAR = 24
const GAP = 2 // surface gap between stacked segments
const RADIUS = 4

const UNIT: Record<Granularity, string> = { day: 'day', week: 'week', month: 'month' }

/** A column segment: rounded 4px data-end on top, square at the baseline. */
function segmentPath(x: number, top: number, w: number, h: number, roundTop: boolean): string {
  const r = roundTop ? Math.min(RADIUS, w / 2, h) : 0
  if (r === 0) return `M${x},${top + h}V${top}H${x + w}V${top + h}Z`
  return (
    `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}` +
    `H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z`
  )
}

function bucketSummary(b: SalesBucket, series: SeriesKey[]): string {
  const total = series.reduce((s, k) => s + b[k], 0)
  const parts = series.length > 1 ? series.map((k) => `${SERIES_META[k].label} ${formatNaira(b[k])}`).join(', ') : ''
  const orders = `${b.orders} paid ${b.orders === 1 ? 'order' : 'orders'}`
  return `${b.longLabel}: ${formatNaira(total)}${parts ? ` (${parts})` : ''}, ${orders}.`
}

export function SalesChart({ buckets, series, granularity, totals: seriesTotals }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const totals = useMemo(() => buckets.map((b) => series.reduce((s, k) => s + b[k], 0)), [buckets, series])
  const max = Math.max(0, ...totals)
  const ticks = niceTicks(max > 0 ? max : 1)
  const top = ticks[ticks.length - 1] || 1
  const peakIndex = max > 0 ? totals.indexOf(max) : -1

  const n = buckets.length
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
  const band = n > 0 ? plotW / n : 0
  const barW = Math.max(2, Math.min(MAX_BAR, band * 0.62))
  const baseline = MARGIN.top + plotH
  const yOf = (v: number) => baseline - (v / top) * plotH
  const centerOf = (i: number) => MARGIN.left + i * band + band / 2

  // Thin the x labels so they never collide (~64px per label).
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 64))))

  function onKeyDown(e: React.KeyboardEvent) {
    if (n === 0) return
    const current = active ?? n - 1
    const next =
      e.key === 'ArrowRight' ? Math.min(n - 1, current + 1)
      : e.key === 'ArrowLeft' ? Math.max(0, current - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : e.key === 'Escape' ? null
      : undefined
    if (next === undefined) return
    e.preventDefault()
    setActive(next)
  }

  const activeBucket = active !== null ? buckets[active] : null
  const tooltipOnLeft = active !== null && centerOf(active) > width / 2

  return (
    <div className="space-y-3">
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#4A5240]" aria-label="Legend">
          {series.map((k) => (
            <li key={k} className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="w-2.5 h-2.5 rounded-[2px]" style={{ background: SERIES_META[k].color }} />
              <span className="font-semibold text-[#17210E]">{SERIES_META[k].label}</span>
              {seriesTotals?.[k] !== undefined && (
                <span className="tabular-nums">{formatNaira(seriesTotals[k]!)}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={`Verified sales per ${UNIT[granularity]}. Use the left and right arrow keys to read each ${UNIT[granularity]}.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? (n > 0 ? n - 1 : null))}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        className="relative rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#263E0F]"
        style={{ height: HEIGHT }}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="presentation" className="block select-none">
            {/* Gridlines and y-axis ticks (hairline, recessive) */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={MARGIN.left}
                  x2={width - MARGIN.right}
                  y1={Math.round(yOf(t)) + 0.5}
                  y2={Math.round(yOf(t)) + 0.5}
                  stroke={t === 0 ? CHART.baseline : CHART.gridline}
                  strokeWidth={1}
                />
                <text
                  x={MARGIN.left - 10}
                  y={yOf(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={12}
                  fill={CHART.axisText}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatCompactNaira(t)}
                </text>
              </g>
            ))}

            {/* Columns */}
            {buckets.map((b, i) => {
              const x = centerOf(i) - barW / 2
              const dim = active !== null && active !== i
              const visible = series.filter((k) => b[k] > 0)
              let cursor = baseline
              return (
                <g
                  key={b.start}
                  style={{ opacity: dim ? 0.45 : 1, transition: 'opacity 120ms ease-out' }}
                >
                  {visible.map((k, si) => {
                    const isTop = si === visible.length - 1
                    const fullH = Math.max(2, (b[k] / top) * plotH)
                    const gap = si > 0 ? GAP : 0
                    const h = Math.max(1, fullH - gap)
                    const segTop = cursor - gap - h
                    const path = segmentPath(x, segTop, barW, h, isTop)
                    cursor = segTop
                    return <path key={k} d={path} fill={SERIES_META[k].color} />
                  })}
                </g>
              )
            })}

            {/* Selective direct label: the peak only */}
            {peakIndex >= 0 && (
              <text
                x={centerOf(peakIndex)}
                y={yOf(totals[peakIndex]) - 8}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill={CHART.inkSecondary}
              >
                {formatCompactNaira(totals[peakIndex])}
              </text>
            )}

            {/* X-axis labels */}
            {buckets.map((b, i) =>
              i % labelEvery === 0 ? (
                <text
                  key={b.start}
                  x={centerOf(i)}
                  y={HEIGHT - 12}
                  textAnchor="middle"
                  fontSize={12}
                  fill={CHART.axisText}
                >
                  {b.label}
                </text>
              ) : null
            )}

            {/* Hit targets: the whole column band, not just the painted bar */}
            {buckets.map((b, i) => (
              <rect
                key={b.start}
                x={MARGIN.left + i * band}
                y={MARGIN.top}
                width={Math.max(band, 1)}
                height={plotH}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              />
            ))}
          </svg>
        )}

        {activeBucket && active !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-10 min-w-[168px] rounded-xl border border-[#E2DACA] bg-white px-3.5 py-3 shadow-lg"
            style={{
              top: MARGIN.top,
              left: tooltipOnLeft ? undefined : centerOf(active) + barW / 2 + 10,
              right: tooltipOnLeft ? width - (centerOf(active) - barW / 2 - 10) : undefined,
            }}
          >
            <p className="text-xs text-[#4A5240]">{activeBucket.longLabel}</p>
            <p className="text-base font-bold text-[#17210E]">{formatNaira(totals[active])}</p>
            {series.length > 1 && (
              <ul className="mt-1.5 space-y-1">
                {series.map((k) => (
                  <li key={k} className="flex items-center gap-2 text-xs">
                    <span aria-hidden="true" className="w-3 h-0.5 rounded-full" style={{ background: SERIES_META[k].color }} />
                    <span className="font-semibold text-[#17210E] tabular-nums">{formatNaira(activeBucket[k])}</span>
                    <span className="text-[#4A5240]">{SERIES_META[k].label}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-xs text-[#4A5240]">
              {activeBucket.orders} paid {activeBucket.orders === 1 ? 'order' : 'orders'}
            </p>
          </div>
        )}

        {/* Keyboard and screen-reader readout of the focused period */}
        <p className="sr-only" aria-live="polite">
          {activeBucket ? bucketSummary(activeBucket, series) : ''}
        </p>
      </div>
    </div>
  )
}

/** The chart's table twin: every value reachable without hovering. */
export function SalesTable({ buckets, series }: { buckets: SalesBucket[]; series: SeriesKey[] }) {
  return (
    <div className="max-h-[260px] overflow-auto rounded-xl border border-[#E2DACA]">
      <table className="w-full text-xs">
        <caption className="sr-only">Verified sales by period</caption>
        <thead className="sticky top-0 bg-[#FAF8F4] text-left text-[#4A5240]">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Period</th>
            {series.length > 1 &&
              series.map((k) => (
                <th key={k} scope="col" className="px-3 py-2 font-semibold text-right">
                  {SERIES_META[k].label}
                </th>
              ))}
            <th scope="col" className="px-3 py-2 font-semibold text-right">Sales</th>
            <th scope="col" className="px-3 py-2 font-semibold text-right">Paid orders</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F4EFE6] text-[#17210E] tabular-nums">
          {buckets.map((b) => (
            <tr key={b.start}>
              <th scope="row" className="px-3 py-2 text-left font-medium">{b.longLabel}</th>
              {series.length > 1 &&
                series.map((k) => (
                  <td key={k} className="px-3 py-2 text-right">{formatNaira(b[k])}</td>
                ))}
              <td className="px-3 py-2 text-right font-semibold">
                {formatNaira(series.reduce((s, k) => s + b[k], 0))}
              </td>
              <td className="px-3 py-2 text-right">{b.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
