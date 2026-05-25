'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Exercise, User, NewEntryForm } from '@/types';
import { formatDateInput } from '@/lib/utils';
import { Toast } from '@/components/ui/Toast';

interface EntryRow extends NewEntryForm {
  key: string;
}

export default function TreningPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [notes, setNotes] = useState('');
  const [entries, setEntries] = useState<EntryRow[]>([{ key: '0', exerciseId: '', sets: 3, reps: 10, weight: 0 }]);
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

    // Check if editing
    const editId = sessionStorage.getItem('editSessionId');
    if (editId) {
      setEditingSession(editId);
      const session = await fetch(`/api/sessions/${editId}`).then(r => r.json());
      setDate(formatDateInput(session.date));
      setUserId(session.userId);
      setNotes(session.notes || '');
      setEntries(session.entries.map((e: { exerciseId: string; sets: number; reps: number; weight: number; rpe?: number | null; comment?: string | null }, i: number) => ({
        key: String(i),
        exerciseId: e.exerciseId,
        sets: e.sets,
        reps: e.reps,
        weight: e.weight,
        rpe: e.rpe || undefined,
        comment: e.comment || undefined,
      })));
      sessionStorage.removeItem('editSessionId');
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const addEntry = () => {
    setEntries(prev => [...prev, { key: String(Date.now()), exerciseId: '', sets: 3, reps: 10, weight: 0 }]);
  };

  const removeEntry = (key: string) => {
    setEntries(prev => prev.filter(e => e.key !== key));
  };

  const updateEntry = (key: string, field: keyof NewEntryForm, value: string | number) => {
    setEntries(prev => prev.map(e => e.key === key ? { ...e, [field]: value } : e));
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
    if (!userId || !date || entries.some(e => !e.exerciseId || !e.weight)) {
      setToast({ message: 'Wypełnij wszystkie wymagane pola', type: 'error' });
      return;
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
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base"
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
                    userId === u.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
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
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base"
            />
          </div>
        </div>

        {/* Entries */}
        <div className="space-y-3">
          {entries.map((entry, idx) => (
            <div key={entry.key} className="bg-white rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-gray-900">Ćwiczenie {idx + 1}</span>
                {entries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.key)}
                    className="text-red-400 text-sm"
                  >
                    Usuń
                  </button>
                )}
              </div>
              {/* Exercise select */}
              <div>
                <select
                  value={entry.exerciseId}
                  onChange={e => updateEntry(entry.key, 'exerciseId', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-white"
                  required
                >
                  <option value="">Wybierz ćwiczenie...</option>
                  {exercises.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </div>
              {/* Sets / Reps / Weight */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-700 font-medium mb-1">Serie</label>
                  <input
                    type="number"
                    min="1"
                    value={entry.sets}
                    onChange={e => updateEntry(entry.key, 'sets', parseInt(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-center"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 font-medium mb-1">Powtórzenia</label>
                  <input
                    type="number"
                    min="1"
                    value={entry.reps}
                    onChange={e => updateEntry(entry.key, 'reps', parseInt(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-center"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 font-medium mb-1">Ciężar (kg)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={entry.weight}
                    onChange={e => updateEntry(entry.key, 'weight', parseFloat(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base text-center"
                    required
                  />
                </div>
              </div>
              {/* RPE + comment (collapsible) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-700 font-medium mb-1">RPE (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    value={entry.rpe || ''}
                    onChange={e => updateEntry(entry.key, 'rpe', parseFloat(e.target.value) || 0)}
                    placeholder="opcjonalne"
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 font-medium mb-1">Komentarz</label>
                  <input
                    type="text"
                    value={entry.comment || ''}
                    onChange={e => updateEntry(entry.key, 'comment', e.target.value)}
                    placeholder="opcjonalne"
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-base"
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Add exercise */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addEntry}
              className="flex-1 bg-white border-2 border-dashed border-blue-300 text-blue-600 py-4 rounded-2xl font-medium"
            >
              + Dodaj ćwiczenie
            </button>
          </div>

          {/* Quick add new exercise */}
          {showNewEx ? (
            <div className="bg-white rounded-2xl p-4 flex gap-2">
              <input
                type="text"
                value={newExName}
                onChange={e => setNewExName(e.target.value)}
                placeholder="Nazwa nowego ćwiczenia"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3"
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

        {/* Submit */}
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
