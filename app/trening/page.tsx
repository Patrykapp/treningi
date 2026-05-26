'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Exercise, NewEntryForm, SetData } from '@/types';
import { formatDateInput } from '@/lib/utils';
import { Toast } from '@/components/ui/Toast';
import { ExerciseSearch } from '@/components/ui/ExerciseSearch';
import { activeSession } from '@/hooks/useActiveSession';
import { useAuth } from '@/hooks/useAuth';

interface EntryRow extends NewEntryForm {
  key: string;
  customSets: boolean;
  bodyweight: boolean; // ćwiczenie własnym ciężarem – brak pola ciężaru
}

interface Template {
  id: string;
  name: string;
  entries: { exerciseId: string; sets: number; reps: number; weight: number }[];
}

function TreningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId: authUserId, name: authName } = useAuth();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [notes, setNotes] = useState('');
  const [entries, setEntries] = useState<EntryRow[]>([{
    key: '0', exerciseId: '', sets: 3, reps: 10, weight: 0, customSets: false, setsData: [], bodyweight: false,
  }]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [newExName, setNewExName] = useState('');
  const [showNewEx, setShowNewEx] = useState(false);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  const loadData = useCallback(async () => {
    const [exRes, tplRes] = await Promise.all([
      fetch('/api/exercises').then(r => r.json()),
      fetch('/api/templates').then(r => r.json()),
    ]);
    setExercises(Array.isArray(exRes) ? exRes : []);
    setTemplates(Array.isArray(tplRes) ? tplRes : []);

    const sessionIdParam = searchParams.get('sessionId');
    if (sessionIdParam) {
      setEditingSession(sessionIdParam);
      const session = await fetch(`/api/sessions/${sessionIdParam}`).then(r => r.json());
      if (session && !session.error) {
        setDate(formatDateInput(session.date));
        setNotes(session.notes || '');
        setEntries(session.entries.map((e: {
          exerciseId: string; sets: number; reps: number; weight: number;
          rpe?: number | null; comment?: string | null; setsData?: SetData[]
        }, i: number) => {
          const sd: SetData[] = Array.isArray(e.setsData) && e.setsData.length > 0 ? e.setsData : [];
          return { key: String(i), exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, weight: e.weight,
            rpe: e.rpe || undefined, comment: e.comment || undefined, setsData: sd, customSets: sd.length > 0, bodyweight: e.weight === 0 && sd.every(s => s.weight === 0) };
        }));
        return;
      }
    }

    const editId = sessionStorage.getItem('editSessionId');
    if (editId) {
      setEditingSession(editId);
      const session = await fetch(`/api/sessions/${editId}`).then(r => r.json());
      if (session && !session.error) {
        setDate(formatDateInput(session.date));
        setNotes(session.notes || '');
        setEntries(session.entries.map((e: {
          exerciseId: string; sets: number; reps: number; weight: number;
          rpe?: number | null; comment?: string | null; setsData?: SetData[]
        }, i: number) => {
          const sd: SetData[] = Array.isArray(e.setsData) && e.setsData.length > 0 ? e.setsData : [];
          return { key: String(i), exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, weight: e.weight,
            rpe: e.rpe || undefined, comment: e.comment || undefined, setsData: sd, customSets: sd.length > 0, bodyweight: e.weight === 0 && sd.every(s => s.weight === 0) };
        }));
      }
      sessionStorage.removeItem('editSessionId');
    }
  }, [searchParams]);

  useEffect(() => { loadData(); }, [loadData]);

  const copyLastWorkout = async () => {
    const sessions = await fetch('/api/sessions?limit=1').then(r => r.json());
    if (!Array.isArray(sessions) || !sessions.length) {
      setToast({ message: 'Brak poprzednich treningow', type: 'error' }); return;
    }
    const last = sessions[0];
    setEntries(last.entries.map((e: {
      exerciseId: string; sets: number; reps: number; weight: number;
      rpe?: number | null; comment?: string | null; setsData?: SetData[]
    }, i: number) => {
      const sd: SetData[] = Array.isArray(e.setsData) && e.setsData.length > 0 ? e.setsData : [];
      return { key: String(Date.now() + i), exerciseId: e.exerciseId, sets: e.sets, reps: e.reps,
        weight: e.weight, rpe: e.rpe || undefined, comment: e.comment || undefined, setsData: sd, customSets: sd.length > 0, bodyweight: false };
    }));
    setToast({ message: 'Skopiowano ostatni trening', type: 'success' });
  };

  const loadTemplate = (tpl: Template) => {
    setEntries(tpl.entries.map((e, i) => ({
      key: String(Date.now() + i), exerciseId: e.exerciseId, sets: e.sets, reps: e.reps,
      weight: e.weight, customSets: false, setsData: [], bodyweight: false,
    })));
    setShowTemplates(false);
    setToast({ message: `Zaladowano szablon "${tpl.name}"`, type: 'success' });
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    const tplEntries = entries.filter(e => e.exerciseId).map(e => ({
      exerciseId: e.exerciseId, sets: e.customSets ? (e.setsData?.length || e.sets) : e.sets,
      reps: e.reps, weight: e.weight,
    }));
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateName.trim(), entries: tplEntries }),
    });
    if (res.ok) {
      const tpl = await res.json();
      setTemplates(prev => [tpl, ...prev]);
      setToast({ message: `Szablon "${tpl.name}" zapisany!`, type: 'success' });
      setTemplateName(''); setShowSaveTemplate(false);
    }
    setSavingTemplate(false);
  };

  const addEntry = () => setEntries(prev => [...prev, {
    key: String(Date.now()), exerciseId: '', sets: 3, reps: 10, weight: 0, customSets: false, setsData: [], bodyweight: false,
  }]);

  const removeEntry = (key: string) => setEntries(prev => prev.filter(e => e.key !== key));

  const updateEntry = (key: string, field: keyof NewEntryForm, value: string | number) =>
    setEntries(prev => prev.map(e => e.key !== key ? e : { ...e, [field]: value }));

  const toggleCustomSets = (key: string, custom: boolean) => {
    setEntries(prev => prev.map(e => {
      if (e.key !== key) return e;
      if (custom && (!e.setsData || e.setsData.length === 0)) {
        const sd: SetData[] = Array.from({ length: e.sets }, () => ({ reps: e.reps, weight: e.weight }));
        return { ...e, customSets: true, setsData: sd };
      }
      return { ...e, customSets: custom, setsData: custom ? (e.setsData || []) : [] };
    }));
  };

  const updateSet = (entryKey: string, setIdx: number, field: 'reps' | 'weight', value: number) => {
    setEntries(prev => prev.map(e => {
      if (e.key !== entryKey) return e;
      const newSets = [...(e.setsData || [])];
      newSets[setIdx] = { ...newSets[setIdx], [field]: value };
      return { ...e, setsData: newSets };
    }));
  };

  const addSet = (entryKey: string) => {
    setEntries(prev => prev.map(e => {
      if (e.key !== entryKey) return e;
      const last = e.setsData && e.setsData.length > 0 ? e.setsData[e.setsData.length - 1] : { reps: e.reps, weight: e.weight };
      return { ...e, setsData: [...(e.setsData || []), { ...last }] };
    }));
  };

  const removeSet = (entryKey: string, setIdx: number) => {
    setEntries(prev => prev.map(e => {
      if (e.key !== entryKey) return e;
      return { ...e, setsData: (e.setsData || []).filter((_, i) => i !== setIdx) };
    }));
  };

  const addNewExercise = async () => {
    if (!newExName.trim()) return;
    const res = await fetch('/api/exercises', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newExName.trim() }),
    });
    if (res.ok) {
      const ex = await res.json();
      setExercises(prev => [...prev, ex].sort((a, b) => a.name.localeCompare(b.name)));
      setNewExName(''); setShowNewEx(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) { setToast({ message: 'Wybierz date', type: 'error' }); return; }
    for (const entry of entries) {
      if (!entry.exerciseId) { setToast({ message: 'Wybierz cwiczenie', type: 'error' }); return; }
      if (entry.customSets && (!entry.setsData || entry.setsData.length === 0)) {
        setToast({ message: 'Dodaj co najmniej jedna serie', type: 'error' }); return;
      }
      if (!entry.customSets && !entry.weight && !entry.bodyweight) {
        setToast({ message: 'Podaj ciezar lub zaznacz "własna masa"', type: 'error' }); return;
      }
    }
    setSaving(true);
    try {
      const url = editingSession ? `/api/sessions/${editingSession}` : '/api/sessions';
      const method = editingSession ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, notes, entries }),
      });
      if (res.ok) {
        activeSession.clear();
        setToast({ message: editingSession ? 'Trening zaktualizowany!' : 'Trening zapisany!', type: 'success' });
        setTimeout(() => router.push('/'), 1500);
      } else {
        const err = await res.json();
        setToast({ message: err.error || 'Blad zapisu', type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">{editingSession ? 'Edytuj trening' : 'Nowy trening'}</h1>
          {authName && <span className="text-sm text-blue-600 font-medium">{authName}</span>}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Data</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Notatki (opcjonalne)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Np. dobry dzien, PR na klatkce..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900" />
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={copyLastWorkout}
            className="flex-1 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">
            Kopiuj ostatni
          </button>
          <button type="button" onClick={() => setShowTemplates(o => !o)}
            className="flex-1 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium">
            Szablony ({templates.length})
          </button>
        </div>

        {showTemplates && (
          <div className="bg-white rounded-2xl p-4 space-y-2">
            {templates.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-2">Brak szablonow</p>
            ) : templates.map(tpl => (
              <div key={tpl.id} className="flex items-center justify-between">
                <button type="button" onClick={() => loadTemplate(tpl)} className="text-sm font-medium text-blue-600 flex-1 text-left">
                  {tpl.name}
                </button>
                <button type="button" onClick={() => setTemplates(prev => prev.filter(t => t.id !== tpl.id))}
                  className="text-red-400 text-xs px-2">usun</button>
              </div>
            ))}
            {!showSaveTemplate ? (
              <button type="button" onClick={() => setShowSaveTemplate(true)}
                className="w-full text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl py-2 mt-2">
                + Zapisz obecny jako szablon
              </button>
            ) : (
              <div className="flex gap-2 mt-2">
                <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Nazwa szablonu"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <button type="button" onClick={saveTemplate} disabled={savingTemplate}
                  className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
                  {savingTemplate ? '...' : 'Zapisz'}
                </button>
              </div>
            )}
          </div>
        )}

        {entries.map((entry, idx) => (
          <div key={entry.key} className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-500">Cwiczenie {idx + 1}</span>
              {entries.length > 1 && (
                <button type="button" onClick={() => removeEntry(entry.key)} className="text-red-400 text-sm">Usun</button>
              )}
            </div>
            <ExerciseSearch
              exercises={exercises}
              value={entry.exerciseId}
              onChange={val => updateEntry(entry.key, 'exerciseId', val)}
            />
            {/* Przełączniki */}
            <div className="flex gap-4 items-center">
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500">Serie per-set</label>
                <button type="button" onClick={() => toggleCustomSets(entry.key, !entry.customSets)}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${entry.customSets ? 'bg-blue-600' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${entry.customSets ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500">Własna masa</label>
                <button type="button"
                  onClick={() => setEntries(prev => prev.map(e =>
                    e.key === entry.key ? { ...e, bodyweight: !e.bodyweight, weight: 0, setsData: (e.setsData || []).map(s => ({ ...s, weight: 0 })) } : e
                  ))}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${entry.bodyweight ? 'bg-green-500' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${entry.bodyweight ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            {!entry.customSets ? (
              <div className={`grid gap-2 ${entry.bodyweight ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {[['Serie', 'sets'], ['Powt.', 'reps'], ...(!entry.bodyweight ? [['Ciezar kg', 'weight']] : [])].map(([label, field]) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input
                      type="number" min="0" step={field === 'weight' ? '0.5' : '1'}
                      inputMode={field === 'weight' ? 'decimal' : 'numeric'}
                      value={(entry[field as keyof NewEntryForm] as number) === 0 ? '' : (entry[field as keyof NewEntryForm] as number)}
                      placeholder="0"
                      onChange={e => updateEntry(entry.key, field as keyof NewEntryForm, parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base text-gray-900 text-center" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {(entry.setsData || []).map((s, si) => (
                  <div key={si} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-6">{si + 1}.</span>
                    <input type="number" min="1" inputMode="numeric"
                      value={s.reps === 0 ? '' : s.reps} placeholder="0"
                      onChange={e => updateSet(entry.key, si, 'reps', parseInt(e.target.value) || 1)}
                      className="w-16 border border-gray-200 rounded-xl px-2 py-2 text-sm text-center" />
                    {!entry.bodyweight && (
                      <>
                        <span className="text-xs text-gray-400">x</span>
                        <input type="number" min="0" step="0.5" inputMode="decimal"
                          value={s.weight === 0 ? '' : s.weight} placeholder="0"
                          onChange={e => updateSet(entry.key, si, 'weight', parseFloat(e.target.value) || 0)}
                          className="w-20 border border-gray-200 rounded-xl px-2 py-2 text-sm text-center" />
                      </>
                    )}
                    <button type="button" onClick={() => removeSet(entry.key, si)} className="text-red-400 text-sm px-1">x</button>
                  </div>
                ))}
                <button type="button" onClick={() => addSet(entry.key)}
                  className="w-full text-sm text-blue-600 border border-dashed border-blue-300 rounded-xl py-2">
                  + Dodaj serie
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">RPE (opcjonalne)</label>
                <input type="number" min="1" max="10" step="0.5" value={entry.rpe || ''} onChange={e => updateEntry(entry.key, 'rpe', parseFloat(e.target.value) || 0)}
                  placeholder="1-10" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Komentarz</label>
                <input type="text" value={entry.comment || ''} onChange={e => updateEntry(entry.key, 'comment', e.target.value)}
                  placeholder="np. zmeczony..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
        ))}

        <button type="button" onClick={addEntry}
          className="w-full bg-white border-2 border-dashed border-gray-300 text-gray-600 py-3 rounded-2xl text-sm font-medium">
          + Dodaj cwiczenie
        </button>

        {showNewEx ? (
          <div className="bg-white rounded-2xl p-4 flex gap-2">
            <input value={newExName} onChange={e => setNewExName(e.target.value)} placeholder="Nazwa cwiczenia"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            <button type="button" onClick={addNewExercise} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">Dodaj</button>
            <button type="button" onClick={() => setShowNewEx(false)} className="text-gray-400 px-2">X</button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowNewEx(true)}
            className="w-full text-sm text-gray-500 py-2">
            + Nowe cwiczenie w bibliotece
          </button>
        )}

        <button type="submit" disabled={saving || !entries.some(e => e.exerciseId)}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg disabled:opacity-50">
          {saving ? 'Zapisuje...' : editingSession ? 'Aktualizuj trening' : 'Zapisz trening'}
        </button>
      </form>
    </div>
  );
}

export default function TreningPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Ladowanie...</div>}>
      <TreningPage />
    </Suspense>
  );
}
