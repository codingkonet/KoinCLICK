import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  supabase,
  type KoinSettings,
  type KoinClickPad,
  type KoinTransaction,
  type KoinSubscription,
} from '../lib/supabase'
import {
  SUPPORTED_CURRENCIES,
  convertCurrency,
  formatMoney,
  getCurrencyInfo,
} from '../lib/currencies'
import { useAuth } from '../context/AuthContext'
import { ensureStarterData } from '../lib/seedUserData'
import { AdminControlPanel } from '../components/AdminControlPanel'
import {
  Coins,
  Zap,
  Plus,
  LogOut,
  Settings,
  Trash2,
  Pencil,
  AlertTriangle,
  Wallet,
  Calendar,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Receipt,
  PiggyBank,
  Search,
  Download,
  Globe,
  TrendingUp,
  TrendingDown,
  BarChart3,
  CreditCard,
  Shield,
  RotateCcw,
} from 'lucide-react'

const CATEGORIES = [
  { label: 'Coffee', emoji: '☕' },
  { label: 'Groceries', emoji: '🛒' },
  { label: 'Dining', emoji: '🍱' },
  { label: 'Transit', emoji: '🚇' },
  { label: 'Entertainment', emoji: '🎮' },
  { label: 'Shopping', emoji: '🛍️' },
  { label: 'Utilities & Bills', emoji: '⚡' },
  { label: 'Health & Fitness', emoji: '🏋️' },
  { label: 'Travel', emoji: '✈️' },
  { label: 'Salary / Income', emoji: '💰' },
  { label: 'Freelance / Bonus', emoji: '🚀' },
  { label: 'General', emoji: '💸' },
]

