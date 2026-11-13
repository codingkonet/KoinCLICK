import type {
  AiProvider,
  KoinAiBudget,
  KoinAiModel,
  KoinSettings,
  KoinSubscription,
  KoinTransaction,
} from './supabase'

export interface ProviderPreset {
  provider: AiProvider
  label: string
  defaultModel: string
  defaultBaseUrl: string
  placeholderKey: string
  suggestedModels: string[]
}

export const AI_PROVIDER_PRESETS: Record<AiProvider, ProviderPreset> = {
  gemini: {
    provider: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    placeholderKey: 'AIzaSy...',
    suggestedModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  },
  openai: {
    provider: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    placeholderKey: 'sk-proj-...',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'],
  },
  anthropic: {
    provider: 'anthropic',
    label: 'Anthropic Claude',
    defaultModel: 'claude-3-5-sonnet-latest',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    placeholderKey: 'sk-ant-...',
    suggestedModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
  },
  groq: {
    provider: 'groq',
    label: 'Groq (Fast)',
    defaultModel: 'llama-3.3-70b-versatile',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    placeholderKey: 'gsk_...',
    suggestedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  },
  openrouter: {
    provider: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'openai/gpt-4o-mini',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    placeholderKey: 'sk-or-v1-...',
    suggestedModels: [
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-flash',
    ],
  },
  custom: {
    provider: 'custom',
    label: 'Custom OpenAI-Compatible',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    placeholderKey: 'sk-...',
    suggestedModels: ['gpt-4o-mini', 'llama3.2', 'qwen2.5'],
  },
}

export interface AiBudgetRecommendation {
  category: string
  recommendedLimit: number
  reason: string
}

export interface AiBudgetAnalysis {
  summary: string
  healthScore: number
  safeDailySpend: number
  projectedMonthlySavings: number
  alerts: string[]
  tips: string[]
  recommendations: AiBudgetRecommendation[]
  usedModelLabel: string
  isLiveAi: boolean
}

function buildFinancialSnapshot(params: {
  settings: KoinSettings
  transactions: KoinTransaction[]
  subscriptions: KoinSubscription[]
  existingBudgets: KoinAiBudget[]
}) {
  const { settings, transactions, subscriptions, existingBudgets } = params
  const expenses = transactions.filter((t) => t.tx_type === 'expense')
  const incomes = transactions.filter((t) => t.tx_type === 'income')

  const totalSpent = expenses.reduce((sum, t) => sum + Number(t.amount || 0), 0)
  const totalExtraIncome = incomes.reduce((sum, t) => sum + Number(t.amount || 0), 0)
  const activeSubs = subscriptions.filter((s) => s.status !== 'paused')
  const totalSubs = activeSubs.reduce((sum, s) => sum + Number(s.monthly_cost || 0), 0)
  const cancelAlerts = subscriptions.filter((s) => s.status === 'cancel_alert')

  const categorySpend: Record<string, number> = {}
  for (const tx of expenses) {
    const cat = tx.category || 'Other'
    categorySpend[cat] = (categorySpend[cat] || 0) + Number(tx.amount || 0)
  }

  return {
    currency: settings.currency || 'USD',
    monthlyIncome: Number(settings.monthly_income || 0),
    extraIncome: totalExtraIncome,
    fixedBills: Number(settings.fixed_bills || 0),
    savingsGoal: Number(settings.savings_goal || 0),
    totalExpensesLogged: totalSpent,
    totalSubscriptionsMonthly: totalSubs,
    cancelAlertSubscriptions: cancelAlerts.map((s) => ({
      name: s.name,
      monthlyCost: s.monthly_cost,
    })),
    categorySpend,
    existingBudgets: existingBudgets.map((b) => ({
      category: b.category,
      monthlyLimit: b.monthly_limit,
    })),
    recentTransactions: transactions.slice(0, 15).map((t) => ({
      title: t.title,
      amount: t.amount,
      type: t.tx_type,
      category: t.category,
      date: t.tx_date,
    })),
  }
}

export async function callUserAiModel(
  model: KoinAiModel,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const preset = AI_PROVIDER_PRESETS[model.provider] || AI_PROVIDER_PRESETS.custom
  const baseUrl = (model.base_url || preset.defaultBaseUrl).replace(/\/+$/, '')

  if (model.provider === 'gemini') {
    const url = `${baseUrl}/models/${encodeURIComponent(model.model_id)}:generateContent?key=${encodeURIComponent(model.api_key)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 1200 },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error?.message || `Gemini API error (${res.status})`)
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Empty response from Gemini model')
    return text
  }

  if (model.provider === 'anthropic') {
    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': model.api_key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model.model_id,
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error?.message || `Anthropic API error (${res.status})`)
    }
    const text = data?.content?.[0]?.text
    if (!text) throw new Error('Empty response from Anthropic model')
    return text
  }

  // OpenAI-compatible (openai, groq, openrouter, custom)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${model.api_key}`,
  }
  if (model.provider === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = 'KoinCLICK AI Budget'
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model.model_id,
      temperature: 0.35,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message || `API error (${res.status})`)
  }
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty response from model')
  return text
}

