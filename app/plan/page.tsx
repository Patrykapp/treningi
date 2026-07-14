'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { formatDate, formatDateInput } from '@/lib/utils';
import { DAY_LABELS, getPlanToday } from '@/lib/plans';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import {
  Calendar, Lock, Trash2, ArrowLeft, Play, RotateCcw, Repeat, Sparkles, Target,
} from 'lucide-react';

const SPLIT_HINTS: Record<number, string> = {
  1: 'Full Body',
  2: 'Full Body A/B',
  3: 'Push / Pull / Legs',
  4: 'Upper / Lower',
  5: 'Push/Pull/Legs + Upper/Lower',
  6: 'Push/Pull/Legs x2',
};

interface PlanRecord {
  id: string;
  name: string;
  startDate: string;
  numWeeks: number;
  repeat: boolean;
  active: boolean;
  days: (string | null)[];
  dayTemplateNames: (string | null)[];
  dayTemplateValid: boolean[];
  createdAt: string;
}

interface TemplateOption {
  id: string;
  name: string;
  entries: { exerciseId: string; sets: number; reps: number; weight: number }[];
}
interface ExerciseOption { id: string; name: string; }

export default function PlanPage() {
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { isLoggedIn } = useAuth();

  const [showCreator, setShowCreator] = useState(false);
  const [formName, setFormName] = useState('');
  const [formStartDate, setFormStartDate] = useState(formatDateInput(new Date()));
  const [formNumWeeks, setFormNumWeeks] = useState('4');
  const [formRepeat, setFormRepeat] = useState(true);
  const [formDays, setFormDays] = useState<(string | null)[]>(Array(7).fill(null));
  const [saving, setSaving] = useState(false);
  const [creatorMode, setCreatorMode] = useState<'manual' | 'ai'>('manual');
  const [formDaysPerWeek, setFormDaysPerWeek] = useState('3');
  const [generating, setGenerating] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

  const load = useCallback(async () => {
    setLoading(true);
    const [plansData, tplData, exData] = await Promise.all([
      fetch('/api/plans').then(r => r.json()),
      fetch('/api/templates').then(r => r.json()),
      fetch('/api/exercises').then(r => r.json()).catch(() => []),
    ]);
    setPlans(Array.isArray(plansData) ? plansData : []);
    setTemplates(Array.isArray(tplData) ? tplData.map((t: TemplateOption) => ({ id: t.id, name: t.name, entries: Array.isArray(t.entries) ? t.entries : [] })) : []);
    setExercises(Array.isArray(exData) ? exData.map((e: ExerciseOption) => ({ id: e.id, name: e.name })) : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activePlan = useMemo(() => plans.find(p => p.active) || null, [plans]);
  const archivedPlans = useMemo(() => plans.filter(p => !p.active), [plans]);
  const today = useMemo(() => activePlan ? getPlanToday(activePlan) : null, [activePlan]);

  // Ćwiczenia użyte w szablonach przypisanych do aktywnego planu — punkt wyjścia
  // do szybkiego dodania celu 1RM powiązanego z tym planem.
  const exerciseNameById = useMemo(() => new Map(exercises.map(e => [e.id, e.name])), [exercises]);
  const planExercises = useMemo(() => {
    if (!activePlan) return [];
    const usedTemplateIds = new Set((activePlan.days as (string | null)[]).filter((d): d is string => !!d));
    const ids = new Set<string>();
    for (const tpl of templates) {
      if (!usedTemplateIds.has(tpl.id)) continue;
      for (const e of tpl.entries) ids.add(e.exerciseId);
    }
    return Array.from(ids).map(id => ({ id, name: exerciseNameById.get(id) || '?' }));
  }, [activePlan, templates, exerciseNameById]);

  // Koniec bieżącego bloku planu — sensowny domyślny termin dla celu (nawet jeśli plan się powtarza)
  const planEndDate = useMemo(() => {
    if (!activePlan) return '';
    const d = new Date(activePlan.startDate);
    d.setDate(d.getDate() + activePlan.numWeeks * 7);
    return formatDateInput(d);
  }, [activePlan]);

  useEffect(() => {
    if (!activePlan) setShowCreator(true);
  }, [activePlan]);

  const resetForm = () => {
    setFormName('');
    setFormStartDate(formatDateInput(new Date()));
    setFormNumWeeks('4');
    setFormRepeat(true);
    setFormDays(Array(7).fill(null));
    setFormDaysPerWeek('3');
    setCreatorMode('manual');
  };

  const handleCreate = async () => {
    if (!formName.trim()) { showToast('Podaj nazwę planu', 'error'); return; }
    const weeks = parseInt(formNumWeeks, 10);
    if (!Number.isFinite(weeks) || weeks < 1 || weeks > 52) { showToast('Liczba tygodni: 1-52', 'error'); return; }
    if (formDays.every(d => d === null)) { showToast('Przypisz przynajmniej jeden dzień treningowy', 'error'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          startDate: formStartDate,
          numWeeks: weeks,
          repeat: formRepeat,
          days: formDays,
        }),
      });
      if (res.ok) {
        showToast('Plan utworzony!');
        resetForm();
        setShowCreator(false);
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Błąd zapisu', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAI = async () => {
    const days = parseInt(formDaysPerWeek, 10);
    if (!Number.isFinite(days) || days < 1 || days > 6) { showToast('Liczba dni treningowych: 1-6', 'error'); return; }
    const weeks = parseInt(formNumWeeks, 10);
    if (!Number.isFinite(weeks) || weeks < 1 || weeks > 52) { showToast('Liczba tygodni: 1-52', 'error'); return; }

    setGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim() || undefined,
          startDate: formStartDate,
          numWeeks: weeks,
          repeat: formRepeat,
          daysPerWeek: days,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const skippedMsg = data.skipped?.length ? ` (pominięto: ${data.skipped.join(', ')} — brak ćwiczeń w bazie)` : '';
        showToast(`Plan wygenerowany: ${data.created.join(', ')}${skippedMsg}`);
        resetForm();
        setShowCreator(false);
        load();
      } else {
        showToast(data.error || 'Błąd generowania', 'error');
      }
    } catch {
      showToast('Błąd generowania', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleResume = async (id: string) => {
    const res = await fetch(`/api/plans/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: true }),
    });
    if (res.ok) { showToast('Plan wznowiony'); load(); } else { showToast('Błąd', 'error'); }
  };

  const handleEnd = async (id: string) => {
    const res = await fetch(`/api/plans/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }),
    });
    if (res.ok) { showToast('Plan zakończony'); load(); } else { showToast('Błąd', 'error'); }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/plans/${id}`, { method: 'DELETE' });
    setPlans(prev => prev.filter(p => p.id !== id));
    setConfirmDeleteId(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirmDeleteId && (
        <ConfirmDialog
          isOpen={true}
          message="Usunąć ten plan? Nie można cofnąć."
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-blue-600 font-medium rounded-lg px-1 -mx-1 transition-colors hover:text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2} /> Wróć
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Plan treningowy</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto md:max-w-3xl lg:max-w-4xl">
        {!isLoggedIn && (
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-700 text-center py-4 rounded-2xl font-medium transition-colors hover:bg-gray-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <Lock className="w-4 h-4" strokeWidth={2} /> Zaloguj się aby ustawić plan
          </Link>
        )}

        {loading && (
          <div className="space-y-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!loading && isLoggedIn && activePlan && today && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">{activePlan.name}</h2>
              <button
                onClick={() => setShowCreator(o => !o)}
                className="text-xs text-blue-600 font-medium rounded-lg px-2 py-1 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Nowy plan
              </button>
            </div>

            {today.status === 'not_started' && (
              <p className="text-sm text-gray-500">Plan startuje za {today.startsInDays} {today.startsInDays === 1 ? 'dzień' : 'dni'}</p>
            )}
            {today.status === 'finished' && (
              <p className="text-sm text-gray-500">Plan zakończony — utwórz nowy albo zmień jego długość</p>
            )}
            {today.status === 'active' && (
              <div className="bg-blue-50 rounded-xl px-4 py-3">
                <p className="text-xs font-medium text-blue-500 uppercase tracking-wide">
                  {DAY_LABELS[today.dayOfWeek]}{!activePlan.repeat ? ` · Tydzień ${today.weekNumber} z ${activePlan.numWeeks}` : ''}
                </p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">
                  {today.templateId ? (activePlan.dayTemplateNames[today.dayOfWeek] || '(usunięty szablon)') : 'Dzień wolny 🌴'}
                </p>
                {today.templateId && activePlan.dayTemplateValid[today.dayOfWeek] && (
                  <Link
                    href={`/trening?templateId=${today.templateId}`}
                    className="mt-2 inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <Play className="w-4 h-4" strokeWidth={2} /> Rozpocznij dzisiejszy trening
                  </Link>
                )}
                {today.templateId && !activePlan.dayTemplateValid[today.dayOfWeek] && (
                  <p className="mt-2 text-xs text-orange-500 font-medium">
                    Szablon przypisany do tego dnia został usunięty — zaktualizuj plan
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1">
              {DAY_LABELS.map((label, i) => (
                <div
                  key={label}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                    today.status === 'active' && today.dayOfWeek === i ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-600'
                  }`}
                >
                  <span>{label}</span>
                  <span className="text-right">{activePlan.dayTemplateNames[i] || 'Odpoczynek'}</span>
                </div>
              ))}
            </div>

            {planExercises.length > 0 && (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" strokeWidth={2} /> Cele dla tego planu
                </p>
                <div className="flex flex-wrap gap-2">
                  {planExercises.map(ex => (
                    <Link
                      key={ex.id}
                      href={`/cele?exerciseId=${ex.id}&exerciseName=${encodeURIComponent(ex.name)}&targetDate=${planEndDate}`}
                      className="text-xs bg-blue-50 text-blue-700 rounded-lg px-2.5 py-1.5 font-medium transition-colors hover:bg-blue-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      + {ex.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleEnd(activePlan.id)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Zakończ plan
              </button>
              <button
                onClick={() => setConfirmDeleteId(activePlan.id)}
                className="px-3 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                title="Usuń plan"
              >
                <Trash2 className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        )}

        {!loading && isLoggedIn && !activePlan && plans.length === 0 && (
          <div className="text-center py-6 text-gray-600 bg-white rounded-2xl">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-400" strokeWidth={2} />
            <p>Brak planu. Ustaw pierwszy poniżej!</p>
          </div>
        )}

        {isLoggedIn && showCreator && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Nowy plan</h3>
              <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setCreatorMode('manual')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${creatorMode === 'manual' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                >
                  Ręcznie
                </button>
                <button
                  type="button"
                  onClick={() => setCreatorMode('ai')}
                  className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 ${creatorMode === 'ai' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                >
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={2} /> AI
                </button>
              </div>
            </div>

            {creatorMode === 'ai' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  AI ułoży cały tygodniowy plan (szablony treningowe + rozkład na dni) na podstawie Twojej historii — nie potrzebujesz zapisanych szablonów.
                </p>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nazwa planu (opcjonalnie)</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="np. Plan AI"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Start</label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={e => setFormStartDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Ile tygodni</label>
                    <input
                      type="number"
                      min={1}
                      max={52}
                      value={formNumWeeks}
                      onChange={e => setFormNumWeeks(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Dni treningowe w tygodniu</label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={formDaysPerWeek}
                    onChange={e => setFormDaysPerWeek(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {SPLIT_HINTS[parseInt(formDaysPerWeek, 10)] && (
                    <p className="text-xs text-gray-400 mt-1">Podział: {SPLIT_HINTS[parseInt(formDaysPerWeek, 10)]}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setFormRepeat(r => !r)}
                  className="w-full flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <span className="text-sm text-gray-700 flex items-center gap-2">
                    <Repeat className="w-4 h-4" strokeWidth={2} /> Powtarzaj ten sam tydzień w kółko
                  </span>
                  <span className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors ${formRepeat ? 'bg-blue-600' : 'bg-gray-200'}`}>
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${formRepeat ? 'translate-x-6' : 'translate-x-1'}`} />
                  </span>
                </button>
                <button
                  onClick={handleGenerateAI}
                  disabled={generating}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" strokeWidth={2} />
                  {generating ? 'Generuję plan (kilkanaście sekund)...' : 'Generuj plan z AI'}
                </button>
              </div>
            )}

            {creatorMode === 'manual' && (templates.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nie masz jeszcze żadnych szablonów treningowych — zapisz je na stronie{' '}
                <Link href="/trening" className="text-blue-600 underline">Trening</Link> (przycisk „Szablony" → „Zapisz obecny jako szablon"), a potem wróć tutaj.
              </p>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nazwa planu</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="np. Push/Pull/Legs"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Start</label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={e => setFormStartDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Ile tygodni</label>
                    <input
                      type="number"
                      min={1}
                      max={52}
                      value={formNumWeeks}
                      onChange={e => setFormNumWeeks(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setFormRepeat(r => !r)}
                  className="w-full flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <span className="text-sm text-gray-700 flex items-center gap-2">
                    <Repeat className="w-4 h-4" strokeWidth={2} /> Powtarzaj ten sam tydzień w kółko
                  </span>
                  <span className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors ${formRepeat ? 'bg-blue-600' : 'bg-gray-200'}`}>
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${formRepeat ? 'translate-x-6' : 'translate-x-1'}`} />
                  </span>
                </button>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-700">Dni tygodnia</label>
                  {DAY_LABELS.map((label, i) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-sm text-gray-700">{label}</span>
                      <select
                        value={formDays[i] ?? ''}
                        onChange={e => setFormDays(prev => prev.map((d, idx) => idx === i ? (e.target.value || null) : d))}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                      >
                        <option value="">Odpoczynek</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  {saving ? 'Zapisuję...' : 'Zapisz plan'}
                </button>
              </>
            ))}
            {activePlan && (
              <button
                onClick={() => setShowCreator(false)}
                className="w-full text-sm text-gray-500 py-1 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
              >
                Anuluj
              </button>
            )}
          </div>
        )}

        {archivedPlans.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2 mt-4">Poprzednie plany</h3>
            <div className="space-y-2">
              {archivedPlans.map(p => (
                <div key={p.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                    <p className="text-xs text-gray-500">od {formatDate(p.startDate)} · {p.numWeeks} {p.numWeeks === 1 ? 'tydzień' : 'tyg.'}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleResume(p.id)}
                      className="p-2 rounded-xl text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      title="Wznów jako aktywny"
                    >
                      <RotateCcw className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(p.id)}
                      className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      title="Usuń plan"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
