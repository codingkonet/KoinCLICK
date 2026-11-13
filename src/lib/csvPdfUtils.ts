import { guessCategoryFromTitle } from './aiBudgetService'
import type { KoinSettings, KoinSubscription, KoinTransaction } from './supabase'

export interface ParsedCsvTx {
  title: string
  amount: number
  tx_type: 'expense' | 'income'
  category: string
  tx_date: string
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if ((ch === ',' || ch === ';') && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function normalizeDate(raw: string): string {
  const cleaned = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10)
  const dmy = cleaned.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parsed = new Date(cleaned)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

export function parseBankCsv(csvText: string): ParsedCsvTx[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase())
  const dateIdx = headers.findIndex((h) => /date|time|posted/.test(h))
  const descIdx = headers.findIndex((h) => /desc|title|merchant|memo|name|label/.test(h))
  const amtIdx = headers.findIndex((h) => /amount|total|value|debit|price/.test(h))
  const typeIdx = headers.findIndex((h) => /type|kind/.test(h))
  const catIdx = headers.findIndex((h) => /cat/.test(h))

  const rows: ParsedCsvTx[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    if (cols.length < 2) continue

    const rawAmtStr = (amtIdx >= 0 ? cols[amtIdx] : cols[cols.length - 1] || '0')
      .replace(/[^0-9.-]/g, '')
    const rawAmt = Number(rawAmtStr)
    if (!Number.isFinite(rawAmt) || rawAmt === 0) continue

    const title = (descIdx >= 0 ? cols[descIdx] : cols[1] || cols[0] || 'Imported Item').slice(0, 60)
    const rawType = typeIdx >= 0 ? cols[typeIdx].toLowerCase() : ''
    const isIncome =
      rawType.includes('income') ||
      rawType.includes('credit') ||
      rawType.includes('deposit') ||
      (amtIdx >= 0 && rawAmt > 0 && !rawType.includes('expense') && !rawType.includes('debit') && /salary|payroll|refund|deposit/i.test(title))

    const tx_type: 'expense' | 'income' =
      rawAmt < 0 ? 'expense' : isIncome ? 'income' : 'expense'

    const category =
      catIdx >= 0 && cols[catIdx] ? cols[catIdx] : guessCategoryFromTitle(title)

    rows.push({
      title,
      amount: Math.abs(rawAmt),
      tx_type,
      category,
      tx_date: dateIdx >= 0 && cols[dateIdx] ? normalizeDate(cols[dateIdx]) : new Date().toISOString().slice(0, 10),
    })
  }

  return rows
}

export function openPrintableMonthlyReport(params: {
  settings: KoinSettings
  transactions: KoinTransaction[]
  subscriptions: KoinSubscription[]
  fmt: (usdAmount: number) => string
}) {
  const { settings, transactions, subscriptions, fmt } = params
  const monthLabel = new Date().toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  const totalExpenses = transactions
    .filter((t) => t.tx_type === 'expense')
    .reduce((s, t) => s + Number(t.amount || 0), 0)
  const totalExtraIncome = transactions
    .filter((t) => t.tx_type === 'income')
    .reduce((s, t) => s + Number(t.amount || 0), 0)
  const totalIncome = Number(settings.monthly_income || 0) + totalExtraIncome
  const totalSubs = subscriptions
    .filter((s) => s.status !== 'paused')
    .reduce((s, x) => s + Number(x.monthly_cost || 0), 0)
  const netBalance = totalIncome - Number(settings.fixed_bills || 0) - totalSubs - totalExpenses

  const catTotals: Record<string, number> = {}
  for (const t of transactions) {
    if (t.tx_type !== 'expense') continue
    catTotals[t.category] = (catTotals[t.category] || 0) + Number(t.amount || 0)
  }

  const catRows = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `<tr><td>${cat}</td><td style="text-align:right;font-weight:600">${fmt(amt)}</td></tr>`)
    .join('')

  const txRows = transactions
    .slice(0, 60)
    .map(
      (t) =>
        `<tr>
          <td>${String(t.tx_date).slice(0, 10)}</td>
          <td>${t.emoji} ${t.title.replace(/</g, '&lt;')}</td>
          <td>${t.category}</td>
          <td style="text-align:right;color:${t.tx_type === 'income' ? '#059669' : '#18181b'};font-weight:600">
            ${t.tx_type === 'income' ? '+' : '-'}${fmt(t.amount)}
          </td>
        </tr>`
    )
    .join('')

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>KoinCLICK Monthly Report — ${monthLabel}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #18181b; margin: 32px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6366f1; padding-bottom: 14px; margin-bottom: 22px; }
    .brand { font-size: 22px; font-weight: 800; color: #4f46e5; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .card { border: 1px solid #e4e4e7; border-radius: 10px; padding: 12px; background: #fafafa; }
    .label { font-size: 11px; text-transform: uppercase; color: #71717a; }
    .val { font-size: 18px; font-weight: 800; margin-top: 4px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #4f46e5; margin: 22px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #e4e4e7; text-align: left; }
    th { background: #f4f4f5; font-weight: 700; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">KoinCLICK Monthly Report</div>
      <div style="font-size:12px;color:#71717a">${settings.display_name || 'User'} · ${monthLabel}</div>
    </div>
    <div style="font-size:12px;color:#71717a">Generated ${new Date().toLocaleDateString()}</div>
  </div>
  <div class="grid">
    <div class="card"><div class="label">Total Income</div><div class="val">${fmt(totalIncome)}</div></div>
    <div class="card"><div class="label">Expenses Logged</div><div class="val">${fmt(totalExpenses)}</div></div>
    <div class="card"><div class="label">Subscriptions</div><div class="val">${fmt(totalSubs)}</div></div>
    <div class="card"><div class="label">Net Cashflow</div><div class="val">${fmt(netBalance)}</div></div>
  </div>
  <h2>Category Breakdown</h2>
  <table><thead><tr><th>Category</th><th style="text-align:right">Total</th></tr></thead><tbody>${catRows || '<tr><td colspan="2">No expenses logged</td></tr>'}</tbody></table>
  <h2>Transactions (${Math.min(60, transactions.length)})</h2>
  <table><thead><tr><th>Date</th><th>Title</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead><tbody>${txRows || '<tr><td colspan="4">No transactions</td></tr>'}</tbody></table>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (win) {
    win.document.open()
    win.document.write(html)
    win.document.close()
  }
}
