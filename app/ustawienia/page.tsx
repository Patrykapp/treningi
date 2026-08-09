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
import { X, Pencil, Trash2, Link2, Download, Upload, LogOut, ChevronRight, Bell, UserPlus, ShieldCheck, Copy, Check, RefreshCw } from 'lucide-react';

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

const REMINDER_SETTINGS_KEY = 'reminderSettings';

// Przypomnienie o treningu (banner na dashboardzie) — ustawienia trzymane
// lokalnie w localStorage, bez żadnej infrastruktury serwerowej (v1).
function useReminderSettings() {
  const [enabled, setEnabled] = useState(true);
  const [thresholdDays, setThresholdDays] = useState(3);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REMINDER_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.enabled === 'boolean') setEnabled(parsed.enabled);
        if (typeof parsed.thresholdDays === 'number' && parsed.thresholdDays > 0) setThresholdDays(parsed.thresholdDays);
      }
    } catch { /* uszkodzone ustawienia — zostają domyślne */ }
  }, []);

  const save = (next: { enabled: boolean; thresholdDays: number }) => {
    setEnabled(next.enabled);
    setThresholdDays(next.thresholdDays);
    try { localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(next)); } catch { /* pełny storage */ }
  };

  return { enabled, thresholdDays, save };
}

interface UserOption { id: string; name: string; }

/** Konto w sekcji administratora — z kodem dostępu i liczbą treningów. */
interface ManagedUser {
  id: string; name: string; accessCode: string | null;
  isolated: boolean; isAdmin: boolean; sessions: number;
}

/** Losowy pięciocyfrowy kod. Bez zer wiodących, żeby dało się go dyktować. */
function randomCode(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
}

