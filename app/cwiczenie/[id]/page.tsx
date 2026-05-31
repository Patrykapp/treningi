'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
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
  exerciseId: string;
  name: string;
  bodyParts: string[];
  equipments: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  instructions?: string[];
  gifUrl: string;
}

interface AppUser { id: string; name: string; }

function calcMax(e: EntryWithSession) {
  if (e.setsData && e.setsData.length > 0) return Math.max(...e.setsData.map(s => s.weight));
  return e.weight;
}
function calcVol(e: EntryWithSession) {
  if (e.setsData && e.setsData.length > 0) {
    const totalWeight = e.setsData.reduce((s, x) => s + x.weight, 0);
    // bodyweight exercise — volume = total reps
    if (totalWeight === 0) return e.setsData.reduce((s, x) => s + x.reps, 0);
    return e.setsData.reduce((s, x) => s + x.reps * x.weight, 0);
  }
  if (e.weight === 0) return e.sets * e.reps; // bodyweight
  return e.sets * e.reps * e.weight;
}
function calcTotalReps(e: EntryWithSession) {
  if (e.setsData && e.setsData.length > 0) return e.setsData.reduce((s, x) => s + x.reps, 0);
  return e.sets * e.reps;
}
function calc1RM(w: number, r: number) { return r === 1 ? w : Math.round(w * (1 + r / 30)); }

function getBodyPart(muscleGroup: string | null | undefined, name: string): string {
  const mg = (muscleGroup || '').toLowerCase();
  const nm = name.toLowerCase()
    .replace(/ą/g, 'a').replace(/ę/g, 'e').replace(/ó/g, 'o').replace(/ł/g, 'l')
    .replace(/ź/g, 'z').replace(/ż/g, 'z').replace(/ć/g, 'c').replace(/ń/g, 'n').replace(/ś/g, 's');
  const combined = mg + ' ' + nm;

  // Muscle group mapping (Polish group names)
  if (mg.includes('klat') || mg === 'klatka') return 'chest';
  if (mg.includes('plec')) return 'back';
  if (mg.includes('bark') || mg.includes('ramion')) return 'shoulders';
  if (mg === 'biceps' || mg.includes('biceps')) return 'upper arms';
  if (mg === 'triceps' || mg.includes('triceps')) return 'upper arms';
  if (mg.includes('nogi') || mg.includes('uda') || mg.includes('noga')) return 'upper legs';
  if (mg.includes('brzuch') || mg.includes('abs')) return 'waist';
  if (mg.includes('przedrami') || mg.includes('nadgar')) return 'lower arms';
  if (mg.includes('lydka') || mg.includes('laska') || mg.includes('calves')) return 'lower legs';
  if (mg.includes('kark') || mg.includes('szyja') || mg.includes('neck')) return 'neck';

  // Name-based fallback (for exercises without muscleGroup, or extra precision)
  if (combined.includes('klat') || combined.includes('lawka') || combined.includes('wyciskanie sztang') ||
      combined.includes('wyciskanie hantl') || combined.includes('pompk') || combined.includes('rozpietk') ||
      combined.includes('pullover') || combined.includes('bench') || combined.includes('pec deck') ||
      combined.includes('landmine')) return 'chest';

  if (combined.includes('plec') || combined.includes('wioslowan') || combined.includes('podciagan') ||
      combined.includes('martwy') || combined.includes('deadlift') || combined.includes('lat') ||
      combined.includes('row') || combined.includes('cable pull')) return 'back';

  if (combined.includes('bark') || combined.includes('ramion') || combined.includes('face pull') ||
      combined.includes('upright row') || combined.includes('szrugs') || combined.includes('unoszenie') ||
      combined.includes('military') || combined.includes('ohp') || combined.includes('shoulder')) return 'shoulders';

  if (combined.includes('biceps') || combined.includes('uginan') || combined.includes('curl') ||
      combined.includes('spider curl') || combined.includes('incline curl')) return 'upper arms';

  if (combined.includes('triceps') || combined.includes('skull') || combined.includes('french') ||
      combined.includes('dip') || combined.includes('pompki diamon')) return 'upper arms';

  if (combined.includes('przysiad') || combined.includes('squat') || combined.includes('wykrok') ||
      combined.includes('lunge') || combined.includes('hip thrust') || combined.includes('uginan nog') ||
      combined.includes('nogi') || combined.includes('udo') || combined.includes('rumunski') ||
      combined.includes('sumo')) return 'upper legs';

  if (combined.includes('brzuch') || combined.includes('plank') || combined.includes('deska') ||
      combined.includes('crunch') || combined.includes('brzuszk') || combined.includes('ab wheel') ||
      combined.includes('v-up') || combined.includes('mountain climb') || combined.includes('pallof') ||
      combined.includes('nozyce')) return 'waist';

  if (combined.includes('lydka') || combined.includes('wspiec') || combined.includes('calf') ||
      combined.includes('laska')) return 'lower legs';

  if (combined.includes('przedrami') || combined.includes('nadgar') || combined.includes('forearm') ||
      combined.includes('wrist')) return 'lower arms';

  return 'back'; // safe default
}

