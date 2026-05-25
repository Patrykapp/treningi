'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { WorkoutSession, Exercise } from '@/types';
import { formatDate } from '@/lib/utils';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';

export default function HistoriaPage() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterExerciseId, setFilterExerciseId] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/exercises').then(r => r.json()).then(setExercises);
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (filterFrom) params.set('from', filterFrom);
    if (filterTo) params.set('to', filterTo);
    const data = await fetch(`/api/sessions?${params}`).then(r => r.json());
    const filtered = filterExerciseId
      ? (Array.isArray(data) ? data : []).filter((s: WorkoutSession) => s.entries.some(e => e.exerciseId === filterExerciseId))
      : (Array.isArray(data) ? data : []);
    setSessions(filtered);
    setLoading(false);
  }, [filterExerciseId, filterFrom, filterTo]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setToast({ message: 'Trening usuniety', type: 'success' });
      setSessions(prev => prev.filter(s => s.id !== id));
    } else {
      setToast({ message: 'Blad usuwania', type: 'error' });
    }
    setConfirmDelete(null);
  };

  const handleEdit = (sessionId: string) => {
    router.push(`/trening?sessionId=${sessionId}`);
  };

  const clearFilters = () => {
    setFilterExerciseId('');
    setFilterFrom('');
    setFilterTo('');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          isOpen={true}
          message="Usunac ten trening? Nie mozna cofnac."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">Historia treningow</h1>
      </div>

      <div className="bg-white border-b px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <select
            value={filterExerciseId}
            onChange={e => setFilterExerciseId(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
          >
            <option value="">Wszystkie cwiczenia</option>
            {exercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          {(filterExerciseId || filterFrom || filterTo) && (
            <button onClick={clearFilters} className="px-3 py-2 text-sm text-blue-600 font-medium">Reset</button>
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="text-center py-8 text-gray-600">Ladowanie...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-600 bg-white rounded-2xl">
            <p className="text-4xl mb-2">🔍</p>
            <p>Brak wynikow</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 font-medium">{sessions.length} treningow</p>
            {sessions.map(session => (
              <div key={session.id} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-bold text-gray-900">{formatDate(session.date)}</span>
                    <span className="ml-2 text-sm text-blue-600 font-medium">{session.user?.name}</span>
                  </div>
                  {isLoggedIn && (
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(session.id)} className="text-sm text-gray-500 px-2 py-1">Edit</button>
                      <button onClick={() => setConfirmDelete(session.id)} className="text-sm text-red-400 px-2 py-1">Del</button>
                    </div>
                  )}
                </div>
                {session.notes && <p className="text-sm text-gray-700 italic mb-2">{session.notes}</p>}
                <div className="space-y-1">
                  {session.entries.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between py-1">
                      <Link href={`/cwiczenie/${entry.exerciseId}`} className="text-sm font-medium text-gray-900 flex-1">
                        {entry.exercise?.name}
                      </Link>
                      <div className="text-sm text-gray-700 text-right">
                        {Array.isArray(entry.setsData) && entry.setsData.length > 0 ? (
                          <span>
                            {entry.setsData.map((s, i) => (
                              <span key={i}>
                                {i > 0 && <span className="text-gray-400 mx-0.5">·</span>}
                                {s.reps}x<strong>{s.weight}kg</strong>
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span>{entry.sets}x{entry.reps} @ <strong>{entry.weight}kg</strong></span>
                        )}
                        {entry.rpe && <span className="ml-1 text-xs text-gray-500">RPE {entry.rpe}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
