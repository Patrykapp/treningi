'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Exercise } from '@/types';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { activeSession } from '@/hooks/useActiveSession';
import Papa from 'papaparse';

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(localStorage.getItem('darkMode') === 'true'); }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('darkMode', String(next));
    if (next) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  };
  return { dark, toggle };
}

interface UserOption { id: string; name: string; }

export default function UstawieniaPage() {
  const router = useRouter();
  const { dark, toggle: toggleDark } = useDarkMode();
  const { name: authName, email: authEmail, userId: authUserId } = useAuth();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [otherUsers, setOtherUsers] = useState<UserOption[]>([]);
  const [exSearch, setExSearch] = useState('');
  const [newExName, setNewExName] = useState('');
  const [newExGroup, setNewExGroup] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'exercise'; id: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingEx, setEditingEx] = useState<{ id: string; name: string; muscleGroup: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/exercises').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setExercises(data);
    });
    fetch('/api/users').then(r => r.json()).then(data => {
      if (Array.isArray(data) && authUserId) {
        setOtherUsers(data.filter((u: UserOption) => u.id !== authUserId));
      }
    }).catch(() => {});
  }, [authUserId]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

  const addExercise = async () => {
    if (!newExName.trim()) return;
    const res = await fetch('/api/exercises', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newExName.trim(), muscleGroup: newExGroup.trim() || null }),
    });
    if (res.ok) {
      const ex = await res.json();
      setExercises(prev => [...prev, ex].sort((a, b) => a.name.localeCompare(b.name)));
      setNewExName(''); setNewExGroup('');
      showToast('Cwiczenie dodane');
    } else {
      const err = await res.json();
      showToast(err.error || 'Blad', 'error');
    }
  };

  const deleteExercise = async (id: string) => {
    const res = await fetch(`/api/exercises/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setExercises(prev => prev.filter(e => e.id !== id));
      showToast('Cwiczenie usuniete');
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Blad usuwania', 'error');
    }
    setConfirmDelete(null);
  };

  const saveEditExercise = async () => {
    if (!editingEx || !editingEx.name.trim()) return;
    const res = await fetch(`/api/exercises/${editingEx.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingEx.name.trim(), muscleGroup: editingEx.muscleGroup.trim() || null }),
    });
    if (res.ok) {
      const updated = await res.json();
      setExercises(prev => prev.map(e => e.id === updated.id ? updated : e).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingEx(null);
      showToast('Cwiczenie zaktualizowane');
    } else {
      showToast('Blad zapisu', 'error');
    }
  };

  const handleExport = () => window.open('/api/export', '_blank');

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const res = await fetch('/api/import', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: results.data }),
          });
          const data = await res.json();
          if (res.ok) showToast(`Zaimportowano ${data.imported} wpisow`);
          else showToast(data.error || 'Blad importu', 'error');
        } finally {
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: () => { showToast('Blad parsowania CSV', 'error'); setImporting(false); },
    });
  };

  const handleLogout = async () => {
    activeSession.clearAll();
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          isOpen={true}
          message="Usunac cwiczenie?"
          onConfirm={() => deleteExercise(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">Ustawienia</h1>
      </div>

      <div className="px-4 py-4 space-y-6">
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-800 mb-3">Konto</h2>
          <div className="space-y-1 mb-4">
            <p className="text-sm text-gray-700"><span className="font-medium">Imie:</span> {authName || '...'}</p>
            <p className="text-sm text-gray-700"><span className="font-medium">Email:</span> {authEmail || '...'}</p>
          </div>
          <button onClick={handleLogout} className="w-full bg-red-50 text-red-600 py-3 rounded-xl font-medium text-sm">
            Wyloguj sie
          </button>
        </section>

        {otherUsers.length > 0 && (
          <section className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="font-bold text-gray-800 mb-3">Uzytkownicy</h2>
            <div className="space-y-2">
              {otherUsers.map(u => (
                <Link
                  key={u.id}
                  href={`/profil/${u.id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800">{u.name}</span>
                  <span className="text-xs text-blue-600">Zobacz profil</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-800">Wyglad</h2>
            <button onClick={toggleDark}
              className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors ${dark ? 'bg-blue-600' : 'bg-gray-200'}`}>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${dark ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">{dark ? 'Ciemny motyw' : 'Jasny motyw'}</p>
        </section>

        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-800 mb-3">Cwiczenia ({exercises.length})</h2>
          <div className="relative mb-2">
            <input
              type="text"
              value={exSearch}
              onChange={e => setExSearch(e.target.value)}
              placeholder="Szukaj cwiczenia..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-9 text-sm bg-gray-50"
            />
            {exSearch && (
              <button onClick={() => setExSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg leading-none">×</button>
            )}
          </div>
          <div className="space-y-1 mb-3 max-h-72 overflow-y-auto">
            {exercises.filter(ex => {
              const q = exSearch.trim().toLowerCase();
              if (!q) return true;
              return ex.name.toLowerCase().includes(q) || (ex.muscleGroup || '').toLowerCase().includes(q);
            }).map(ex => (
              <div key={ex.id} className="border-b border-gray-100 py-2">
                {editingEx?.id === ex.id ? (
                  <div className="space-y-2">
                    <input type="text" value={editingEx.name} onChange={e => setEditingEx({ ...editingEx, name: e.target.value })}
                      className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm" autoFocus />
                    <input type="text" value={editingEx.muscleGroup} onChange={e => setEditingEx({ ...editingEx, muscleGroup: e.target.value })}
                      placeholder="Grupa miesniowa" className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm" />
                    <div className="flex gap-2">
                      <button onClick={saveEditExercise} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium">Zapisz</button>
                      <button onClick={() => setEditingEx(null)} className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm">Anuluj</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm text-gray-900">{ex.name}</span>
                      {ex.muscleGroup && <span className="ml-2 text-xs text-gray-500">{ex.muscleGroup}</span>}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <button onClick={() => setEditingEx({ id: ex.id, name: ex.name, muscleGroup: ex.muscleGroup || '' })}
                        className="text-blue-500 text-sm px-2 py-1">Edit</button>
                      <button onClick={() => setConfirmDelete({ type: 'exercise', id: ex.id })}
                        className="text-red-400 text-sm px-2 py-1">Del</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <input type="text" value={newExName} onChange={e => setNewExName(e.target.value)} placeholder="Nazwa cwiczenia"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addExercise())} />
            <input type="text" value={newExGroup} onChange={e => setNewExGroup(e.target.value)} placeholder="Grupa miesniowa (opcjonalnie)"
              className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm" />
            <button onClick={addExercise} className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-medium text-sm">
              Dodaj cwiczenie
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <h2 className="font-bold text-gray-800">Dane</h2>
          <button onClick={handleExport} className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-medium">
            Eksportuj dane (CSV)
          </button>
          <div>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" id="csv-import" />
            <label htmlFor="csv-import" className={`block w-full text-center bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-medium cursor-pointer ${importing ? 'opacity-50' : ''}`}>
              {importing ? 'Importuje...' : 'Importuj dane (CSV)'}
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