export async function testAiModelConnection(
  model: KoinAiModel
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const start = performance.now()
  try {
    const reply = await callUserAiModel(
      model,
      'You are a connectivity test assistant. Reply briefly.',
      'Reply with "OK" only.'
    )
    const latencyMs = Math.round(performance.now() - start)
    return {
      ok: true,
      latencyMs,
      message: `Connected (${latencyMs}ms): ${reply.slice(0, 60).trim()}`,
    }
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start)
    return {
      ok: false,
      latencyMs,
      message: err instanceof Error ? err.message : 'Connection failed',
    }
  }
}

export function buildLocalSmartAnalysis(params: {
  settings: KoinSettings
  transactions: KoinTransaction[]
  subscriptions: KoinSubscription[]
  existingBudgets: KoinAiBudget[]
}): AiBudgetAnalysis {
  const snap = buildFinancialSnapshot(params)
  const totalIncome = snap.monthlyIncome + snap.extraIncome
  const spendablePool = Math.max(0, totalIncome - snap.fixedBills - snap.savingsGoal - snap.totalSubscriptionsMonthly)
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const remainingDays = Math.max(1, daysInMonth - now.getDate() + 1)
  const remainingPool = Math.max(0, spendablePool - snap.totalExpensesLogged)
  const safeDailySpend = Math.round((remainingPool / remainingDays) * 100) / 100

  const projectedMonthlySavings = Math.round(
    totalIncome - snap.fixedBills - snap.totalSubscriptionsMonthly - snap.totalExpensesLogged
  )

  const defaultCategories = [
    { category: 'Food & Coffee', weight: 0.35 },
    { category: 'Transport', weight: 0.15 },
    { category: 'Shopping', weight: 0.2 },
    { category: 'Entertainment', weight: 0.15 },
    { category: 'Health', weight: 0.1 },
    { category: 'Other', weight: 0.05 },
  ]

  const allCats = new Set([
    ...defaultCategories.map((d) => d.category),
    ...Object.keys(snap.categorySpend),
    ...snap.existingBudgets.map((b) => b.category),
  ])

  const baseBudgetPool = spendablePool > 0 ? spendablePool : Math.max(300, snap.totalExpensesLogged * 1.1)
  const recommendations: AiBudgetRecommendation[] = Array.from(allCats).map((cat) => {
    const presetWeight = defaultCategories.find((d) => d.category === cat)?.weight ?? 0.12
    const currentSpent = snap.categorySpend[cat] || 0
    const suggested = Math.max(25, Math.round((baseBudgetPool * presetWeight) / 5) * 5)
    const reason =
      currentSpent > suggested
        ? `Current spend (${currentSpent.toFixed(0)}) exceeds target; cap at ${suggested} to protect savings.`
        : `Balanced allocation (~${Math.round(presetWeight * 100)}% of discretionary pool).`
    return {
      category: cat,
      recommendedLimit: suggested,
      reason,
    }
  })

  const alerts: string[] = []
  if (totalIncome > 0 && snap.totalExpensesLogged > spendablePool) {
    alerts.push(
      `Discretionary spending (${snap.totalExpensesLogged.toFixed(2)}) has exceeded your post-savings pool (${spendablePool.toFixed(2)}).`
    )
  }
  if (snap.cancelAlertSubscriptions.length > 0) {
    const subTotal = snap.cancelAlertSubscriptions.reduce((s, x) => s + Number(x.monthlyCost), 0)
    alerts.push(
      `${snap.cancelAlertSubscriptions.length} subscription(s) flagged for review could save ${subTotal.toFixed(2)}/mo.`
    )
  }
  for (const b of params.existingBudgets) {
    const spent = snap.categorySpend[b.category] || 0
    if (b.monthly_limit > 0 && spent >= b.monthly_limit * (b.alert_threshold / 100)) {
      const pct = Math.round((spent / b.monthly_limit) * 100)
      alerts.push(`${b.category} is at ${pct}% of its monthly cap (${spent.toFixed(0)}/${b.monthly_limit.toFixed(0)}).`)
    }
  }

  let healthScore = 78
  if (totalIncome <= 0) healthScore = 55
  else {
    const savingsRatio = projectedMonthlySavings / totalIncome
    if (savingsRatio >= 0.25) healthScore = 92
    else if (savingsRatio >= 0.15) healthScore = 82
    else if (savingsRatio >= 0.05) healthScore = 68
    else healthScore = 44
  }
  if (alerts.length > 2) healthScore = Math.max(25, healthScore - 10)

  const tips: string[] = [
    `Keep daily discretionary spending under ${safeDailySpend.toFixed(2)} ${snap.currency} for the remaining ${remainingDays} days of the month.`,
    snap.savingsGoal > 0
      ? `Automate your ${snap.savingsGoal.toFixed(0)} ${snap.currency} savings goal right after payday before variable spending.`
      : 'Set a monthly savings goal in Budget Settings to unlock sharper AI target allocations.',
    snap.totalSubscriptionsMonthly > 0
      ? `Subscriptions currently consume ${snap.totalSubscriptionsMonthly.toFixed(2)} ${snap.currency}/mo — audit unused plans.`
      : 'Track recurring bills in Subscriptions so AI forecasts your true free cashflow.',
  ]

  return {
    summary:
      totalIncome > 0
        ? `Based on ${totalIncome.toFixed(0)} ${snap.currency} income, ${snap.fixedBills.toFixed(0)} fixed bills, and ${snap.totalSubscriptionsMonthly.toFixed(0)} in subscriptions, your safe daily spend is ${safeDailySpend.toFixed(2)} ${snap.currency}.`
        : 'Add your monthly income in Budget Settings or log transactions for personalized cashflow forecasting.',
    healthScore,
    safeDailySpend,
    projectedMonthlySavings,
    alerts,
    tips,
    recommendations,
    usedModelLabel: 'KoinCLICK Smart Engine (Local)',
    isLiveAi: false,
  }
}

