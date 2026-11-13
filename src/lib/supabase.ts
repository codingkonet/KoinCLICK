/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://zpoqdjccnvrkfkixboph.supabase.co'
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_3o6nrjHwPcmallYW_Ss9xQ_QBHFGULS'

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export interface KoinSettings {
  user_id: string
  display_name: string
  monthly_income: number
  fixed_bills: number
  savings_goal: number
  currency: string
  streak_days: number
}

export interface KoinJar {
  id: number
  user_id: string
  name: string
  icon: string
  color: string
  allocated: number
  spent: number
}

export interface KoinClickPad {
  id: number
  user_id: string
  jar_id: number | null
  label: string
  emoji: string
  amount: number
  category: string
  clicks_count: number
}

export interface KoinTransaction {
  id: number
  user_id: string
  jar_id: number | null
  title: string
  emoji: string
  amount: number
  tx_type: 'expense' | 'income' | 'transfer'
  category: string
  source: 'clickpad' | 'manual' | 'subscription'
  notes?: string | null
  original_amount?: number | null
  original_currency?: string | null
  receipt_image?: string | null
  receipt_kind?: 'receipt' | 'product' | null
  tx_date: string
}

export interface KoinSubscription {
  id: number
  user_id: string
  name: string
  emoji: string
  monthly_cost: number
  billing_day: number
  status: 'active' | 'cancel_alert' | 'paused'
}

export type AiProvider = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'openrouter' | 'custom'

export interface KoinAiModel {
  id: number
  user_id: string
  name: string
  provider: AiProvider
  model_id: string
  api_key: string
  base_url?: string | null
  is_active: boolean
  is_default: boolean
  monthly_budget: number
  current_spend: number
  created_at?: string
}

export interface KoinAiBudget {
  id: number
  user_id: string
  category: string
  monthly_limit: number
  ai_recommended_limit?: number | null
  alert_threshold: number
  ai_notes?: string | null
  updated_at?: string
}

export interface TontineMember {
  name: string
  round: number
  paidCurrentRound: boolean
  receivedPot: boolean
}

export interface KoinTontine {
  id: number
  user_id: string
  name: string
  emoji: string
  contribution_amount: number
  frequency: 'weekly' | 'biweekly' | 'monthly'
  total_members: number
  current_round: number
  my_turn_round: number
  start_date: string
  next_due_date: string
  members: TontineMember[]
  status: 'active' | 'completed' | 'paused'
  notes?: string | null
  created_at?: string
}
