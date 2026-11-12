import React, { useState } from 'react'
import {
  supabase,
  type KoinSettings,
  type KoinClickPad,
  type KoinTransaction,
  type KoinSubscription,
} from '../lib/supabase'
import {
  getSupportedCurrencies,
  saveCustomRatesMap,
  resetCustomRatesMap,
  convertCurrency,
} from '../lib/currencies'
import {
  Shield,
  RotateCcw,
  Trash2,
  Sparkles,
  Download,
  Upload,
  CheckCircle2,
  Sliders,
  Lock,
  Wand2,
  RefreshCw,
  AlertTriangle,
  Database,
  Activity,
  Globe,
  Layers,
} from 'lucide-react'

interface AdminControlPanelProps {
  userId: string
  userEmail: string
  settings: KoinSettings | null
  clickpads: KoinClickPad[]
  transactions: KoinTransaction[]
  subscriptions: KoinSubscription[]
  activeCurrency: string
  fmt: (usdAmount: number, decimals?: number) => string
  onRefreshData: () => Promise<void>
  onResetTransactionsToZero: () => Promise<void>
  onFullFactoryResetToZero: () => Promise<void>
  showToast: (msg: string) => void
}

export function AdminControlPanel({
  userId,
  userEmail,
  settings,
  clickpads,
  transactions,
  subscriptions,
  activeCurrency,
  fmt,
  onRefreshData,
  onResetTransactionsToZero,
  onFullFactoryResetToZero,
  showToast,
}: AdminControlPanelProps) {
  const [busy, setBusy] = useState(false)

  // Custom FX Rates state
  const [currenciesList, setCurrenciesList] = useState(() => getSupportedCurrencies())
  const [rateEdits, setRateEdits] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    getSupportedCurrencies().forEach((c) => {
      map[c.code] = String(c.ratePerUsd)
    })
    return map
  })

  // Password & Admin Profile state
  const [newPassword, setNewPassword] = useState('')
  const [adminDisplayName, setAdminDisplayName] = useState(
    settings?.display_name || 'KoinCLICK Admin'
  )

  // Budget Rule Generator Base Income input (in activeCurrency)
  const [ruleIncomeInput, setRuleIncomeInput] = useState(() => {
    const baseUsd = Number(settings?.monthly_income || 4500)
    const converted = convertCurrency(baseUsd, 'USD', activeCurrency)
    return String(Math.round(converted || 4500))
  })

  // Computed Audit Metrics
  const monthlyIncomeUsd = Number(settings?.monthly_income || 0)
  const fixedBillsUsd = Number(settings?.fixed_bills || 0)
  const savingsGoalUsd = Number(settings?.savings_goal || 0)
  const totalExpensesUsd = transactions
    .filter((t) => t.tx_type === 'expense')
    .reduce((s, t) => s + Number(t.amount), 0)
  const totalSubsUsd = subscriptions
    .filter((s) => s.status !== 'paused')
    .reduce((s, t) => s + Number(t.monthly_cost), 0)

  const savingsRatePct =
    monthlyIncomeUsd > 0 ? Math.round((savingsGoalUsd / monthlyIncomeUsd) * 100) : 0
  const burnRatePct =
    monthlyIncomeUsd > 0
      ? Math.min(
          100,
          Math.round(((fixedBillsUsd + totalSubsUsd + totalExpensesUsd) / monthlyIncomeUsd) * 100)
        )
      : 0
  const healthScore = Math.max(
    10,
    Math.min(100, 100 - Math.max(0, burnRatePct - 80) * 2 + Math.min(20, savingsRatePct))
  )

  // 1. Apply Smart Budget Rule (50/30/20 or 70/20/10)
  const handleApplyBudgetRule = async (rule: '50-30-20' | '70-20-10') => {
    const enteredIncome = Number(ruleIncomeInput)
    if (!Number.isFinite(enteredIncome) || enteredIncome <= 0) {
      showToast('Please enter a valid monthly income greater than 0.')
      return
    }
    setBusy(true)
    try {
      const incomeUsd = Number(convertCurrency(enteredIncome, activeCurrency, 'USD').toFixed(2))
      const needsRatio = rule === '50-30-20' ? 0.5 : 0.7
      const savingsRatio = 0.2

      const fixedUsd = Number((incomeUsd * needsRatio).toFixed(2))
      const savingsUsd = Number((incomeUsd * savingsRatio).toFixed(2))

      await supabase
        .from('koinclick_settings')
        .update({
          monthly_income: incomeUsd,
          fixed_bills: fixedUsd,
          savings_goal: savingsUsd,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)

      await onRefreshData()
      showToast(`📐 Applied ${rule} Budget Rule on ${fmt(incomeUsd, 0)} monthly income!`)
    } finally {
      setBusy(false)
    }
  }

  // 2. Seed Starter ClickPads & Subscriptions (0 Transactions)
  const handleSeedStarterTemplates = async () => {
    setBusy(true)
    try {
      await supabase.from('koinclick_clickpads').insert([
        {
          user_id: userId,
          jar_id: null,
          label: 'Morning Coffee',
          emoji: '☕',
          amount: 4.5,
          category: 'Coffee',
          clicks_count: 0,
        },
        {
          user_id: userId,
          jar_id: null,
          label: 'Metro / Bus Pass',
          emoji: '🚇',
          amount: 2.75,
          category: 'Transit',
          clicks_count: 0,
        },
        {
          user_id: userId,
          jar_id: null,
          label: 'Quick Lunch',
          emoji: '🍱',
          amount: 14.0,
          category: 'Dining',
          clicks_count: 0,
        },
        {
          user_id: userId,
          jar_id: null,
          label: 'Groceries Top-Up',
          emoji: '🛒',
          amount: 35.0,
          category: 'Groceries',
          clicks_count: 0,
        },
      ])

      await supabase.from('koinclick_subscriptions').insert([
        {
          user_id: userId,
          name: 'Music Streaming',
          emoji: '🎧',
          monthly_cost: 11.99,
          billing_day: 15,
          status: 'active',
        },
        {
          user_id: userId,
          name: 'Cloud Storage Pro',
          emoji: '☁️',
          monthly_cost: 9.99,
          billing_day: 22,
          status: 'active',
        },
      ])

      await onRefreshData()
      showToast('✨ Starter ClickPads & Subscriptions created (with 0 transactions)!')
    } finally {
      setBusy(false)
    }
  }

  // 3. Bulk Subscription Controls
  const handleBulkSubStatus = async (status: 'active' | 'cancel_alert' | 'paused') => {
    setBusy(true)
    try {
      await supabase
        .from('koinclick_subscriptions')
        .update({ status })
        .eq('user_id', userId)
      await onRefreshData()
      showToast(`Updated all subscriptions to "${status.replace('_', ' ')}"`)
    } finally {
      setBusy(false)
    }
  }

  const handleFlagExpensiveSubs = async () => {
    setBusy(true)
    try {
      const expensiveIds = subscriptions
        .filter((s) => Number(s.monthly_cost) >= 20)
        .map((s) => s.id)
      if (expensiveIds.length > 0) {
        await supabase
          .from('koinclick_subscriptions')
          .update({ status: 'cancel_alert' })
          .in('id', expensiveIds)
        await onRefreshData()
        showToast(`🚩 Flagged ${expensiveIds.length} subscriptions (>= $20/mo) for review!`)
      } else {
        showToast('No subscriptions over $20/mo found.')
      }
    } finally {
      setBusy(false)
    }
  }

  // 4. Bulk Delete Transactions by Type
  const handleBulkDeleteTxByType = async (txType: 'expense' | 'income') => {
    setBusy(true)
    try {
      await supabase
        .from('koinclick_transactions')
        .delete()
        .eq('user_id', userId)
        .eq('tx_type', txType)
      await onRefreshData()
      showToast(`🗑️ Deleted all ${txType} transactions!`)
    } finally {
      setBusy(false)
    }
  }

  // 5. Save Custom FX Rates
  const handleSaveCustomRates = () => {
    const parsed: Record<string, number> = {}
    Object.entries(rateEdits).forEach(([code, val]) => {
      const n = Number(val)
      if (Number.isFinite(n) && n > 0) parsed[code] = n
    })
    saveCustomRatesMap(parsed)
    setCurrenciesList(getSupportedCurrencies())
    showToast('💱 Saved custom multi-currency exchange rates!')
  }

  const handleResetDefaultRates = () => {
    resetCustomRatesMap()
    const defaults = getSupportedCurrencies()
    setCurrenciesList(defaults)
    const map: Record<string, string> = {}
    defaults.forEach((c) => {
      map[c.code] = String(c.ratePerUsd)
    })
    setRateEdits(map)
    showToast('💱 Restored default exchange rates!')
  }

  // 6. Full JSON Backup Export & Restore
  const handleExportJsonBackup = () => {
    const backup = {
      app: 'KoinCLICK',
      exportedAt: new Date().toISOString(),
      settings,
      clickpads,
      subscriptions,
      transactions,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `KoinCLICK_Full_Backup_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('💾 Downloaded full KoinCLICK JSON backup!')
  }

  const handleImportJsonBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (data.settings) {
        await supabase
          .from('koinclick_settings')
          .update({
            display_name: data.settings.display_name || 'Koin Master',
            monthly_income: Number(data.settings.monthly_income || 0),
            fixed_bills: Number(data.settings.fixed_bills || 0),
            savings_goal: Number(data.settings.savings_goal || 0),
            currency: data.settings.currency || 'USD',
          })
          .eq('user_id', userId)
      }

      if (Array.isArray(data.subscriptions) && data.subscriptions.length > 0) {
        await supabase.from('koinclick_subscriptions').insert(
          data.subscriptions.map((s: any) => ({
            user_id: userId,
            name: s.name,
            emoji: s.emoji || '🔄',
            monthly_cost: Number(s.monthly_cost || 0),
            billing_day: Number(s.billing_day || 1),
            status: s.status || 'active',
          }))
        )
      }

      if (Array.isArray(data.transactions) && data.transactions.length > 0) {
        await supabase.from('koinclick_transactions').insert(
          data.transactions.map((t: any) => ({
            user_id: userId,
            jar_id: null,
            title: t.title,
            emoji: t.emoji || '💸',
            amount: Number(t.amount || 0),
            tx_type: t.tx_type === 'income' ? 'income' : 'expense',
            category: t.category || 'General',
            source: t.source || 'manual',
            notes: t.notes || '',
            original_amount: t.original_amount ?? Number(t.amount || 0),
            original_currency: t.original_currency || 'USD',
            tx_date: t.tx_date || new Date().toISOString(),
          }))
        )
      }

      await onRefreshData()
      showToast('📂 Restored backup data into your KoinCLICK account!')
    } catch {
      showToast('Invalid backup JSON file.')
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  // 7. Admin Profile & Password Update
  const handleUpdateAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await supabase
        .from('koinclick_settings')
        .update({ display_name: adminDisplayName.trim() || 'KoinCLICK Admin' })
        .eq('user_id', userId)

      if (newPassword.trim().length >= 6) {
        const { error } = await supabase.auth.updateUser({
          password: newPassword.trim(),
        })
        if (error) throw error
        setNewPassword('')
      }
      await onRefreshData()
      showToast('🔐 Admin profile & security settings updated!')
    } catch (err: any) {
      showToast(err?.message || 'Could not update security settings.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Top Admin Hero Banner */}
      <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-br from-amber-950/50 via-slate-900 to-slate-900 border border-amber-500/30 p-4 sm:p-6 lg:p-8 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold mb-2">
              <Shield className="w-3.5 h-3.5" />
              KoinCLICK Admin Suite
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">
              Executive Admin Control Panel
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Administrator: <strong className="text-white">{userEmail}</strong> • Active Currency:{' '}
              <strong className="text-emerald-400">{activeCurrency}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onRefreshData}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Workspace
            </button>
          </div>
        </div>

        {/* System Health & Financial Audit KPIs */}
        <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Budget Health Score</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{healthScore} / 100</div>
            <span className="text-[11px] text-slate-500">Based on savings & burn rate</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Monthly Burn Ratio</span>
              <Sliders className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-300 mt-1">{burnRatePct}%</div>
            <span className="text-[11px] text-slate-500">Target: under 80% of income</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Savings Rate</span>
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-purple-300 mt-1">{savingsRatePct}%</div>
            <span className="text-[11px] text-slate-500">{fmt(savingsGoalUsd, 0)} / month</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Active Workspace Items</span>
              <Database className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-2xl font-black text-white mt-1">
              {transactions.length + clickpads.length + subscriptions.length}
            </div>
            <span className="text-[11px] text-slate-500">
              {transactions.length} Tx • {clickpads.length} Pads • {subscriptions.length} Subs
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Admin Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 1: 1-Click Smart Budget Rule Generator & Starter Pack */}
        <div className="rounded-3xl bg-slate-900/70 border border-slate-800 p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-emerald-400" />
              Smart Budget Rule Generator & Presets
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Automatically configure your Monthly Income, Fixed Bills, and Savings Goal using
              proven financial ratios.
            </p>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">
              Base Monthly Income ({activeCurrency})
            </label>
            <input
              type="number"
              step="50"
              value={ruleIncomeInput}
              onChange={(e) => setRuleIncomeInput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-bold text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => handleApplyBudgetRule('50-30-20')}
              className="p-3.5 rounded-2xl bg-slate-950 hover:bg-emerald-500/15 border border-slate-800 hover:border-emerald-500/40 text-left transition-all cursor-pointer"
            >
              <div className="font-bold text-xs text-emerald-300">Apply 50 / 30 / 20 Rule</div>
              <p className="text-[11px] text-slate-400 mt-1">
                50% Fixed Bills, 30% Flexible Spend, 20% Savings Target.
              </p>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => handleApplyBudgetRule('70-20-10')}
              className="p-3.5 rounded-2xl bg-slate-950 hover:bg-sky-500/15 border border-slate-800 hover:border-sky-500/40 text-left transition-all cursor-pointer"
            >
              <div className="font-bold text-xs text-sky-300">Apply 70 / 20 / 10 Rule</div>
              <p className="text-[11px] text-slate-400 mt-1">
                70% Living & Essentials, 20% Savings Target, 10% Flexible.
              </p>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <button
              type="button"
              disabled={busy}
              onClick={handleSeedStarterTemplates}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Add Starter ClickPads & Subscriptions (0 Transactions)
            </button>
          </div>
        </div>

        {/* SECTION 2: Bulk Ledger & Subscription Operations */}
        <div className="rounded-3xl bg-slate-900/70 border border-slate-800 p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-400" />
              Bulk Maintenance & Subscription Tools
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Run 1-click subscription sweeps and selective transaction cleanup.
            </p>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={handleFlagExpensiveSubs}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-white flex items-center justify-between cursor-pointer"
            >
              <span>🚩 Flag Subscriptions Over $20/mo as Cancel Alert</span>
              <span className="text-amber-300 font-bold">Run Sweep</span>
            </button>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleBulkSubStatus('paused')}
                className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 cursor-pointer"
              >
                Pause All Subscriptions
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleBulkSubStatus('active')}
                className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-emerald-300 cursor-pointer"
              >
                Activate All Subscriptions
              </button>
            </div>

            <div className="pt-3 border-t border-slate-800/80">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-2">
                Selective Transaction Cleanup
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleBulkDeleteTxByType('expense')}
                  className="py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-bold text-rose-300 cursor-pointer"
                >
                  Clear All Expenses
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleBulkDeleteTxByType('income')}
                  className="py-2.5 px-3 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-xs font-bold text-sky-300 cursor-pointer"
                >
                  Clear All Incomes
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: Custom Multi-Currency Exchange Rate Editor */}
        <div className="rounded-3xl bg-slate-900/70 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-sky-400" />
                Multi-Currency Exchange Rates (vs 1 USD)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Customize conversion rates used across KoinCLICK.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetDefaultRates}
              className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 cursor-pointer"
            >
              Reset Defaults
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {currenciesList
              .filter((c) => c.code !== 'USD')
              .map((c) => (
                <div
                  key={c.code}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-1"
                >
                  <span className="text-xs font-bold text-slate-300">
                    {c.flag} {c.code} ({c.symbol})
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={rateEdits[c.code] ?? String(c.ratePerUsd)}
                    onChange={(e) =>
                      setRateEdits((prev) => ({ ...prev, [c.code]: e.target.value }))
                    }
                    className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                  />
                </div>
              ))}
          </div>

          <button
            type="button"
            onClick={handleSaveCustomRates}
            className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold cursor-pointer"
          >
            Save Custom Exchange Rates
          </button>
        </div>

        {/* SECTION 4: Backup, Restore & Admin Security */}
        <div className="rounded-3xl bg-slate-900/70 border border-slate-800 p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Download className="w-5 h-5 text-purple-400" />
                Backup, Restore & Security
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Export your entire KoinCLICK workspace to a portable JSON file or restore from a
                previous snapshot.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleExportJsonBackup}
                className="py-3 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                Export JSON Backup
              </button>

              <label className="py-3 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4 text-amber-400" />
                <span>Restore JSON Backup</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJsonBackup}
                  className="hidden"
                />
              </label>
            </div>

            <form
              onSubmit={handleUpdateAdminProfile}
              className="pt-4 border-t border-slate-800/80 space-y-3"
            >
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                Admin Profile & Password Update
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  placeholder="Admin Display Name"
                  value={adminDisplayName}
                  onChange={(e) => setAdminDisplayName(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
                <input
                  type="password"
                  minLength={6}
                  placeholder="New Password (optional)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
              >
                Update Admin Profile & Password
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* SECTION 5: Zero-Out & Factory Reset Danger Zone */}
      <div className="rounded-3xl bg-rose-950/20 border border-rose-500/30 p-6 space-y-4">
        <div className="flex items-center gap-2 text-rose-300 font-bold text-base">
          <AlertTriangle className="w-5 h-5 text-rose-400" />
          Start From Zero — Reset Controls
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between gap-3">
            <div>
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-rose-400" />
                Zero Out All Transactions
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Deletes all {transactions.length} transactions and resets ClickPad counters to 0.
              </p>
            </div>
            <button
              type="button"
              onClick={onResetTransactionsToZero}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-bold cursor-pointer"
            >
              Clear All Transactions to 0.00
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between gap-3">
            <div>
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-amber-400" />
                Complete Factory Reset (Everything to 0.00)
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Wipes all transactions, ClickPads, and Subscriptions, and sets Monthly Income, Fixed
                Bills, and Savings Goal to 0.00.
              </p>
            </div>
            <button
              type="button"
              onClick={onFullFactoryResetToZero}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold cursor-pointer"
            >
              Factory Reset Entire Account to Zero
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
