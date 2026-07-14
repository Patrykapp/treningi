'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Exercise } from '@/types';
import { formatDate, formatDateInput } from '@/lib/utils';
import { formatPace, MEASUREMENT_FIELDS } from '@/lib/goals';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { ExercisePicker } from '@/components/ui/ExercisePicker';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import {
  Target, Lock, Trash2, ArrowLeft, Plus, Scale, Ruler, Dumbbell,
  PersonStanding, Zap, PartyPopper,
} from 'lucide-react';

type GoalType = 'WEIGHT' | 'MEASUREMENT' | 'EXERCISE_1RM' | 'RUN_DISTANCE' | 'RUN_PACE';

interface GoalRecord {
  id: string;
  type: GoalType;
  direction: 'increase' | 'decrease';
  label: string;
  startValue: number | null;
  targetValue: number;
  targetDate?: string | null;
  exerciseId?: string | null;
  exerciseName?: string | null;
  measurementKey?: string | null;
  notes?: string | null;
  achievedAt?: string | null;
  createdAt: string;
  currentValue: number | null;
  progressPct: number;
  achieved: boolean;
}

const TYPE_OPTIONS: { type: GoalType; label: string; icon: typeof Scale }[] = [
  { type: 'WEIGHT', label: 'Waga ciała', icon: Scale },
  { type: 'MEASUREMENT', label: 'Obwód ciała', icon: Ruler },
  { type: 'EXERCISE_1RM', label: 'Siła (1RM)', icon: Dumbbell },
  { type: 'RUN_DISTANCE', label: 'Dystans biegu', icon: PersonStanding },
  { type: 'RUN_PACE', label: 'Tempo biegu', icon: Zap },
];

function formatValue(goal: Pick<GoalRecord, 'type'>, v: number | null): string {
  if (v === null) return '—';
  if (goal.type === 'RUN_PACE') return formatPace(v);
  const unit = goal.type === 'RUN_DISTANCE' ? 'km' : goal.type === 'MEASUREMENT' ? 'cm' : 'kg';
  return `${v}${unit}`;
}

