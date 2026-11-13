import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Coins } from 'lucide-react'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F4EF] flex flex-col items-center justify-center gap-4 text-stone-700">
        <div className="w-14 h-14 rounded-2xl bg-teal-700/10 border border-teal-700/30 flex items-center justify-center animate-pulse">
          <Coins className="w-7 h-7 text-teal-700" />
        </div>
        <p className="text-sm font-medium tracking-wide text-stone-500">
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
