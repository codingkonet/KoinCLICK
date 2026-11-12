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
