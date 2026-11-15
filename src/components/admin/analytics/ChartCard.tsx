'use client'

import React, { useState } from 'react'
import { BarChart3, Table2 } from 'lucide-react'

interface Props {
  title: string
  subtitle?: string
  /** When given, the card offers a chart/table toggle (the chart's accessible twin). */
  table?: React.ReactNode
  /** Right-aligned summary figure, e.g. the period total */
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function ChartCard({ title, subtitle, table, aside, children, className = '' }: Props) {
  const [showTable, setShowTable] = useState(false)
  const headingId = `chart-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  return (
    <section aria-labelledby={headingId} className={`bg-white rounded-2xl border border-[#E2DACA] p-5 sm:p-6 space-y-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="font-serif-display text-lg font-bold text-[#17210E]">
            {title}
          </h3>
          {subtitle && <p className="text-xs text-[#4A5240] leading-relaxed">{subtitle}</p>}
        </div>
        <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-3">
          {aside}
          {table && (
            <button
              type="button"
              aria-pressed={showTable}
              onClick={() => setShowTable((v) => !v)}
              className="min-h-[44px] px-3 rounded-xl border border-[#E2DACA] hover:border-[#263E0F] hover:bg-[#FAF8F4] text-xs font-bold text-[#17210E] inline-flex items-center gap-1.5 transition-colors"
            >
              {showTable ? <BarChart3 className="w-4 h-4" /> : <Table2 className="w-4 h-4" />}
              <span>{showTable ? 'Show chart' : 'Show table'}</span>
            </button>
          )}
        </div>
      </div>
      {showTable && table ? table : children}
    </section>
  )
}
