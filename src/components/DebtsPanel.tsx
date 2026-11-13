import React, { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Plus,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { convertCurrency } from '../lib/currencies'
import { supabase, type KoinDebt } from '../lib/supabase'

interface DebtsPanelProps {
  userId: string
  debts: KoinDebt[]
  setDebts: React.Dispatch<React.SetStateAction<KoinDebt[]>>
  activeCurrency: string
  fmt: (usdAmount: number, decimals?: number) => string
  onLogDebtTx: (params: {
    title: string
    emoji: string
    amountUsd: number
    txType: 'expense' | 'income'
    notes: string
  }) => Promise<void>
  showToast: (msg: string) => void
}

export const DebtsPanel: React.FC<DebtsPanelProps> = ({
  userId,
  debts,
  setDebts,
  activeCurrency,
  fmt,
  onLogDebtTx,
  showToast,
}) => {
  const [showModal, setShowModal] = useState(false)
  const [personName, setPersonName] = useState('')
  const [direction, setDirection] = useState<'lent' | 'borrowed'>('lent')
  const [amountInput, setAmountInput] = useState('100')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const summary = useMemo(() => {
    let owedToMe = 0
    let iOwe = 0
    for (const d of debts) {
      if (d.status === 'settled') continue
      const remaining = Math.max(0, Number(d.total_amount) - Number(d.paid_amount))
      if (d.direction === 'lent') owedToMe += remaining
      else iOwe += remaining
    }
    return { owedToMe, iOwe, net: owedToMe - iOwe }
  }, [debts])

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!personName.trim()) return
    const displayAmt = Math.max(1, Number(amountInput) || 0)
    const usdAmt = convertCurrency(displayAmt, activeCurrency, 'USD')
    setSaving(true)

    const { data, error } = await supabase
      .from('koinclick_debts')
      .insert({
        user_id: userId,
        person_name: personName.trim(),
        direction,
        total_amount: usdAmt,
        paid_amount: 0,
        due_date: dueDate || null,
        status: 'open',
        notes: notes.trim() || null,
      })
      .select('*')
      .single()

    setSaving(false)
    if (!error && data) {
      setDebts((prev) => [data, ...prev])
      setShowModal(false)
      setPersonName('')
      setNotes('')
      showToast('💳 Debt / Loan record added!')
    }
  }

  const handleSettle = async (d: KoinDebt) => {
    const remainingUsd = Math.max(0, Number(d.total_amount) - Number(d.paid_amount))
    const { data, error } = await supabase
      .from('koinclick_debts')
      .update({ paid_amount: d.total_amount, status: 'settled' })
      .eq('id', d.id)
      .select('*')
      .single()

    if (!error && data) {
      setDebts((prev) => prev.map((x) => (x.id === d.id ? data : x)))
      if (remainingUsd > 0) {
        await onLogDebtTx({
          title:
            d.direction === 'lent'
              ? `Repayment from ${d.person_name}`
              : `Paid debt to ${d.person_name}`,
          emoji: d.direction === 'lent' ? '💵' : '💳',
          amountUsd: remainingUsd,
          txType: d.direction === 'lent' ? 'income' : 'expense',
          notes: d.notes || 'Debt settled',
        })
      }
      showToast(`✅ Settled with ${d.person_name}!`)
    }
  }

  const handleDelete = async (id: number) => {
    const { error } = await supabase.from('koinclick_debts').delete().eq('id', id)
    if (!error) {
      setDebts((prev) => prev.filter((x) => x.id !== id))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Debts & Loans (Prêts / Dettes)</h2>
          <p className="text-xs text-zinc-400">
            Track money lent to friends or borrowed, and settle with 1-click transaction logging.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Loan / Debt
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
          <div className="text-xs text-zinc-400">Owed to Me (Lent)</div>
          <div className="text-2xl font-black text-cyan-400 mt-1">{fmt(summary.owedToMe)}</div>
        </div>
        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
          <div className="text-xs text-zinc-400">I Owe (Borrowed)</div>
          <div className="text-2xl font-black text-rose-400 mt-1">{fmt(summary.iOwe)}</div>
        </div>
        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4">
          <div className="text-xs text-zinc-400">Net Loan Balance</div>
          <div className="text-2xl font-black text-indigo-300 mt-1">{fmt(summary.net)}</div>
        </div>
      </div>

      {debts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center space-y-2">
          <Wallet className="w-8 h-8 text-indigo-400 mx-auto" />
          <p className="text-sm font-bold text-zinc-200">No Open Debts or Loans</p>
          <p className="text-xs text-zinc-500">Record a loan or debt to track repayments cleanly.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {debts.map((d) => {
            const remaining = Math.max(0, Number(d.total_amount) - Number(d.paid_amount))
            const isSettled = d.status === 'settled' || remaining <= 0
            return (
              <div
                key={d.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        d.direction === 'lent'
                          ? 'bg-cyan-500/15 text-cyan-400'
                          : 'bg-rose-500/15 text-rose-400'
                      }`}
                    >
                      {d.direction === 'lent' ? (
                        <ArrowDownLeft className="w-5 h-5" />
                      ) : (
                        <ArrowUpRight className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">{d.person_name}</div>
                      <div className="text-xs text-zinc-400">
                        {d.direction === 'lent' ? 'Owes you' : 'You owe'} ·{' '}
                        {d.due_date ? (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {String(d.due_date).slice(0, 10)}
                          </span>
                        ) : (
                          'No due date'
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(d.id)}
                    className="p-1.5 text-zinc-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {d.notes && <p className="text-xs text-zinc-400">{d.notes}</p>}

                <div className="flex items-center justify-between pt-1">
                  <div className="text-base font-black text-white">
                    {isSettled ? 'Settled' : fmt(remaining)}
                  </div>
                  {isSettled ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" /> Settled
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSettle(d)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                    >
                      Settle & Log
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAddDebt}
            className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Add Loan / Debt</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('lent')}
                className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  direction === 'lent'
                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}
              >
                I Lent (Owed to me)
              </button>
              <button
                type="button"
                onClick={() => setDirection('borrowed')}
                className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  direction === 'borrowed'
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}
              >
                I Borrowed (I owe)
              </button>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Person Name</label>
              <input
                type="text"
                required
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="e.g. Karim, Sara"
                className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Amount ({activeCurrency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Due Date (Optional)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note..."
                className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Record'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
