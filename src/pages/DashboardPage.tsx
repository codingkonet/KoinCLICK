import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  supabase,
  type KoinSettings,
  type KoinClickPad,
  type KoinTransaction,
  type KoinSubscription,
  type KoinAiModel,
  type KoinAiBudget,
  type KoinTontine,
} from '../lib/supabase'
import {
  SUPPORTED_CURRENCIES,
  convertCurrency,
  formatMoney,
  getCurrencyInfo,
  syncLiveExchangeRates,
} from '../lib/currencies'
import { compressImageToDataUrl } from '../lib/imageUtils'
import { scanReceiptWithAi } from '../lib/aiBudgetService'
import { openPrintableMonthlyReport, parseBankCsv, type ParsedCsvTx } from '../lib/csvPdfUtils'
import { useAuth } from '../context/AuthContext'
import { ensureStarterData } from '../lib/seedUserData'
import { AdminControlPanel } from '../components/AdminControlPanel'
import { AiBudgetPanel } from '../components/AiBudgetPanel'
import { TontinePanel } from '../components/TontinePanel'
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
  Camera,
  Upload,
  X,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  FileSpreadsheet,
  Printer,
  Wand2,
  Users,
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
  const [aiModels, setAiModels] = useState<KoinAiModel[]>([])
  const [aiBudgets, setAiBudgets] = useState<KoinAiBudget[]>([])
  const [tontines, setTontines] = useState<KoinTontine[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<
    'overview' | 'transactions' | 'radar' | 'tontine' | 'ai' | 'admin'
  >('overview')

  // Active Display Currency (stored in settings.currency, defaults to USD)
  const activeCurrency = settings?.currency || 'USD'

  // Privacy Blur Mode
  const [privacyBlur, setPrivacyBlur] = useState<boolean>(() => {
    try {
      return localStorage.getItem('koinclick_privacy_blur') === '1'
    } catch {
      return false
    }
  })

  const togglePrivacyBlur = () => {
    setPrivacyBlur((prev) => {
      const next = !prev
      localStorage.setItem('koinclick_privacy_blur', next ? '1' : '0')
      return next
    })
  }

  // Live Exchange Rate Sync
  const [fxSyncing, setFxSyncing] = useState(false)
  const [, setFxVersion] = useState(0)

  const handleSyncLiveFx = async (force = true) => {
    setFxSyncing(true)
    const res = await syncLiveExchangeRates(force)
    setFxSyncing(false)
    if (res.ok) {
      setFxVersion((v) => v + 1)
      if (force) showToast(`💱 Live FX rates synced (${res.count || 'cached'} currencies)`)
    } else if (force) {
      showToast('⚠️ Could not reach live FX server — using cached rates')
    }
  }

  useEffect(() => {
    syncLiveExchangeRates(false).then((res) => {
      if (res.ok && res.count > 0) setFxVersion((v) => v + 1)
    })
  }, [])

  // 4-Digit PIN App Lock
  const pinStorageKey = user ? `koinclick_pin_${user.id}` : 'koinclick_pin_guest'
  const [savedPin, setSavedPin] = useState<string>(() => {
    try {
      return user ? localStorage.getItem(`koinclick_pin_${user.id}`) || '' : ''
    } catch {
      return ''
    }
  })
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    try {
      return !!(user && localStorage.getItem(`koinclick_pin_${user.id}`))
    } catch {
      return false
    }
  })
  const [pinEntry, setPinEntry] = useState('')
  const [pinError, setPinError] = useState('')
  const [showPinModal, setShowPinModal] = useState(false)
  const [newPinInput, setNewPinInput] = useState('')

  useEffect(() => {
    if (!user) return
    const existing = localStorage.getItem(`koinclick_pin_${user.id}`) || ''
    setSavedPin(existing)
    if (existing) setIsLocked(true)
  }, [user])

  // AI Receipt Scanner, CSV Import & Due Subscriptions
  const [scanningReceipt, setScanningReceipt] = useState(false)
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [csvRows, setCsvRows] = useState<ParsedCsvTx[]>([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [loggingDueSubs, setLoggingDueSubs] = useState(false)

  const toDisplay = useCallback(
    (usdAmount: number) => convertCurrency(Number(usdAmount || 0), 'USD', activeCurrency),
    [activeCurrency]
  )

  const rawFmt = useCallback(
    (usdAmount: number, decimals?: number) =>
      formatMoney(toDisplay(usdAmount), activeCurrency, { decimals }),
    [toDisplay, activeCurrency]
  )

  const fmt = useCallback(
    (usdAmount: number, decimals?: number) => {
      if (privacyBlur) return '••••'
      return formatMoney(toDisplay(usdAmount), activeCurrency, { decimals })
    },
    [toDisplay, activeCurrency, privacyBlur]
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
  const [txReceiptImage, setTxReceiptImage] = useState<string | null>(null)
  const [txReceiptKind, setTxReceiptKind] = useState<'receipt' | 'product'>('receipt')
  const [txPhotoBusy, setTxPhotoBusy] = useState(false)

  // Photo Preview & Live Camera Modal State
  const [previewPhotoTx, setPreviewPhotoTx] = useState<KoinTransaction | null>(null)
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

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

    const [settingsRes, padsRes, txRes, subsRes, aiModelsRes, aiBudgetsRes, tontinesRes] =
      await Promise.all([
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
        supabase
          .from('koinclick_ai_models')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('koinclick_ai_budgets')
          .select('*')
          .eq('user_id', user.id)
          .order('category'),
        supabase
          .from('koinclick_tontines')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
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
    if (aiModelsRes.data) setAiModels(aiModelsRes.data)
    if (aiBudgetsRes.data) setAiBudgets(aiBudgetsRes.data)
    if (tontinesRes.data) setTontines(tontinesRes.data)

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
  const openAddTransactionModal = (
    presetType: 'expense' | 'income' = 'expense',
    presetPhotoKind?: 'receipt' | 'product'
  ) => {
    setEditingTx(null)
    setTxTitle('')
    setTxAmount('')
    setTxCurrency(activeCurrency)
    setTxType(presetType)
    setTxCategory(presetType === 'income' ? 'Salary / Income' : 'Dining')
    setTxEmoji(presetType === 'income' ? '💰' : '🍱')
    setTxDate(new Date().toISOString().slice(0, 10))
    setTxNotes('')
    setTxReceiptImage(null)
    setTxReceiptKind(presetPhotoKind || 'receipt')
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
    setTxReceiptImage(tx.receipt_image || null)
    setTxReceiptKind(tx.receipt_kind === 'product' ? 'product' : 'receipt')
    setShowTxModal(true)
  }

  // Handle Photo File Selection (Camera or Gallery)
  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setTxPhotoBusy(true)
    try {
      const compressed = await compressImageToDataUrl(file)
      setTxReceiptImage(compressed)
      showToast(
        txReceiptKind === 'product'
          ? '📦 Product photo attached!'
          : '🧾 Receipt (reçu) photo attached!'
      )
    } catch {
      showToast('Could not process photo. Please try another image.')
    } finally {
      setTxPhotoBusy(false)
    }
  }

  // Live Camera Helpers
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const openLiveCamera = async () => {
    setCameraError(null)
    setShowCameraModal(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Live camera is unavailable here. Use "Take Photo" or "Upload Photo" instead.')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch {
      setCameraError('Camera permission denied or no camera found. Use "Upload Photo" instead.')
    }
  }

  const closeLiveCamera = () => {
    stopCameraStream()
    setShowCameraModal(false)
  }

  const captureFromLiveCamera = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    setTxPhotoBusy(true)
    try {
      const canvas = document.createElement('canvas')
      const maxDim = 960
      let w = video.videoWidth
      let h = video.videoHeight
      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w)
          w = maxDim
        } else {
          w = Math.round((w * maxDim) / h)
          h = maxDim
        }
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72)
        setTxReceiptImage(dataUrl)
        showToast(
          txReceiptKind === 'product'
            ? '📦 Product photo captured!'
            : '🧾 Receipt (reçu) photo captured!'
        )
      }
      closeLiveCamera()
    } finally {
      setTxPhotoBusy(false)
    }
  }

  useEffect(() => {
    return () => stopCameraStream()
  }, [stopCameraStream])

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
          receipt_image: txReceiptImage,
          receipt_kind: txReceiptImage ? txReceiptKind : null,
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
          receipt_image: txReceiptImage,
          receipt_kind: txReceiptImage ? txReceiptKind : null,
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

  // Active AI Model (default active model or first active model)
  const activeAiModel = useMemo(() => {
    const active = aiModels.filter((m) => m.is_active)
    return active.find((m) => m.is_default) || active[0] || null
  }, [aiModels])

  // Due Subscriptions This Month (not yet logged this YYYY-MM)
  const dueSubscriptions = useMemo(() => {
    const today = new Date()
    const currentDay = today.getDate()
    const monthPrefix = today.toISOString().slice(0, 7)
    return subscriptions.filter((sub) => {
      if (sub.status === 'paused') return false
      if (sub.billing_day > currentDay) return false
      const alreadyLogged = transactions.some(
        (t) =>
          t.source === 'subscription' &&
          String(t.tx_date).startsWith(monthPrefix) &&
          t.title.toLowerCase().includes(sub.name.toLowerCase())
      )
      return !alreadyLogged
    })
  }, [subscriptions, transactions])

  const handleLogDueSubscriptions = async () => {
    if (!user || dueSubscriptions.length === 0) return
    setLoggingDueSubs(true)
    const todayIso = new Date().toISOString()
    const rows = dueSubscriptions.map((sub) => ({
      user_id: user.id,
      jar_id: null,
      title: `${sub.name} (Subscription)`,
      emoji: sub.emoji || '🔁',
      amount: Number(sub.monthly_cost),
      tx_type: 'expense' as const,
      category: 'Utilities & Bills',
      source: 'subscription' as const,
      notes: `Auto-logged recurring billing day ${sub.billing_day}`,
      tx_date: todayIso,
    }))

    const { data, error } = await supabase
      .from('koinclick_transactions')
      .insert(rows)
      .select('*')

    setLoggingDueSubs(false)
    if (!error && data) {
      setTransactions((prev) => [...data, ...prev])
      showToast(`🔁 Logged ${data.length} due subscription(s)!`)
    }
  }

  // AI Receipt Scanner (inside Transaction Modal)
  const handleAiScanReceipt = async () => {
    if (!txReceiptImage) return
    if (!activeAiModel) {
      showToast('⚠️ Add an active AI Model API in the AI Budget tab first!')
      return
    }
    setScanningReceipt(true)
    try {
      const scanned = await scanReceiptWithAi(
        activeAiModel,
        txReceiptImage,
        CATEGORIES.map((c) => c.label),
        activeCurrency
      )
      setTxTitle(scanned.title)
      if (scanned.amount > 0) setTxAmount(String(scanned.amount))
      setTxCurrency(scanned.currency || activeCurrency)
      setTxCategory(scanned.category)
      const matched = CATEGORIES.find((c) => c.label === scanned.category)
      if (matched) setTxEmoji(matched.emoji)
      setTxDate(scanned.txDate)
      if (scanned.notes) setTxNotes(scanned.notes)
      showToast(`✨ Scanned receipt with ${activeAiModel.name}!`)
    } catch (err: unknown) {
      showToast(`⚠️ AI Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setScanningReceipt(false)
    }
  }

  // CSV Bank Statement Import
  const handleCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const parsed = parseBankCsv(text)
    setCsvRows(parsed)
    e.target.value = ''
  }

  const handleImportCsvConfirm = async () => {
    if (!user || csvRows.length === 0) return
    setCsvImporting(true)
    const payload = csvRows.slice(0, 150).map((r) => {
      const catEmoji = CATEGORIES.find((c) => c.label === r.category)?.emoji || '💸'
      const usdAmt = convertCurrency(r.amount, activeCurrency, 'USD')
      return {
        user_id: user.id,
        jar_id: null,
        title: r.title,
        emoji: catEmoji,
        amount: usdAmt,
        tx_type: r.tx_type,
        category: r.category,
        source: 'manual' as const,
        notes: 'Imported from CSV',
        original_amount: r.amount,
        original_currency: activeCurrency,
        tx_date: new Date(`${r.tx_date}T12:00:00`).toISOString(),
      }
    })

    const { data, error } = await supabase
      .from('koinclick_transactions')
      .insert(payload)
      .select('*')

    setCsvImporting(false)
    if (!error && data) {
      setTransactions((prev) => [...data, ...prev])
      setShowCsvModal(false)
      setCsvRows([])
      showToast(`📥 Imported ${data.length} transactions from CSV!`)
    }
  }

  // PIN Lock Handlers
  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = newPinInput.replace(/\D/g, '').slice(0, 4)
    if (clean.length !== 4) {
      showToast('⚠️ Enter a 4-digit numeric PIN')
      return
    }
    localStorage.setItem(pinStorageKey, clean)
    setSavedPin(clean)
    setNewPinInput('')
    setShowPinModal(false)
    showToast('🔒 4-Digit App PIN enabled!')
  }

  const handleRemovePin = () => {
    localStorage.removeItem(pinStorageKey)
    setSavedPin('')
    setIsLocked(false)
    setShowPinModal(false)
    showToast('🔓 App PIN removed')
  }

  const handleUnlockPin = (e: React.FormEvent) => {
    e.preventDefault()
    if (pinEntry === savedPin) {
      setIsLocked(false)
      setPinEntry('')
      setPinError('')
    } else {
      setPinError('Incorrect 4-digit PIN')
      setPinEntry('')
    }
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
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center animate-spin">
          <RefreshCw className="w-6 h-6 text-indigo-400" />
        </div>
        <p className="text-sm text-zinc-400">Loading your KoinCLICK workspace...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between">
      <div>
        {/* Floating Toast Notification */}
        {toast && (
          <div className="fixed bottom-20 lg:bottom-6 inset-x-4 sm:inset-x-auto sm:right-6 z-50 flex items-center justify-center sm:justify-start gap-2.5 px-4 py-3 rounded-2xl bg-indigo-500 text-white font-bold text-xs sm:text-sm shadow-2xl shadow-indigo-500/30 animate-bounce">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="truncate">{toast}</span>
          </div>
        )}

        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-zinc-950/90 border-b border-zinc-800/80">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
                <Coins className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="text-lg sm:text-xl font-extrabold tracking-tight text-white truncate">
                  Koin<span className="text-indigo-400">CLICK</span>
                </span>
                <span className="hidden md:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 truncate max-w-[140px]">
                  {settings?.display_name || user?.email}
                </span>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 shrink-0">
                    <Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    <span className="hidden sm:inline">Admin</span>
                  </span>
                )}
              </div>
            </div>

            {/* Desktop Top Navigation Menu (Without Jars) */}
            <nav className="hidden lg:flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
              {(
                [
                  { id: 'overview', label: 'Pulse & Overview' },
                  { id: 'transactions', label: `Transactions (${transactions.length})` },
                  { id: 'radar', label: `Subscriptions (${subscriptions.length})` },
                  { id: 'tontine', label: `Tontine (${tontines.length})` },
                  { id: 'ai', label: 'AI Budget' },
                  ...(isAdmin ? ([{ id: 'admin', label: 'Admin Control' }] as const) : []),
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-indigo-500 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Right Controls: Start From Zero + Multi-Currency Selector + Settings + Sign Out */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                title="Reset & Start From Zero"
                className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Start From Zero</span>
              </button>

              {/* Multi-Currency Selector + Live FX Sync */}
              <div className="relative flex items-center bg-zinc-900 border border-zinc-800 hover:border-indigo-500/40 rounded-xl px-2 sm:px-2.5 py-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-400 mr-1 sm:mr-1.5 shrink-0" />
                <select
                  aria-label="Select Currency"
                  value={activeCurrency}
                  onChange={(e) => handleCurrencyChange(e.target.value)}
                  className="bg-transparent text-[11px] sm:text-xs font-bold text-white focus:outline-none cursor-pointer pr-0.5 sm:pr-1"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code} className="bg-zinc-900 text-white">
                      {c.flag} {c.code} ({c.symbol})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleSyncLiveFx(true)}
                  title="Sync Live Exchange Rates"
                  className="ml-1 text-zinc-400 hover:text-cyan-400 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${fxSyncing ? 'animate-spin text-cyan-400' : ''}`} />
                </button>
              </div>

              {/* Privacy Blur Toggle */}
              <button
                type="button"
                onClick={togglePrivacyBlur}
                title={privacyBlur ? 'Show Amounts' : 'Hide Amounts (Privacy Mode)'}
                className={`p-2 rounded-xl border cursor-pointer transition-colors ${
                  privacyBlur
                    ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                }`}
              >
                {privacyBlur ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>

              {/* 4-Digit PIN App Lock */}
              <button
                type="button"
                onClick={() => {
                  if (savedPin) {
                    setIsLocked(true)
                  } else {
                    setShowPinModal(true)
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setShowPinModal(true)
                }}
                title={savedPin ? 'Lock App (Right-click to change PIN)' : 'Set 4-Digit App PIN'}
                className={`p-2 rounded-xl border cursor-pointer transition-colors ${
                  savedPin
                    ? 'bg-zinc-900 hover:bg-zinc-800 border-indigo-500/35 text-indigo-300'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400'
                }`}
              >
                {savedPin ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>

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
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={signOut}
                title="Sign Out"
                className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl bg-zinc-900 hover:bg-rose-500/15 hover:border-rose-500/40 hover:text-rose-300 border border-zinc-800 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-5 sm:pt-8 pb-8 lg:pb-12 space-y-6 sm:space-y-8">
          {/* =========================================================
              TAB 1: SIMPLE PULSE & OVERVIEW
             ========================================================= */}
          {activeTab === 'overview' && (
            <>
              {/* Due Subscriptions Auto-Log Banner */}
              {dueSubscriptions.length > 0 && (
                <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs sm:text-sm text-amber-200">
                    <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>{dueSubscriptions.length} recurring subscription(s)</strong> are due
                      this month ({dueSubscriptions.map((s) => s.name).join(', ')}).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogDueSubscriptions}
                    disabled={loggingDueSubs}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    {loggingDueSubs ? 'Logging...' : 'Log All Due Now'}
                  </button>
                </div>
              )}

              {/* Hero Safe-to-Spend Pulse Banner */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="lg:col-span-2 relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-indigo-950/70 via-zinc-900 to-zinc-900 border border-indigo-500/30 p-5 sm:p-8 shadow-xl">
                  <div className="absolute -right-12 -top-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
                    <div>
                      <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[11px] sm:text-xs font-semibold mb-2.5 sm:mb-3">
                        <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                        Safe-to-Spend Today • {daysRemaining} days left
                      </div>
                      <div className="text-3xl sm:text-5xl font-black tracking-tight text-white">
                        {fmt(safeToSpendToday)}
                        <span className="text-sm sm:text-base font-medium text-zinc-400 ml-1.5 sm:ml-2">/ day</span>
                      </div>
                      <p className="text-xs sm:text-sm text-zinc-400 mt-2 max-w-lg">
                        Calculated after setting aside{' '}
                        <span className="text-zinc-200 font-semibold">{fmt(fixedBills, 0)}</span>{' '}
                        for fixed bills,{' '}
                        <span className="text-indigo-300 font-semibold">
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
                      <div className="grid grid-cols-2 sm:flex sm:flex-col gap-2">
                        <button
                          onClick={() => openAddTransactionModal('expense')}
                          className="px-4 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 cursor-pointer transition-all"
                        >
                          <Plus className="w-4 h-4 shrink-0" />
                          <span>Add Expense</span>
                        </button>
                        <button
                          onClick={() => openAddTransactionModal('expense', 'receipt')}
                          className="px-4 py-2.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
                        >
                          <Camera className="w-4 h-4 shrink-0" />
                          <span>Photo / Reçu</span>
                        </button>
                      </div>
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
                  <div className="mt-6 pt-6 border-t border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-zinc-400 block">
                        Total Monthly Income
                      </span>
                      <span className="text-lg font-extrabold text-white">
                        {fmt(monthlyIncome, 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-zinc-400 block">
                        Remaining Budget
                      </span>
                      <span className="text-lg font-extrabold text-indigo-400">
                        {fmt(remainingFlexible)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-zinc-400 block">
                        Total Expenses
                      </span>
                      <span className="text-lg font-extrabold text-rose-400">
                        {fmt(totalExpensesLogged)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-zinc-400 block">
                        Monthly Savings Goal
                      </span>
                      <span className="text-lg font-extrabold text-purple-300">
                        {fmt(savingsGoal, 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 7-Day Cashflow Pulse */}
                <div className="rounded-2xl sm:rounded-3xl bg-zinc-900/90 border border-zinc-800 p-4 sm:p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <PiggyBank className="w-4 h-4 shrink-0" />
                        7-Day Cashflow Pulse
                      </span>
                      <span className="text-[11px] sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-semibold whitespace-nowrap">
                        {last7DaysHeatmap.filter((d) => d.spentUsd === 0).length} Zero-Spend Days
                      </span>
                    </div>

                    <div className="grid grid-cols-7 gap-1 sm:gap-1.5 my-3">
                      {last7DaysHeatmap.map((d) => {
                        const isZero = d.spentUsd === 0
                        const isHigh = d.spentUsd > safeToSpendToday && safeToSpendToday > 0
                        return (
                          <div
                            key={d.dateStr}
                            title={`${d.dateStr}: ${fmt(d.spentUsd)}`}
                            className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl border text-center flex flex-col items-center justify-center ${
                              isZero
                                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                                : isHigh
                                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                  : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                            }`}
                          >
                            <span className="text-[9px] sm:text-[10px] font-bold uppercase">{d.label}</span>
                            <span className="text-[9px] sm:text-[10px] mt-0.5 sm:mt-1 font-extrabold truncate max-w-full">
                              {isZero ? '0' : fmt(d.spentUsd, 0)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Projected Month-End Surplus</span>
                      <span className="font-bold text-indigo-400">
                        {fmt(
                          Math.max(
                            0,
                            monthlyIncome - totalExpensesLogged - fixedBills - totalSubsMonthly
                          )
                        )}
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-zinc-950 overflow-hidden border border-zinc-800">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-amber-400 to-rose-500 transition-all duration-500"
                        style={{
                          width: `${
                            flexiblePool > 0
                              ? Math.min(100, Math.round((totalExpensesLogged / flexiblePool) * 100))
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                      <span>
                        Currency: {getCurrencyInfo(activeCurrency).flag} {activeCurrency}
                      </span>
                      <span>Green = Zero Spend</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* 1-CLICK QUICK-LOG ("ClickPads") */}
              <section className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
                      <span className="truncate">1-Click Quick-Log (&ldquo;ClickPads&rdquo;)</span>
                    </h2>
                    <p className="text-[11px] sm:text-xs text-zinc-400">
                      Tap once to log a daily expense in {activeCurrency}.
                    </p>
                  </div>
                  <button
                    onClick={openAddPadModal}
                    className="px-3 sm:px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-indigo-400 flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">New ClickPad</span>
                    <span className="sm:hidden">New</span>
                  </button>
                </div>

                {clickpads.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-center text-xs text-zinc-400">
                    No ClickPads yet. Click &ldquo;+ New ClickPad&rdquo; to create 1-click expense
                    shortcuts!
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
                    {clickpads.map((pad) => (
                      <div
                        key={pad.id}
                        onClick={() => handleQuickClickPad(pad)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') handleQuickClickPad(pad)
                        }}
                        className="group relative text-left p-3 sm:p-4 rounded-2xl bg-zinc-900/90 hover:bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 transition-all active:scale-95 cursor-pointer shadow-sm"
                      >
                        <button
                          type="button"
                          title="Edit ClickPad"
                          onClick={(e) => openEditPadModal(pad, e)}
                          className="opacity-80 sm:opacity-0 sm:group-hover:opacity-100 absolute top-2 right-2 p-1.5 rounded-lg bg-zinc-950/90 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-opacity cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>

                        <div className="flex items-center justify-between mb-2 pr-6 sm:pr-0">
                          <span className="text-xl sm:text-2xl group-hover:scale-110 transition-transform">
                            {pad.emoji}
                          </span>
                          <span className="text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            -{fmt(Number(pad.amount))}
                          </span>
                        </div>
                        <div className="font-bold text-xs sm:text-sm text-white truncate">{pad.label}</div>
                        <div className="flex items-center justify-between mt-1 text-[10px] sm:text-[11px] text-zinc-500">
                          <span className="truncate">{pad.category}</span>
                          <span className="shrink-0 ml-1">{pad.clicks_count}×</span>
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
                  <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800/90 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <Receipt className="w-5 h-5 text-sky-400" />
                          Recent Transactions ({transactions.length})
                        </h3>
                        <p className="text-xs text-zinc-400">
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
                          className="px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-xs font-bold text-white flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Tx
                        </button>
                      </div>
                    </div>

                    {transactions.length === 0 ? (
                      <div className="py-12 text-center space-y-2">
                        <p className="text-sm font-semibold text-zinc-300">
                          0 Transactions — Clean Slate!
                        </p>
                        <p className="text-xs text-zinc-500">
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
                              className="p-3.5 rounded-2xl bg-zinc-950/90 border border-zinc-800/80 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-lg shrink-0">
                                  {tx.emoji}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-sm text-white truncate">
                                    {tx.title}
                                  </div>
                                  <div className="text-[11px] text-zinc-500 flex flex-wrap items-center gap-1.5">
                                    <span>
                                      {tx.category} •{' '}
                                      {tx.tx_date
                                        ? new Date(tx.tx_date).toLocaleDateString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                          })
                                        : 'Today'}
                                    </span>
                                    {tx.receipt_image && (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewPhotoTx(tx)}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold hover:bg-amber-500/25 cursor-pointer"
                                      >
                                        <Camera className="w-2.5 h-2.5" />
                                        {tx.receipt_kind === 'product' ? 'Product' : 'Reçu'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`font-extrabold text-sm mr-1 ${
                                    isIncome ? 'text-indigo-400' : 'text-rose-400'
                                  }`}
                                >
                                  {isIncome ? '+' : '-'}
                                  {fmt(Number(tx.amount))}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openEditTransactionModal(tx)}
                                  title="Edit transaction"
                                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-indigo-500/20 text-zinc-400 hover:text-indigo-300 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTx(tx)}
                                  title="Delete transaction"
                                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 cursor-pointer"
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
                            className="w-full py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-indigo-400 cursor-pointer"
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
                  <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800/90 p-6 space-y-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-sky-400" />
                      Spending by Category
                    </h3>
                    {categoryBreakdown.length === 0 ? (
                      <p className="text-xs text-zinc-500 py-4">
                        All transactions are at zero. Add an expense to see category analytics.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {categoryBreakdown.map((item) => (
                          <div key={item.category} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-semibold text-zinc-200">{item.category}</span>
                              <span className="text-zinc-400">
                                <strong className="text-white">{fmt(item.amountUsd)}</strong> (
                                {item.pct}%)
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-zinc-950 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-sky-400"
                                style={{ width: `${item.pct}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Subscriptions Quick View */}
                  <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800/90 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-amber-400" />
                          Subscriptions ({subscriptions.length})
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Monthly recurring: <strong className="text-amber-300">{fmt(totalSubsMonthly)}/mo</strong>
                        </p>
                      </div>
                      <button
                        onClick={openAddSubModal}
                        className="px-3 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-indigo-400 cursor-pointer"
                      >
                        + Add Sub
                      </button>
                    </div>

                    {subscriptions.length === 0 ? (
                      <p className="text-xs text-zinc-500 py-4">No active subscriptions.</p>
                    ) : (
                      <div className="divide-y divide-zinc-800/70">
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
                                <span className="text-[11px] text-zinc-500">
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
                                className="p-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
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
                  <p className="text-sm text-zinc-400">
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
                    onClick={() => setShowCsvModal(true)}
                    className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                    Import CSV
                  </button>
                  <button
                    onClick={() =>
                      settings &&
                      openPrintableMonthlyReport({
                        settings,
                        transactions,
                        subscriptions,
                        fmt: rawFmt,
                      })
                    }
                    className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-indigo-400" />
                    PDF Report
                  </button>
                  <button
                    onClick={handleExportCsv}
                    className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
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
                    className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />+ Add Expense
                  </button>
                </div>
              </div>

              {/* Summary KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                  <span className="text-xs text-zinc-400">Logged Income</span>
                  <div className="text-2xl font-black text-indigo-400 mt-1">
                    +{fmt(extraIncomeLogged)}
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                  <span className="text-xs text-zinc-400">Logged Expenses</span>
                  <div className="text-2xl font-black text-rose-400 mt-1">
                    -{fmt(totalExpensesLogged)}
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                  <span className="text-xs text-zinc-400">Net Activity Balance</span>
                  <div className="text-2xl font-black text-white mt-1">
                    {fmt(extraIncomeLogged - totalExpensesLogged)}
                  </div>
                </div>
              </div>

              {/* Search & Filters */}
              <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800 p-6 space-y-5">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -tranzinc-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search transactions by title, category, or notes..."
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {(['all', 'expense', 'income'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTxFilterType(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize cursor-pointer ${
                          txFilterType === t
                            ? 'bg-indigo-500 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredTransactions.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <p className="text-base font-bold text-zinc-300">No Transactions Found</p>
                    <p className="text-xs text-zinc-500">
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
                          className="p-3 sm:p-4 rounded-2xl bg-zinc-950/90 border border-zinc-800/80 hover:border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-lg sm:text-xl shrink-0">
                              {tx.emoji}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-sm sm:text-base text-white truncate">
                                {tx.title}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-zinc-400">
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
                                  <span className="px-1.5 sm:px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-amber-300 font-semibold">
                                    Logged as{' '}
                                    {formatMoney(
                                      Number(tx.original_amount),
                                      tx.original_currency || 'USD'
                                    )}
                                  </span>
                                )}
                                {tx.receipt_image && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewPhotoTx(tx)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold hover:bg-amber-500/25 cursor-pointer"
                                  >
                                    <Camera className="w-3 h-3" />
                                    {tx.receipt_kind === 'product' ? 'View Product' : 'View Reçu'}
                                  </button>
                                )}
                              </div>
                              {tx.notes && (
                                <p className="text-xs text-zinc-500 mt-0.5 truncate">{tx.notes}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pl-12 sm:pl-0">
                            <span
                              className={`font-extrabold text-sm sm:text-base mr-1 sm:mr-2 ${
                                isIncome ? 'text-indigo-400' : 'text-rose-400'
                              }`}
                            >
                              {isIncome ? '+' : '-'}
                              {fmt(Number(tx.amount))}
                            </span>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditTransactionModal(tx)}
                                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-indigo-500/20 text-xs font-semibold text-zinc-300 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTx(tx)}
                                aria-label="Delete transaction"
                                className="p-2 rounded-xl bg-zinc-900 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
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
                  <p className="text-sm text-zinc-400">
                    Track recurring monthly charges, annual burn, and 1-Click Cancel Alerts.
                  </p>
                </div>
                <button
                  onClick={openAddSubModal}
                  className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />+ Add Subscription
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                  <span className="text-xs text-zinc-400">Active Monthly Burn</span>
                  <div className="text-2xl font-black text-white mt-1">
                    {fmt(totalSubsMonthly)}/mo
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                  <span className="text-xs text-zinc-400">Projected Annual Burn</span>
                  <div className="text-2xl font-black text-amber-300 mt-1">
                    {fmt(totalSubsMonthly * 12, 0)}/yr
                  </div>
                </div>
                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800">
                  <span className="text-xs text-zinc-400">Cancel Alerts Flagged</span>
                  <div className="text-2xl font-black text-rose-400 mt-1">
                    {subscriptions.filter((s) => s.status === 'cancel_alert').length}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800 p-6">
                {subscriptions.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <p className="text-base font-bold text-zinc-300">No Subscriptions Tracked</p>
                    <p className="text-xs text-zinc-500">
                      Click &ldquo;+ Add Subscription&rdquo; to track your recurring monthly bills.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/70">
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
                            <div className="text-xs text-zinc-400">
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
                                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                                : sub.status === 'cancel_alert'
                                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 line-through'
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
                            className="px-3 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 flex items-center gap-1 cursor-pointer"
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
              TAB 3.4: TONTINE / DARET SAVINGS CIRCLES
             ========================================================= */}
          {activeTab === 'tontine' && user && (
            <TontinePanel
              userId={user.id}
              tontines={tontines}
              setTontines={setTontines}
              activeCurrency={activeCurrency}
              fmt={fmt}
              toDisplay={toDisplay}
              showToast={showToast}
              onLogTontineTx={async ({ title, emoji, amountUsd, txType, notes }) => {
                const { data, error } = await supabase
                  .from('koinclick_transactions')
                  .insert({
                    user_id: user.id,
                    jar_id: null,
                    title,
                    emoji,
                    amount: amountUsd,
                    tx_type: txType,
                    category: txType === 'income' ? 'Salary / Income' : 'Utilities & Bills',
                    source: 'manual',
                    notes,
                    tx_date: new Date().toISOString(),
                  })
                  .select('*')
                  .single()
                if (!error && data) {
                  setTransactions((prev) => [data, ...prev])
                  showToast(
                    txType === 'income'
                      ? `🎉 Logged Tontine pot (+${rawFmt(amountUsd)})`
                      : `🤝 Logged Tontine share (-${rawFmt(amountUsd)})`
                  )
                }
              }}
            />
          )}

          {/* =========================================================
              TAB 3.5: AI BUDGET MANAGEMENT & USER MODEL APIS
             ========================================================= */}
          {activeTab === 'ai' && user && settings && (
            <AiBudgetPanel
              userId={user.id}
              settings={settings}
              transactions={transactions}
              subscriptions={subscriptions}
              aiModels={aiModels}
              setAiModels={setAiModels}
              aiBudgets={aiBudgets}
              setAiBudgets={setAiBudgets}
              formatMoney={(amt) => fmt(amt)}
            />
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
      <footer className="border-t border-zinc-900 bg-zinc-950/90 py-6 pb-24 lg:pb-6 mt-8 sm:mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 text-xs text-zinc-500 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="font-bold text-zinc-300">KoinCLICK</span>
            <span>— Simple Multi-Currency Budget Manager</span>
          </div>
          <div>© {new Date().getFullYear()} KoinCLICK. All rights reserved.</div>
        </div>
      </footer>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/90 px-2 py-1.5 flex items-center justify-around"
      >
        {(
          [
            { id: 'overview', label: 'Overview', icon: BarChart3, count: null },
            { id: 'transactions', label: 'Transactions', icon: Receipt, count: transactions.length },
            { id: 'radar', label: 'Subs', icon: Calendar, count: subscriptions.length },
            {
              id: 'tontine',
              label: 'Tontine',
              icon: Users,
              count: tontines.filter((t) => t.status === 'active').length || null,
            },
            {
              id: 'ai',
              label: 'AI Budget',
              icon: Sparkles,
              count: aiModels.filter((m) => m.is_active).length || null,
            },
            ...(isAdmin ? ([{ id: 'admin', label: 'Admin', icon: Shield, count: null }] as const) : []),
          ] as const
        ).map((item) => {
          const Icon = item.icon
          const active = activeTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[64px] transition-all cursor-pointer ${
                active
                  ? 'text-indigo-400 bg-indigo-500/10'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.count !== null && item.count > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-indigo-500 text-white text-[9px] font-extrabold flex items-center justify-center">
                    {item.count > 99 ? '99+' : item.count}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold tracking-tight">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* MODAL 0: Start From Zero / Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-rose-400" />
              Start Everything From Zero
            </h3>
            <p className="text-xs text-zinc-400">
              Choose how you would like to reset your KoinCLICK budget:
            </p>

            <div className="space-y-3">
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetTransactionsToZero}
                className="w-full text-left p-4 rounded-2xl bg-zinc-950 hover:bg-zinc-800/80 border border-rose-500/30 transition-colors cursor-pointer"
              >
                <div className="font-bold text-sm text-rose-300">
                  1. Clear All Transactions to 0.00
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Removes all {transactions.length} transactions and resets ClickPad counters to 0.
                </p>
              </button>

              <button
                type="button"
                disabled={resetting}
                onClick={handleFullFactoryResetToZero}
                className="w-full text-left p-4 rounded-2xl bg-zinc-950 hover:bg-zinc-800/80 border border-amber-500/30 transition-colors cursor-pointer"
              >
                <div className="font-bold text-sm text-amber-300">
                  2. Full Factory Reset (All Pads, Subs & Income to 0.00)
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Starts your entire account from a 100% blank slate with 0 transactions and 0.00
                  income.
                </p>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Add / Edit Transaction (Simple: Expense or Income) */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">
                {editingTx ? 'Edit Transaction' : 'Add New Transaction'}
              </h3>
              <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 font-semibold">
                Multi-Currency
              </span>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-4">
              {/* Transaction Type Selector */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950 rounded-2xl border border-zinc-800">
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
                          ? 'bg-indigo-500 text-white shadow'
                          : 'text-zinc-400 hover:text-white'
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
                  <label className="text-xs text-zinc-400 block mb-1">Emoji</label>
                  <input
                    type="text"
                    value={txEmoji}
                    onChange={(e) => setTxEmoji(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-center text-lg"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-zinc-400 block mb-1">Title / Description</label>
                  <input
                    type="text"
                    required
                    placeholder="Supermarket, Salary, Coffee, etc."
                    value={txTitle}
                    onChange={(e) => setTxTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                  />
                </div>
              </div>

              {/* Amount + Currency Selector */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-zinc-400 block mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="25.00"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Currency</label>
                  <select
                    value={txCurrency}
                    onChange={(e) => setTxCurrency(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white font-semibold"
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
                  <label className="text-xs text-zinc-400 block mb-1">Category</label>
                  <select
                    value={txCategory}
                    onChange={(e) => {
                      setTxCategory(e.target.value)
                      const found = CATEGORIES.find((c) => c.label === e.target.value)
                      if (found && !editingTx) setTxEmoji(found.emoji)
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.label} value={c.label}>
                        {c.emoji} {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Transaction Date</label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Optional note or memo..."
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                />
              </div>

              {/* Product or Receipt (Reçu) Photo Capture */}
              <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-amber-400" />
                    Product or Receipt (Reçu) Photo
                  </span>
                  <div className="inline-flex p-0.5 rounded-xl bg-zinc-900 border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setTxReceiptKind('receipt')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                        txReceiptKind === 'receipt'
                          ? 'bg-amber-500 text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      🧾 Reçu / Receipt
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxReceiptKind('product')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                        txReceiptKind === 'product'
                          ? 'bg-indigo-500 text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      📦 Product
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <label className="py-2.5 px-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer text-center">
                    <Camera className="w-3.5 h-3.5 shrink-0" />
                    <span>Take Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoFileChange}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={openLiveCamera}
                    className="py-2.5 px-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-300 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>Live Cam</span>
                  </button>

                  <label className="py-2.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer text-center">
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {txPhotoBusy && (
                  <p className="text-[11px] text-amber-300 animate-pulse">
                    Compressing photo...
                  </p>
                )}

                {txReceiptImage && (
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900">
                      <img
                        src={txReceiptImage}
                        alt="Attached product or receipt"
                        className="w-full max-h-48 object-contain bg-zinc-950"
                      />
                      <button
                        type="button"
                        onClick={() => setTxReceiptImage(null)}
                        title="Remove photo"
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-zinc-950/90 hover:bg-rose-500/80 text-white border border-zinc-700 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleAiScanReceipt}
                      disabled={scanningReceipt}
                      className="w-full py-2 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/40 text-indigo-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Wand2 className={`w-3.5 h-3.5 text-cyan-400 ${scanningReceipt ? 'animate-spin' : ''}`} />
                      {scanningReceipt
                        ? 'Scanning Reçu with AI...'
                        : activeAiModel
                          ? `AI Scan & Auto-Fill (${activeAiModel.name})`
                          : 'AI Scan & Auto-Fill (Add Model API in AI Budget)'}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTxModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingPad ? 'Edit 1-Click Pad' : 'Create 1-Click Quick-Log Pad'}
            </h3>
            <form onSubmit={handleSaveClickPad} className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Emoji</label>
                  <input
                    type="text"
                    value={padEmoji}
                    onChange={(e) => setPadEmoji(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-center text-lg"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-zinc-400 block mb-1">Habit Label</label>
                  <input
                    type="text"
                    required
                    placeholder="Morning Coffee"
                    value={padLabel}
                    onChange={(e) => setPadLabel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    Price ({activeCurrency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="4.50"
                    value={padAmount}
                    onChange={(e) => setPadAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Category</label>
                  <input
                    type="text"
                    value={padCategory}
                    onChange={(e) => setPadCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
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
                    className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-xs font-bold cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-400" />
              {editingSub ? 'Edit Subscription' : 'Add Recurring Subscription'}
            </h3>
            <form onSubmit={handleSaveSubscription} className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Emoji</label>
                  <input
                    type="text"
                    value={subEmoji}
                    onChange={(e) => setSubEmoji(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-center text-lg"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-zinc-400 block mb-1">Service Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Spotify, iCloud, Gym"
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    Monthly Cost ({activeCurrency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="14.99"
                    value={subCost}
                    onChange={(e) => setSubCost(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Billing Day (1-31)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={subBillingDay}
                    onChange={(e) => setSubBillingDay(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Status</label>
                <select
                  value={subStatus}
                  onChange={(e) =>
                    setSubStatus(e.target.value as 'active' | 'cancel_alert' | 'paused')
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
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
                    className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-xs font-bold cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-indigo-400" />
              Budget & Multi-Currency Settings
            </h3>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Profile Display Name</label>
                <input
                  type="text"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Primary Display Currency</label>
                <select
                  value={currencyInput}
                  onChange={(e) => setCurrencyInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white font-semibold"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} — {c.name} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  Monthly Take-Home Income ({currencyInput})
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  value={incomeInput}
                  onChange={(e) => setIncomeInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  Fixed Monthly Bills ({currencyInput})
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  value={billsInput}
                  onChange={(e) => setBillsInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  Monthly Savings Goal ({currencyInput})
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  value={savingsInput}
                  onChange={(e) => setSavingsInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Photo Preview Lightbox (Product / Reçu) */}
      {previewPhotoTx && previewPhotoTx.receipt_image && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          onClick={() => setPreviewPhotoTx(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl sm:rounded-3xl bg-zinc-900 border border-zinc-800 p-4 sm:p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 mb-1">
                  <Camera className="w-3 h-3" />
                  {previewPhotoTx.receipt_kind === 'product' ? 'Product Photo' : 'Receipt / Reçu'}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white truncate">
                  {previewPhotoTx.emoji} {previewPhotoTx.title}
                </h3>
                <p className="text-xs text-zinc-400">
                  {fmt(Number(previewPhotoTx.amount))} • {previewPhotoTx.category}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhotoTx(null)}
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center">
              <img
                src={previewPhotoTx.receipt_image}
                alt={previewPhotoTx.title}
                className="max-h-[65vh] w-auto object-contain"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <a
                href={previewPhotoTx.receipt_image}
                download={`KoinCLICK_${previewPhotoTx.receipt_kind || 'receipt'}_${previewPhotoTx.id}.jpg`}
                className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download Photo
              </a>
              <button
                type="button"
                onClick={() => setPreviewPhotoTx(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Live Camera Capture */}
      {showCameraModal && (
        <div className="fixed inset-0 z-[60] bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-lg rounded-2xl sm:rounded-3xl bg-zinc-900 border border-zinc-800 p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-amber-400" />
                Capture {txReceiptKind === 'product' ? 'Product' : 'Receipt (Reçu)'}
              </h3>
              <button
                type="button"
                onClick={closeLiveCamera}
                className="p-2 rounded-xl bg-zinc-800 text-zinc-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {cameraError ? (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                {cameraError}
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden bg-black border border-zinc-800 aspect-video flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeLiveCamera}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              {!cameraError && (
                <button
                  type="button"
                  onClick={captureFromLiveCamera}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  Snap Photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: CSV Bank Statement Import */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-zinc-900 border border-zinc-800 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
                Import Bank / Expense CSV
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCsvModal(false)
                  setCsvRows([])
                }}
                className="p-2 rounded-xl bg-zinc-800 text-zinc-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Upload any CSV with Date, Description/Title, and Amount columns. Categories are
              auto-detected automatically.
            </p>

            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60 p-5 cursor-pointer hover:border-indigo-500/50">
              <Upload className="w-5 h-5 text-indigo-400" />
              <span className="text-xs font-semibold text-zinc-200">Choose .CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileSelect}
                className="hidden"
              />
            </label>

            {csvRows.length > 0 && (
              <div className="max-h-52 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/70 divide-y divide-zinc-800/80">
                {csvRows.slice(0, 30).map((r, i) => (
                  <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-white">{r.title}</div>
                      <div className="text-[11px] text-zinc-500">
                        {r.tx_date} · {r.category}
                      </div>
                    </div>
                    <span
                      className={`font-bold ${
                        r.tx_type === 'income' ? 'text-indigo-400' : 'text-rose-400'
                      }`}
                    >
                      {r.tx_type === 'income' ? '+' : '-'}
                      {r.amount.toFixed(2)} {activeCurrency}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCsvModal(false)
                  setCsvRows([])
                }}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={csvRows.length === 0 || csvImporting}
                onClick={handleImportCsvConfirm}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-bold text-white cursor-pointer"
              >
                {csvImporting ? 'Importing...' : `Import ${csvRows.length} Row(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: 4-Digit PIN Setup */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePin}
            className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-400" />
                {savedPin ? 'Manage App PIN' : 'Set 4-Digit App PIN'}
              </h3>
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPinInput}
              onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Enter 4-digit PIN (e.g. 1234)"
              className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3.5 py-2.5 text-center text-lg tracking-[0.5em] font-bold text-white"
            />
            <div className="flex justify-between gap-2">
              {savedPin ? (
                <button
                  type="button"
                  onClick={handleRemovePin}
                  className="px-3 py-2 rounded-xl bg-rose-500/15 text-rose-300 text-xs font-bold cursor-pointer"
                >
                  Remove PIN
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
              >
                Save PIN
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PIN LOCK SCREEN OVERLAY */}
      {isLocked && savedPin && (
        <div className="fixed inset-0 z-[100] bg-zinc-950/95 backdrop-blur-xl flex items-center justify-center p-4">
          <form
            onSubmit={handleUnlockPin}
            className="w-full max-w-xs rounded-3xl bg-zinc-900 border border-indigo-500/35 p-6 shadow-2xl text-center space-y-4"
          >
            <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <Lock className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">KoinCLICK Locked</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Enter your 4-digit PIN to unlock</p>
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pinEntry}
              onChange={(e) => {
                setPinError('')
                setPinEntry(e.target.value.replace(/\D/g, '').slice(0, 4))
              }}
              placeholder="••••"
              className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-3 text-center text-2xl tracking-[0.6em] font-bold text-white"
            />
            {pinError && <p className="text-xs text-rose-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold cursor-pointer"
            >
              Unlock
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
