import React, { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, ADMIN_EMAIL } from '../context/AuthContext'
import { ensureStarterData } from '../lib/seedUserData'
import {
  Coins,
  Zap,
  Globe,
  Sparkles,
  Mail,
  Lock,
  User as UserIcon,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  BarChart3,
} from 'lucide-react'

export function AuthPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)
    setSubmitting(true)

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const isAdminEmail = normalizedEmail === ADMIN_EMAIL

      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim() || (isAdminEmail ? 'KoinCLICK Admin' : 'Koin Master'),
            },
          },
        })
        if (error) throw error

        if (data.user && data.session) {
          await ensureStarterData(
            data.user.id,
            fullName.trim() || (isAdminEmail ? 'KoinCLICK Admin' : 'Koin Master')
          )
          navigate('/dashboard')
        } else {
          setSuccessMsg('Account created! Please sign in below.')
          setMode('login')
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })
        if (error) throw error

        if (data.user) {
          await ensureStarterData(
            data.user.id,
            data.user.user_metadata?.full_name || data.user.email?.split('@')[0]
          )
          navigate('/dashboard')
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sign in failed. Please check your email and password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      {/* Left Brand Showcase */}
      <div className="lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950/40 p-5 sm:p-8 lg:p-16 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800/80">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-2.5 sm:gap-3">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25 shrink-0">
            <Coins className="w-5 h-5 sm:w-6 sm:h-6 text-slate-950" />
          </div>
          <div>
            <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
              Koin<span className="text-emerald-400">CLICK</span>
            </span>
          </div>
        </div>

        <div className="relative z-10 my-6 sm:my-10 lg:my-0 max-w-xl">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1 sm:py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] sm:text-xs font-medium mb-4 sm:mb-6">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            Simple Multi-Currency Budget Manager
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
            Your money, mastered in a{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-amber-300">
              single click.
            </span>
          </h1>
          <p className="mt-3 sm:mt-4 text-slate-400 text-sm sm:text-base lg:text-lg leading-relaxed">
            Fast, clean personal finance without clutter. Log daily expenses with 1-Click buttons,
            track your income and bills, and see your real-time Safe-to-Spend number across 10
            global currencies.
          </p>

          <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
            <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/70 border border-slate-800/90 flex sm:block items-start gap-3">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 sm:mb-2 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <div className="font-bold text-xs sm:text-sm text-white">1-Click Quick-Log</div>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">
                  Tap once to log coffee, transit, or lunch in milliseconds.
                </p>
              </div>
            </div>
            <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/70 border border-slate-800/90 flex sm:block items-start gap-3">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 sm:mb-2 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <div className="font-bold text-xs sm:text-sm text-white">Clear Cashflow</div>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">
                  Instant income, expense, and daily safe-to-spend tracking.
                </p>
              </div>
            </div>
            <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/70 border border-slate-800/90 flex sm:block items-start gap-3">
              <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 sm:mb-2 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <div className="font-bold text-xs sm:text-sm text-white">Multi-Currency</div>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">
                  Switch currencies anytime with automatic conversion.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs text-slate-500">
          <span>© {new Date().getFullYear()} KoinCLICK. All rights reserved.</span>
          <span>Simple Personal Finance Suite</span>
        </div>
      </div>

      {/* Right Auth Card */}
      <div className="lg:w-1/2 flex flex-col items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-2xl">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-2xl border border-slate-800 mb-8">
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setErrorMsg(null)
                setSuccessMsg(null)
              }}
              className={`py-2.5 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup')
                setErrorMsg(null)
                setSuccessMsg(null)
              }}
              className={`py-2.5 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">
              {mode === 'login' ? 'Welcome back to KoinCLICK' : 'Create your KoinCLICK account'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {mode === 'login'
                ? 'Sign in to access your budget dashboard.'
                : 'Start fresh from zero and track your income and expenses effortlessly.'}
            </p>
          </div>

          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Display Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Alex Rivera"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 py-3.5 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer transition-all"
            >
              {submitting ? (
                'Signing in...'
              ) : mode === 'login' ? (
                <>
                  Log In to KoinCLICK <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Create Account & Launch <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-xs text-slate-500 text-center">
          © {new Date().getFullYear()} KoinCLICK. All rights reserved.
        </p>
      </div>
    </div>
  )
}