export function DashboardPage() {
  const { user, isAdmin, signOut } = useAuth()

  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<KoinSettings | null>(null)
  const [clickpads, setClickpads] = useState<KoinClickPad[]>([])
  const [transactions, setTransactions] = useState<KoinTransaction[]>([])
  const [subscriptions, setSubscriptions] = useState<KoinSubscription[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'radar' | 'admin'>(
    'overview'
  )

  // Active Display Currency (stored in settings.currency, defaults to USD)
  const activeCurrency = settings?.currency || 'USD'

  const toDisplay = useCallback(
    (usdAmount: number) => convertCurrency(Number(usdAmount || 0), 'USD', activeCurrency),
    [activeCurrency]
  )

  const fmt = useCallback(
    (usdAmount: number, decimals?: number) =>
      formatMoney(toDisplay(usdAmount), activeCurrency, { decimals }),
    [toDisplay, activeCurrency]
  )

  // Transaction Filters & Search
  const [txSearch, setTxSearch] = useState('')
  const [txFilterType, setTxFilterType] = useState<'all' | 'expense' | 'income'>('all')

  // Reset / Start From Zero Confirmation Modal
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetting, setResetting] = useState(false)

  // Add / Edit Transaction Modal State
  const [showTxModal, setShowTxModal] = useState(false)
  const [editingTx, setEditingTx] = useState<KoinTransaction | null>(null)
  const [txTitle, setTxTitle] = useState('')
  const [txAmount, setTxAmount] = useState('')
  const [txCurrency, setTxCurrency] = useState('USD')
  const [txType, setTxType] = useState<'expense' | 'income'>('expense')
  const [txCategory, setTxCategory] = useState('Dining')
  const [txEmoji, setTxEmoji] = useState('🍱')
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [txNotes, setTxNotes] = useState('')

  // Add / Edit ClickPad Modal State
  const [showPadModal, setShowPadModal] = useState(false)
  const [editingPad, setEditingPad] = useState<KoinClickPad | null>(null)
  const [padLabel, setPadLabel] = useState('')
  const [padAmount, setPadAmount] = useState('')
  const [padEmoji, setPadEmoji] = useState('⚡')
  const [padCategory, setPadCategory] = useState('Daily')

  // Add / Edit Subscription Modal State
  const [showSubModal, setShowSubModal] = useState(false)
  const [editingSub, setEditingSub] = useState<KoinSubscription | null>(null)
  const [subName, setSubName] = useState('')
  const [subEmoji, setSubEmoji] = useState('🔄')
  const [subCost, setSubCost] = useState('')
  const [subBillingDay, setSubBillingDay] = useState('15')
  const [subStatus, setSubStatus] = useState<'active' | 'cancel_alert' | 'paused'>('active')

  // Settings Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [incomeInput, setIncomeInput] = useState('0')
  const [billsInput, setBillsInput] = useState('0')
  const [savingsInput, setSavingsInput] = useState('0')
  const [currencyInput, setCurrencyInput] = useState('USD')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3400)
  }

  const fetchAllData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    await ensureStarterData(
      user.id,
      user.user_metadata?.full_name || user.email?.split('@')[0] || 'Koin Master'
    )

    const [settingsRes, padsRes, txRes, subsRes] = await Promise.all([
      supabase.from('koinclick_settings').select('*').eq('user_id', user.id).single(),
      supabase.from('koinclick_clickpads').select('*').eq('user_id', user.id).order('id'),
      supabase
        .from('koinclick_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('tx_date', { ascending: false })
        .limit(200),
      supabase
        .from('koinclick_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('billing_day'),
    ])

    if (settingsRes.data) {
      setSettings(settingsRes.data)
      setDisplayNameInput(settingsRes.data.display_name || 'Koin Master')
      setIncomeInput(String(settingsRes.data.monthly_income))
      setBillsInput(String(settingsRes.data.fixed_bills))
      setSavingsInput(String(settingsRes.data.savings_goal))
      setCurrencyInput(settingsRes.data.currency || 'USD')
      setTxCurrency(settingsRes.data.currency || 'USD')
    }
    if (padsRes.data) setClickpads(padsRes.data)
    if (txRes.data) setTransactions(txRes.data)
    if (subsRes.data) setSubscriptions(subsRes.data)

    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  // Switch Currency in Header
  const handleCurrencyChange = async (newCode: string) => {
    if (!user) return
    setSettings((prev) => (prev ? { ...prev, currency: newCode } : prev))
    setCurrencyInput(newCode)
    setTxCurrency(newCode)
    await supabase
      .from('koinclick_settings')
      .update({ currency: newCode, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
    const info = getCurrencyInfo(newCode)
    showToast(`${info.flag} Active currency switched to ${info.code} (${info.symbol})`)
  }

  // START FROM ZERO: Clear All Transactions
  const handleResetTransactionsToZero = async () => {
    if (!user) return
    setResetting(true)
    await Promise.all([
      supabase.from('koinclick_transactions').delete().eq('user_id', user.id),
      supabase.from('koinclick_clickpads').update({ clicks_count: 0 }).eq('user_id', user.id),
    ])

    setTransactions([])
    setClickpads((prev) => prev.map((p) => ({ ...p, clicks_count: 0 })))
    setResetting(false)
    setShowResetModal(false)
    showToast('🧹 All transactions cleared to 0.00!')
  }

  // FULL FACTORY RESET TO ZERO: Wipe Transactions, ClickPads, Subscriptions & Zero Budget Settings
  const handleFullFactoryResetToZero = async () => {
    if (!user) return
    setResetting(true)
    await Promise.all([
      supabase.from('koinclick_transactions').delete().eq('user_id', user.id),
      supabase.from('koinclick_clickpads').delete().eq('user_id', user.id),
      supabase.from('koinclick_subscriptions').delete().eq('user_id', user.id),
      supabase
        .from('koinclick_settings')
        .update({
          monthly_income: 0,
          fixed_bills: 0,
          savings_goal: 0,
          streak_days: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id),
    ])

    setTransactions([])
    setClickpads([])
    setSubscriptions([])
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            monthly_income: 0,
            fixed_bills: 0,
            savings_goal: 0,
            streak_days: 0,
          }
        : prev
    )
    setIncomeInput('0')
    setBillsInput('0')
    setSavingsInput('0')
    setResetting(false)
    setShowResetModal(false)
    showToast('✨ Entire account reset to 0.00! Ready to start from scratch.')
  }

  // Open Add Transaction Modal
  const openAddTransactionModal = (presetType: 'expense' | 'income' = 'expense') => {
    setEditingTx(null)
    setTxTitle('')
    setTxAmount('')
    setTxCurrency(activeCurrency)
    setTxType(presetType)
    setTxCategory(presetType === 'income' ? 'Salary / Income' : 'Dining')
    setTxEmoji(presetType === 'income' ? '💰' : '🍱')
    setTxDate(new Date().toISOString().slice(0, 10))
    setTxNotes('')
    setShowTxModal(true)
  }

  // Open Edit Transaction Modal
  const openEditTransactionModal = (tx: KoinTransaction) => {
    setEditingTx(tx)
    setTxTitle(tx.title)
    const origCurr = tx.original_currency || activeCurrency
    const origAmt =
      tx.original_amount != null
        ? Number(tx.original_amount)
        : Number(convertCurrency(Number(tx.amount), 'USD', origCurr).toFixed(2))
    setTxAmount(String(origAmt))
    setTxCurrency(origCurr)
    setTxType(tx.tx_type === 'income' ? 'income' : 'expense')
    setTxCategory(tx.category || 'General')
    setTxEmoji(tx.emoji || '💸')
    setTxDate(
      tx.tx_date
        ? new Date(tx.tx_date).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    )
    setTxNotes(tx.notes || '')
    setShowTxModal(true)
  }

  // Save (Add or Edit) Transaction
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !txTitle.trim() || !txAmount) return

    const enteredAmount = Number(txAmount)
    if (!Number.isFinite(enteredAmount) || enteredAmount <= 0) return

    const amountInUsd = Number(convertCurrency(enteredAmount, txCurrency, 'USD').toFixed(2))
    const isoDate = new Date(`${txDate}T12:00:00`).toISOString()

    if (editingTx) {
      const { data: updatedTx, error } = await supabase
        .from('koinclick_transactions')
        .update({
          jar_id: null,
          title: txTitle.trim(),
          emoji: txEmoji || '💸',
          amount: amountInUsd,
          tx_type: txType,
          category: txCategory,
          notes: txNotes.trim(),
          original_amount: enteredAmount,
          original_currency: txCurrency,
          tx_date: isoDate,
        })
        .eq('id', editingTx.id)
        .select()
        .single()

      if (error) {
        showToast(`Error updating transaction: ${error.message}`)
        return
      }

      if (updatedTx) {
        setTransactions((prev) => prev.map((t) => (t.id === updatedTx.id ? updatedTx : t)))
      }
      setShowTxModal(false)
      showToast(`✏️ Updated "${txTitle.trim()}" (${formatMoney(enteredAmount, txCurrency)})`)
    } else {
      const { data: newTx, error } = await supabase
        .from('koinclick_transactions')
        .insert({
          user_id: user.id,
          jar_id: null,
          title: txTitle.trim(),
          emoji: txEmoji || '💸',
          amount: amountInUsd,
          tx_type: txType,
          category: txCategory,
          source: 'manual',
          notes: txNotes.trim(),
          original_amount: enteredAmount,
          original_currency: txCurrency,
          tx_date: isoDate,
        })
        .select()
        .single()

      if (error) {
        showToast(`Error: ${error.message}`)
        return
      }

      if (newTx) {
        setTransactions((prev) => [newTx, ...prev])
        setShowTxModal(false)
        showToast(
          `Added ${newTx.emoji} ${newTx.title} (${formatMoney(enteredAmount, txCurrency)})`
        )
      }
    }
  }

  // Delete Transaction
  const handleDeleteTx = async (tx: KoinTransaction) => {
    await supabase.from('koinclick_transactions').delete().eq('id', tx.id)
    setTransactions((prev) => prev.filter((t) => t.id !== tx.id))
    showToast(`Deleted transaction "${tx.title}"`)
  }

  // 1-Click Quick-Log Handler
  const handleQuickClickPad = async (pad: KoinClickPad) => {
    if (!user) return
    const amountUsd = Number(pad.amount)
    const displayAmt = toDisplay(amountUsd)

    const { data: newTx, error: txErr } = await supabase
      .from('koinclick_transactions')
      .insert({
        user_id: user.id,
        jar_id: null,
        title: pad.label,
        emoji: pad.emoji,
        amount: amountUsd,
        tx_type: 'expense',
        category: pad.category,
        source: 'clickpad',
        notes: 'Logged via 1-Click ClickPad',
        original_amount: Number(displayAmt.toFixed(2)),
        original_currency: activeCurrency,
      })
      .select()
      .single()

    if (txErr) {
      showToast(`Error: ${txErr.message}`)
      return
    }

    await supabase
      .from('koinclick_clickpads')
      .update({ clicks_count: Number(pad.clicks_count) + 1 })
      .eq('id', pad.id)

    if (newTx) setTransactions((prev) => [newTx, ...prev])
    setClickpads((prev) =>
      prev.map((p) => (p.id === pad.id ? { ...p, clicks_count: Number(p.clicks_count) + 1 } : p))
    )

    showToast(`⚡ Logged ${pad.emoji} ${pad.label} (${fmt(amountUsd)}) in 1 click!`)
  }

  // ClickPad Modal Handlers
  const openAddPadModal = () => {
    setEditingPad(null)
    setPadLabel('')
    setPadAmount('')
    setPadEmoji('⚡')
    setPadCategory('Coffee')
    setShowPadModal(true)
  }

  const openEditPadModal = (pad: KoinClickPad, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingPad(pad)
    setPadLabel(pad.label)
    setPadAmount(String(Number(toDisplay(pad.amount).toFixed(2))))
    setPadEmoji(pad.emoji)
    setPadCategory(pad.category)
    setShowPadModal(true)
  }

  const handleSaveClickPad = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !padLabel || !padAmount) return
    const amountUsd = Number(convertCurrency(Number(padAmount), activeCurrency, 'USD').toFixed(2))

    if (editingPad) {
      const { data, error } = await supabase
        .from('koinclick_clickpads')
        .update({
          jar_id: null,
          label: padLabel.trim(),
          emoji: padEmoji || '⚡',
          amount: amountUsd,
          category: padCategory || 'Daily',
        })
        .eq('id', editingPad.id)
        .select()
        .single()

      if (!error && data) {
        setClickpads((prev) => prev.map((p) => (p.id === data.id ? data : p)))
        setShowPadModal(false)
        showToast(`Updated ClickPad: ${data.emoji} ${data.label}`)
      }
    } else {
      const { data, error } = await supabase
        .from('koinclick_clickpads')
        .insert({
          user_id: user.id,
          jar_id: null,
          label: padLabel.trim(),
          emoji: padEmoji || '⚡',
          amount: amountUsd,
          category: padCategory || 'Daily',
        })
        .select()
        .single()

      if (!error && data) {
        setClickpads((prev) => [...prev, data])
        setShowPadModal(false)
        showToast(`Created ClickPad: ${data.emoji} ${data.label}`)
      }
    }
  }

  const handleDeleteClickPad = async (padId: number) => {
    await supabase.from('koinclick_clickpads').delete().eq('id', padId)
    setClickpads((prev) => prev.filter((p) => p.id !== padId))
    setShowPadModal(false)
    showToast('Removed ClickPad')
  }

  // Subscription Handlers
  const openAddSubModal = () => {
    setEditingSub(null)
    setSubName('')
    setSubEmoji('🔄')
    setSubCost('')
    setSubBillingDay('15')
    setSubStatus('active')
    setShowSubModal(true)
  }

  const openEditSubModal = (sub: KoinSubscription) => {
    setEditingSub(sub)
    setSubName(sub.name)
    setSubEmoji(sub.emoji)
    setSubCost(String(Number(toDisplay(sub.monthly_cost).toFixed(2))))
    setSubBillingDay(String(sub.billing_day))
    setSubStatus(sub.status)
    setShowSubModal(true)
  }

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !subName || !subCost) return
    const costUsd = Number(convertCurrency(Number(subCost), activeCurrency, 'USD').toFixed(2))
    const billDay = Math.min(31, Math.max(1, Number(subBillingDay) || 1))

    if (editingSub) {
      const { data, error } = await supabase
        .from('koinclick_subscriptions')
        .update({
          name: subName.trim(),
          emoji: subEmoji || '🔄',
          monthly_cost: costUsd,
          billing_day: billDay,
          status: subStatus,
        })
        .eq('id', editingSub.id)
        .select()
        .single()

      if (!error && data) {
        setSubscriptions((prev) => prev.map((s) => (s.id === data.id ? data : s)))
        setShowSubModal(false)
        showToast(`Updated subscription: ${data.name}`)
      }
    } else {
      const { data, error } = await supabase
        .from('koinclick_subscriptions')
        .insert({
          user_id: user.id,
          name: subName.trim(),
          emoji: subEmoji || '🔄',
          monthly_cost: costUsd,
          billing_day: billDay,
          status: subStatus,
        })
        .select()
        .single()

      if (!error && data) {
        setSubscriptions((prev) => [...prev, data])
        setShowSubModal(false)
        showToast(`Added subscription: ${data.name}`)
      }
    }
  }

  const handleDeleteSub = async (subId: number) => {
    await supabase.from('koinclick_subscriptions').delete().eq('id', subId)
    setSubscriptions((prev) => prev.filter((s) => s.id !== subId))
    setShowSubModal(false)
    showToast('Deleted subscription')
  }

  const toggleSubStatus = async (sub: KoinSubscription) => {
    const nextStatus =
      sub.status === 'active'
        ? 'cancel_alert'
        : sub.status === 'cancel_alert'
          ? 'paused'
          : 'active'
    const { data } = await supabase
      .from('koinclick_subscriptions')
      .update({ status: nextStatus })
      .eq('id', sub.id)
      .select()
      .single()

    if (data) {
      setSubscriptions((prev) => prev.map((s) => (s.id === sub.id ? data : s)))
      showToast(`${sub.name} marked as ${nextStatus.replace('_', ' ')}`)
    }
  }

  // Update Budget Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    const updated = {
      display_name: displayNameInput.trim() || 'Koin Master',
      monthly_income: Number(
        convertCurrency(Number(incomeInput) || 0, currencyInput, 'USD').toFixed(2)
      ),
      fixed_bills: Number(
        convertCurrency(Number(billsInput) || 0, currencyInput, 'USD').toFixed(2)
      ),
      savings_goal: Number(
        convertCurrency(Number(savingsInput) || 0, currencyInput, 'USD').toFixed(2)
      ),
      currency: currencyInput,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('koinclick_settings')
      .update(updated)
      .eq('user_id', user.id)
      .select()
      .single()

    if (!error && data) {
      setSettings(data)
      setShowSettingsModal(false)
      showToast('Budget & Currency settings saved!')
    }
  }

  // Export Transactions to CSV
  const handleExportCsv = () => {
    if (transactions.length === 0) return
    const headers = [
      'Date',
      'Title',
      'Type',
      'Category',
      `Amount_${activeCurrency}`,
      'Original_Amount',
      'Original_Currency',
      'Source',
      'Notes',
    ]
    const rows = transactions.map((t) => [
      new Date(t.tx_date).toISOString().slice(0, 10),
      `"${(t.title || '').replace(/"/g, '""')}"`,
      t.tx_type,
      `"${t.category || ''}"`,
      toDisplay(Number(t.amount)).toFixed(2),
      t.original_amount ?? Number(t.amount).toFixed(2),
      t.original_currency ?? 'USD',
      t.source,
      `"${(t.notes || '').replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `KoinCLICK_Transactions_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToast('📊 Exported transactions to CSV!')
  }

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (txFilterType !== 'all' && tx.tx_type !== txFilterType) return false
      if (txSearch.trim()) {
        const q = txSearch.toLowerCase()
        const matchTitle = tx.title?.toLowerCase().includes(q)
        const matchCat = tx.category?.toLowerCase().includes(q)
        const matchNotes = tx.notes?.toLowerCase().includes(q)
        if (!matchTitle && !matchCat && !matchNotes) return false
      }
      return true
    })
  }, [transactions, txFilterType, txSearch])

  // Simple, Direct Financial Metrics (No Jars!)
  const baseMonthlyIncome = Number(settings?.monthly_income ?? 0)
  const extraIncomeLogged = transactions
    .filter((t) => t.tx_type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const totalExpensesLogged = transactions
    .filter((t) => t.tx_type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const monthlyIncome = baseMonthlyIncome + extraIncomeLogged
  const fixedBills = Number(settings?.fixed_bills ?? 0)
  const savingsGoal = Number(settings?.savings_goal ?? 0)
  const totalSubsMonthly = subscriptions
    .filter((s) => s.status !== 'paused')
    .reduce((acc, s) => acc + Number(s.monthly_cost), 0)

  const flexiblePool = Math.max(0, monthlyIncome - fixedBills - savingsGoal - totalSubsMonthly)
  const remainingFlexible = Math.max(0, flexiblePool - totalExpensesLogged)
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysRemaining = Math.max(1, daysInMonth - now.getDate() + 1)
  const safeToSpendToday = remainingFlexible / daysRemaining

  // Category Breakdown Analytics
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    transactions
      .filter((t) => t.tx_type === 'expense')
      .forEach((t) => {
        const cat = t.category || 'General'
        map.set(cat, (map.get(cat) || 0) + Number(t.amount))
      })
    const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1])
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1
    return entries.slice(0, 6).map(([cat, amt]) => ({
      category: cat,
      amountUsd: amt,
      pct: Math.round((amt / total) * 100),
    }))
  }, [transactions])

  // Last 7 Days Cashflow Heatmap
  const last7DaysHeatmap = useMemo(() => {
    const days: { dateStr: string; label: string; spentUsd: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const isoDay = d.toISOString().slice(0, 10)
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' })
      const spentUsd = transactions
        .filter((t) => t.tx_type === 'expense' && t.tx_date?.slice(0, 10) === isoDay)
        .reduce((s, t) => s + Number(t.amount), 0)
      days.push({ dateStr: isoDay, label: dayLabel, spentUsd })
    }
    return days
  }, [transactions])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center animate-spin">
          <RefreshCw className="w-6 h-6 text-emerald-400" />
        </div>
        <p className="text-sm text-slate-400">Loading your KoinCLICK workspace...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      <div>
        {/* Floating Toast Notification */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-emerald-500 text-slate-950 font-bold text-sm shadow-2xl shadow-emerald-500/30 animate-bounce">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toast}</span>
          </div>
        )}

        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/90 border-b border-slate-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
                <Coins className="w-5 h-5 text-slate-950" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight text-white">
                  Koin<span className="text-emerald-400">CLICK</span>
                </span>
                <span className="hidden sm:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                  {settings?.display_name || user?.email}
                </span>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300">
                    <Shield className="w-3 h-3" /> Admin
                  </span>
                )}
              </div>
            </div>

            {/* Simplified Top Navigation Menu (Without Jars) */}
            <nav className="order-3 lg:order-2 w-full lg:w-auto flex items-center gap-1 overflow-x-auto bg-slate-900 p-1 rounded-xl border border-slate-800">
              {(
                [
                  { id: 'overview', label: 'Pulse & Overview' },
                  { id: 'transactions', label: `Transactions (${transactions.length})` },
                  { id: 'radar', label: `Subscriptions (${subscriptions.length})` },
                  ...(isAdmin ? ([{ id: 'admin', label: 'Admin Control' }] as const) : []),
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Right Controls: Start From Zero + Multi-Currency Selector + Settings + Sign Out */}
            <div className="order-2 lg:order-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                title="Reset & Start From Zero"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Start From Zero</span>
              </button>

              {/* Multi-Currency Selector */}
              <div className="relative flex items-center bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-xl px-2.5 py-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-400 mr-1.5 shrink-0" />
                <select
                  aria-label="Select Currency"
                  value={activeCurrency}
                  onChange={(e) => handleCurrencyChange(e.target.value)}
                  className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer pr-1"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code} className="bg-slate-900 text-white">
                      {c.flag} {c.code} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIncomeInput(String(Number(toDisplay(baseMonthlyIncome).toFixed(0))))
                  setBillsInput(String(Number(toDisplay(fixedBills).toFixed(0))))
                  setSavingsInput(String(Number(toDisplay(savingsGoal).toFixed(0))))
                  setCurrencyInput(activeCurrency)
                  setShowSettingsModal(true)
                }}
                title="Budget & Currency Settings"
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={signOut}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-rose-500/15 hover:border-rose-500/40 hover:text-rose-300 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 space-y-8">
          {/* =========================================================
              TAB 1: SIMPLE PULSE & OVERVIEW
             ========================================================= */}
          {activeTab === 'overview' && (
            <>
              {/* Hero Safe-to-Spend Pulse Banner */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950/70 via-slate-900 to-slate-900 border border-emerald-500/30 p-6 sm:p-8 shadow-xl">
                  <div className="absolute -right-12 -top-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div>
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold mb-3">
                        <Sparkles className="w-3.5 h-3.5" />
                        Safe-to-Spend Today • {daysRemaining} days left in month
                      </div>
                      <div className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                        {fmt(safeToSpendToday)}
                        <span className="text-base font-medium text-slate-400 ml-2">/ day</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-lg">
                        Calculated after setting aside{' '}
                        <span className="text-slate-200 font-semibold">{fmt(fixedBills, 0)}</span>{' '}
                        for fixed bills,{' '}
                        <span className="text-emerald-300 font-semibold">
                          {fmt(savingsGoal, 0)}
                        </span>{' '}
                        for savings, and{' '}
                        <span className="text-amber-300 font-semibold">
                          {fmt(totalSubsMonthly)}
                        </span>{' '}
                        in subscriptions.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2.5 shrink-0">
                      <button
                        onClick={() => openAddTransactionModal('expense')}
                        className="px-4 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer transition-all"
                      >
                        <Plus className="w-4 h-4" />+ Add Expense
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => openAddTransactionModal('income')}
                          className="px-3 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 font-semibold text-xs flex items-center justify-center gap-1.5 border border-sky-500/30 cursor-pointer"
                        >
                          <TrendingUp className="w-3.5 h-3.5" />+ Income
                        </button>
                        <button
                          onClick={() => setShowResetModal(true)}
                          className="px-3 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-semibold text-xs flex items-center justify-center gap-1.5 border border-rose-500/30 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Zero All
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Mini KPI Strip */}
                  <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-slate-400 block">
                        Total Monthly Income
                      </span>
                      <span className="text-lg font-extrabold text-white">
                        {fmt(monthlyIncome, 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-slate-400 block">
                        Remaining Budget
                      </span>
                      <span className="text-lg font-extrabold text-emerald-400">
                        {fmt(remainingFlexible)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-slate-400 block">
                        Total Expenses
                      </span>
                      <span className="text-lg font-extrabold text-rose-400">
                        {fmt(totalExpensesLogged)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-slate-400 block">
                        Monthly Savings Goal
                      </span>
                      <span className="text-lg font-extrabold text-purple-300">
                        {fmt(savingsGoal, 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 7-Day Cashflow Pulse */}
                <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <PiggyBank className="w-4 h-4" />
                        7-Day Cashflow Pulse
                      </span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-semibold">
                        {last7DaysHeatmap.filter((d) => d.spentUsd === 0).length} Zero-Spend Days
                      </span>
                    </div>

                    <div className="grid grid-cols-7 gap-1.5 my-3">
                      {last7DaysHeatmap.map((d) => {
                        const isZero = d.spentUsd === 0
                        const isHigh = d.spentUsd > safeToSpendToday && safeToSpendToday > 0
                        return (
                          <div
                            key={d.dateStr}
                            title={`${d.dateStr}: ${fmt(d.spentUsd)}`}
                            className={`p-2 rounded-xl border text-center flex flex-col items-center justify-center ${
                              isZero
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : isHigh
                                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                  : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                            }`}
                          >
                            <span className="text-[10px] font-bold uppercase">{d.label}</span>
                            <span className="text-[10px] mt-1 font-extrabold">
                              {isZero ? '0' : fmt(d.spentUsd, 0)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Projected Month-End Surplus</span>
                      <span className="font-bold text-emerald-400">
                        {fmt(
                          Math.max(
                            0,
                            monthlyIncome - totalExpensesLogged - fixedBills - totalSubsMonthly
                          )
                        )}
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 transition-all duration-500"
                        style={{
                          width: `${
                            flexiblePool > 0
                              ? Math.min(100, Math.round((totalExpensesLogged / flexiblePool) * 100))
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>
                        Currency: {getCurrencyInfo(activeCurrency).flag} {activeCurrency}
                      </span>
                      <span>Green = Zero Spend</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* 1-CLICK QUICK-LOG ("ClickPads") */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-400" />
                      1-Click Quick-Log (&ldquo;ClickPads&rdquo;)
                    </h2>
                    <p className="text-xs text-slate-400">
                      Tap once to log a daily expense in {activeCurrency}. Click the pencil icon on
                      any button to edit or remove it.
                    </p>
                  </div>
                  <button
                    onClick={openAddPadModal}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New ClickPad
                  </button>
                </div>

                {clickpads.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400">
                    No ClickPads yet. Click &ldquo;+ New ClickPad&rdquo; to create 1-click expense
                    shortcuts!
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                    {clickpads.map((pad) => (
                      <div
                        key={pad.id}
                        onClick={() => handleQuickClickPad(pad)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') handleQuickClickPad(pad)
                        }}
                        className="group relative text-left p-4 rounded-2xl bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition-all active:scale-95 cursor-pointer shadow-sm"
                      >
                        <button
                          type="button"
                          title="Edit ClickPad"
                          onClick={(e) => openEditPadModal(pad, e)}
                          className="opacity-0 group-hover:opacity-100 absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-slate-950/90 hover:bg-slate-800 text-slate-400 hover:text-white transition-opacity cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>

                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-2xl group-hover:scale-110 transition-transform">
                            {pad.emoji}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            -{fmt(Number(pad.amount))}
                          </span>
                        </div>
                        <div className="font-bold text-sm text-white truncate">{pad.label}</div>
                        <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                          <span>{pad.category}</span>
                          <span>{pad.clicks_count} clicks</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Simple Overview Grid: Recent Transactions + Category Analytics & Subscriptions */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left 7 Columns: Recent Transactions */}
                <div className="lg:col-span-7">
                  <div className="rounded-3xl bg-slate-900/70 border border-slate-800/90 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <Receipt className="w-5 h-5 text-sky-400" />
                          Recent Transactions ({transactions.length})
                        </h3>
                        <p className="text-xs text-slate-400">
                          Click any transaction’s pencil icon to edit its amount, currency, or date.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {transactions.length > 0 && (
                          <button
                            onClick={() => setShowResetModal(true)}
                            title="Clear all transactions & start from zero"
                            className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-300 cursor-pointer"
                          >
                            Zero All
                          </button>
                        )}
                        <button
                          onClick={() => openAddTransactionModal('expense')}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Tx
                        </button>
                      </div>
                    </div>

                    {transactions.length === 0 ? (
                      <div className="py-12 text-center space-y-2">
                        <p className="text-sm font-semibold text-slate-300">
                          0 Transactions — Clean Slate!
                        </p>
                        <p className="text-xs text-slate-500">
                          Click &ldquo;+ Add Tx&rdquo; or tap any ClickPad above to log your first
                          transaction.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                        {transactions.slice(0, 12).map((tx) => {
                          const isIncome = tx.tx_type === 'income'
                          return (
                            <div
                              key={tx.id}
                              className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800/80 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-lg shrink-0">
                                  {tx.emoji}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-sm text-white truncate">
                                    {tx.title}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {tx.category} •{' '}
                                    {tx.tx_date
                                      ? new Date(tx.tx_date).toLocaleDateString(undefined, {
                                          month: 'short',
                                          day: 'numeric',
                                        })
                                      : 'Today'}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`font-extrabold text-sm mr-1 ${
                                    isIncome ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  {isIncome ? '+' : '-'}
                                  {fmt(Number(tx.amount))}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openEditTransactionModal(tx)}
                                  title="Edit transaction"
                                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTx(tx)}
                                  title="Delete transaction"
                                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                        {transactions.length > 12 && (
                          <button
                            onClick={() => setActiveTab('transactions')}
                            className="w-full py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-emerald-400 cursor-pointer"
                          >
                            View All {transactions.length} Transactions →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right 5 Columns: Category Analytics + Subscriptions Summary */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Top Categories */}
                  <div className="rounded-3xl bg-slate-900/70 border border-slate-800/90 p-6 space-y-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-sky-400" />
                      Spending by Category
                    </h3>
                    {categoryBreakdown.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">
                        All transactions are at zero. Add an expense to see category analytics.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {categoryBreakdown.map((item) => (
                          <div key={item.category} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-semibold text-slate-200">{item.category}</span>
                              <span className="text-slate-400">
                                <strong className="text-white">{fmt(item.amountUsd)}</strong> (
                                {item.pct}%)
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400"
                                style={{ width: `${item.pct}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Subscriptions Quick View */}
                  <div className="rounded-3xl bg-slate-900/70 border border-slate-800/90 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-amber-400" />
                          Subscriptions ({subscriptions.length})
                        </h3>
                        <p className="text-xs text-slate-400">
                          Monthly recurring: <strong className="text-amber-300">{fmt(totalSubsMonthly)}/mo</strong>
                        </p>
                      </div>
                      <button
                        onClick={openAddSubModal}
                        className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-emerald-400 cursor-pointer"
                      >
                        + Add Sub
                      </button>
                    </div>

                    {subscriptions.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">No active subscriptions.</p>
                    ) : (
                      <div className="divide-y divide-slate-800/70">
                        {subscriptions.slice(0, 5).map((sub) => (
                          <div
                            key={sub.id}
                            className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-xl">{sub.emoji}</span>
                              <div>
                                <div className="font-bold text-xs sm:text-sm text-white">
                                  {sub.name}
                                </div>
                                <span className="text-[11px] text-slate-500">
                                  Day {sub.billing_day}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-white">
                                {fmt(Number(sub.monthly_cost))}/mo
                              </span>
                              <button
                                type="button"
                                onClick={() => openEditSubModal(sub)}
                                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* =========================================================
              TAB 2: DEDICATED TRANSACTIONS LEDGER VIEW
             ========================================================= */}
          {activeTab === 'transactions' && (
            <section className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-extrabold text-white flex items-center gap-2.5">
                    <Receipt className="w-6 h-6 text-sky-400" />
                    Transactions Ledger ({transactions.length})
                  </h1>
                  <p className="text-sm text-slate-400">
                    Add, edit, filter, export, or reset all transactions to zero at any time.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => setShowResetModal(true)}
                    className="px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Start From Zero (Clear All)
                  </button>
                  <button
                    onClick={handleExportCsv}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </button>
                  <button
                    onClick={() => openAddTransactionModal('income')}
                    className="px-4 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <TrendingUp className="w-4 h-4" />+ Add Income
                  </button>
                  <button
                    onClick={() => openAddTransactionModal('expense')}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />+ Add Expense
                  </button>
                </div>
              </div>

              {/* Summary KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <span className="text-xs text-slate-400">Logged Income</span>
                  <div className="text-2xl font-black text-emerald-400 mt-1">
                    +{fmt(extraIncomeLogged)}
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <span className="text-xs text-slate-400">Logged Expenses</span>
                  <div className="text-2xl font-black text-rose-400 mt-1">
                    -{fmt(totalExpensesLogged)}
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <span className="text-xs text-slate-400">Net Activity Balance</span>
                  <div className="text-2xl font-black text-white mt-1">
                    {fmt(extraIncomeLogged - totalExpensesLogged)}
                  </div>
                </div>
              </div>

              {/* Search & Filters */}
              <div className="rounded-3xl bg-slate-900/70 border border-slate-800 p-6 space-y-5">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search transactions by title, category, or notes..."
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    {(['all', 'expense', 'income'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTxFilterType(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize cursor-pointer ${
                          txFilterType === t
                            ? 'bg-emerald-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredTransactions.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <p className="text-base font-bold text-slate-300">No Transactions Found</p>
                    <p className="text-xs text-slate-500">
                      Your transaction ledger is at zero. Click &ldquo;+ Add Expense&rdquo; or
                      &ldquo;+ Add Income&rdquo; to add a new entry.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredTransactions.map((tx) => {
                      const isIncome = tx.tx_type === 'income'
                      const hasDifferentOriginalCurrency =
                        tx.original_currency &&
                        tx.original_currency !== activeCurrency &&
                        tx.original_amount != null

                      return (
                        <div
                          key={tx.id}
                          className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl shrink-0">
                              {tx.emoji}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-sm sm:text-base text-white truncate">
                                {tx.title}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                <span>{tx.category}</span>
                                <span>•</span>
                                <span>
                                  {tx.tx_date
                                    ? new Date(tx.tx_date).toLocaleDateString(undefined, {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                      })
                                    : 'Today'}
                                </span>
                                {hasDifferentOriginalCurrency && (
                                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300 font-semibold">
                                    Logged as{' '}
                                    {formatMoney(
                                      Number(tx.original_amount),
                                      tx.original_currency || 'USD'
                                    )}
                                  </span>
                                )}
                              </div>
                              {tx.notes && (
                                <p className="text-xs text-slate-500 mt-0.5">{tx.notes}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`font-extrabold text-base mr-2 ${
                                isIncome ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isIncome ? '+' : '-'}
                              {fmt(Number(tx.amount))}
                            </span>

                            <button
                              type="button"
                              onClick={() => openEditTransactionModal(tx)}
                              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-500/20 text-xs font-semibold text-slate-300 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTx(tx)}
                              className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* =========================================================
              TAB 3: DEDICATED SUBSCRIPTION RADAR VIEW
             ========================================================= */}
          {activeTab === 'radar' && (
            <section className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-extrabold text-white flex items-center gap-2.5">
                    <Calendar className="w-6 h-6 text-amber-400" />
                    Subscriptions ({subscriptions.length})
                  </h1>
                  <p className="text-sm text-slate-400">
                    Track recurring monthly charges, annual burn, and 1-Click Cancel Alerts.
                  </p>
                </div>
                <button
                  onClick={openAddSubModal}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />+ Add Subscription
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <span className="text-xs text-slate-400">Active Monthly Burn</span>
                  <div className="text-2xl font-black text-white mt-1">
                    {fmt(totalSubsMonthly)}/mo
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <span className="text-xs text-slate-400">Projected Annual Burn</span>
                  <div className="text-2xl font-black text-amber-300 mt-1">
                    {fmt(totalSubsMonthly * 12, 0)}/yr
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <span className="text-xs text-slate-400">Cancel Alerts Flagged</span>
                  <div className="text-2xl font-black text-rose-400 mt-1">
                    {subscriptions.filter((s) => s.status === 'cancel_alert').length}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-slate-900/70 border border-slate-800 p-6">
                {subscriptions.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <p className="text-base font-bold text-slate-300">No Subscriptions Tracked</p>
                    <p className="text-xs text-slate-500">
                      Click &ldquo;+ Add Subscription&rdquo; to track your recurring monthly bills.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/70">
                    {subscriptions.map((sub) => (
                      <div
                        key={sub.id}
                        className="py-4 flex flex-wrap items-center justify-between gap-4 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center gap-3.5">
                          <span className="text-3xl">{sub.emoji}</span>
                          <div>
                            <div className="font-bold text-base text-white flex items-center gap-2">
                              {sub.name}
                              {sub.status === 'cancel_alert' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                  <AlertTriangle className="w-3 h-3" /> Renewing Soon
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              Bills on Day {sub.billing_day} •{' '}
                              {fmt(Number(sub.monthly_cost) * 12, 0)}/year
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span className="font-extrabold text-base text-white">
                            {fmt(Number(sub.monthly_cost))}/mo
                          </span>
                          <button
                            onClick={() => toggleSubStatus(sub)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                              sub.status === 'active'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : sub.status === 'cancel_alert'
                                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                  : 'bg-slate-800 border-slate-700 text-slate-400 line-through'
                            }`}
                          >
                            {sub.status === 'active'
                              ? 'Active'
                              : sub.status === 'cancel_alert'
                                ? 'Review Alert'
                                : 'Paused'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditSubModal(sub)}
                            className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* =========================================================
              TAB 4: ADMIN CONTROL CENTER (Restricted strictly to ouagrani.me@gmail.com)
             ========================================================= */}
          {activeTab === 'admin' && isAdmin && user && (
            <AdminControlPanel
              userId={user.id}
              userEmail={user.email || ''}
              settings={settings}
              clickpads={clickpads}
              transactions={transactions}
              subscriptions={subscriptions}
              activeCurrency={activeCurrency}
              fmt={fmt}
              onRefreshData={fetchAllData}
              onResetTransactionsToZero={handleResetTransactionsToZero}
              onFullFactoryResetToZero={handleFullFactoryResetToZero}
              showToast={showToast}
            />
          )}
        </main>
      </div>

      {/* COPYRIGHT FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950/90 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-slate-300">KoinCLICK</span>
            <span>— Simple Multi-Currency Budget Manager</span>
          </div>
          <div>© {new Date().getFullYear()} KoinCLICK. All rights reserved.</div>
        </div>
      </footer>

      {/* MODAL 0: Start From Zero / Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-rose-400" />
              Start Everything From Zero
            </h3>
            <p className="text-xs text-slate-400">
              Choose how you would like to reset your KoinCLICK budget:
            </p>

            <div className="space-y-3">
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetTransactionsToZero}
                className="w-full text-left p-4 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-rose-500/30 transition-colors cursor-pointer"
              >
                <div className="font-bold text-sm text-rose-300">
                  1. Clear All Transactions to 0.00
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Removes all {transactions.length} transactions and resets ClickPad counters to 0.
                </p>
              </button>

              <button
                type="button"
                disabled={resetting}
                onClick={handleFullFactoryResetToZero}
                className="w-full text-left p-4 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-amber-500/30 transition-colors cursor-pointer"
              >
                <div className="font-bold text-sm text-amber-300">
                  2. Full Factory Reset (All Pads, Subs & Income to 0.00)
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Starts your entire account from a 100% blank slate with 0 transactions and 0.00
                  income.
                </p>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Add / Edit Transaction (Simple: Expense or Income) */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">
                {editingTx ? 'Edit Transaction' : 'Add New Transaction'}
              </h3>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 font-semibold">
                Multi-Currency
              </span>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-4">
              {/* Transaction Type Selector */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800">
                {(
                  [
                    { id: 'expense', label: 'Expense', icon: TrendingDown },
                    { id: 'income', label: 'Income', icon: TrendingUp },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setTxType(item.id)
                        if (item.id === 'income') {
                          setTxCategory('Salary / Income')
                          setTxEmoji('💰')
                        } else {
                          setTxCategory('Dining')
                          setTxEmoji('🍱')
                        }
                      }}
                      className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        txType === item.id
                          ? 'bg-emerald-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {item.label}
                    </button>
                  )
                })}
              </div>

              {/* Emoji + Title */}
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Emoji</label>
                  <input
                    type="text"
                    value={txEmoji}
                    onChange={(e) => setTxEmoji(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center text-lg"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-slate-400 block mb-1">Title / Description</label>
                  <input
                    type="text"
                    required
                    placeholder="Supermarket, Salary, Coffee, etc."
                    value={txTitle}
                    onChange={(e) => setTxTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              {/* Amount + Currency Selector */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-slate-400 block mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="25.00"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Currency</label>
                  <select
                    value={txCurrency}
                    onChange={(e) => setTxCurrency(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-semibold"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {txAmount && Number(txAmount) > 0 && txCurrency !== activeCurrency && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between">
                  <span>Auto-converted to your active {activeCurrency} budget:</span>
                  <span className="font-bold">
                    {formatMoney(
                      convertCurrency(Number(txAmount), txCurrency, activeCurrency),
                      activeCurrency
                    )}
                  </span>
                </div>
              )}

              {/* Category + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Category</label>
                  <select
                    value={txCategory}
                    onChange={(e) => {
                      setTxCategory(e.target.value)
                      const found = CATEGORIES.find((c) => c.label === e.target.value)
                      if (found && !editingTx) setTxEmoji(found.emoji)
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.label} value={c.label}>
                        {c.emoji} {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Transaction Date</label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Optional note or memo..."
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTxModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
                >
                  {editingTx ? 'Save Changes' : 'Add Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Add / Edit 1-Click Pad */}
      {showPadModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingPad ? 'Edit 1-Click Pad' : 'Create 1-Click Quick-Log Pad'}
            </h3>
            <form onSubmit={handleSaveClickPad} className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Emoji</label>
                  <input
                    type="text"
                    value={padEmoji}
                    onChange={(e) => setPadEmoji(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center text-lg"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-slate-400 block mb-1">Habit Label</label>
                  <input
                    type="text"
                    required
                    placeholder="Morning Coffee"
                    value={padLabel}
                    onChange={(e) => setPadLabel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Price ({activeCurrency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="4.50"
                    value={padAmount}
                    onChange={(e) => setPadAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Category</label>
                  <input
                    type="text"
                    value={padCategory}
                    onChange={(e) => setPadCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                {editingPad ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteClickPad(editingPad.id)}
                    className="px-3 py-2 rounded-xl bg-rose-500/15 text-rose-300 text-xs font-semibold cursor-pointer"
                  >
                    Delete Pad
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPadModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold cursor-pointer"
                  >
                    {editingPad ? 'Save Pad' : 'Create ClickPad'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Add / Edit Subscription */}
      {showSubModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-400" />
              {editingSub ? 'Edit Subscription' : 'Add Recurring Subscription'}
            </h3>
            <form onSubmit={handleSaveSubscription} className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Emoji</label>
                  <input
                    type="text"
                    value={subEmoji}
                    onChange={(e) => setSubEmoji(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center text-lg"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-slate-400 block mb-1">Service Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Spotify, iCloud, Gym"
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Monthly Cost ({activeCurrency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="14.99"
                    value={subCost}
                    onChange={(e) => setSubCost(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Billing Day (1-31)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={subBillingDay}
                    onChange={(e) => setSubBillingDay(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Status</label>
                <select
                  value={subStatus}
                  onChange={(e) =>
                    setSubStatus(e.target.value as 'active' | 'cancel_alert' | 'paused')
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="active">Active</option>
                  <option value="cancel_alert">1-Click Cancel Alert (Renewing Soon)</option>
                  <option value="paused">Paused / Cancelled</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-2">
                {editingSub ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteSub(editingSub.id)}
                    className="px-3 py-2 rounded-xl bg-rose-500/15 text-rose-300 text-xs font-semibold cursor-pointer"
                  >
                    Delete
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSubModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold cursor-pointer"
                  >
                    {editingSub ? 'Save Changes' : 'Add Subscription'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Monthly Cashflow & Multi-Currency Settings */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-400" />
              Budget & Multi-Currency Settings
            </h3>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Profile Display Name</label>
                <input
                  type="text"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Primary Display Currency</label>
                <select
                  value={currencyInput}
                  onChange={(e) => setCurrencyInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-semibold"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} — {c.name} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Monthly Take-Home Income ({currencyInput})
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  value={incomeInput}
                  onChange={(e) => setIncomeInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Fixed Monthly Bills ({currencyInput})
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  value={billsInput}
                  onChange={(e) => setBillsInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Monthly Savings Goal ({currencyInput})
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  value={savingsInput}
                  onChange={(e) => setSavingsInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
