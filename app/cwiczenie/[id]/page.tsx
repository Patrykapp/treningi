'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
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
  session: { id: string; date: string; user: { id: string; name: string }; notes?: string | null };
}

interface DbExercise {
  id: string;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  instructions: string[];
  gifUrl: string;
}

interface AppUser { id: string; name: string; }

function calcMax(e: EntryWithSession) {
  if (e.setsData && e.setsData.length > 0) return Math.max(...e.setsData.map(s => s.weight));
  return e.weight;
}
function calcVol(e: EntryWithSession) {
  if (e.setsData && e.setsData.length > 0) return e.setsData.reduce((s, x) => s + x.reps * x.weight, 0);
  return e.sets * e.reps * e.weight;
}
function calc1RM(w: number, r: number) { return r === 1 ? w : Math.round(w * (1 + r / 30)); }

function buildChart(
  mine: EntryWithSession[],
  theirs: EntryWithSession[],
  type: 'weight' | 'volume'
): { date: string; Ty?: number; Porownanie?: number }[] {
  const map: Record<string, { date: string; Ty?: number; Porownanie?: number }> = {};
  const val = (e: EntryWithSession) => type === 'weight' ? calcMax(e) : Math.round(calcVol(e));
  [...mine].reverse().forEach(e => {
    const d = formatDate(e.session.date);
    if (!map[d]) map[d] = { date: d };
    map[d].Ty = val(e);
  });
  [...theirs].reverse().forEach(e => {
    const d = formatDate(e.session.date);
    if (!map[d]) map[d] = { date: d };
    map[d].Porownanie = val(e);
  });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export default function CwiczeniePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isLoggedIn, userId: authUserId, name: authName, loading: authLoading } = useAuth();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [entries, setEntries] = useState<EntryWithSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [chartType, setChartType] = useState<'weight' | 'volume'>('weight');

  const [users, setUsers] = useState<AppUser[]>([]);
  const [compareUserId, setCompareUserId] = useState('');
  const [compareEntries, setCompareEntries] = useState<EntryWithSession[]>([]);

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

  const [showTechnika, setShowTechnika] = useState(false);
  const [dbQuery, setDbQuery] = useState('');
  const [dbResults, setDbResults] = useState<DbExercise[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [selectedDb, setSelectedDb] = useState<DbExercise | null>(null);

  const loadData = async () => {
    const uq = authUserId ? `&userId=${authUserId}` : '';
    const [exRes, entRes, usersRes] = await Promise.all([
      fetch('/api/exercises').then(r => r.json()),
      fetch(`/api/entries?exerciseId=${id}${uq}`).then(r => r.json()),
      fetch('/api/users').then(r => r.json()),
    ]);
    const ex = (Array.isArray(exRes) ? exRes : []).find((e: Exercise) => e.id === id);
    setExercise(ex || null);
    setEntries(Array.isArray(entRes) ? entRes : []);
    setUsers(Array.isArray(usersRes) ? usersRes : []);
    setLoading(false);
  };

  useEffect(() => { if (!authLoading) loadData(); }, [id, authLoading]);

  useEffect(() => {
    if (!compareUserId) { setCompareEntries([]); return; }
    fetch(`/api/entries?exerciseId=${id}&userId=${compareUserId}`)
      .then(r => r.json()).then(d => setCompareEntries(Array.isArray(d) ? d : []));
  }, [compareUserId, id]);

  const bestWeight = entries.length ? Math.max(...entries.map(calcMax)) : 0;
  const lastEntry = entries[0];
  const chartData = buildChart(entries, compareEntries, chartType);
  const compareName = users.find(u => u.id === compareUserId)?.name || 'Porownanie';

  const initCustomSets = () => {
    setFormSetsData(Array.from({ length: formSets }, () => ({ reps: formReps, weight: formWeight })));
    setFormCustomSets(true);
  };
  const addSet = () => {
    const last = formSetsData.length > 0 ? formSetsData[formSetsData.length - 1] : { reps: formReps, weight: formWeight };
    setFormSetsData(p => [...p, { ...last }]);
  };
  const removeSet = (i: number) => setFormSetsData(p => p.filter((_, idx) => idx !== i));
  const updateSet = (i: number, f: 'reps' | 'weight', v: number) =>
    setFormSetsData(p => p.map((s, idx) => idx === i ? { ...s, [f]: v } : s));

  const handleAddToDraft = async () => {
    const sid = activeSession.getId();
    if (!sid) { setToast({ message: 'Brak aktywnego treningu', type: 'error' }); return; }
    const sd = formCustomSets && formSetsData.length > 0 ? formSetsData : [];
    const res = await fetch(`/api/sessions/${sid}/entries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId: id, sets: formSets, reps: formReps, weight: formWeight,
        rpe: formRpe ? parseFloat(formRpe) : undefined, comment: formComment || undefined, setsData: sd })
    });
    if (res.ok) { setToast({ message: 'Dodano do treningu', type: 'success' }); setShowForm(false); }
    else setToast({ message: 'Blad dodawania', type: 'error' });
  };

  const handleSaveAlone = async () => {
    setSaving(true);
    const sd = formCustomSets && formSetsData.length > 0 ? formSetsData : [];
    const res = await fetch('/api/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: formDate, notes: '', entries: [{ exerciseId: id, sets: formSets,
        reps: formReps, weight: formWeight, rpe: formRpe ? parseFloat(formRpe) : undefined,
        comment: formComment || undefined, setsData: sd }] })
    });
    if (res.ok) { setToast({ message: 'Zapisano', type: 'success' }); setShowForm(false); loadData(); }
    else setToast({ message: 'Blad zapisu', type: 'error' });
    setSaving(false);
  };

  const searchDb = async () => {
    if (!dbQuery.trim()) return;
    setDbLoading(true);
    try {
      const res = await fetch(`https://oss.exercisedb.dev/exercises/name/${encodeURIComponent(dbQuery.trim())}`);
      const data = await res.json();
      setDbResults(Array.isArray(data) ? data.slice(0, 8) : []);
    } catch { setDbResults([]); }
    setDbLoading(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Ladowanie...</div>;
  if (!exercise) return <div className="min-h-screen flex items-center justify-center text-gray-500">Nie znaleziono cwiczenia</div>;

  const shortName = exercise.name.includes(' - ') ? exercise.name.split(' - ').slice(1).join(' - ') : exercise.name;
  const otherUsers = users.filter(u => u.id !== authUserId);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
        <Link href="/cwiczenia" className="text-blue-600 text-sm mb-2 block">← Cwiczenia</Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{shortName}</h1>
            {exercise.muscleGroup && <p className="text-sm text-gray-500">{exercise.muscleGroup}</p>}
          </div>
          {isLoggedIn && (
            <button onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
              + Dodaj
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {entries.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{bestWeight}</div>
              <div className="text-xs text-gray-500">rekord kg</div>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{entries.length}</div>
              <div className="text-xs text-gray-500">sesji</div>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{lastEntry ? calcMax(lastEntry) : '-'}</div>
              <div className="text-xs text-gray-500">ostatnio kg</div>
            </div>
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <h3 className="font-semibold text-gray-900">Nowa sesja</h3>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Data</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            {!formCustomSets ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {[['Serie', formSets, (v: number) => setFormSets(v)], ['Powt.', formReps, (v: number) => setFormReps(v)], ['Ciezar kg', formWeight, (v: number) => setFormWeight(v)]].map(([label, val, fn]) => (
                    <div key={String(label)}>
                      <label className="text-xs text-gray-500 block mb-1">{String(label)}</label>
                      <input type="number" value={Number(val)} onChange={e => (fn as (v: number) => void)(Number(e.target.value))} min={0} step={String(label) === 'Ciezar kg' ? 0.5 : 1}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center" />
                    </div>
                  ))}
                </div>
                <button onClick={initCustomSets} className="text-sm text-blue-600">+ Rozpisz serie osobno</button>
              </>
            ) : (
              <div className="space-y-2">
                {formSetsData.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-12">Seria {i + 1}</span>
                    <input type="number" value={s.reps} onChange={e => updateSet(i, 'reps', Number(e.target.value))} min={1}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center" />
                    <span className="text-xs text-gray-400">x</span>
                    <input type="number" value={s.weight} onChange={e => updateSet(i, 'weight', Number(e.target.value))} min={0} step={0.5}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center" />
                    <span className="text-xs text-gray-400">kg</span>
                    <button onClick={() => removeSet(i)} className="text-red-400 text-sm">x</button>
                  </div>
                ))}
                <button onClick={addSet} className="text-sm text-blue-600">+ Dodaj serie</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">RPE</label>
                <input type="number" value={formRpe} onChange={e => setFormRpe(e.target.value)} min={1} max={10} step={0.5} placeholder="6-10"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Komentarz</label>
                <input type="text" value={formComment} onChange={e => setFormComment(e.target.value)} placeholder="np. pas"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              {activeSession.getId() && (
                <button onClick={handleAddToDraft}
                  className="flex-1 bg-green-600 text-white py-2 rounded-xl text-sm font-medium">
                  Dodaj do treningu
                </button>
              )}
              <button onClick={handleSaveAlone} disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm font-medium disabled:opacity-50">
                {saving ? 'Zapisuje...' : 'Zapisz osobno'}
              </button>
            </div>
          </div>
        )}

        {(entries.length > 0 || compareEntries.length > 0) && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-2">
                {(['weight', 'volume'] as const).map(t => (
                  <button key={t} onClick={() => setChartType(t)}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${chartType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {t === 'weight' ? 'Ciezar' : 'Wolumen'}
                  </button>
                ))}
              </div>
              {otherUsers.length > 0 && (
                <select value={compareUserId} onChange={e => setCompareUserId(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 max-w-32">
                  <option value="">+ Porownaj</option>
                  {otherUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              )}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip />
                {compareUserId && <Legend />}
                <Line type="monotone" dataKey="Ty" stroke="#2563eb" strokeWidth={2} dot={false}
                  name={authName || 'Ty'} connectNulls />
                {compareUserId && (
                  <Line type="monotone" dataKey="Porownanie" stroke="#f97316" strokeWidth={2} dot={false}
                    name={compareName} connectNulls />
                )}
              </LineChart>
            </ResponsiveContainer>
            {compareUserId && (
              <div className="flex gap-4 justify-center mt-2 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-600 inline-block"></span>{authName || 'Ty'}</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-500 inline-block"></span>{compareName}</span>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button onClick={() => setShowCalc(!showCalc)}
            className="w-full flex items-center justify-between px-4 py-3 text-left">
            <span className="font-medium text-gray-900 text-sm">Kalkulator 1RM</span>
            <span className="text-gray-400 text-xs">{showCalc ? '▲' : '▼'}</span>
          </button>
          {showCalc && (
            <div className="px-4 pb-4 border-t border-gray-100 space-y-3">
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Ciezar (kg)</label>
                  <input type="number" value={calcWeight} onChange={e => setCalcWeight(Number(e.target.value))} min={0} step={0.5}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Powtorzenia</label>
                  <input type="number" value={calcReps} onChange={e => setCalcReps(Number(e.target.value))} min={1} max={30}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center" />
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">{calc1RM(calcWeight, calcReps)} kg</div>
                <div className="text-xs text-blue-500">szacunkowe 1RM</div>
              </div>
              <div className="grid grid-cols-4 gap-1 text-center text-xs">
                {[100, 95, 90, 85, 80, 75, 70, 65].map(pct => (
                  <div key={pct} className="bg-gray-50 rounded-lg p-2">
                    <div className="font-bold text-gray-900">{Math.round(calc1RM(calcWeight, calcReps) * pct / 100)}</div>
                    <div className="text-gray-400">{pct}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button onClick={() => setShowTechnika(!showTechnika)}
            className="w-full flex items-center justify-between px-4 py-3 text-left">
            <span className="font-medium text-gray-900 text-sm">Technika i opis</span>
            <span className="text-gray-400 text-xs">{showTechnika ? '▲' : '▼'}</span>
          </button>
          {showTechnika && (
            <div className="px-4 pb-4 border-t border-gray-100">
              {selectedDb ? (
                <div className="space-y-4 mt-3">
                  <div className="flex gap-3">
                    <img src={selectedDb.gifUrl} alt={selectedDb.name}
                      className="w-28 h-28 object-cover rounded-xl border border-gray-200 flex-shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm">{selectedDb.name}</h3>
                      <div className="text-xs text-gray-500 mt-1 space-y-1">
                        <div>Miesien: <span className="text-gray-700 font-medium">{selectedDb.target}</span></div>
                        <div>Czesc ciala: <span className="text-gray-700">{selectedDb.bodyPart}</span></div>
                        <div>Sprzet: <span className="text-gray-700">{selectedDb.equipment}</span></div>
                        {selectedDb.secondaryMuscles.length > 0 && (
                          <div>Pomocnicze: <span className="text-gray-700">{selectedDb.secondaryMuscles.join(', ')}</span></div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Instrukcja</h4>
                    <ol className="space-y-2">
                      {selectedDb.instructions.map((step, i) => (
                        <li key={i} className="flex gap-2 text-sm text-gray-700">
                          <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full text-xs flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <button onClick={() => { setSelectedDb(null); setDbResults([]); }}
                    className="text-sm text-blue-600">Szukaj innego</button>
                </div>
              ) : (
                <div className="space-y-3 mt-3">
                  <p className="text-xs text-gray-400">Wyszukaj cwiczenie po angielskiej nazwie aby zobaczyc animacje i instrukcje.</p>
                  <div className="flex gap-2">
                    <input type="text" value={dbQuery} onChange={e => setDbQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchDb()}
                      placeholder="np. bench press, squat, deadlift..."
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                    <button onClick={searchDb} disabled={dbLoading}
                      className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
                      {dbLoading ? '...' : 'Szukaj'}
                    </button>
                  </div>
                  {dbResults.length > 0 && (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {dbResults.map(ex => (
                        <button key={ex.id} onClick={() => setSelectedDb(ex)}
                          className="w-full flex items-center gap-3 p-2 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-colors text-left">
                          <img src={ex.gifUrl} alt={ex.name} className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{ex.name}</div>
                            <div className="text-xs text-gray-500">{ex.target} · {ex.equipment}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {dbResults.length === 0 && dbQuery && !dbLoading && (
                    <p className="text-xs text-gray-400 text-center py-2">Brak wynikow. Sprobuj innej nazwy.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {entries.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <h2 className="px-4 py-3 font-semibold text-gray-900 text-sm border-b border-gray-100">Historia</h2>
            <div className="divide-y divide-gray-100">
              {entries.map(entry => (
                <div key={entry.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{formatDate(entry.session.date)}</span>
                    <span className="text-sm font-bold text-blue-600">{calcMax(entry)} kg</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {Array.isArray(entry.setsData) && entry.setsData.length > 0
                      ? entry.setsData.map(s => `${s.reps}x${s.weight}kg`).join(' · ')
                      : `${entry.sets}x${entry.reps} @ ${entry.weight}kg`}
                    {entry.rpe && ` RPE ${entry.rpe}`}
                  </div>
                  {entry.comment && <div className="text-xs text-gray-400 italic mt-0.5">{entry.comment}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {entries.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-3xl mb-2">📊</p>
            <p>Brak historii dla tego cwiczenia.</p>
          </div>
        )}
      </div>
    </div>
  );
}