export async function generateAiBudgetPlan(params: {
  model: KoinAiModel | null
  settings: KoinSettings
  transactions: KoinTransaction[]
  subscriptions: KoinSubscription[]
  existingBudgets: KoinAiBudget[]
}): Promise<AiBudgetAnalysis> {
  if (!params.model) {
    return buildLocalSmartAnalysis(params)
  }

  const snap = buildFinancialSnapshot(params)
  const systemPrompt = `You are KoinCLICK AI Budget Strategist. Analyze the user's JSON financial snapshot and return ONLY valid JSON (no markdown fences) with this exact schema:
{
  "summary": "2-sentence executive summary",
  "healthScore": 0-100 integer,
  "safeDailySpend": number,
  "projectedMonthlySavings": number,
  "alerts": ["short warning strings"],
  "tips": ["3 actionable concise tips"],
  "recommendations": [
    { "category": "Category Name", "recommendedLimit": number, "reason": "short reason" }
  ]
}`

  const userPrompt = `Financial Snapshot (${snap.currency}):\n${JSON.stringify(snap, null, 2)}`

  const raw = await callUserAiModel(params.model, systemPrompt, userPrompt)
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned)

  return {
    summary: String(parsed.summary || 'AI analysis completed.'),
    healthScore: Math.max(0, Math.min(100, Number(parsed.healthScore ?? 75))),
    safeDailySpend: Math.max(0, Number(parsed.safeDailySpend ?? 0)),
    projectedMonthlySavings: Number(parsed.projectedMonthlySavings ?? 0),
    alerts: Array.isArray(parsed.alerts) ? parsed.alerts.map(String) : [],
    tips: Array.isArray(parsed.tips) ? parsed.tips.map(String) : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((r: Record<string, unknown>) => ({
          category: String(r.category || 'Other'),
          recommendedLimit: Math.max(0, Number(r.recommendedLimit ?? 0)),
          reason: String(r.reason || ''),
        }))
      : [],
    usedModelLabel: `${params.model.name} (${params.model.model_id})`,
    isLiveAi: true,
  }
}

