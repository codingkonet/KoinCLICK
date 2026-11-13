import React, { useMemo } from 'react'
import { BarChart3, PieChart } from 'lucide-react'
import type { KoinTransaction } from '../lib/supabase'

interface SpendingChartsProps {
  transactions: KoinTransaction[]
  safeToSpendTodayUsd: number
  fmt: (usdAmount: number, decimals?: number) => string
  toDisplay: (usdAmount: number) => number
  title14Day: string
  titleCategoryMix: string
}

const CHART_COLORS = [
  '#0f766e',
  '#d97706',
  '#0369a1',
  '#4338ca',
  '#be123c',
  '#57534e',
]

export const SpendingCharts: React.FC<SpendingChartsProps> = ({
  transactions,
  safeToSpendTodayUsd,
  fmt,
  toDisplay,
  title14Day,
  titleCategoryMix,
}) => {
  // Build last 14 days daily expense totals (USD)
  const dailySeries = useMemo(() => {
    const days: Array<{ label: string; dateStr: string; amountUsd: number }> = []
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      days.push({ label, dateStr, amountUsd: 0 })
    }
    const map = new Map(days.map((d) => [d.dateStr, d]))
    for (const tx of transactions) {
      if (tx.tx_type !== 'expense') continue
      const key = String(tx.tx_date).slice(0, 10)
      const entry = map.get(key)
      if (entry) entry.amountUsd += Number(tx.amount || 0)
    }
    return days
  }, [transactions])

  const maxDailyUsd = useMemo(
    () =>
      Math.max(
        safeToSpendTodayUsd * 1.25,
        ...dailySeries.map((d) => d.amountUsd),
        10
      ),
    [dailySeries, safeToSpendTodayUsd]
  )

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.tx_type !== 'expense') continue
      map.set(tx.category, (map.get(tx.category) || 0) + Number(tx.amount || 0))
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1])
    const total = sorted.reduce((s, [, v]) => s + v, 0)
    return { items: sorted.slice(0, 6), total }
  }, [transactions])

  const safeLinePct = Math.min(100, Math.round((safeToSpendTodayUsd / maxDailyUsd) * 100))

  // SVG Donut segments
  const donutSegments = useMemo(() => {
    if (categoryTotals.total <= 0) return []
    const radius = 38
    const circumference = 2 * Math.PI * radius
    let offset = 0
    return categoryTotals.items.map(([cat, amt], idx) => {
      const fraction = amt / categoryTotals.total
      const dash = fraction * circumference
      const seg = {
        cat,
        amt,
        pct: Math.round(fraction * 100),
        color: CHART_COLORS[idx % CHART_COLORS.length],
        dasharray: `${dash} ${circumference - dash}`,
        dashoffset: -offset,
      }
      offset += dash
      return seg
    })
  }, [categoryTotals])

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
      {/* 14-Day Daily Spending Velocity */}
      <div className="lg:col-span-7 rounded-2xl sm:rounded-3xl bg-white border border-stone-200 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-teal-700" />
            <h3 className="text-sm sm:text-base font-bold text-stone-900">{title14Day}</h3>
          </div>
          <span className="text-[11px] text-teal-800 font-semibold">
            Safe line: {fmt(safeToSpendTodayUsd)}/d
          </span>
        </div>

        <div className="relative h-40 flex items-end gap-1.5 pt-4">
          {safeToSpendTodayUsd > 0 && (
            <div
              className="absolute inset-x-0 border-t border-dashed border-cyan-400/50 pointer-events-none"
              style={{ bottom: `${safeLinePct}%` }}
            />
          )}
          {dailySeries.map((d) => {
            const hPct = Math.max(4, Math.round((d.amountUsd / maxDailyUsd) * 100))
            const overSafe = safeToSpendTodayUsd > 0 && d.amountUsd > safeToSpendTodayUsd
            return (
              <div
                key={d.dateStr}
                title={`${d.label}: ${fmt(d.amountUsd)}`}
                className="flex-1 flex flex-col items-center gap-1 h-full justify-end group"
              >
                <div className="w-full flex items-end justify-center h-full">
                  <div
                    className={`w-full max-w-[22px] rounded-t-md transition-all ${
                      d.amountUsd === 0
                        ? 'bg-stone-200/70'
                        : overSafe
                          ? 'bg-gradient-to-t from-rose-600 to-rose-400'
                          : 'bg-gradient-to-t from-teal-700 to-teal-500'
                    }`}
                    style={{ height: `${d.amountUsd === 0 ? 4 : hPct}%` }}
                  />
                </div>
                <span className="text-[9px] text-stone-500 truncate max-w-full">
                  {d.dateStr.slice(8)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Category Share Donut */}
      <div className="lg:col-span-5 rounded-2xl sm:rounded-3xl bg-white border border-stone-200 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-teal-700" />
            <h3 className="text-sm sm:text-base font-bold text-stone-900">{titleCategoryMix}</h3>
          </div>
          <span className="text-xs font-semibold text-stone-500">
            {fmt(categoryTotals.total)}
          </span>
        </div>

        {categoryTotals.total <= 0 ? (
          <div className="h-36 flex items-center justify-center text-xs text-stone-500">
            Log an expense to see your category donut chart.
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0 -rotate-90">
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#e7e5e4"
                strokeWidth="12"
              />
              {donutSegments.map((seg) => (
                <circle
                  key={seg.cat}
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="12"
                  strokeDasharray={seg.dasharray}
                  strokeDashoffset={seg.dashoffset}
                />
              ))}
            </svg>

            <div className="flex-1 space-y-1.5 min-w-0">
              {donutSegments.map((seg) => (
                <div key={seg.cat} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-stone-700 truncate">{seg.cat}</span>
                  </div>
                  <span className="text-stone-500 font-semibold shrink-0">
                    {seg.pct}% ({Math.round(toDisplay(seg.amt))})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
