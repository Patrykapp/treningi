'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Exercise, User, NewEntryForm, SetData } from '@/types';
import { formatDateInput } from '@/lib/utils';
import { Toast } from '@/components/ui/Toast';

interface EntryRow extends NewEntryForm {
  key: string;
  customSets: boolean; // tryb różnych serii
}

export default function TreningPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [notes, setNotes] = useState('');
  const [entries, setEntries] = useState<EntryRow[]>([{
    key: '0', exerciseId: '', sets: 3, reps: 10, weight: 0, customSets: false, setsData: []
  }]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [newExName, setNewExName] = useState('');
  const [showNewEx, setShowNewEx] = useState(false);
  const [editingSession, setEditingSession] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [usersRes, exRes] = await Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/exercises').then(r => r.json()),
    ]);
    setUsers(usersRes);
    setExercises(exRes);
    const saved = localStorage.getItem('selectedUserId');
    if (saved) setUserId(saved);
    else if (usersRes.length > 0) setUserId(usersRes[0].id);

    const editId = sessionStorage.getItem('editSessionId');
    if (editId) {
      setEditingSession(editId);
      const session = await fetch(`/api/sessions/${editId}`).then(r => r.json());
      setDate(formatDateInput(session.date));
      setUserId(session.userId);
      setNotes(session.notes || '');
      setEntries(session.entries.map((e: {
        exerciseId: string; sets: number; reps: number; weight: number;
        rpe?: number | null; comment?: string | null; setsData?: SetData[]
      }, i: number) => {
        const sd: SetData[] = Array.isArray(e.setsData) && e.setsData.length > 0 ? e.setsData : [];
        return {
          key: String(i),
          exerciseId: e.exerciseId,
          sets: e.sets,
          reps: e.reps,
          weight: e.weight,
          rpe: e.rpe || undefined,
          comment: e.comment || undefined,
          setsData: sd,
          customSets: sd.length > 0,
        };
      }));
      sessionStorage.removeItem('editSessionId');
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const addEntry = () => {
    setEntries(prev => [...prev, {
      key: String(Date.now()), exerciseId: '', sets: 3, reps: 10, weight: 0, customSets: false, setsData: []
    }]);
  };

  const removeEntry = (key: string) => {
    setEntries(prev => prev.filter(e => e.key !== key));
  };

  const updateEntry = (key: string, field: keyof NewEntryForm, value: string | number) => {
    setEntries(prev => prev.map(e => e.key === key ? { ...e, [field]: value } : e));
  };

  const toggleCustomSets = (key: string, custom: boolean) => {
    setEntries(prev => prev.map(e => {
      if (e.key !== key) return e;
      if (custom && (!e.setsData || e.setsData.length === 0)) {
        // Wypełnij setsData na podstawie aktualnych wartości
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
      const newSets = (e.setsData || []).filter((_, i) => i !== setIdx);
      return { ...e, setsData: newSets };
    }));
  };

  const addNewExercise = async () => {
    if (!newExName.trim()) return;
    const res = await fetch('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newExName.trim() }),
    });
    if (res.ok) {
      const ex = await res.json();
      setExercises(prev => [...prev, ex].sort((a, b) => a.name.localeCompare(b.name)));
      setNewExName('');
      setShowNewEx(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !date) {
      setToast({ message: 'Wypełnij wszystkie wymagane pola', type: 'error' });
      return;
    }
    for (const entry of entries) {
      if (!entry.exerciseId) { setToast({ message: 'Wybierz ćwiczenie', type: 'error' }); return; }
      if (entry.customSets && (!entry.setsData || entry.setsData.length === 0)) {
        setToast({ message: 'Dodaj co najmniej jedną serię', type: 'error' }); return;
      }
      if (!entry.customSets && !entry.weight) {
        setToast({ message: 'Podaj ciężar', type: 'error' }); return;
      }
    }
    setSaving(true);
    try {
      const url = editingSession ? `/api/sessions/${editingSession}` : '/api/sessions';
      const method = editingSession ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, userId, notes, entries }),
      });
      if (res.ok) {
        setToast({ message: editingSession ? 'Trening zaktualizowany!' : 'Trening zapisany! 💪', type: 'success' });
        setTimeout(() => router.push('/'), 1500);
      } else {
        const err = await res.json();
        setToast({ message: err.error || 'Błąd zapisu', type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">{editingSession ? 'Edytuj trening' : 'Nowy trening'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
        {/* Date & User */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Data</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Kto trenuje</label>
            <div className="flex gap-2">
              {users.map(u => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => setUserId(u.id)}
                  className={`flex-1 py-3 rounded-xl font-medium text-base transition-colors ${
                    userId === u.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Notatki (opcjonalne)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="np. dobry dzień, PR..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900"
            />
          </div>
        </div>

        {/* Entries */}
        <div className="space-y-3">
          {entries.map((entry, idx) => (
            <div key={entry.key} className="bg-white rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">Ćwiczenie {idx + 1}</span>
                {entries.length > 1 && (
                  <button type="button" onClick={() => removeEntry(entry.key)} className="text-red-500 text-sm">Usuń</button>
                )}
              </div>

              {/* Exercise select */}
              <select
                value={entry.exerciseId}
                onChange={e => updateEntry(entry.key, 'exerciseId', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-white text-gray-900"
                required
              >
                <option value="">Wybierz ćwiczenie...</option>
                {exercises.map(ex => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </select>

              {/* Toggle trybu serii */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => toggleCustomSets(entry.key, false)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !entry.customSets ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                  }`}
                >
                  Jednakowe serie
                </button>
                <button
                  type="button"
                  onClick={() => toggleCustomSets(entry.key, true)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    entry.customSets ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                  }`}
                >
                  Różne serie
                </button>
              </div>

              {/* Tryb: jednakowe serie */}
              {!entry.customSets && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-700 font-medium mb-1">Serie</label>
                    <input
                      type="number" min="1"
                      value={entry.sets}
                      onChange={e => updateEntry(entry.key, 'sets', parseInt(e.target.value))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-center text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 font-medium mb-1">Powtórzenia</label>
                    <input
                      type="number" min="1"
                      value={entry.reps}
                      onChange={e => updateEntry(entry.key, 'reps', parseInt(e.target.value))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-center text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 font-medium mb-1">Ciężar (kg)</label>
                    <input
                      type="number" min="0" step="0.5"
                      value={entry.weight}
                      onChange={e => updateEntry(entry.key, 'weight', parseFloat(e.target.value))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-center text-gray-900"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Tryb: różne serie */}
              {entry.customSets && (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1 text-xs text-gray-700 font-medium px-1">
                    <span className="col-span-2 text-center">Seria</span>
                    <span className="col-span-4 text-center">Powt.</span>
                    <span className="col-span-5 text-center">Ciężar (kg)</span>
                    <span className="col-span-1"></span>
                  </div>
                  {(entry.setsData || []).map((set, setIdx) => (
                    <div key={setIdx} className="grid grid-cols-12 gap-1 items-center">
                      <span className="col-span-2 text-center text-sm font-semibold text-gray-700">#{setIdx + 1}</span>
                      <input
                        type="number" min="1"
                        value={set.reps}
                        onChange={e => updateSet(entry.key, setIdx, 'reps', parseInt(e.target.value) || 1)}
                        className="col-span-4 border border-gray-200 rounded-xl px-2 py-3 text-base text-center text-gray-900"
                      />
                      <input
                        type="number" min="0" step="0.5"
                        value={set.weight}
                        onChange={e => updateSet(entry.key, setIdx, 'weight', parseFloat(e.target.value) || 0)}
                        className="col-span-5 border border-gray-200 rounded-xl px-2 py-3 text-base text-center text-gray-900"
                      />
                      <button
                        type="button"
                        onClick={() => removeSet(entry.key, setIdx)}
                        className="col-span-1 text-red-400 text-lg font-bold flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addSet(entry.key)}
                    className="w-full border border-dashed border-blue-300 text-blue-600 rounded-xl py-2 text-sm font-medium"
                  >
                    + Dodaj serię
                  </button>
                </div>
              )}

              {/* RPE + komentarz */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-700 font-medium mb-1">RPE (1-10)</label>
                  <input
                    type="number" min="1" max="10" step="0.5"
                    value={entry.rpe || ''}
                    onChange={e => updateEntry(entry.key, 'rpe', parseFloat(e.target.value) || 0)}
                    placeholder="opcjonalne"
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 font-medium mb-1">Komentarz</label>
                  <input
                    type="text"
                    value={entry.comment || ''}
                    onChange={e => updateEntry(entry.key, 'comment', e.target.value)}
                    placeholder="opcjonalne"
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-gray-900"
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={addEntry}
              className="flex-1 bg-white border-2 border-dashed border-blue-300 text-blue-600 py-4 rounded-2xl font-medium"
            >
              + Dodaj ćwiczenie
            </button>
          </div>

          {showNewEx ? (
            <div className="bg-white rounded-2xl p-4 flex gap-2">
              <input
                type="text"
                value={newExName}
                onChange={e => setNewExName(e.target.value)}
                placeholder="Nazwa nowego ćwiczenia"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-gray-900"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addNewExercise())}
              />
              <button type="button" onClick={addNewExercise} className="bg-blue-600 text-white px-4 rounded-xl">Dodaj</button>
              <button type="button" onClick={() => setShowNewEx(false)} className="text-gray-600 px-3">✕</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewEx(true)}
              className="w-full text-center text-sm text-gray-700 py-2"
            >
              Nie ma ćwiczenia na liście? Dodaj nowe →
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg disabled:opacity-60"
        >
          {saving ? 'Zapisuję...' : editingSession ? 'Zaktualizuj trening' : 'Zapisz trening'}
        </button>
      </form>
    </div>
  );
}
