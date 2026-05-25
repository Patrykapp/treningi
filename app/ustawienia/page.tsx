'use client';

import { useState, useEffect, useRef } from 'react';
import { User, Exercise } from '@/types';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import Papa from 'papaparse';

export default function UstawieniaPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newExName, setNewExName] = useState('');
  const [newExGroup, setNewExGroup] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'user' | 'exercise'; id: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportUserId, setExportUserId] = useState('');
  const [editingEx, setEditingEx] = useState<{ id: string; name: string; muscleGroup: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(setUsers);
    fetch('/api/exercises').then(r => r.json()).then(setExercises);
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  // Users
  const addUser = async () => {
    if (!newUserName.trim()) return;
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newUserName.trim() }),
    });
    if (res.ok) {
      const user = await res.json();
      setUsers(prev => [...prev, user]);
      setNewUserName('');
      showToast('Użytkownik dodany');
    } else {
      showToast('Błąd dodawania', 'error');
    }
  };

  const deleteUser = async (id: string) => {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== id));
      showToast('Użytkownik usunięty');
    } else {
      showToast('Błąd usuwania', 'error');
    }
    setConfirmDelete(null);
  };

  // Exercises
  const addExercise = async () => {
    if (!newExName.trim()) return;
    const res = await fetch('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newExName.trim(), muscleGroup: newExGroup.trim() || null }),
    });
    if (res.ok) {
      const ex = await res.json();
      setExercises(prev => [...prev, ex].sort((a, b) => a.name.localeCompare(b.name)));
      setNewExName('');
      setNewExGroup('');
      showToast('Ćwiczenie dodane');
    } else {
      const err = await res.json();
      showToast(err.error || 'Błąd', 'error');
    }
  };

  const deleteExercise = async (id: string) => {
    const res = await fetch(`/api/exercises/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setExercises(prev => prev.filter(e => e.id !== id));
      showToast('Ćwiczenie usunięte');
    } else {
      showToast('Błąd usuwania', 'error');
    }
    setConfirmDelete(null);
  };

  const saveEditExercise = async () => {
    if (!editingEx || !editingEx.name.trim()) return;
    const res = await fetch(`/api/exercises/${editingEx.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingEx.name.trim(), muscleGroup: editingEx.muscleGroup.trim() || null }),
    });
    if (res.ok) {
      const updated = await res.json();
      setExercises(prev => prev.map(e => e.id === updated.id ? updated : e).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingEx(null);
      showToast('Ćwiczenie zaktualizowane');
    } else {
      showToast('Błąd zapisu', 'error');
    }
  };

  // CSV Export
  const handleExport = () => {
    const url = exportUserId ? `/api/export?userId=${exportUserId}` : '/api/export';
    window.open(url, '_blank');
  };

  // CSV Import
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
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: results.data }),
          });
          const data = await res.json();
          if (res.ok) {
            showToast(`Zaimportowano ${data.imported} wpisów${data.skipped ? `, pominięto ${data.skipped}` : ''}`);
          } else {
            showToast(data.error || 'Błąd importu', 'error');
          }
        } finally {
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: () => {
        showToast('Błąd parsowania CSV', 'error');
        setImporting(false);
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          isOpen={true}
          message={confirmDelete.type === 'user' ? 'Usunąć użytkownika? Spowoduje to usunięcie wszystkich jego treningów.' : 'Usunąć ćwiczenie?'}
          onConfirm={() => confirmDelete.type === 'user' ? deleteUser(confirmDelete.id) : deleteExercise(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">Ustawienia</h1>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Users */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-800 mb-3">👤 Użytkownicy</h2>
          <div className="space-y-2 mb-3">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="font-medium text-gray-900">{u.name}</span>
                <button
                  onClick={() => setConfirmDelete({ type: 'user', id: u.id })}
                  className="text-red-400 text-sm px-2"
                >
                  Usuń
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newUserName}
              onChange={e => setNewUserName(e.target.value)}
              placeholder="Imię nowego użytkownika"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3"
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addUser())}
            />
            <button onClick={addUser} className="bg-blue-600 text-white px-4 rounded-xl font-medium">Dodaj</button>
          </div>
        </section>

        {/* Exercises */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-800 mb-3">🏋️ Ćwiczenia ({exercises.length})</h2>
          <div className="space-y-1 mb-3 max-h-72 overflow-y-auto">
            {exercises.map(ex => (
              <div key={ex.id} className="border-b border-gray-100 py-2">
                {editingEx?.id === ex.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editingEx.name}
                      onChange={e => setEditingEx({ ...editingEx, name: e.target.value })}
                      className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={editingEx.muscleGroup}
                      onChange={e => setEditingEx({ ...editingEx, muscleGroup: e.target.value })}
                      placeholder="Grupa mięśniowa"
                      className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEditExercise} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium">Zapisz</button>
                      <button onClick={() => setEditingEx(null)} className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm">Anuluj</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm text-gray-900">{ex.name}</span>
                      {ex.muscleGroup && <span className="ml-2 text-xs text-gray-500 font-normal">{ex.muscleGroup}</span>}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => setEditingEx({ id: ex.id, name: ex.name, muscleGroup: ex.muscleGroup || '' })}
                        className="text-blue-500 text-sm px-2 py-1"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ type: 'exercise', id: ex.id })}
                        className="text-red-400 text-sm px-2 py-1"
                      >
                        Usuń
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={newExName}
              onChange={e => setNewExName(e.target.value)}
              placeholder="Nazwa ćwiczenia"
              className="w-full border border-gray-200 rounded-xl px-4 py-3"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={newExGroup}
                onChange={e => setNewExGroup(e.target.value)}
                placeholder="Grupa mięśniowa (opcjonalne)"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addExercise())}
              />
              <button onClick={addExercise} className="bg-blue-600 text-white px-4 rounded-xl font-medium">Dodaj</button>
            </div>
          </div>
        </section>

        {/* Export */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-800 mb-3">📤 Eksport CSV</h2>
          <p className="text-sm text-gray-500 mb-3">Pobierz wszystkie treningi jako plik CSV.</p>
          <div className="flex gap-2 mb-3">
            <select
              value={exportUserId}
              onChange={e => setExportUserId(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-3 bg-white"
            >
              <option value="">Wszyscy użytkownicy</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <button
            onClick={handleExport}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-medium"
          >
            Pobierz CSV
          </button>
        </section>

        {/* Import */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-800 mb-3">📥 Import CSV</h2>
          <p className="text-sm text-gray-500 mb-2">
            Format pliku CSV (nagłówki):
          </p>
          <code className="block text-xs bg-gray-100 p-2 rounded-lg mb-3 text-gray-700 overflow-x-auto">
            data,uzytkownik,cwiczenie,grupa_miesniowa,serie,powt,ciezar_kg,rpe,komentarz,id_sesji
          </code>
          <p className="text-xs text-gray-400 mb-3">
            Przykład: 2025-01-15,Patryk,Wyciskanie sztangi,Klatka,4,8,80,7,,
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="w-full bg-orange-500 text-white py-3 rounded-xl font-medium disabled:opacity-60"
          >
            {importing ? 'Importuję...' : 'Wybierz plik CSV'}
          </button>
        </section>
      </div>
    </div>
  );
}