export default function CelePage() {
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { isLoggedIn } = useAuth();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [formType, setFormType] = useState<GoalType | null>(null);
  const [formTarget, setFormTarget] = useState('');
  const [formMeasurementKey, setFormMeasurementKey] = useState('');
  const [formExerciseId, setFormExerciseId] = useState('');
  const [formExerciseName, setFormExerciseName] = useState('');
  const [formPaceMin, setFormPaceMin] = useState('');
  const [formPaceSec, setFormPaceSec] = useState('');
  const [formTargetDate, setFormTargetDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    const data = await fetch('/api/goals').then(r => r.json());
    setGoals(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadGoals(); }, [loadGoals]);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetch('/api/exercises').then(r => r.json()).then(data => { if (Array.isArray(data)) setExercises(data); });
    fetch('/api/favorites').then(r => r.json()).then(data => { if (Array.isArray(data)) setFavorites(data); }).catch(() => {});
  }, [isLoggedIn]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

  const resetForm = () => {
    setFormType(null);
    setFormTarget('');
    setFormMeasurementKey('');
    setFormExerciseId('');
    setFormExerciseName('');
    setFormPaceMin('');
    setFormPaceSec('');
    setFormTargetDate('');
    setFormNotes('');
  };

  const closeModal = () => { setShowModal(false); resetForm(); };

  const handleCreate = async () => {
    if (!formType) return;
    let targetValue: number;
    if (formType === 'RUN_PACE') {
      const min = parseInt(formPaceMin || '0', 10);
      const sec = parseInt(formPaceSec || '0', 10);
      targetValue = min * 60 + sec;
      if (!(targetValue > 0)) { showToast('Podaj tempo docelowe', 'error'); return; }
    } else {
      targetValue = parseFloat(formTarget);
      if (!Number.isFinite(targetValue) || targetValue <= 0) { showToast('Podaj wartość docelową', 'error'); return; }
    }
    if (formType === 'MEASUREMENT' && !formMeasurementKey) { showToast('Wybierz obwód', 'error'); return; }
    if (formType === 'EXERCISE_1RM' && !formExerciseId) { showToast('Wybierz ćwiczenie', 'error'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          targetValue,
          measurementKey: formType === 'MEASUREMENT' ? formMeasurementKey : undefined,
          exerciseId: formType === 'EXERCISE_1RM' ? formExerciseId : undefined,
          targetDate: formTargetDate || undefined,
          notes: formNotes || undefined,
        }),
      });
      if (res.ok) {
        showToast('Cel dodany!');
        closeModal();
        loadGoals();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Błąd zapisu', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/goals/${id}`, { method: 'DELETE' });
    setGoals(prev => prev.filter(g => g.id !== id));
    setConfirmDeleteId(null);
  };

  const activeGoals = useMemo(() => goals.filter(g => !g.achieved), [goals]);
  const achievedGoals = useMemo(() => goals.filter(g => g.achieved), [goals]);

  const GoalCard = ({ goal }: { goal: GoalRecord }) => {
    const overdue = !goal.achieved && goal.targetDate && new Date(goal.targetDate).getTime() < Date.now();
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{goal.label}</p>
            {goal.notes && <p className="text-xs text-gray-500 mt-0.5">{goal.notes}</p>}
          </div>
          <button
            onClick={() => setConfirmDeleteId(goal.id)}
            className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shrink-0"
            title="Usuń cel"
          >
            <Trash2 className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {goal.achieved ? (
          <div className="flex items-center gap-1.5 text-green-600 text-sm font-semibold">
            <PartyPopper className="w-4 h-4" strokeWidth={2} />
            Osiągnięto{goal.achievedAt ? ` · ${formatDate(goal.achievedAt)}` : ''}
          </div>
        ) : (
          <>
            <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div className="h-2.5 rounded-full bg-blue-500 transition-all" style={{ width: `${Math.max(4, goal.progressPct)}%` }} />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-xs text-gray-600">
              <span>{formatValue(goal, goal.currentValue)} → {formatValue(goal, goal.targetValue)}</span>
              <span className="font-semibold text-blue-600">{goal.progressPct}%</span>
            </div>
            {goal.targetDate && (
              <p className={`text-xs mt-1 ${overdue ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                {overdue ? 'Termin minął' : 'Do'} {formatDate(goal.targetDate)}
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirmDeleteId && (
        <ConfirmDialog
          isOpen={true}
          message="Usunąć ten cel? Nie można cofnąć."
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
          <h1 className="text-xl font-bold text-gray-900">Cele</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto md:max-w-3xl lg:max-w-4xl">
        {isLoggedIn ? (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white text-center py-4 rounded-2xl font-semibold shadow-sm transition-colors hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <Plus className="w-5 h-5" strokeWidth={2} /> Dodaj cel
          </button>
        ) : (
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-700 text-center py-4 rounded-2xl font-medium transition-colors hover:bg-gray-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <Lock className="w-4 h-4" strokeWidth={2} /> Zaloguj się aby ustawiać cele
          </Link>
        )}

        {loading ? (
          <div className="space-y-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : goals.length === 0 ? (
          <div className="text-center py-8 text-gray-600 bg-white rounded-2xl">
            <Target className="w-8 h-8 mx-auto mb-2 text-gray-400" strokeWidth={2} />
            <p>Brak celów. Dodaj pierwszy!</p>
          </div>
        ) : (
          <>
            {activeGoals.length > 0 && (
              <div className="space-y-2">
                {activeGoals.map(g => <GoalCard key={g.id} goal={g} />)}
              </div>
            )}
            {achievedGoals.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2 mt-4">Osiągnięte 🎉</h3>
                <div className="space-y-2">
                  {achievedGoals.map(g => <GoalCard key={g.id} goal={g} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Modal isOpen={showModal} onClose={closeModal} title="Nowy cel">
        {!formType ? (
          <div className="grid grid-cols-2 gap-3">
            {TYPE_OPTIONS.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                onClick={() => setFormType(type)}
                className="flex flex-col items-center gap-2 bg-gray-50 rounded-2xl p-4 text-center transition hover:bg-gray-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <Icon className="w-6 h-6 text-blue-600" strokeWidth={2} />
                <span className="text-sm font-medium text-gray-800">{label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => setFormType(null)}
              className="text-sm text-blue-600 font-medium inline-flex items-center gap-1 rounded-lg transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} /> Zmień typ celu
            </button>

            {formType === 'MEASUREMENT' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Obwód</label>
                <select
                  value={formMeasurementKey}
                  onChange={e => setFormMeasurementKey(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white"
                >
                  <option value="">— wybierz —</option>
                  {MEASUREMENT_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
            )}

            {formType === 'EXERCISE_1RM' && (
              formExerciseId ? (
                <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                  <span className="text-sm font-medium text-gray-900">{formExerciseName}</span>
                  <button
                    onClick={() => { setFormExerciseId(''); setFormExerciseName(''); }}
                    className="text-xs text-blue-600 font-medium rounded-lg px-2 py-1 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    Zmień
                  </button>
                </div>
              ) : (
                <ExercisePicker
                  exercises={exercises}
                  favorites={favorites}
                  onSelect={ex => { setFormExerciseId(ex.id); setFormExerciseName(ex.name); }}
                />
              )
            )}

            {(formType !== 'EXERCISE_1RM' || formExerciseId) && (
              <>
                {formType === 'RUN_PACE' ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Docelowe tempo (min/km)</label>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" max="59" value={formPaceMin} onChange={e => setFormPaceMin(e.target.value)}
                        placeholder="min" className="w-20 border border-gray-200 rounded-xl px-3 py-3 text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      <span className="text-gray-400">:</span>
                      <input type="number" min="0" max="59" value={formPaceSec} onChange={e => setFormPaceSec(e.target.value)}
                        placeholder="sek" className="w-20 border border-gray-200 rounded-xl px-3 py-3 text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      <span className="text-sm text-gray-500">/ km</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Wartość docelowa ({formType === 'RUN_DISTANCE' ? 'km' : formType === 'MEASUREMENT' ? 'cm' : 'kg'})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={formTarget}
                      onChange={e => setFormTarget(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Termin (opcjonalnie)</label>
                  <input
                    type="date"
                    min={formatDateInput(new Date())}
                    value={formTargetDate}
                    onChange={e => setFormTargetDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notatka (opcjonalnie)</label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  {saving ? 'Zapisuję...' : 'Zapisz cel'}
                </button>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
