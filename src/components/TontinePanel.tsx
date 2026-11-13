import React, { useMemo, useState } from 'react'
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Circle,
  Coins,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { convertCurrency } from '../lib/currencies'
import { supabase, type KoinTontine, type TontineMember } from '../lib/supabase'

interface TontinePanelProps {
  userId: string
  tontines: KoinTontine[]
  setTontines: React.Dispatch<React.SetStateAction<KoinTontine[]>>
  activeCurrency: string
  fmt: (usdAmount: number, decimals?: number) => string
  toDisplay: (usdAmount: number) => number
  onLogTontineTx: (params: {
    title: string
    emoji: string
    amountUsd: number
    txType: 'expense' | 'income'
    notes: string
  }) => Promise<void>
  showToast: (msg: string) => void
}

const TONTINE_EMOJIS = ['🤝', '🪙', '💎', '🏠', '🚗', '✈️', '👨‍👩‍👧‍👦', '💼']

function addFrequencyToDate(dateStr: string, freq: 'weekly' | 'biweekly' | 'monthly'): string {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10)
  if (freq === 'weekly') d.setDate(d.getDate() + 7)
  else if (freq === 'biweekly') d.setDate(d.getDate() + 14)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export const TontinePanel: React.FC<TontinePanelProps> = ({
  userId,
  tontines,
  setTontines,
  activeCurrency,
  fmt,
  toDisplay,
  onLogTontineTx,
  showToast,
}) => {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<KoinTontine | null>(null)

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🤝')
  const [contributionInput, setContributionInput] = useState('100')
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly')
  const [totalMembers, setTotalMembers] = useState('6')
  const [myTurnRound, setMyTurnRound] = useState('1')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [memberNamesText, setMemberNamesText] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const activeTontines = useMemo(
    () => tontines.filter((t) => t.status === 'active'),
    [tontines]
  )

  const totalCycleCommitmentUsd = useMemo(
    () => activeTontines.reduce((s, t) => s + Number(t.contribution_amount || 0), 0),
    [activeTontines]
  )

  const totalExpectedPotsUsd = useMemo(
    () =>
      activeTontines.reduce(
        (s, t) => s + Number(t.contribution_amount || 0) * Number(t.total_members || 1),
        0
      ),
    [activeTontines]
  )

  const openCreateModal = () => {
    setEditing(null)
    setName('')
    setEmoji('🤝')
    setContributionInput('100')
    setFrequency('monthly')
    setTotalMembers('6')
    setMyTurnRound('2')
    setStartDate(new Date().toISOString().slice(0, 10))
    setMemberNamesText('')
    setNotes('')
    setShowModal(true)
  }

  const openEditModal = (t: KoinTontine) => {
    setEditing(t)
    setName(t.name)
    setEmoji(t.emoji || '🤝')
    setContributionInput(String(Number(toDisplay(t.contribution_amount).toFixed(2))))
    setFrequency(t.frequency)
    setTotalMembers(String(t.total_members))
    setMyTurnRound(String(t.my_turn_round))
    setStartDate(String(t.start_date).slice(0, 10))
    setMemberNamesText((t.members || []).map((m) => m.name).join(', '))
    setNotes(t.notes || '')
    setShowModal(true)
  }

  const buildMembersArray = (
    count: number,
    turn: number,
    rawNames: string,
    existing?: TontineMember[]
  ): TontineMember[] => {
    const parsedNames = rawNames
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const list: TontineMember[] = []
    for (let i = 1; i <= count; i++) {
      const existingMatch = existing?.find((m) => m.round === i)
      const defaultName = i === turn ? 'You' : `Member ${i}`
      list.push({
        name: parsedNames[i - 1] || existingMatch?.name || defaultName,
        round: i,
        paidCurrentRound: existingMatch?.paidCurrentRound ?? false,
        receivedPot: existingMatch?.receivedPot ?? false,
      })
    }
    return list
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const count = Math.max(2, Math.min(30, Math.round(Number(totalMembers) || 6)))
    const turn = Math.max(1, Math.min(count, Math.round(Number(myTurnRound) || 1)))
    const displayAmt = Math.max(1, Number(contributionInput) || 100)
    const usdAmt = convertCurrency(displayAmt, activeCurrency, 'USD')

    if (!name.trim()) return
    setSaving(true)

    const members = buildMembersArray(count, turn, memberNamesText, editing?.members)

    if (editing) {
      const { data, error } = await supabase
        .from('koinclick_tontines')
        .update({
          name: name.trim(),
          emoji,
          contribution_amount: usdAmt,
          frequency,
          total_members: count,
          my_turn_round: turn,
          start_date: startDate,
          members,
          notes: notes.trim() || null,
        })
        .eq('id', editing.id)
        .select('*')
        .single()

      if (!error && data) {
        setTontines((prev) => prev.map((x) => (x.id === data.id ? data : x)))
        showToast('🤝 Tontine updated!')
      }
    } else {
      const { data, error } = await supabase
        .from('koinclick_tontines')
        .insert({
          user_id: userId,
          name: name.trim(),
          emoji,
          contribution_amount: usdAmt,
          frequency,
          total_members: count,
          current_round: 1,
          my_turn_round: turn,
          start_date: startDate,
          next_due_date: startDate,
          members,
          status: 'active',
          notes: notes.trim() || null,
        })
        .select('*')
        .single()

      if (!error && data) {
        setTontines((prev) => [data, ...prev])
        showToast('🤝 New Tontine / Daret created!')
      }
    }

    setSaving(false)
    setShowModal(false)
  }

  const handleDelete = async (id: number) => {
    const { error } = await supabase.from('koinclick_tontines').delete().eq('id', id)
    if (!error) {
      setTontines((prev) => prev.filter((x) => x.id !== id))
      showToast('🗑️ Tontine removed')
    }
  }

  const handleToggleMemberPaid = async (t: KoinTontine, roundNum: number) => {
    const nextMembers = (t.members || []).map((m) =>
      m.round === roundNum ? { ...m, paidCurrentRound: !m.paidCurrentRound } : m
    )
    const { data, error } = await supabase
      .from('koinclick_tontines')
      .update({ members: nextMembers })
      .eq('id', t.id)
      .select('*')
      .single()
    if (!error && data) {
      setTontines((prev) => prev.map((x) => (x.id === data.id ? data : x)))
    }
  }

  const handlePayMyShare = async (t: KoinTontine) => {
    await onLogTontineTx({
      title: `${t.name} (Round ${t.current_round}/${t.total_members})`,
      emoji: t.emoji || '🤝',
      amountUsd: Number(t.contribution_amount),
      txType: 'expense',
      notes: `Tontine contribution — Round ${t.current_round}`,
    })

    const nextMembers = (t.members || []).map((m) =>
      m.round === t.my_turn_round ? { ...m, paidCurrentRound: true } : m
    )
    const { data } = await supabase
      .from('koinclick_tontines')
      .update({ members: nextMembers })
      .eq('id', t.id)
      .select('*')
      .single()
    if (data) {
      setTontines((prev) => prev.map((x) => (x.id === data.id ? data : x)))
    }
  }

  const handleCollectPot = async (t: KoinTontine) => {
    const potUsd = Number(t.contribution_amount) * Number(t.total_members)
    await onLogTontineTx({
      title: `${t.name} Pot Payout`,
      emoji: '🎉',
      amountUsd: potUsd,
      txType: 'income',
      notes: `Collected Tontine pot on Round ${t.current_round}/${t.total_members}`,
    })

    const nextMembers = (t.members || []).map((m) =>
      m.round === t.my_turn_round ? { ...m, receivedPot: true } : m
    )
    const { data } = await supabase
      .from('koinclick_tontines')
      .update({ members: nextMembers })
      .eq('id', t.id)
      .select('*')
      .single()
    if (data) {
      setTontines((prev) => prev.map((x) => (x.id === data.id ? data : x)))
    }
  }

  const handleAdvanceRound = async (t: KoinTontine) => {
    const isFinal = t.current_round >= t.total_members
    const nextRound = isFinal ? t.total_members : t.current_round + 1
    const nextStatus = isFinal ? 'completed' : 'active'
    const nextMembers = (t.members || []).map((m) => ({
      ...m,
      receivedPot: m.round === t.current_round ? true : m.receivedPot,
      paidCurrentRound: isFinal ? m.paidCurrentRound : false,
    }))
    const nextDue = isFinal ? t.next_due_date : addFrequencyToDate(t.next_due_date, t.frequency)

    const { data, error } = await supabase
      .from('koinclick_tontines')
      .update({
        current_round: nextRound,
        status: nextStatus,
        next_due_date: nextDue,
        members: nextMembers,
      })
      .eq('id', t.id)
      .select('*')
      .single()

    if (!error && data) {
      setTontines((prev) => prev.map((x) => (x.id === data.id ? data : x)))
      showToast(
        isFinal
          ? `🏁 ${t.name} completed all ${t.total_members} rounds!`
          : `➡️ Advanced ${t.name} to Round ${nextRound}/${t.total_members}`
      )
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-700/10 border border-teal-700/25 px-2.5 py-0.5 text-xs font-semibold text-teal-800 mb-1.5">
            <Users className="w-3.5 h-3.5 text-teal-700" />
            Tontine / Daret Circles
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900">
            Rotating Savings & Payout Tracker
          </h2>
          <p className="text-xs text-stone-500">
            Track member contributions, payout turns, and log your Tontine share or pot in 1 click.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-bold cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          New Tontine
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white border border-stone-200 p-4">
          <div className="text-xs text-stone-500">Active Tontines</div>
          <div className="text-2xl font-black text-stone-900 mt-1">{activeTontines.length}</div>
        </div>
        <div className="rounded-2xl bg-white border border-stone-200 p-4">
          <div className="text-xs text-stone-500">Your Cycle Contribution</div>
          <div className="text-2xl font-black text-teal-700 mt-1">
            {fmt(totalCycleCommitmentUsd)}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-stone-200 p-4">
          <div className="text-xs text-stone-500">Combined Pot Value</div>
          <div className="text-2xl font-black text-teal-700 mt-1">
            {fmt(totalExpectedPotsUsd)}
          </div>
        </div>
      </div>

      {/* Tontine Cards */}
      {tontines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center space-y-2.5">
          <Users className="w-8 h-8 text-teal-700 mx-auto" />
          <p className="text-base font-bold text-stone-800">No Tontines Created Yet</p>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            Create a Tontine / Daret circle with friends, family, or coworkers to track rounds,
            who has paid, and when you collect the pot.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Your First Tontine
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {tontines.map((t) => {
            const potUsd = Number(t.contribution_amount) * Number(t.total_members)
            const paidCount = (t.members || []).filter((m) => m.paidCurrentRound).length
            const isMyTurn = t.status === 'active' && t.current_round === t.my_turn_round
            const myMember = (t.members || []).find((m) => m.round === t.my_turn_round)
            const pct = Math.min(100, Math.round((t.current_round / Math.max(1, t.total_members)) * 100))

            return (
              <div
                key={t.id}
                className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
                  isMyTurn
                    ? 'border-teal-700/35 bg-white shadow-sm'
                    : 'border-stone-200 bg-white'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-teal-700/10 border border-teal-700/25 flex items-center justify-center text-xl">
                      {t.emoji || '🤝'}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-stone-900">{t.name}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            t.status === 'completed'
                              ? 'bg-emerald-500/15 text-emerald-700'
                              : isMyTurn
                                ? 'bg-teal-700/10 text-teal-800 border border-teal-700/25'
                                : 'bg-teal-700/10 text-teal-800'
                          }`}
                        >
                          {t.status === 'completed'
                            ? 'Completed'
                            : isMyTurn
                              ? '🎉 Your Turn!'
                              : `Turn #${t.my_turn_round}`}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500">
                        {fmt(t.contribution_amount)} / {t.frequency} · {t.total_members} members ·
                        Pot: <span className="text-teal-700 font-semibold">{fmt(potUsd)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(t)}
                      className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="p-1.5 rounded-lg text-stone-500 hover:text-rose-600 hover:bg-stone-100 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Round Progress */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-700 font-semibold">
                      Round {t.current_round} of {t.total_members}
                    </span>
                    <span className="text-stone-500 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-teal-700" />
                      Due: {String(t.next_due_date).slice(0, 10)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-700 to-teal-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Members Payment Checklist */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-stone-500">
                    <span>
                      Round {t.current_round} Payments ({paidCount}/{t.total_members} paid)
                    </span>
                    <span>Click member to toggle paid</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {(t.members || []).map((m) => {
                      const isTurnHolder = m.round === t.current_round
                      return (
                        <button
                          key={m.round}
                          type="button"
                          onClick={() => handleToggleMemberPaid(t, m.round)}
                          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs border transition cursor-pointer ${
                            m.paidCurrentRound
                              ? 'bg-teal-700/10 border-teal-700/25 text-teal-900'
                              : 'bg-stone-50 border-stone-200 text-stone-500 hover:text-stone-800'
                          }`}
                        >
                          {m.paidCurrentRound ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          )}
                          <span className="truncate font-medium">
                            #{m.round} {m.name}
                          </span>
                          {isTurnHolder && (
                            <Sparkles className="w-3 h-3 text-amber-600 shrink-0 ml-auto" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Action Buttons */}
                {t.status === 'active' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handlePayMyShare(t)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-300 text-xs font-bold text-stone-900 cursor-pointer"
                    >
                      <Coins className="w-3.5 h-3.5 text-teal-700" />
                      {myMember?.paidCurrentRound ? 'Log Share Again' : 'Pay My Share'}
                    </button>

                    {isMyTurn && !myMember?.receivedPot && (
                      <button
                        type="button"
                        onClick={() => handleCollectPot(t)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-extrabold cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Collect Pot ({fmt(potUsd)})
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleAdvanceRound(t)}
                      className="ml-auto inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
                    >
                      {t.current_round >= t.total_members ? 'Finish Tontine' : 'Next Round'}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit Tontine Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-2xl bg-white border border-stone-200 p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-stone-900">
                {editing ? 'Edit Tontine / Daret' : 'Create Tontine / Daret'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl bg-stone-100 text-stone-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {TONTINE_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border cursor-pointer ${
                    emoji === em
                      ? 'bg-teal-700/15 border-teal-700'
                      : 'bg-[#F6F4EF] border-stone-200'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-stone-500 mb-1">Tontine Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Daret Famille, Office Tontine"
                  className="w-full rounded-xl bg-[#F6F4EF] border border-stone-200 px-3 py-2.5 text-sm text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs text-stone-500 mb-1">
                  Contribution ({activeCurrency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={contributionInput}
                  onChange={(e) => setContributionInput(e.target.value)}
                  className="w-full rounded-xl bg-[#F6F4EF] border border-stone-200 px-3 py-2.5 text-sm text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs text-stone-500 mb-1">Frequency</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as 'weekly' | 'biweekly' | 'monthly')}
                  className="w-full rounded-xl bg-[#F6F4EF] border border-stone-200 px-3 py-2.5 text-sm text-stone-900"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-stone-500 mb-1">Total Members</label>
                <input
                  type="number"
                  min={2}
                  max={30}
                  required
                  value={totalMembers}
                  onChange={(e) => setTotalMembers(e.target.value)}
                  className="w-full rounded-xl bg-[#F6F4EF] border border-stone-200 px-3 py-2.5 text-sm text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs text-stone-500 mb-1">Your Payout Turn (#)</label>
                <input
                  type="number"
                  min={1}
                  max={Number(totalMembers) || 30}
                  required
                  value={myTurnRound}
                  onChange={(e) => setMyTurnRound(e.target.value)}
                  className="w-full rounded-xl bg-[#F6F4EF] border border-stone-200 px-3 py-2.5 text-sm text-stone-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs text-stone-500 mb-1">Start / First Due Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl bg-[#F6F4EF] border border-stone-200 px-3 py-2.5 text-sm text-stone-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs text-stone-500 mb-1">
                  Member Names (comma-separated, optional)
                </label>
                <input
                  type="text"
                  value={memberNamesText}
                  onChange={(e) => setMemberNamesText(e.target.value)}
                  placeholder="Sara, You, Karim, Nadia, Omar, Lina"
                  className="w-full rounded-xl bg-[#F6F4EF] border border-stone-200 px-3 py-2.5 text-sm text-stone-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl bg-stone-100 text-xs font-semibold text-stone-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-xs font-bold text-white cursor-pointer"
              >
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Tontine'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