export async function askAiBudgetAdvisor(params: {
  model: KoinAiModel | null
  question: string
  settings: KoinSettings
  transactions: KoinTransaction[]
  subscriptions: KoinSubscription[]
  existingBudgets: KoinAiBudget[]
}): Promise<{ answer: string; usedModelLabel: string; isLiveAi: boolean }> {
  const snap = buildFinancialSnapshot(params)
  if (!params.model) {
    const local = buildLocalSmartAnalysis(params)
    return {
      answer: `${local.summary}\n\n• Safe Daily Spend: ${local.safeDailySpend.toFixed(2)} ${snap.currency}\n• Projected Savings: ${local.projectedMonthlySavings.toFixed(2)} ${snap.currency}\n• Tip: ${local.tips[0]}\n\n(Add an AI Model API key in the Model APIs section below for live conversational AI answers!)`,
      usedModelLabel: local.usedModelLabel,
      isLiveAi: false,
    }
  }

  const systemPrompt = `You are KoinCLICK AI Budget Advisor. Answer concisely, practically, and reference the user's actual numbers and currency (${snap.currency}). Keep answers under 140 words.`
  const userPrompt = `User Question: ${params.question}\n\nFinancial Data:\n${JSON.stringify(snap, null, 2)}`

  const answer = await callUserAiModel(params.model, systemPrompt, userPrompt)
  return {
    answer: answer.trim(),
    usedModelLabel: `${params.model.name} (${params.model.model_id})`,
    isLiveAi: true,
  }
}

export interface ScannedReceiptResult {
  title: string
  amount: number
  currency: string
  category: string
  txDate: string
  notes: string
}

export async function scanReceiptWithAi(
  model: KoinAiModel,
  imageDataUrl: string,
  allowedCategories: string[],
  fallbackCurrency: string
): Promise<ScannedReceiptResult> {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid image format. Please upload or capture a JPEG/PNG image.')
  }
  const mimeType = match[1]
  const base64Data = match[2]

  const preset = AI_PROVIDER_PRESETS[model.provider] || AI_PROVIDER_PRESETS.custom
  const baseUrl = (model.base_url || preset.defaultBaseUrl).replace(/\/+$/, '')

  const prompt = `Extract the receipt or product purchase details from this image and return ONLY valid JSON (no markdown fences):
{
  "title": "short merchant or product name",
  "amount": number (positive total paid),
  "currency": "3-letter code like USD, EUR, MAD, GBP (default ${fallbackCurrency})",
  "category": "one of: ${allowedCategories.join(', ')}",
  "txDate": "YYYY-MM-DD (use ${new Date().toISOString().slice(0, 10)} if unclear)",
  "notes": "brief 1-line summary of items"
}`

  let raw = ''

  if (model.provider === 'gemini') {
    const url = `${baseUrl}/models/${encodeURIComponent(model.model_id)}:generateContent?key=${encodeURIComponent(model.api_key)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: base64Data } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error?.message || `Gemini vision error (${res.status})`)
    raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } else if (model.provider === 'anthropic') {
    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': model.api_key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model.model_id,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: base64Data },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error?.message || `Anthropic vision error (${res.status})`)
    raw = data?.content?.[0]?.text || ''
  } else {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${model.api_key}`,
    }
    if (model.provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin
      headers['X-Title'] = 'KoinCLICK Receipt Scanner'
    }
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model.model_id,
        temperature: 0.1,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error?.message || `Vision API error (${res.status})`)
    raw = data?.choices?.[0]?.message?.content || ''
  }

  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned)

  const pickedCat = allowedCategories.includes(String(parsed.category))
    ? String(parsed.category)
    : allowedCategories[0] || 'General'

  return {
    title: String(parsed.title || 'Scanned Receipt').slice(0, 60),
    amount: Math.max(0, Number(parsed.amount || 0)),
    currency: String(parsed.currency || fallbackCurrency).toUpperCase().slice(0, 3),
    category: pickedCat,
    txDate: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.txDate || ''))
      ? String(parsed.txDate)
      : new Date().toISOString().slice(0, 10),
    notes: String(parsed.notes || 'Scanned by AI').slice(0, 120),
  }
}

export function guessCategoryFromTitle(title: string): string {
  const t = title.toLowerCase()
  if (/coffee|starbucks|cafe|espresso|tea/.test(t)) return 'Coffee'
  if (/market|grocery|supermarket|carrefour|marjane|walmart|aldi|lidl/.test(t)) return 'Groceries'
  if (/restaurant|pizza|burger|uber eats|glovo|food|dining/.test(t)) return 'Dining'
  if (/uber|taxi|train|bus|metro|fuel|gas|shell|transit/.test(t)) return 'Transit'
  if (/netflix|spotify|cinema|steam|game|youtube|twitch/.test(t)) return 'Entertainment'
  if (/amazon|zara|store|shop|mall|nike/.test(t)) return 'Shopping'
  if (/electric|water|internet|rent|phone|bill|wifi/.test(t)) return 'Utilities & Bills'
  if (/pharmacy|gym|doctor|health|clinic/.test(t)) return 'Health & Fitness'
  if (/flight|hotel|airbnb|ryanair|travel/.test(t)) return 'Travel'
  if (/salary|payroll|deposit|refund|dividend/.test(t)) return 'Salary / Income'
  return 'General'
}
