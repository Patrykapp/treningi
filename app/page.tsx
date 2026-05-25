'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { WorkoutSession } from '@/types';
import { formatDate } from '@/lib/utils';

export default function DashboardPage() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('selectedUserId');
    if (saved) setSelectedUser(saved);
    fetch('/api/users').then(r => r.json()).then(data => {
      setUsers(data);
      if (!saved && data.length > 0) {
        setSelectedUser(data[0].id);
        localStorage.setItem('selectedUserId', data[0].id);
      }
    });
  }, []);

  const loadSessions = useCallback(async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions?userId=${selectedUser}&limit=5`);
      const data = await res.json();
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }, [selectedUser]);

  useEffect(() => {
    if (selectedUser) {
      localStorage.setItem('selectedUserId', selectedUser);
      loadSessions();
    }
  }, [selectedUser, loadSessions]);

  const currentUser = users.find(u => u.id === selectedUser);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dziennik Treningów</h1>
            <p className="text-sm text-gray-700">Witaj, {currentUser?.name || '...'} 💪</p>
          </div>
          <div className="flex gap-2">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedUser(u.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedUser === u.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {u.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Quick add button */}
        <Link
          href="/trening"
          className="block w-full bg-blue-600 text-white text-center py-4 rounded-2xl font-semibold text-lg shadow-sm"
        >
          + Dodaj trening
        </Link>

        {/* Recent sessions */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Ostatnie treningi</h2>
          {loading ? (
            <div className="text-center py-8 text-gray-600">Ładowanie...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-gray-600 bg-white rounded-2xl">
              <p className="text-4xl mb-2">🏋️</p>
              <p>Brak treningów. Czas zacząć!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(session => (
                <div key={session.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900">{formatDate(session.date)}</span>
                    <span className="text-sm text-blue-600 font-medium">{session.user.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {session.entries.map(entry => (
                      <Link
                        key={entry.id}
                        href={`/cwiczenie/${entry.exerciseId}`}
                        className="text-sm bg-gray-100 rounded-lg px-2 py-1 text-gray-700"
                      >
                        {entry.exercise.name}: {entry.sets}×{entry.reps} @ {entry.weight}kg
                      </Link>
                    ))}
                  </div>
                  {session.notes && (
                    <p className="text-sm text-gray-700 mt-2 italic">{session.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Shortcuts */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/historia" className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <div className="text-3xl mb-1">📋</div>
            <div className="text-sm font-medium text-gray-800">Historia</div>
          </Link>
          <Link href="/ustawienia" className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <div className="text-3xl mb-1">⚙️</div>
            <div className="text-sm font-medium text-gray-800">Ustawienia</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
