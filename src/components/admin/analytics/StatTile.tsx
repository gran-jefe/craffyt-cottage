import React from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { percentChange, type Metric } from '@/lib/analytics'
import { CHART } from './chartTheme'

interface Props {
  label: string
  metric: Metric
  format: (value: number) => string
  /** e.g. "vs previous 30 days"; null when the period has no comparison */
  compareLabel: string | null
  /** Whether a rise is good news (true for sales; false for e.g. cancellations) */
  upIsGood?: boolean
}

/** Stat tile: label · value · signed delta vs a named period. Direction is shown by icon and sign, never colour alone. */
export function StatTile({ label, metric, format, compareLabel, upIsGood = true }: Props) {
  const change = percentChange(metric)
  let delta: React.ReactNode

  if (compareLabel === null || metric.previous === null) {
    delta = <span className="text-[#4A5240]">No earlier period to compare</span>
  } else if (change === null) {
    // Previous period was zero: a percentage would be infinite, so say it plainly.
    delta = (
      <span className="text-[#4A5240]">
        {metric.value > 0 ? 'Up from nothing' : 'None in either period'} {compareLabel}
      </span>
    )
  } else {
    const rounded = Math.round(change * 10) / 10
    const flat = Math.abs(rounded) < 0.5
    const up = rounded > 0
    const good = flat ? null : up === upIsGood
    const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
    const color = good === null ? CHART.inkSecondary : good ? CHART.deltaUp : CHART.deltaDown
    const text = flat ? 'No change' : `${up ? '+' : '−'}${Math.abs(rounded).toFixed(Math.abs(rounded) < 10 ? 1 : 0)}%`
    // Wraps as normal text on narrow tiles: the change stays together, the comparison flows after it.
    delta = (
      <span className="flex flex-wrap items-center gap-x-1">
        <span className="inline-flex items-center gap-0.5 font-semibold whitespace-nowrap" style={{ color }}>
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          {text}
        </span>
        <span className="text-[#4A5240]">{compareLabel}</span>
      </span>
    )
  }

  return (
    <div className="bg-white p-4 sm:p-5 space-y-1">
      <p className="text-xs font-semibold text-[#4A5240]">{label}</p>
      <p className="text-2xl sm:text-[28px] leading-tight font-bold text-[#17210E]">{format(metric.value)}</p>
      <p className="text-xs leading-relaxed">{delta}</p>
    </div>
  )
}
