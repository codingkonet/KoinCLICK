import React, { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Wand2,
  Zap,
} from 'lucide-react'
import {
  AI_PROVIDER_PRESETS,
  askAiBudgetAdvisor,
  buildLocalSmartAnalysis,
  generateAiBudgetPlan,
  testAiModelConnection,
  type AiBudgetAnalysis,
} from '../lib/aiBudgetService'
import {
  supabase,
  type AiProvider,
  type KoinAiBudget,
  type KoinAiModel,
  type KoinSettings,
  type KoinSubscription,
  type KoinTransaction,
} from '../lib/supabase'

interface AiBudgetPanelProps {
  userId: string
  settings: KoinSettings
  transactions: KoinTransaction[]
  subscriptions: KoinSubscription[]
  aiModels: KoinAiModel[]
  setAiModels: React.Dispatch<React.SetStateAction<KoinAiModel[]>>
  aiBudgets: KoinAiBudget[]
  setAiBudgets: React.Dispatch<React.SetStateAction<KoinAiBudget[]>>
  formatMoney: (amount: number) => string
}

const DEFAULT_CATEGORIES = [
  'Food & Coffee',
  'Transport',
  'Bills & Rent',
  'Shopping',
  'Entertainment',
  'Health',
  'Other',
]

export const AiBudgetPanel: React.FC<AiBudgetPanelProps> = ({
  userId,
  settings,
  transactions,
  subscriptions,
  aiModels,
  setAiModels,
  aiBudgets,
  setAiBudgets,
  formatMoney,
}) => {
  // Selected model (default active model, or first active model)
  const activeModels = useMemo(() => aiModels.filter((m) => m.is_active), [aiModels])
  const defaultModel = useMemo(
    () => activeModels.find((m) => m.is_default) || activeModels[0] || null,
    [activeModels]
  )
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const effectiveModel = useMemo(() => {
    if (selectedModelId) {
      const found = activeModels.find((m) => m.id === selectedModelId)
      if (found) return found
    }
    return defaultModel
  }, [selectedModelId, activeModels, defaultModel])

  // AI Analysis State
  const localBaseline = useMemo(
    () =>
      buildLocalSmartAnalysis({
        settings,
        transactions,
        subscriptions,
        existingBudgets: aiBudgets,
      }),
    [settings, transactions, subscriptions, aiBudgets]
  )
  const [analysis, setAnalysis] = useState<AiBudgetAnalysis | null>(null)
  const displayedAnalysis = analysis || localBaseline
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // AI Advisor Q&A State
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [qaHistory, setQaHistory] = useState<
    Array<{ q: string; a: string; model: string; isLive: boolean }>
  >([])

  // Add/Edit Model API Modal State
  const [showModelForm, setShowModelForm] = useState(false)
  const [editingModel, setEditingModel] = useState<KoinAiModel | null>(null)
  const [modelName, setModelName] = useState('')
  const [modelProvider, setModelProvider] = useState<AiProvider>('gemini')
  const [modelIdInput, setModelIdInput] = useState(AI_PROVIDER_PRESETS.gemini.defaultModel)
  const [modelApiKey, setModelApiKey] = useState('')
  const [modelBaseUrl, setModelBaseUrl] = useState(AI_PROVIDER_PRESETS.gemini.defaultBaseUrl)
  const [modelMonthlyCap, setModelMonthlyCap] = useState('20')
  const [savingModel, setSavingModel] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [revealedKeys, setRevealedKeys] = useState<Record<number, boolean>>({})
  const [testingModelId, setTestingModelId] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<
    Record<number, { ok: boolean; message: string }>
  >({})

  // Add/Edit Category Budget Cap State
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [budgetCat, setBudgetCat] = useState('Food & Coffee')
  const [budgetLimit, setBudgetLimit] = useState('250')
  const [budgetThreshold, setBudgetThreshold] = useState('80')
  const [savingBudget, setSavingBudget] = useState(false)

  // Category spend map
  const categorySpend = useMemo(() => {
    const map: Record<string, number> = {}
    for (const tx of transactions) {
      if (tx.tx_type !== 'expense') continue
      const cat = tx.category || 'Other'
      map[cat] = (map[cat] || 0) + Number(tx.amount || 0)
    }
    return map
  }, [transactions])

  const handleRunAnalysis = async () => {
    setAnalyzing(true)
    setAnalysisError(null)
    try {
      const result = await generateAiBudgetPlan({
        model: effectiveModel,
        settings,
        transactions,
        subscriptions,
        existingBudgets: aiBudgets,
      })
      setAnalysis(result)
    } catch (err: unknown) {
      setAnalysisError(
        err instanceof Error ? err.message : 'Failed to run AI analysis. Falling back to local engine.'
      )
    } finally {
      setAnalyzing(false)
    }
  }

  const handleApplyAllRecommendations = async () => {
    if (!displayedAnalysis.recommendations.length) return
    setSavingBudget(true)
    try {
      const rows = displayedAnalysis.recommendations.map((rec) => ({
        user_id: userId,
        category: rec.category,
        monthly_limit: rec.recommendedLimit,
        ai_recommended_limit: rec.recommendedLimit,
        alert_threshold: 80,
        ai_notes: rec.reason,
        updated_at: new Date().toISOString(),
      }))

      const { data, error } = await supabase
        .from('koinclick_ai_budgets')
        .upsert(rows, { onConflict: 'user_id,category' })
        .select('*')

      if (error) throw error
      if (data) {
        setAiBudgets(data)
      }
    } catch (err) {
      console.error('Failed to apply AI budget recommendations:', err)
    } finally {
      setSavingBudget(false)
    }
  }

  const handleAskAdvisor = async (customQ?: string) => {
    const q = (customQ ?? question).trim()
    if (!q || asking) return
    setAsking(true)
    if (!customQ) setQuestion('')
    try {
      const res = await askAiBudgetAdvisor({
        model: effectiveModel,
        question: q,
        settings,
        transactions,
        subscriptions,
        existingBudgets: aiBudgets,
      })
      setQaHistory((prev) => [
        { q, a: res.answer, model: res.usedModelLabel, isLive: res.isLiveAi },
        ...prev.slice(0, 7),
      ])
    } catch (err: unknown) {
      setQaHistory((prev) => [
        {
          q,
          a: `Error calling model: ${err instanceof Error ? err.message : 'Unknown error'}`,
          model: effectiveModel?.name || 'Model',
          isLive: false,
        },
        ...prev.slice(0, 7),
      ])
    } finally {
      setAsking(false)
    }
  }

  const openAddModelForm = () => {
    setEditingModel(null)
    setModelProvider('gemini')
    setModelName('My Gemini Flash')
    setModelIdInput(AI_PROVIDER_PRESETS.gemini.defaultModel)
    setModelApiKey('')
    setModelBaseUrl(AI_PROVIDER_PRESETS.gemini.defaultBaseUrl)
    setModelMonthlyCap('20')
    setModelError(null)
    setShowModelForm(true)
  }

  const openEditModelForm = (m: KoinAiModel) => {
    setEditingModel(m)
    setModelProvider(m.provider)
    setModelName(m.name)
    setModelIdInput(m.model_id)
    setModelApiKey(m.api_key)
    setModelBaseUrl(m.base_url || AI_PROVIDER_PRESETS[m.provider]?.defaultBaseUrl || '')
    setModelMonthlyCap(String(m.monthly_budget ?? 20))
    setModelError(null)
    setShowModelForm(true)
  }

  const handleProviderChange = (provider: AiProvider) => {
    setModelProvider(provider)
    const preset = AI_PROVIDER_PRESETS[provider]
    setModelIdInput(preset.defaultModel)
    setModelBaseUrl(preset.defaultBaseUrl)
    if (!editingModel) {
      setModelName(`My ${preset.label}`)
    }
  }

  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modelName.trim() || !modelIdInput.trim() || !modelApiKey.trim()) {
      setModelError('Name, Model ID, and API Key are required.')
      return
    }
    setSavingModel(true)
    setModelError(null)
    try {
      const payload = {
        user_id: userId,
        name: modelName.trim(),
        provider: modelProvider,
        model_id: modelIdInput.trim(),
        api_key: modelApiKey.trim(),
        base_url: modelBaseUrl.trim() || null,
        monthly_budget: Math.max(0, Number(modelMonthlyCap) || 20),
        is_active: editingModel ? editingModel.is_active : true,
        is_default: editingModel ? editingModel.is_default : aiModels.length === 0,
      }

      if (editingModel) {
        const { data, error } = await supabase
          .from('koinclick_ai_models')
          .update(payload)
          .eq('id', editingModel.id)
          .select('*')
          .single()
        if (error) throw error
        if (data) {
          setAiModels((prev) => prev.map((m) => (m.id === data.id ? data : m)))
        }
      } else {
        const { data, error } = await supabase
          .from('koinclick_ai_models')
          .insert(payload)
          .select('*')
          .single()
        if (error) throw error
        if (data) {
          setAiModels((prev) => [...prev, data])
        }
      }
      setShowModelForm(false)
    } catch (err: unknown) {
      setModelError(err instanceof Error ? err.message : 'Failed to save model API')
    } finally {
      setSavingModel(false)
    }
  }

  const handleTestModel = async (m: KoinAiModel) => {
    setTestingModelId(m.id)
    const res = await testAiModelConnection(m)
    setTestResults((prev) => ({ ...prev, [m.id]: { ok: res.ok, message: res.message } }))
    setTestingModelId(null)
  }

  const handleToggleModelActive = async (m: KoinAiModel) => {
    const { data, error } = await supabase
      .from('koinclick_ai_models')
      .update({ is_active: !m.is_active })
      .eq('id', m.id)
      .select('*')
      .single()
    if (!error && data) {
      setAiModels((prev) => prev.map((x) => (x.id === m.id ? data : x)))
    }
  }

  const handleSetDefaultModel = async (m: KoinAiModel) => {
    await supabase.from('koinclick_ai_models').update({ is_default: false }).eq('user_id', userId)
    const { data, error } = await supabase
      .from('koinclick_ai_models')
      .update({ is_default: true, is_active: true })
      .eq('id', m.id)
      .select('*')
      .single()
    if (!error && data) {
      setAiModels((prev) =>
        prev.map((x) => (x.id === m.id ? data : { ...x, is_default: false }))
      )
      setSelectedModelId(m.id)
    }
  }

  const handleDeleteModel = async (id: number) => {
    const { error } = await supabase.from('koinclick_ai_models').delete().eq('id', id)
    if (!error) {
      setAiModels((prev) => prev.filter((x) => x.id !== id))
      if (selectedModelId === id) setSelectedModelId(null)
    }
  }

  const handleSaveBudgetCap = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!budgetCat.trim()) return
    setSavingBudget(true)
    try {
      const { data, error } = await supabase
        .from('koinclick_ai_budgets')
        .upsert(
          {
            user_id: userId,
            category: budgetCat.trim(),
            monthly_limit: Math.max(0, Number(budgetLimit) || 0),
            alert_threshold: Math.min(100, Math.max(10, Number(budgetThreshold) || 80)),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,category' }
        )
        .select('*')
        .single()
      if (error) throw error
      if (data) {
        setAiBudgets((prev) => {
          const exists = prev.some((b) => b.category === data.category)
          return exists
            ? prev.map((b) => (b.category === data.category ? data : b))
            : [...prev, data]
        })
      }
      setShowBudgetForm(false)
    } catch (err) {
      console.error('Failed to save budget cap:', err)
    } finally {
      setSavingBudget(false)
    }
  }

  const handleDeleteBudgetCap = async (id: number) => {
    const { error } = await supabase.from('koinclick_ai_budgets').delete().eq('id', id)
    if (!error) {
      setAiBudgets((prev) => prev.filter((b) => b.id !== id))
    }
  }

  const maskKey = (k: string) =>
    k.length <= 10 ? '••••••••' : `${k.slice(0, 5)}••••••${k.slice(-4)}`

  return (
    <div className="space-y-6">
      {/* Top Hero Banner: AI Budget Strategist */}
      <div className="rounded-2xl border border-teal-700/25 bg-white shadow-sm p-4 sm:p-6 shadow-lg shadow-stone-900/5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-700/10 border border-teal-700/25 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                AI Budget Management
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 border border-stone-300 px-2.5 py-0.5 text-xs text-stone-700">
                <Cpu className="w-3.5 h-3.5 text-teal-700" />
                {effectiveModel
                  ? `${effectiveModel.name} (${effectiveModel.model_id})`
                  : 'Local Smart Engine (Add API below)'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              AI Cashflow & Budget Strategist
            </h2>
            <p className="text-xs sm:text-sm text-stone-500 max-w-2xl">
              {displayedAnalysis.summary}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeModels.length > 0 && (
              <select
                value={effectiveModel?.id || ''}
                onChange={(e) => setSelectedModelId(Number(e.target.value) || null)}
                className="rounded-xl bg-[#F6F4EF] border border-stone-300 px-3 py-2 text-xs text-stone-800 focus:outline-none focus:border-teal-700"
              >
                {activeModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.provider})
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={handleRunAnalysis}
              disabled={analyzing}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md shadow-stone-900/10 transition cursor-pointer"
            >
              {analyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              {analyzing ? 'Analyzing...' : 'Run AI Analysis'}
            </button>
          </div>
        </div>

        {analysisError && (
          <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-700">
            {analysisError}
          </div>
        )}

        {/* KPI Cards */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-stone-50 border border-stone-200 p-3.5">
            <div className="text-[11px] uppercase tracking-wider text-stone-500">
              AI Budget Health Score
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-stone-900">
                {displayedAnalysis.healthScore}
              </span>
              <span className="text-xs text-stone-500">/ 100</span>
              <span
                className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
                  displayedAnalysis.healthScore >= 75
                    ? 'bg-teal-700/10 text-teal-800'
                    : displayedAnalysis.healthScore >= 55
                      ? 'bg-amber-500/15 text-amber-700'
                      : 'bg-rose-500/15 text-rose-700'
                }`}
              >
                {displayedAnalysis.healthScore >= 75
                  ? 'Healthy'
                  : displayedAnalysis.healthScore >= 55
                    ? 'Watch'
                    : 'At Risk'}
              </span>
            </div>
          </div>

          <div className="rounded-xl bg-stone-50 border border-stone-200 p-3.5">
            <div className="text-[11px] uppercase tracking-wider text-stone-500">
              Safe Daily Spend
            </div>
            <div className="mt-1 text-2xl font-extrabold text-teal-700">
              {formatMoney(displayedAnalysis.safeDailySpend)}
            </div>
            <div className="text-[11px] text-stone-500 mt-0.5">
              Remaining month daily allowance
            </div>
          </div>

          <div className="rounded-xl bg-stone-50 border border-stone-200 p-3.5">
            <div className="text-[11px] uppercase tracking-wider text-stone-500">
              Projected Monthly Savings
            </div>
            <div
              className={`mt-1 text-2xl font-extrabold ${
                displayedAnalysis.projectedMonthlySavings >= 0
                  ? 'text-teal-800'
                  : 'text-rose-600'
              }`}
            >
              {formatMoney(displayedAnalysis.projectedMonthlySavings)}
            </div>
            <div className="text-[11px] text-stone-500 mt-0.5">
              Source: {displayedAnalysis.isLiveAi ? displayedAnalysis.usedModelLabel : 'Local Engine'}
            </div>
          </div>
        </div>

        {/* Alerts & Tips */}
        {(displayedAnalysis.alerts.length > 0 || displayedAnalysis.tips.length > 0) && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedAnalysis.alerts.length > 0 && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <AlertTriangle className="w-4 h-4" />
                  Spending Alerts
                </div>
                <ul className="space-y-1 text-xs text-stone-700">
                  {displayedAnalysis.alerts.map((a, idx) => (
                    <li key={idx}>• {a}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl border border-teal-700/20 bg-teal-50/60 p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-800">
                <TrendingUp className="w-4 h-4 text-teal-700" />
                Actionable AI Tips
              </div>
              <ul className="space-y-1 text-xs text-stone-700">
                {displayedAnalysis.tips.map((t, idx) => (
                  <li key={idx}>• {t}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Middle Grid: Category Budget Caps + AI Advisor Q&A */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Category Budget Caps */}
        <div className="lg:col-span-7 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-stone-900">Category Budget Caps</h3>
              <p className="text-xs text-stone-500">
                Track monthly limits per category or apply AI-recommended caps
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleApplyAllRecommendations}
                disabled={savingBudget}
                className="inline-flex items-center gap-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 border border-teal-700/25 px-3 py-1.5 text-xs font-semibold text-teal-800 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                Apply AI Caps
              </button>
              <button
                onClick={() => {
                  setBudgetCat('Food & Coffee')
                  setBudgetLimit('250')
                  setBudgetThreshold('80')
                  setShowBudgetForm((v) => !v)
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 px-3 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Cap
              </button>
            </div>
          </div>

          {showBudgetForm && (
            <form
              onSubmit={handleSaveBudgetCap}
              className="rounded-xl border border-teal-700/25 bg-stone-50 p-3.5 grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end"
            >
              <div>
                <label className="block text-[11px] text-stone-500 mb-1">Category</label>
                <select
                  value={budgetCat}
                  onChange={(e) => setBudgetCat(e.target.value)}
                  className="w-full rounded-lg bg-white border border-stone-300 px-2.5 py-2 text-xs text-stone-900"
                >
                  {DEFAULT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-stone-500 mb-1">Monthly Limit</label>
                <input
                  type="number"
                  step="0.01"
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  className="w-full rounded-lg bg-white border border-stone-300 px-2.5 py-2 text-xs text-stone-900"
                />
              </div>
              <div>
                <label className="block text-[11px] text-stone-500 mb-1">Alert At (%)</label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={budgetThreshold}
                  onChange={(e) => setBudgetThreshold(e.target.value)}
                  className="w-full rounded-lg bg-white border border-stone-300 px-2.5 py-2 text-xs text-stone-900"
                />
              </div>
              <button
                type="submit"
                disabled={savingBudget}
                className="rounded-lg bg-teal-700 hover:bg-teal-800 px-3 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                {savingBudget ? 'Saving...' : 'Save Cap'}
              </button>
            </form>
          )}

          {aiBudgets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-100/70 p-6 text-center space-y-2">
              <p className="text-sm font-medium text-stone-700">No Category Caps Configured Yet</p>
              <p className="text-xs text-stone-500">
                Click <span className="text-teal-700 font-semibold">Apply AI Caps</span> to
                auto-generate smart monthly limits based on your income and spending.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {aiBudgets.map((b) => {
                const spent = categorySpend[b.category] || 0
                const limit = Number(b.monthly_limit || 0)
                const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0
                const isOver = limit > 0 && spent > limit
                const isWarn = !isOver && pct >= b.alert_threshold

                return (
                  <div
                    key={b.id}
                    className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-semibold text-stone-900">{b.category}</span>
                        {b.ai_notes && (
                          <p className="text-[11px] text-stone-500 line-clamp-1">{b.ai_notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold ${
                            isOver
                              ? 'text-rose-600'
                              : isWarn
                                ? 'text-amber-700'
                                : 'text-stone-700'
                          }`}
                        >
                          {formatMoney(spent)} / {formatMoney(limit)}
                        </span>
                        <button
                          onClick={() => handleDeleteBudgetCap(b.id)}
                          title="Delete cap"
                          className="p-1 text-stone-500 hover:text-rose-600 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isOver
                            ? 'bg-rose-500'
                            : isWarn
                              ? 'bg-amber-400'
                              : 'bg-gradient-to-r from-teal-700 to-teal-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* AI Budget Advisor Chat */}
        <div className="lg:col-span-5 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-teal-700" />
                <h3 className="text-base font-bold text-stone-900">AI Budget Advisor</h3>
              </div>
              <span className="text-[11px] text-stone-500">
                {effectiveModel ? effectiveModel.model_id : 'Local Engine'}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                'How can I save 20% this month?',
                'Which category is hurting my budget?',
                'Can I afford a 150 purchase?',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleAskAdvisor(prompt)}
                  disabled={asking}
                  className="rounded-lg bg-stone-100 hover:bg-stone-200 border border-stone-300 px-2.5 py-1 text-[11px] text-stone-700 transition cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {qaHistory.length === 0 ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs text-stone-500">
                  Ask anything about your spending, subscriptions, or savings target. Uses your
                  selected Model API when connected.
                </div>
              ) : (
                qaHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-1.5"
                  >
                    <div className="text-xs font-semibold text-teal-800">You: {item.q}</div>
                    <div className="text-xs text-stone-800 whitespace-pre-line leading-relaxed">
                      {item.a}
                    </div>
                    <div className="text-[10px] text-stone-500">
                      {item.isLive ? '⚡ Live AI' : '🧠 Local'} · {item.model}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleAskAdvisor()
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask your AI budget advisor..."
              className="flex-1 rounded-xl bg-[#F6F4EF] border border-stone-300 px-3 py-2 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-teal-700"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="inline-flex items-center justify-center rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 p-2.5 text-white transition cursor-pointer"
            >
              {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>

      {/* User Panel: AI Model APIs Manager */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-700" />
              <h3 className="text-base font-bold text-stone-900">Your AI Model APIs</h3>
            </div>
            <p className="text-xs text-stone-500">
              Connect your own Gemini, OpenAI, Anthropic, Groq, OpenRouter, or custom model API keys
            </p>
          </div>
          <button
            onClick={openAddModelForm}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 px-3.5 py-2 text-xs font-semibold text-white transition cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Add Model API
          </button>
        </div>

        {/* Add / Edit Model Form */}
        {showModelForm && (
          <form
            onSubmit={handleSaveModel}
            className="rounded-xl border border-teal-700/25 bg-[#F6F4EF]/95 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-stone-900">
                {editingModel ? 'Edit AI Model API' : 'Add AI Model API'}
              </h4>
              <button
                type="button"
                onClick={() => setShowModelForm(false)}
                className="text-xs text-stone-500 hover:text-stone-900 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {modelError && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-700">
                {modelError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-stone-500 mb-1">Provider</label>
                <select
                  value={modelProvider}
                  onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
                  className="w-full rounded-lg bg-white border border-stone-300 px-3 py-2 text-xs text-stone-900"
                >
                  {Object.values(AI_PROVIDER_PRESETS).map((p) => (
                    <option key={p.provider} value={p.provider}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-stone-500 mb-1">Display Label</label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g. My Gemini Flash"
                  className="w-full rounded-lg bg-white border border-stone-300 px-3 py-2 text-xs text-stone-900"
                />
              </div>

              <div>
                <label className="block text-[11px] text-stone-500 mb-1">Model ID</label>
                <input
                  type="text"
                  value={modelIdInput}
                  onChange={(e) => setModelIdInput(e.target.value)}
                  placeholder="e.g. gemini-2.5-flash"
                  className="w-full rounded-lg bg-white border border-stone-300 px-3 py-2 text-xs text-stone-900"
                />
                <div className="mt-1 flex flex-wrap gap-1">
                  {AI_PROVIDER_PRESETS[modelProvider].suggestedModels.map((sm) => (
                    <button
                      type="button"
                      key={sm}
                      onClick={() => setModelIdInput(sm)}
                      className="rounded bg-stone-100 hover:bg-stone-200 px-1.5 py-0.5 text-[10px] text-stone-700 cursor-pointer"
                    >
                      {sm}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] text-stone-500 mb-1">API Key</label>
                <input
                  type="password"
                  value={modelApiKey}
                  onChange={(e) => setModelApiKey(e.target.value)}
                  placeholder={AI_PROVIDER_PRESETS[modelProvider].placeholderKey}
                  className="w-full rounded-lg bg-white border border-stone-300 px-3 py-2 text-xs text-stone-900 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-stone-500 mb-1">
                  Monthly API Cap ($)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={modelMonthlyCap}
                  onChange={(e) => setModelMonthlyCap(e.target.value)}
                  className="w-full rounded-lg bg-white border border-stone-300 px-3 py-2 text-xs text-stone-900"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-[11px] text-stone-500 mb-1">
                  Base URL (Optional / Custom Endpoint)
                </label>
                <input
                  type="text"
                  value={modelBaseUrl}
                  onChange={(e) => setModelBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full rounded-lg bg-white border border-stone-300 px-3 py-2 text-xs text-stone-700 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="submit"
                disabled={savingModel}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                {savingModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {editingModel ? 'Update Model API' : 'Save Model API'}
              </button>
            </div>
          </form>
        )}

        {/* Saved Model APIs List */}
        {aiModels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-100/70 p-6 text-center space-y-1.5">
            <p className="text-sm font-medium text-stone-700">No AI Model APIs Added Yet</p>
            <p className="text-xs text-stone-500">
              Add a Gemini, OpenAI, Anthropic, Groq, or OpenRouter API key to power live AI budget
              forecasting and Q&A.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {aiModels.map((m) => {
              const revealed = !!revealedKeys[m.id]
              const testRes = testResults[m.id]
              return (
                <div
                  key={m.id}
                  className={`rounded-xl border p-3.5 space-y-2.5 transition ${
                    m.is_default
                      ? 'border-teal-700/35 bg-teal-50/70'
                      : 'border-stone-200 bg-stone-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-stone-900">{m.name}</span>
                        {m.is_default && (
                          <span className="rounded-full bg-teal-700/10 border border-teal-700/25 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                            Default
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            m.is_active
                              ? 'bg-teal-700/10 text-teal-800'
                              : 'bg-stone-100 text-stone-500'
                          }`}
                        >
                          {m.is_active ? 'Active' : 'Paused'}
                        </span>
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        {AI_PROVIDER_PRESETS[m.provider]?.label || m.provider} ·{' '}
                        <span className="font-mono text-stone-700">{m.model_id}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSetDefaultModel(m)}
                        title="Set as default model"
                        className={`p-1.5 rounded-lg transition cursor-pointer ${
                          m.is_default
                            ? 'text-amber-600 bg-amber-400/10'
                            : 'text-stone-500 hover:text-amber-700'
                        }`}
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteModel(m.id)}
                        title="Delete model"
                        className="p-1.5 rounded-lg text-stone-500 hover:text-rose-600 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-lg bg-white border border-stone-200 px-2.5 py-1.5">
                    <span className="text-[11px] font-mono text-stone-700 truncate">
                      {revealed ? m.api_key : maskKey(m.api_key)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedKeys((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                      }
                      className="text-stone-500 hover:text-stone-900 cursor-pointer"
                    >
                      {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleTestModel(m)}
                        disabled={testingModelId === m.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-stone-100 hover:bg-stone-200 px-2.5 py-1 text-[11px] font-medium text-stone-800 cursor-pointer"
                      >
                        {testingModelId === m.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3 text-teal-700" />
                        )}
                        Test API
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleModelActive(m)}
                        className="rounded-lg bg-stone-100 hover:bg-stone-200 px-2.5 py-1 text-[11px] font-medium text-stone-700 cursor-pointer"
                      >
                        {m.is_active ? 'Pause' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModelForm(m)}
                        className="rounded-lg bg-stone-100 hover:bg-stone-200 px-2.5 py-1 text-[11px] font-medium text-stone-700 cursor-pointer"
                      >
                        Edit
                      </button>
                    </div>
                    <span className="text-[11px] text-stone-500">
                      Cap: ${Number(m.monthly_budget || 0).toFixed(0)}/mo
                    </span>
                  </div>

                  {testRes && (
                    <div
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] ${
                        testRes.ok
                          ? 'bg-teal-50 text-teal-800 border border-teal-700/20'
                          : 'bg-rose-500/10 text-rose-700 border border-rose-500/25'
                      }`}
                    >
                      {testRes.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">{testRes.message}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
