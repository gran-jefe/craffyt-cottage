import React from 'react'
import { CHART } from './chartTheme'

export interface BarListRow {
  key: string
  label: string
  value: number
  /** Printed value, e.g. "₦135,000" or "3" */
  valueLabel: string
  /** Secondary figure, e.g. "3 sold" or "25%" */
  detail?: string
  /** De-emphasised row (folded "Other") */
  muted?: boolean
}

interface Props {
  rows: BarListRow[]
  /** Accessible name for the list, e.g. "Top products by revenue" */
  label: string
  /** Scale max; defaults to the largest row (ranked bars), or pass a whole for shares. */
  max?: number
  emptyText: string
}

/**
 * Ranked horizontal bars on one baseline: name and figures on the first line, the bar under it,
 * so long names never collide at any width. Every value is printed, so no tooltip is needed.
 */
export function BarList({ rows, label, max, emptyText }: Props) {
  const scale = max ?? Math.max(0, ...rows.map((r) => r.value))

  if (rows.length === 0 || scale <= 0) {
    return <p className="py-6 text-sm text-[#3F4F4C] text-center">{emptyText}</p>
  }

  return (
    <ul aria-label={label} className="space-y-3">
      {rows.map((row) => {
        const pct = Math.max(0, Math.min(100, (row.value / scale) * 100))
        return (
          <li key={row.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span
                title={row.label}
                className={`min-w-0 truncate ${row.muted ? 'text-[#3F4F4C]' : 'font-semibold text-[#0F1F1D]'}`}
              >
                {row.label}
              </span>
              <span className="shrink-0 tabular-nums text-[#0F1F1D]">
                <span className="font-semibold">{row.valueLabel}</span>
                {row.detail && <span className="ml-2 text-xs text-[#3F4F4C]">{row.detail}</span>}
              </span>
            </div>
            <div aria-hidden="true" className="h-2.5">
              {row.value > 0 && (
                <div
                  className="h-full rounded-r-[4px] transition-[width] duration-200 ease-out"
                  style={{
                    width: `max(${pct}%, 3px)`,
                    background: row.muted ? CHART.other : CHART.online,
                  }}
                />
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