export default function UstawieniaPage() {
  const router = useRouter();
  const { dark, toggle: toggleDark } = useDarkMode();
  const reminder = useReminderSettings();
  // Kopia wartości pola jako tekst — inaczej nie da się skasować cyfry,
  // bo kontrolka natychmiast wracałaby do liczby z ustawień.
  const [thresholdInput, setThresholdInput] = useState('3');
  useEffect(() => {
    setThresholdInput(String(reminder.thresholdDays));
  }, [reminder.thresholdDays]);
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
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');
  const [merging, setMerging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Zarządzanie kontami — widoczne wyłącznie dla administratora. O tym, kto nim
  // jest, decyduje serwer; tutaj tylko chowamy sekcję.
  const [isAdmin, setIsAdmin] = useState(false);
  const [accounts, setAccounts] = useState<ManagedUser[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserCode, setNewUserCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdUser, setCreatedUser] = useState<{ name: string; code: string } | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

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

  // Sekcja kont. Serwer sam decyduje, czy odpowiedzieć listą, czy odmówić —
  // ukrycie przycisku niczego by nie zabezpieczyło.
  const loadAccounts = () => {
    fetch('/api/users/manage')
      .then(r => (r.ok ? r.json() : { isAdmin: false, users: [] }))
      .then((d: { isAdmin?: boolean; users?: ManagedUser[] }) => {
        setIsAdmin(Boolean(d?.isAdmin));
        setAccounts(Array.isArray(d?.users) ? d.users : []);
      })
      .catch(() => {});
  };
  useEffect(loadAccounts, []);
  useEffect(() => { if (isAdmin && !newUserCode) setNewUserCode(randomCode()); }, [isAdmin, newUserCode]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

  const createUser = async () => {
    const name = newUserName.trim();
    if (name.length < 2) { showToast('Podaj imię', 'error'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, accessCode: newUserCode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(body?.error || 'Nie udało się dodać konta', 'error'); return; }
      setCreatedUser({ name, code: newUserCode });
      setNewUserName('');
      setNewUserCode(randomCode());
      setCodeCopied(false);
      loadAccounts();
      showToast(`Konto „${name}" utworzone`);
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      showToast('Przeglądarka nie pozwoliła skopiować', 'error');
    }
  };

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

  const mergeExercises = async () => {
    if (!mergeFrom || !mergeTo || mergeFrom === mergeTo) return;
    setMerging(true);
    const res = await fetch('/api/exercises/merge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId: mergeTo, deleteId: mergeFrom }),
    });
    if (res.ok) {
      const data = await res.json();
      setExercises(prev => prev.filter(e => e.id !== mergeFrom));
      setMergeFrom(''); setMergeTo('');
      showToast(`Scalono "${data.deletedName}" → "${data.keptName}" (${data.movedEntries} wpisów)`);
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Blad scalania', 'error');
    }
    setMerging(false);
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

      <div className="px-4 py-4 space-y-6 md:max-w-3xl lg:max-w-4xl md:mx-auto">
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-800 mb-3">Konto</h2>
          <div className="space-y-1 mb-4">
            <p className="text-sm text-gray-700"><span className="font-medium">Imie:</span> {authName || '...'}</p>
            <p className="text-sm text-gray-700"><span className="font-medium">Email:</span> {authEmail || '...'}</p>
          </div>
          <button onClick={handleLogout} className="w-full bg-red-50 text-red-600 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors hover:bg-red-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <LogOut className="w-4 h-4" strokeWidth={2} />
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
                  className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <span className="text-sm font-medium text-gray-800">{u.name}</span>
                  <span className="text-xs text-blue-600 flex items-center gap-1">Zobacz profil <ChevronRight className="w-4 h-4" strokeWidth={2} /></span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Konta — tylko administrator. Nowe konto powstaje jako boczne:
            bez rywalizacji na pulpicie i bez zapisu ćwiczeń za innych, dokładnie
            tak jak konto Maćka. */}
        {isAdmin && (
          <section className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" strokeWidth={2} /> Konta
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Widoczne tylko dla ciebie. Nowe konto loguje się swoim kodem i działa „z boku":
              bez porównań na pulpicie, bez zapisywania ćwiczeń za innych. Historię i wykresy widać wzajemnie.
            </p>

            <div className="space-y-2 mb-4">
              {accounts.map(u => (
                <div key={u.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-gray-50">
                  <span className="min-w-0">
                    <span className="text-sm font-medium text-gray-800">{u.name}</span>
                    {u.isAdmin && <span className="ml-2 text-[11px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">administrator</span>}
                    {u.isolated && <span className="ml-2 text-[11px] bg-gray-200 text-gray-600 rounded px-1.5 py-0.5">konto boczne</span>}
                    <span className="block text-xs text-gray-500">
                      {u.sessions} {u.sessions === 1 ? 'trening' : 'treningów'}
                      {u.accessCode ? ` · kod ${u.accessCode}` : ' · logowanie hasłem'}
                    </span>
                  </span>
                  {u.accessCode && (
                    <button
                      onClick={() => copyCode(u.accessCode!)}
                      className="p-2 text-gray-400 hover:text-blue-600 shrink-0 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label={`Kopiuj kod konta ${u.name}`}
                    >
                      <Copy className="w-4 h-4" strokeWidth={2} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {createdUser && (
              <div className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-900">
                  Konto <strong>{createdUser.name}</strong> gotowe. Kod do logowania:
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-black tracking-widest text-green-900">{createdUser.code}</span>
                  <button
                    onClick={() => copyCode(createdUser.code)}
                    className="p-2 text-green-700 rounded-lg hover:bg-green-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label="Kopiuj kod"
                  >
                    {codeCopied ? <Check className="w-4 h-4" strokeWidth={2} /> : <Copy className="w-4 h-4" strokeWidth={2} />}
                  </button>
                </div>
                <p className="text-xs text-green-800 mt-1">Podaj go tej osobie — wpisuje go na ekranie logowania.</p>
              </div>
            )}

            <div className="space-y-2">
              <input
                value={newUserName}
                onChange={e => setNewUserName(e.target.value)}
                placeholder="Imię (np. Tomek)"
                maxLength={30}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
              />
              <div className="flex gap-2">
                <input
                  value={newUserCode}
                  onChange={e => setNewUserCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  inputMode="numeric"
                  placeholder="Kod dostępu (4-8 cyfr)"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm tracking-widest"
                />
                <button
                  onClick={() => setNewUserCode(randomCode())}
                  className="px-3 rounded-xl border border-gray-200 text-gray-500 shrink-0 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="Wylosuj inny kod"
                >
                  <RefreshCw className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
              <button
                onClick={createUser}
                disabled={creating || newUserName.trim().length < 2 || newUserCode.length < 4}
                className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <UserPlus className="w-4 h-4" strokeWidth={2} />
                {creating ? 'Zakładam…' : 'Dodaj konto'}
              </button>
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-800">Wyglad</h2>
            <button onClick={toggleDark}
              className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${dark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-200 hover:bg-gray-300'}`}>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${dark ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">{dark ? 'Ciemny motyw' : 'Jasny motyw'}</p>
        </section>

        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-800 flex items-center gap-1.5">
              <Bell className="w-4 h-4" strokeWidth={2} /> Przypomnienia
            </h2>
            <button
              onClick={() => reminder.save({ enabled: !reminder.enabled, thresholdDays: reminder.thresholdDays })}
              className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${reminder.enabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-200 hover:bg-gray-300'}`}>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${reminder.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">Baner na dashboardzie, gdy dawno nie było treningu</p>
          {reminder.enabled && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-sm text-gray-700">Przypomnij po</span>
              <input
                type="number"
                min={1}
                max={14}
                value={thresholdInput}
                onChange={e => {
                  // Pole trzyma tekst, żeby dało się je wyczyścić i wpisać
                  // wartość od nowa. Do ustawień zapisujemy tylko sensowne liczby.
                  const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
                  setThresholdInput(raw);
                  const v = parseInt(raw, 10);
                  if (Number.isFinite(v) && v > 0 && v <= 14) {
                    reminder.save({ enabled: reminder.enabled, thresholdDays: v });
                  }
                }}
                onBlur={() => setThresholdInput(String(reminder.thresholdDays))}
                className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-sm text-gray-700">dniach bez treningu</span>
            </div>
          )}
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded">
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
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
                      <button onClick={saveEditExercise} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium transition-colors hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">Zapisz</button>
                      <button onClick={() => setEditingEx(null)} className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm transition-colors hover:bg-gray-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">Anuluj</button>
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
                        className="text-blue-500 hover:text-blue-700 text-sm px-2 py-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                        <Pencil className="w-4 h-4" strokeWidth={2} />
                      </button>
                      <button onClick={() => setConfirmDelete({ type: 'exercise', id: ex.id })}
                        className="text-red-400 hover:text-red-600 text-sm px-2 py-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                        <Trash2 className="w-4 h-4" strokeWidth={2} />
                      </button>
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
            <button onClick={addExercise} className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-medium text-sm transition-colors hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              Dodaj cwiczenie
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-800 mb-1">Scal duplikaty ćwiczeń</h2>
          <p className="text-xs text-gray-500 mb-3">
            Historia, ulubione i szablony zostaną przeniesione do ćwiczenia docelowego, a duplikat usunięty.
          </p>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Duplikat (do usunięcia)</label>
              <select value={mergeFrom} onChange={e => setMergeFrom(e.target.value)}
                className="w-full min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                <option value="">— wybierz —</option>
                {exercises.filter(e => e.id !== mergeTo).map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ćwiczenie docelowe (zostaje)</label>
              <select value={mergeTo} onChange={e => setMergeTo(e.target.value)}
                className="w-full min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                <option value="">— wybierz —</option>
                {exercises.filter(e => e.id !== mergeFrom).map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <button onClick={mergeExercises} disabled={!mergeFrom || !mergeTo || merging}
              className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-colors hover:bg-orange-600 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              <Link2 className="w-4 h-4" strokeWidth={2} />
              {merging ? 'Scalanie...' : 'Scal ćwiczenia'}
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <h2 className="font-bold text-gray-800">Dane</h2>
          <button onClick={handleExport} className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors hover:bg-gray-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <Download className="w-4 h-4" strokeWidth={2} />
            Eksportuj dane (CSV)
          </button>
          <div>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" id="csv-import" />
            <label htmlFor="csv-import" className={`block w-full text-center bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-medium cursor-pointer flex items-center justify-center gap-2 transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${importing ? 'opacity-50' : ''}`}>
              <Upload className="w-4 h-4" strokeWidth={2} />
              {importing ? 'Importuje...' : 'Importuj dane (CSV)'}
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
