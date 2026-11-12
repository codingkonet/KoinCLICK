import { supabase } from './supabase'

export async function ensureStarterData(userId: string, displayName?: string) {
  // Check if settings already exist for this user
  const { data: existingSettings } = await supabase
    .from('koinclick_settings')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  // Only create default settings row if this is a brand-new user
  if (!existingSettings) {
    await supabase.from('koinclick_settings').insert({
      user_id: userId,
      display_name: displayName || 'Koin Master',
      monthly_income: 0.0,
      fixed_bills: 0.0,
      savings_goal: 0.0,
      currency: 'USD',
      streak_days: 0,
    })
  }
}
