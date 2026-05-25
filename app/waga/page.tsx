'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { User } from '@/types';
import { formatDate, formatDateInput } from '@/lib/utils';
import { Toast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';

interface BodyWeightEntry {
  id: string;
  date: string;
  weight: number;
  notes?: string | null;
  user: User;
}

export default function WagaPage() {
  const [entries, setEntries] = useState<BodyWeightEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { isLoggedIn } = useAuth();

  // Formularz
  const [formDate, setFormDate] = useState(formatDateInput(new Date()));
  const [formWeight, setFormWeight] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then((u: User[]) => {
      setUsers(u);
      const saved = localStorage.getItem('selectedUserId');
      const id = saved && u.find(us => us.id === saved) ? saved : u[0]?.id || '';
      setSelectedUser(id);
    });
  }, []);

  const loadEntries = useCallback(async () => {
    if (!selectedUser) return;
    setLoading(true);
    const data = await fetch(`/api/body-weight?userId=${selectedUser}`).then(r => r.json());
    setEntries(data);
    setLoading(false);
  }, [selectedUser]);

  useEffect(() => { if (selectedUser) loadEntries(); }, [selectedUser, loadEntries]);

  const handleSave = async () => {
    if (!formWeight || !selectedUser) {
      setToast({ message: 'Wpisz wagę', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/body-weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser, date: formDate, weight: parseFloat(formWeight), notes: formNotes || null }),
      });
      if (res.ok) {
        setToast({ message: 'Waga zapisana!', type: 'success' });
        setFormWeight('');
        setFormNotes('');
        loadEntries();
      } else {
        setToast({ message: 'Błąd zapisu', type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/body-weight/${id}`, { method: 'DELETE' });
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const chartData = [...entries].reverse().map(e => ({
    date: formatDate(e.date),
    waga: e.weight,
  }));

  const latest = entries[0];
  const oldest = entries[entries.length - 1];
  const diff = latest && oldest && latest.id !== oldest.id
    ? +(latest.weight - oldest.weight).toFixed(1)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-blue-600 font-medium">← Wróć</Link>
          <h1 className="text-xl font-bold text-gray-900">Śledzenie wagi</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Wybór użytkownika */}
        <div className="flex gap-2">
          {users.map(u => (
            <button
              key={u.id}
              onClick={() => setSelectedUser(u.id)}
              className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                selectedUser === u.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'
              }`}
            >
              {u.name}
            </button>
          ))}
        </div>

        {/* Statystyki */}
        {!loading && entries.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <div className="text-xl font-bold text-blue-600">{latest?.weight}kg</div>
              <div className="text-xs text-gray-600 font-medium mt-0.5">Ostatnia</div>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <div className="text-xl font-bold text-gray-900">
                {Math.min(...entries.map(e => e.weight))}kg
              </div>
              <div className="text-xs text-gray-600 font-medium mt-0.5">Minimum</div>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <div className={`text-xl font-bold ${diff === null ? 'text-gray-900' : diff > 0 ? 'text-red-500' : 'text-green-600'}`}>
                {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff}kg`}
              </div>
              <div className="text-xs text-gray-600 font-medium mt-0.5">Zmiana</div>
            </div>
          </div>
        )}

        {/* Wykres */}
        {chartData.length >= 2 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Wykres wagi</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} unit="kg" domain={['auto', 'auto']} />
                <Tooltip formatter={(v) => [`${v}kg`, 'Waga']} />
                <Line type="monotone" dataKey="waga" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Formularz dodawania */}
        {isLoggedIn && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <h3 className="font-bold text-gray-900">Dodaj pomiar</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Waga (kg)</label>
                <input
                  type="number"
                  min="30"
                  max="300"
                  step="0.1"
                  value={formWeight}
                  onChange={e => setFormWeight(e.target.value)}
                  placeholder="np. 82.5"
                  className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-gray-900"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notatka (opcjonalne)</label>
              <input
                type="text"
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="np. rano, przed śniadaniem"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold disabled:opacity-60"
            >
              {saving ? 'Zapisuję...' : 'Zapisz pomiar'}
            </button>
          </div>
        )}

        {!isLoggedIn && (
          <Link
            href="/login"
            className="block w-full bg-gray-100 text-gray-700 text-center py-4 rounded-2xl font-medium"
          >
            🔒 Zaloguj się aby dodawać pomiary
          </Link>
        )}

        {/* Historia */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Historia</h3>
          {loading ? (
            <div className="text-center py-8 text-gray-600">Ładowanie...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-gray-600 bg-white rounded-2xl">
              <p className="text-4xl mb-2">⚖️</p>
              <p>Brak pomiarów. Dodaj pierwszy!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map(entry => (
                <div key={entry.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">{formatDate(entry.date)}</span>
                    <span className="ml-2 text-xl font-bold text-blue-600">{entry.weight}kg</span>
                    {entry.notes && <p className="text-xs text-gray-500 mt-0.5">{entry.notes}</p>}
                  </div>
                  {isLoggedIn && (
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-red-400 text-sm px-2 py-1"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
