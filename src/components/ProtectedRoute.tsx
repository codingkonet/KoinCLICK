import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Coins } from 'lucide-react'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-zinc-300">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/40 flex items-center justify-center animate-pulse">
          <Coins className="w-7 h-7 text-indigo-400" />
        </div>
        <p className="text-sm font-medium tracking-wide text-zinc-400">
          Loading KoinCLICK...
        </p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
