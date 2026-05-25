'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Exercise, SetData } from '@/types';
import { formatDate, formatDateInput } from '@/lib/utils';
import { Toast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { activeSession } from '@/hooks/useActiveSession';

interface EntryWithSession {
  id: string;
  exerciseId: string;
  sets: number;
  reps: number;
  weight: number;
  rpe?: number | null;
  comment?: string | null;
  setsData?: SetData[];
  exercise: Exercise;
  session: {
    id: string;
    date: string;
    user: { id: string; name: string };
    notes?: string | null;
  };
}

function calcEntryMax(entry: EntryWithSession): number {
  if (entry.setsData && entry.setsData.length > 0) return Math.max(...entry.setsData.map(s => s.weight));
  return entry.weight;
}

function calcVolume(entry: EntryWithSession): number {
  if (entry.setsData && entry.setsData.length > 0) return entry.setsData.reduce((sum, s) => sum + s.reps * s.weight, 0);
  return entry.sets * entry.reps * entry.weight;
}

function calc1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export default function CwiczeniePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [entries, setEntries] = useState<EntryWithSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [prBanner, setPrBanner] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [calcWeight, setCalcWeight] = useState(100);
  const [calcReps, setCalcReps] = useState(5);
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState(formatDateInput(new Date()));
  const [formCustomSets, setFormCustomSets] = useState(false);
  const [formSets, setFormSets] = useState(3);
  const [formReps, setFormReps] = useState(10);
  const [formWeight, setFormWeight] = useState(0);
  const [formRpe, setFormRpe] = useState('');
  const [formComment, setFormComment] = useState('');
  const [formSetsData, setFormSetsData] = useState<SetData[]>([]);
  const [saving, setSaving] = useState(false);
  const [chartType, setChartType] = useState<'weight' | 'volume'>('weight');
  const { isLoggedIn, userId: authUserId } = useAuth();

  const loadData = async () => {
    const [exRes, entriesRes] = await Promise.all([
      fetch('/api/exercises').then(r => r.json()),
      fetch(`/api/entries?exerciseId=${id}`).then(r => r.json()),
    ]);
    const ex = (Array.isArray(exRes) ? exRes : []).find((e: Exercise) => e.id === id);
    setExercise(ex || null);
    setEntries(Array.isArray(entriesRes) ? entriesRes : []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [id]);

  const bestWeight = entries.length ? Math.max(...entries.map(calcEntryMax)) : 0;
  const lastEntry = entries[0];

  const chartData = [...entries].reverse().map(e => ({
    date: formatDate(e.session.date),
    Ciezar: calcEntryMax(e),
    Wolumen: Math.round(calcVolume(e)),
  }));

  const initCustomSets = () => {
    setFormSetsData(Array.from({ length: formSets }, () => ({ reps: formReps, weight: formWeight })));
    setFormCustomSets(true);
  };
  const addSet = () => {
    const last = formSetsData.length > 0 ? formSetsData[formSetsData.length - 1] : { reps: formReps, weight: formWeight };
    setFormSetsData(prev => [...prev, { ...last }]);
  };
  const removeSet = (i: number) => setFormSetsData(prev => prev.filter((_, idx) => idx !== i));
  const updateSet = (i: number, field: 'reps' | 'weight', val: number) =>
    setFormSetsData(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  const buildEntry = () => {
    const sd = formCustomSets ? formSetsData : [];
    return {
      exerciseId: id,
      sets: formCustomSets ? sd.length : formSets,
      reps: formCustomSets ? Math.max(...sd.map(s => s.reps), 1) : formReps,
      weight: formCustomSets ? Math.max(...sd.map(s => s.weight), 0) : formWeight,
      rpe: formRpe ? Number(formRpe) : undefined,
      comment: formComment || undefined,
      setsData: sd,
    };
  };

  const checkPR = (newMax: number): boolean => {
    return newMax > bestWeight && bestWeight > 0;
  };

  const resetForm = () => {
    setShowForm(false); setFormComment(''); setFormRpe('');
    setFormSetsData([]); setFormCustomSets(false);
  };

  const handleAddToDraft = async () => {
    if (formCustomSets && formSetsData.length === 0) { setToast({ message: 'Dodaj serie', type: 'error' }); return; }
    if (!formCustomSets && !formWeight) { setToast({ message: 'Podaj ciezar', type: 'error' }); return; }
    setSaving(true);
    try {
      const entry = buildEntry();
      const newMax = formCustomSets ? Math.max(...formSetsData.map(s => s.weight)) : formWeight;
      const isPR = checkPR(newMax);
      const existingId = activeSession.getId();

      if (existingId) {
        const res = await fetch(`/api/sessions/${existingId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry }),
        });
        if (!res.ok) {
          activeSession.clear();
          const newRes = await fetch('/api/sessions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: formDate, entries: [entry] }),
          });
          if (newRes.ok) {
            const newSession = await newRes.json();
            activeSession.setId(newSession.id);
          }
        }
      } else {
        const res = await fetch('/api/sessions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: formDate, entries: [entry] }),
        });
        if (res.ok) {
          const session = await res.json();
          activeSession.setId(session.id);
        }
      }

      if (isPR) {
        setPrBanner(true);
        setTimeout(() => setPrBanner(false), 4000);
      }
      setToast({ message: isPR ? 'Dodano do treningu - Nowe PR!' : 'Dodano do treningu!', type: 'success' });
      resetForm();
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAlone = async () => {
    if (formCustomSets && formSetsData.length === 0) { setToast({ message: 'Dodaj serie', type: 'error' }); return; }
    if (!formCustomSets && !formWeight) { setToast({ message: 'Podaj ciezar', type: 'error' }); return; }
    setSaving(true);
    try {
      const entry = buildEntry();
      const newMax = formCustomSets ? Math.max(...formSetsData.map(s => s.weight)) : formWeight;
      const isPR = checkPR(newMax);
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: formDate, entries: [entry] }),
      });
      if (res.ok) {
        if (isPR) { setPrBanner(true); setTimeout(() => setPrBanner(false), 4000); }
        setToast({ message: isPR ? 'Zapisano - Nowe PR!' : 'Zapisano!', type: 'success' });
        resetForm(); loadData();
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Ladowanie...</div>;
  if (!exercise) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Nie znaleziono cwiczenia</div>;

  const shortName = exercise.name.includes(' - ') ? exercise.name.split(' - ').slice(1).join(' - ') : exercise.name;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {prBanner && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-yellow-400 text-yellow-900 rounded-2xl p-4 text-center font-bold shadow-lg">
          Nowe PR! Rekord osobisty!
        </div>
      )}

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <Link href="/cwiczenia" className="text-blue-600 text-sm mb-1 block">Cwiczenia</Link>
        <h1 className="text-xl font-bold text-gray-900">{shortName}</h1>
        {exercise.muscleGroup && <p className="text-sm text-gray-500">{exercise.muscleGroup}</p>}
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <div className="text-xl font-bold text-blue-600">{bestWeight > 0 ? `${bestWeight}kg` : '-'}</div>
            <div className="text-xs text-gray-500 mt-0.5">Rekord</div>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <div className="text-xl font-bold text-orange-500">{entries.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Sesji</div>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <div className="text-xl font-bold text-green-600">
              {lastEntry ? `${calcEntryMax(lastEntry)}kg` : '-'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Ostatnio</div>
          </div>
        </div>

        {chartData.length > 1 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex gap-2 mb-3">
              {(['weight', 'volume'] as const).map(t => (
                <button key={t} onClick={() => setChartType(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${chartType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {t === 'weight' ? 'Ciezar' : 'Wolumen'}
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey={chartType === 'weight' ? 'Ciezar' : 'Wolumen'}
                  stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <button onClick={() => setShowCalc(o => !o)}
          className="w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-2xl text-sm font-medium shadow-sm">
          Kalkulator 1RM {showCalc ? '▴' : '▾'}
        </button>
        {showCalc && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ciezar (kg)</label>
                <input type="number" value={calcWeight} onChange={e => setCalcWeight(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Powtorzenia</label>
                <input type="number" min="1" value={calcReps} onChange={e => setCalcReps(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base" />
              </div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <span className="text-sm text-gray-600">Szacowany 1RM: </span>
              <span className="text-2xl font-bold text-blue-600">{calc1RM(calcWeight, calcReps)} kg</span>
            </div>
          </div>
        )}

        {isLoggedIn && !showForm && (
          <button onClick={() => setShowForm(true)}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-sm">
            + Dodaj do treningu
          </button>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Dodaj wynik</h3>
              <button onClick={resetForm} className="text-gray-400 text-sm">Anuluj</button>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-xs text-gray-500">Serie per-set</label>
              <button type="button" onClick={() => formCustomSets ? setFormCustomSets(false) : initCustomSets()}
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${formCustomSets ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${formCustomSets ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
            {!formCustomSets ? (
              <div className="grid grid-cols-3 gap-2">
                {[['Serie', formSets, setFormSets], ['Powt.', formReps, setFormReps]].map(([label, val, setter]) => (
                  <div key={String(label)}>
                    <label className="block text-xs text-gray-500 mb-1">{String(label)}</label>
                    <input type="number" min="1" value={Number(val)}
                      onChange={e => (setter as (v: number) => void)(parseInt(e.target.value) || 1)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Ciezar kg</label>
                  <input type="number" min="0" step="0.5" value={formWeight} onChange={e => setFormWeight(parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base" />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {formSetsData.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                    <input type="number" min="1" value={s.reps} onChange={e => updateSet(i, 'reps', parseInt(e.target.value) || 1)}
                      className="w-16 border border-gray-200 rounded-xl px-2 py-2 text-sm text-center" />
                    <span className="text-xs text-gray-400">x</span>
                    <input type="number" min="0" step="0.5" value={s.weight} onChange={e => updateSet(i, 'weight', parseFloat(e.target.value) || 0)}
                      className="w-20 border border-gray-200 rounded-xl px-2 py-2 text-sm text-center" />
                    <button onClick={() => removeSet(i)} className="text-red-400 text-sm px-1">x</button>
                  </div>
                ))}
                <button onClick={addSet} className="w-full text-sm text-blue-600 border border-dashed border-blue-300 rounded-xl py-2">
                  + Dodaj serie
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">RPE</label>
                <input type="number" min="1" max="10" step="0.5" value={formRpe} onChange={e => setFormRpe(e.target.value)}
                  placeholder="1-10" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Komentarz</label>
                <input type="text" value={formComment} onChange={e => setFormComment(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddToDraft} disabled={saving}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50">
                {saving ? '...' : '+ Dodaj do treningu'}
              </button>
              <button onClick={handleSaveAlone} disabled={saving}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium text-sm disabled:opacity-50">
                Zapisz osobno
              </button>
            </div>
          </div>
        )}

        {entries.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Historia</h2>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {entries.slice(0, 20).map((entry, i) => (
                <div key={entry.id} className={`px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{formatDate(entry.session.date)}</span>
                    <span className="text-sm font-bold text-blue-600">{calcEntryMax(entry)} kg</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {Array.isArray(entry.setsData) && entry.setsData.length > 0
                      ? entry.setsData.map((s, si) => `${s.reps}x${s.weight}kg`).join(' · ')
                      : `${entry.sets}x${entry.reps} @ ${entry.weight}kg`}
                    {entry.rpe && ` RPE ${entry.rpe}`}
                  </div>
                  {entry.comment && <div className="text-xs text-gray-400 italic mt-0.5">{entry.comment}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