function buildChart(
  mine: EntryWithSession[], theirs: EntryWithSession[], type: 'weight' | 'volume' | 'reps'
): { date: string; ts: number; Ty?: number; Porownanie?: number }[] {
  const map: Record<string, { date: string; ts: number; Ty?: number; Porownanie?: number }> = {};
  const val = (e: EntryWithSession) =>
    type === 'weight' ? calcMax(e) :
    type === 'reps' ? calcTotalReps(e) :
    Math.round(calcVol(e));
  const key = (e: EntryWithSession) => new Date(e.session.date).toISOString().slice(0, 10);
  const ts  = (e: EntryWithSession) => new Date(e.session.date).getTime();
  mine.forEach(e => {
    const k = key(e);
    if (!map[k]) map[k] = { date: formatDate(e.session.date), ts: ts(e) };
    map[k].Ty = val(e);
  });
  theirs.forEach(e => {
    const k = key(e);
    if (!map[k]) map[k] = { date: formatDate(e.session.date), ts: ts(e) };
    map[k].Porownanie = val(e);
  });
  return Object.values(map).sort((a, b) => a.ts - b.ts);
}

export default function CwiczeniePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isLoggedIn, userId: authUserId, name: authName, loading: authLoading } = useAuth();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [entries, setEntries] = useState<EntryWithSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [chartType, setChartType] = useState<'weight' | 'volume' | 'reps'>('weight');

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
  const [formBodyweight, setFormBodyweight] = useState(false);
  const [saving, setSaving] = useState(false);

  const [saveAsUserId, setSaveAsUserId] = useState('');
  const [existingSessionId, setExistingSessionId] = useState<string | null>(null);

  const [showTechnika, setShowTechnika] = useState(false);
  const [linkedDb, setLinkedDb] = useState<DbExercise | null>(null);
  const [suggestions, setSuggestions] = useState<DbExercise[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [linking, setLinking] = useState(false);

  const loadData = async () => {
    const uq = authUserId ? `&userId=${authUserId}` : '';
    const [exRes, entRes, usersRes] = await Promise.all([
      fetch('/api/exercises').then(r => r.json()),
      fetch(`/api/entries?exerciseId=${id}${uq}`).then(r => r.json()),
      fetch('/api/users').then(r => r.json()),
    ]);
    const ex = (Array.isArray(exRes) ? exRes : []).find((e: Exercise) => e.id === id) || null;
    setExercise(ex);
    const loadedEntries = Array.isArray(entRes) ? entRes : [];
    setEntries(loadedEntries);
    setUsers(Array.isArray(usersRes) ? usersRes : []);
    // Auto-switch to reps chart for bodyweight exercises
    const allBodyweight = loadedEntries.length > 0 && loadedEntries.every((e: EntryWithSession) => calcMax(e) === 0);
    if (allBodyweight) setChartType('reps');
    setLoading(false);
    return ex;
  };

  useEffect(() => {
    if (!authLoading) {
      loadData().then(ex => {
        if (ex?.exerciseDbId) {
          fetch(`/api/exercisedb?id=${ex.exerciseDbId}`)
            .then(r => r.json())
            .then(d => { if (d?.exerciseId) setLinkedDb(d); })
            .catch(() => {});
        }
      });
    }
  }, [id, authLoading]);

  useEffect(() => {
    if (!compareUserId) { setCompareEntries([]); return; }
    fetch(`/api/entries?exerciseId=${id}&userId=${compareUserId}`)
      .then(r => r.json()).then(d => setCompareEntries(Array.isArray(d) ? d : []));
  }, [compareUserId, id]);

  // Check if a session already exists for the chosen date
  useEffect(() => {
    if (!authUserId || !formDate || !showForm) return;
    const targetId = saveAsUserId === 'all' ? authUserId : (saveAsUserId || authUserId);
    fetch(`/api/sessions?date=${formDate}&userId=${targetId}&limit=1`)
      .then(r => r.json())
      .then(d => setExistingSessionId(Array.isArray(d) && d.length > 0 ? d[0].id : null))
      .catch(() => setExistingSessionId(null));
  }, [formDate, saveAsUserId, authUserId, showForm]);

  useEffect(() => {
    if (!showTechnika || linkedDb || loadingSuggestions || suggestions.length > 0 || !exercise) return;
    const bodyPart = getBodyPart(exercise.muscleGroup, exercise.name);
    setLoadingSuggestions(true);
    fetch(`/api/exercisedb?bodyPart=${encodeURIComponent(bodyPart)}`)
      .then(r => r.json())
      .then(data => setSuggestions(Array.isArray(data) ? data : []))
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSuggestions(false));
  }, [showTechnika, linkedDb, exercise]);

  const linkExercise = async (dbEx: DbExercise) => {
    setLinking(true);
    const res = await fetch(`/api/exercises/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseDbId: dbEx.exerciseId }),
    });
    if (res.ok) {
      setLinkedDb(dbEx);
      setExercise(prev => prev ? { ...prev, exerciseDbId: dbEx.exerciseId } : prev);
      setToast({ message: 'Technika powiazana!', type: 'success' });
    } else setToast({ message: 'Błąd zapisu', type: 'error' });
    setLinking(false);
  };

  const unlinkExercise = async () => {
    await fetch(`/api/exercises/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseDbId: '' }),
    });
    setLinkedDb(null);
    setSuggestions([]);
    setExercise(prev => prev ? { ...prev, exerciseDbId: null } : prev);
  };

  const bestWeight = entries.length ? Math.max(...entries.map(calcMax)) : 0;
  const isBodyweightExercise = entries.length > 0 && bestWeight === 0;
  const lastEntry = entries[0];
  const chartData = buildChart(entries, compareEntries, chartType);
  const compareName = users.find(u => u.id === compareUserId)?.name || 'Porownanie';
  const otherUsers = users.filter(u => u.id !== authUserId);

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
    else setToast({ message: 'Błąd dodawania', type: 'error' });
  };

  const buildEntry = () => {
    const sd = formCustomSets && formSetsData.length > 0 ? formSetsData : [];
    return { exerciseId: id, sets: formSets, reps: formReps, weight: formWeight,
      rpe: formRpe ? parseFloat(formRpe) : undefined, comment: formComment || undefined, setsData: sd };
  };

  const handleAddToExisting = async () => {
    if (!existingSessionId) return;
    setSaving(true);
    const entry = buildEntry();
    const targetIds: string[] = saveAsUserId === 'all' ? users.map(u => u.id) : [saveAsUserId || authUserId || ''];
    // For "all" we need to find each user's session for this date
    let allOk = true;
    if (saveAsUserId === 'all') {
      for (const uid of targetIds) {
        const sessRes = await fetch(`/api/sessions?date=${formDate}&userId=${uid}&limit=1`).then(r => r.json());
        const sid = Array.isArray(sessRes) && sessRes.length > 0 ? sessRes[0].id : null;
        if (sid) {
          const res = await fetch(`/api/sessions/${sid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry }) });
          if (!res.ok) allOk = false;
        } else {
          const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: formDate, notes: '', targetUserId: uid, entries: [entry] }) });
          if (!res.ok) allOk = false;
        }
      }
    } else {
      const res = await fetch(`/api/sessions/${existingSessionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry }) });
      if (!res.ok) allOk = false;
    }
    if (allOk) {
      setToast({ message: 'Dodano do treningu z tego dnia!', type: 'success' });
      setShowForm(false);
      loadData();
    } else {
      setToast({ message: 'Błąd zapisu', type: 'error' });
    }
    setSaving(false);
  };

  const handleSaveAlone = async () => {
    setSaving(true);
    const entry = buildEntry();
    const targetIds: string[] = saveAsUserId === 'all'
      ? users.map(u => u.id)
      : [saveAsUserId || authUserId || ''];

    let allOk = true;
    for (const uid of targetIds) {
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: formDate, notes: '', targetUserId: uid, entries: [entry] })
      });
      if (!res.ok) allOk = false;
    }

    if (allOk) {
      const msg = saveAsUserId === 'all'
        ? `Zapisano dla ${users.map(u => u.name).join(' i ')}!`
        : 'Zapisano!';
      setToast({ message: msg, type: 'success' });
      setShowForm(false);
      loadData();
    } else {
      setToast({ message: 'Błąd zapisu', type: 'error' });
    }
    setSaving(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Ładowanie...</div>;
  if (!exercise) return <div className="min-h-screen flex items-center justify-center text-gray-500">Nie znaleziono ćwiczenia</div>;

  const shortName = exercise.name.includes(' - ') ? exercise.name.split(' - ').slice(1).join(' - ') : exercise.name;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="bg-white border-b px-4 pt-4 pb-3 sticky top-0 z-10">
        <Link href="/cwiczenia" className="text-blue-600 text-sm mb-2 block">← Ćwiczenia</Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{shortName}</h1>
            {exercise.muscleGroup && <p className="text-sm text-gray-500">{exercise.muscleGroup}</p>}
          </div>
          {isLoggedIn && (
            <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
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
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Własna masa ciała</span>
              <button onClick={() => { setFormBodyweight(b => !b); if (!formBodyweight) setFormWeight(0); }}
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${formBodyweight ? 'bg-green-500' : 'bg-gray-200'}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${formBodyweight ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
            {!formCustomSets ? (
              <>
                <div className={`grid gap-2 ${formBodyweight ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  <div><label className="text-xs text-gray-500 block mb-1">Serie</label>
                    <input type="number" inputMode="numeric"
                      value={formSets === 0 ? '' : formSets} placeholder="0"
                      onChange={e => setFormSets(e.target.value === '' ? 0 : Math.max(1, Number(e.target.value)))} min={1}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center" /></div>
                  <div><label className="text-xs text-gray-500 block mb-1">Powt.</label>
                    <input type="number" inputMode="numeric"
                      value={formReps === 0 ? '' : formReps} placeholder="0"
                      onChange={e => setFormReps(e.target.value === '' ? 0 : Number(e.target.value))} min={1}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center" /></div>
                  {!formBodyweight && (
                    <div><label className="text-xs text-gray-500 block mb-1">Ciężar kg</label>
                      <input type="number" inputMode="decimal" step={0.5}
                        value={formWeight === 0 ? '' : formWeight} placeholder="0"
                        onChange={e => setFormWeight(Number(e.target.value) || 0)} min={0}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center" /></div>
                  )}
                </div>
                <button onClick={initCustomSets} className="text-sm text-blue-600">+ Rozpisz serie osobno</button>
              </>
            ) : (
              <div className="space-y-2">
                {formSetsData.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 shrink-0 w-9">S{i + 1}</span>
                    <input type="number" inputMode="numeric"
                      value={s.reps === 0 ? '' : s.reps} placeholder="powt."
                      onChange={e => updateSet(i, 'reps', e.target.value === '' ? 0 : Number(e.target.value))} min={1}
                      className="w-16 border border-gray-200 rounded-lg px-1 py-1.5 text-sm text-center" />
                    {!formBodyweight && (
                      <>
                        <span className="text-xs text-gray-400 shrink-0">×</span>
                        <input type="number" inputMode="decimal" step={0.5}
                          value={s.weight === 0 ? '' : s.weight} placeholder="kg"
                          onChange={e => updateSet(i, 'weight', e.target.value === '' ? 0 : Number(e.target.value))} min={0}
                          className="w-16 border border-gray-200 rounded-lg px-1 py-1.5 text-sm text-center" />
                        <span className="text-xs text-gray-400 shrink-0">kg</span>
                      </>
                    )}
                    <button onClick={() => removeSet(i)} className="ml-auto text-red-400 p-1 shrink-0">✕</button>
                  </div>
                ))}
                <button onClick={addSet} className="text-sm text-blue-600">+ Dodaj serię</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-gray-500 block mb-1">RPE</label>
                <input type="number" value={formRpe} onChange={e => setFormRpe(e.target.value)} min={1} max={10} step={0.5} placeholder="6-10"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center" /></div>
              <div><label className="text-xs text-gray-500 block mb-1">Komentarz</label>
                <input type="text" value={formComment} onChange={e => setFormComment(e.target.value)} placeholder="np. pas"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" /></div>
            </div>
            {users.length > 1 && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Zapisz dla</label>
                <div className="flex gap-2">
                  {users.map(u => (
                    <button key={u.id} onClick={() => setSaveAsUserId(u.id)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                        saveAsUserId === u.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}>
                      {u.name}
                    </button>
                  ))}
                  <button onClick={() => setSaveAsUserId('all')}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      saveAsUserId === 'all'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}>
                    Oboje 👥
                  </button>
                </div>
              </div>
            )}
            {existingSessionId && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2 text-center font-medium">
                ⚠️ Masz już trening z tego dnia
              </p>
            )}
            <div className="flex gap-2">
              {activeSession.getId() && (
                <button onClick={handleAddToDraft} className="flex-1 bg-green-600 text-white py-2 rounded-xl text-sm font-medium">
                  Dodaj do treningu
                </button>
              )}
              {existingSessionId ? (
                <>
                  <button onClick={handleAddToExisting} disabled={saving}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm font-medium disabled:opacity-50">
                    {saving ? 'Zapisuję...' : '+ Dodaj do istniejącego'}
                  </button>
                  <button onClick={handleSaveAlone} disabled={saving}
                    className="flex-1 bg-gray-600 text-white py-2 rounded-xl text-sm font-medium disabled:opacity-50">
                    Osobno
                  </button>
                </>
              ) : (
                <button onClick={handleSaveAlone} disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm font-medium disabled:opacity-50">
                  {saving ? 'Zapisuję...' : 'Zapisz'}
                </button>
              )}
            </div>
          </div>
        )}

        {(entries.length > 0 || compareEntries.length > 0) && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-2">
                {(isBodyweightExercise
                  ? (['reps', 'volume'] as const)
                  : (['weight', 'volume', 'reps'] as const)
                ).map(t => (
                  <button key={t} onClick={() => setChartType(t)}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${chartType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {t === 'weight' ? 'Ciężar' : t === 'reps' ? 'Powtórzenia' : 'Wolumen'}
                  </button>
                ))}
              </div>
              {otherUsers.length > 0 && (
                <select value={compareUserId} onChange={e => setCompareUserId(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600">
                  <option value="">+ Porównaj</option>
                  {otherUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              )}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradOrange" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  tickFormatter={(v: string) => {
                    const parts = v.split('.');
                    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : v;
                  }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  domain={(['dataMin - 5', 'dataMax + 5'] as [string, string])}
                  tickFormatter={(v: number) => chartType === 'volume' && v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: '13px' }}
                  formatter={(value: number, name: string) => [
                    chartType === 'weight' ? `${value} kg` :
                    chartType === 'reps' ? `${value} powt.` :
                    isBodyweightExercise ? `${value} powt.` :
                    `${value} kg·powt`,
                    name,
                  ]}
                  labelStyle={{ fontWeight: 600, color: '#111827', marginBottom: 4 }}
                />
                {compareUserId && <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />}
                <Area
                  type="monotone"
                  dataKey="Ty"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fill="url(#gradBlue)"
                  dot={{ r: 3, fill: '#2563eb', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#2563eb', strokeWidth: 0 }}
                  name={authName || 'Ty'}
                  connectNulls
                />
                {compareUserId && (
                  <Area
                    type="monotone"
                    dataKey="Porownanie"
                    stroke="#f97316"
                    strokeWidth={2.5}
                    fill="url(#gradOrange)"
                    dot={{ r: 3, fill: '#f97316', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#f97316', strokeWidth: 0 }}
                    name={compareName}
                    connectNulls
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button onClick={() => setShowCalc(!showCalc)} className="w-full flex items-center justify-between px-4 py-3 text-left">
            <span className="font-medium text-gray-900 text-sm">Kalkulator 1RM</span>
            <span className="text-gray-400 text-xs">{showCalc ? '▲' : '▼'}</span>
          </button>
          {showCalc && (
            <div className="px-4 pb-4 border-t border-gray-100 space-y-3">
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div><label className="text-xs text-gray-500 block mb-1">Ciężar (kg)</label>
                  <input type="number" value={calcWeight} onChange={e => setCalcWeight(Number(e.target.value))} min={0} step={0.5}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Powtorzenia</label>
                  <input type="number" value={calcReps} onChange={e => setCalcReps(Number(e.target.value))} min={1} max={30}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center" /></div>
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
          <button onClick={() => setShowTechnika(!showTechnika)} className="w-full flex items-center justify-between px-4 py-3 text-left">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 text-sm">Technika i opis</span>
              {linkedDb && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">powiazane</span>}
              {!linkedDb && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">nie powiazane</span>}
            </div>
            <span className="text-gray-400 text-xs">{showTechnika ? '▲' : '▼'}</span>
          </button>

          {showTechnika && (
            <div className="border-t border-gray-100">
              {linkedDb ? (
                <div className="p-4 space-y-4">
                  <div className="flex gap-3">
                    <img src={linkedDb.gifUrl} alt={linkedDb.name}
                      className="w-28 h-28 object-cover rounded-xl border border-gray-200 flex-shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm">{linkedDb.name}</h3>
                      <div className="text-xs text-gray-500 mt-1 space-y-1">
                        {linkedDb.targetMuscles.length > 0 && (
                          <div>Mięsień: <span className="text-gray-700 font-medium">{linkedDb.targetMuscles.join(', ')}</span></div>
                        )}
                        {linkedDb.bodyParts.length > 0 && (
                          <div>Część ciała: <span className="text-gray-700">{linkedDb.bodyParts.join(', ')}</span></div>
                        )}
                        {linkedDb.equipments.length > 0 && (
                          <div>Sprzęt: <span className="text-gray-700">{linkedDb.equipments.join(', ')}</span></div>
                        )}
                        {linkedDb.secondaryMuscles.length > 0 && (
                          <div>Pomocnicze: <span className="text-gray-700">{linkedDb.secondaryMuscles.slice(0, 3).join(', ')}</span></div>
                        )}
                      </div>
                    </div>
                  </div>
                  {linkedDb.instructions && linkedDb.instructions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Instrukcja</h4>
                    <ol className="space-y-2">
                      {linkedDb.instructions.map((step, i) => (
                        <li key={i} className="flex gap-2 text-sm text-gray-700">
                          <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full text-xs flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  )}
                  {isLoggedIn && <button onClick={unlinkExercise} className="text-xs text-gray-400 underline">Zmien powiazanie</button>}
                </div>
              ) : (
                <div className="p-4">
                  {isLoggedIn ? (
                    <>
                      <p className="text-sm text-gray-500 mb-3">
                        Wybierz odpowiednie ćwiczenie — zostanie zapisane dla wszystkich użytkowników:
                      </p>
                      {loadingSuggestions && (
                        <div className="flex flex-col items-center py-8 gap-2">
                          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-sm text-gray-400">Pobieranie propozycji...</span>
                        </div>
                      )}
                      {!loadingSuggestions && suggestions.length > 0 && (
                        <div className="space-y-2 max-h-96 overflow-y-auto -mx-1 px-1">
                          {suggestions.map(ex => (
                            <button key={ex.exerciseId} onClick={() => linkExercise(ex)} disabled={linking}
                              className="w-full flex items-center gap-3 p-2 rounded-xl border border-gray-100 active:bg-blue-50 text-left disabled:opacity-50">
                              <img src={ex.gifUrl} alt={ex.name} className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-gray-900">{ex.name}</div>
                                <div className="text-xs text-gray-500">
                                  {ex.targetMuscles[0]} · {ex.equipments[0]}
                                </div>
                              </div>
                              <span className="text-blue-500 text-xs flex-shrink-0 font-medium">Wybierz</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {!loadingSuggestions && suggestions.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-6">Brak propozycji z ExerciseDB.</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">Zaloguj się aby zobaczyć technikę.</p>
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
            <p>Brak historii dla tego ćwiczenia.</p>
          </div>
        )}
      </div>
    </div>
  );
}
