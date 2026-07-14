'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Exercise, NewEntryForm, SetData } from '@/types';
import { formatDateInput } from '@/lib/utils';
import { fetchExercises, invalidateExerciseCache } from '@/lib/exerciseCache';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ExerciseSearch } from '@/components/ui/ExerciseSearch';
import { RestTimer } from '@/components/ui/RestTimer';
import { activeSession } from '@/hooks/useActiveSession';
import { useAuth } from '@/hooks/useAuth';
import { parseTcx, TcxSummary } from '@/lib/tcx';
import { SkeletonCard, Skeleton } from '@/components/ui/Skeleton';
import {
  X, Plus, Minus, Check, Trash2, Sparkles, RotateCcw, ArrowRight, Watch,
  Flame, Timer, HeartPulse, Users, Clipboard, AlertTriangle,
} from 'lucide-react';

function formatDur(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

interface EntryRow extends NewEntryForm {
  key: string;
  customSets: boolean;
  bodyweight: boolean;
}

interface Template {
  id: string;
  name: string;
  entries: { exerciseId: string; sets: number; reps: number; weight: number }[];
}

interface LastResult {
  sets: number;
  reps: number;
  weight: number;
  rpe: number | null;
  date: string;
  setsData: SetData[];
}

// Szacowany 1RM (wzór Epley)
function calc1RM(weight: number, reps: number): number | null {
  if (weight <= 0 || reps <= 0) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Sugestia progresji na podstawie ostatniego wyniku
function progressionHint(last: LastResult): string {
  const maxW = last.setsData.length > 0 ? Math.max(...last.setsData.map(s => s.weight)) : last.weight;
  if (maxW <= 0) return 'spróbuj +1 powtórzenie';
  if (last.rpe != null && last.rpe > 8.5) return `zostań przy ${maxW}kg (RPE ${last.rpe})`;
  return `spróbuj ${(maxW + 2.5).toLocaleString('pl-PL')}kg`;
}

function formatLastResult(last: LastResult): string {
  if (last.setsData.length > 0) {
    return last.setsData.map(s => `${s.reps}x${s.weight}kg`).join(' · ');
  }
  return `${last.sets}x${last.reps} @ ${last.weight}kg`;
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
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<{ id: string; name: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  // null = zalogowany user, 'all' = wszyscy, string = konkretny userId
  const [saveAsUserId, setSaveAsUserId] = useState<string | null>(null);
  const [existingSessionId, setExistingSessionId] = useState<string | null>(null);

  // AI planer
  const AI_MUSCLE_GROUPS = ['Klatka piersiowa', 'Plecy', 'Barki', 'Biceps', 'Triceps', 'Nogi', 'Brzuch'];
  const [showAiPlanner, setShowAiPlanner] = useState(false);
  const [aiMuscles, setAiMuscles] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPlan, setAiPlan] = useState<{
    intro: string;
    exercises: { exerciseId: string; name: string; setsData: { reps: number; weight: number }[]; note: string }[];
  } | null>(null);
  const [aiError, setAiError] = useState('');
  // Chroni szkic przed nadpisaniem pustym stanem początkowym przy odświeżeniu strony
  const [draftLoaded, setDraftLoaded] = useState(false);
  // Ostatnie wyniki per ćwiczenie — podpowiedź progresji
  const [lastResults, setLastResults] = useState<Record<string, LastResult | null>>({});
  // Tryb live: odhaczanie serii + timer przerwy
  const [doneSets, setDoneSets] = useState<Record<string, boolean>>({});
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restSecs, setRestSecs] = useState(90);
  // Dane z zegarka (import TCX)
  const [watchData, setWatchData] = useState<TcxSummary | null>(null);
  // Manualny wpis kcal (gdy brak zegarka)
  const [manualKcal, setManualKcal] = useState<number | ''>('');
  // Sekcje pickera ćwiczeń: ulubione + ostatnio używane + liczniki z historii (baza, nie localStorage)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [dbUsageCounts, setDbUsageCounts] = useState<Record<string, number>>({});

  const DRAFT_KEY = 'treningFormDraft';

  const loadData = useCallback(async () => {
    const [exRes, tplRes, usersRes] = await Promise.all([
      fetchExercises(),
      fetch('/api/templates').then(r => r.json()),
      fetch('/api/users').then(r => r.json()),
    ]);
    setExercises(Array.isArray(exRes) ? exRes : []);
    setTemplates(Array.isArray(tplRes) ? tplRes : []);
    setUsers(Array.isArray(usersRes) ? usersRes : []);

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
            rpe: e.rpe || undefined, comment: e.comment || undefined, setsData: sd, customSets: sd.length > 0,
            bodyweight: e.weight === 0 && sd.every(s => s.weight === 0) };
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
            rpe: e.rpe || undefined, comment: e.comment || undefined, setsData: sd, customSets: sd.length > 0,
            bodyweight: e.weight === 0 && sd.every(s => s.weight === 0) };
        }));
      }
      sessionStorage.removeItem('editSessionId');
      return;
    }

    // Prefill z planu treningowego (link "Rozpocznij dzisiejszy trening" z /plan)
    const templateIdParam = searchParams.get('templateId');
    if (templateIdParam) {
      const tpl = (Array.isArray(tplRes) ? tplRes : []).find((t: Template) => t.id === templateIdParam);
      if (tpl) {
        setEntries(tpl.entries.map((e, i) => ({
          key: String(Date.now() + i), exerciseId: e.exerciseId, sets: e.sets, reps: e.reps,
          weight: e.weight, customSets: false, setsData: [], bodyweight: false,
        })));
        return;
      }
    }

    // Restore draft from localStorage (only for new sessions)
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.date) setDate(draft.date);
        if (draft.notes !== undefined) setNotes(draft.notes);
        if (Array.isArray(draft.entries) && draft.entries.length > 0) setEntries(draft.entries);
      }
    } catch {
      // ignore parse errors
    }
  }, [searchParams]);

  useEffect(() => { loadData().finally(() => setDraftLoaded(true)); }, [loadData]);

  // Użytkownik, dla którego pokazujemy podpowiedzi progresji
  const hintUserId = saveAsUserId && saveAsUserId !== 'all' ? saveAsUserId : authUserId;

  // Ulubione zalogowanego użytkownika (sekcja ★ w pickerze ćwiczeń)
  useEffect(() => {
    fetch('/api/favorites')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setFavoriteIds(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Historia wpisów → sekcja "Ostatnio" i realne liczniki "Najczęściej" w pickerze
  useEffect(() => {
    if (!hintUserId) return;
    fetch(`/api/entries?userId=${hintUserId}&limit=300`)
      .then(r => (r.ok ? r.json() : []))
      .then((data: { exerciseId?: string }[]) => {
        if (!Array.isArray(data)) return;
        const counts: Record<string, number> = {};
        const recent: string[] = [];
        for (const e of data) {
          if (!e.exerciseId) continue;
          counts[e.exerciseId] = (counts[e.exerciseId] || 0) + 1;
          if (!recent.includes(e.exerciseId)) recent.push(e.exerciseId);
        }
        setDbUsageCounts(counts);
        setRecentIds(recent.slice(0, 15));
      })
      .catch(() => {});
  }, [hintUserId]);

  // Pobierz ostatni wynik dla każdego wybranego ćwiczenia.
  // Cache kluczowany "userId:exerciseId" (zmiana użytkownika nie wymaga resetu),
  // ref chroni przed podwójnym pobraniem bez setState w efekcie.
  const hintsInFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!hintUserId) return;
    const exIds = [...new Set(entries.map(e => e.exerciseId).filter(Boolean))];
    for (const exId of exIds) {
      const key = `${hintUserId}:${exId}`;
      if (key in lastResults || hintsInFlight.current.has(key)) continue;
      hintsInFlight.current.add(key);
      fetch(`/api/entries?exerciseId=${exId}&userId=${hintUserId}&limit=1`)
        .then(r => r.json())
        .then(data => {
          const e = Array.isArray(data) && data.length > 0 ? data[0] : null;
          setLastResults(prev => ({
            ...prev,
            [key]: e ? {
              sets: e.sets, reps: e.reps, weight: e.weight, rpe: e.rpe ?? null,
              date: e.session?.date || '',
              setsData: Array.isArray(e.setsData) ? e.setsData : [],
            } : null,
          }));
        })
        .catch(() => setLastResults(prev => ({ ...prev, [key]: null })))
        .finally(() => hintsInFlight.current.delete(key));
    }
  }, [entries, hintUserId, lastResults]);

  // Save draft to localStorage on every change (only when creating new session).
  // draftLoaded: bez tego zapis startował z pustym stanem PONIŻEJ wczytania szkicu
  // i odświeżenie strony kasowało wpisywany trening.
  useEffect(() => {
    if (!draftLoaded || editingSession) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ date, notes, entries }));
    } catch { /* ignore */ }
  }, [date, notes, entries, editingSession, draftLoaded]);

  // Sprawdź czy istnieje sesja z wybranej daty (dla wybranego użytkownika)
  useEffect(() => {
    if (editingSession) { setExistingSessionId(null); return; }
    const targetId = saveAsUserId === 'all' ? authUserId : (saveAsUserId || authUserId);
    if (!targetId || !date) return;
    const check = async () => {
      const res = await fetch(`/api/sessions?date=${date}&userId=${targetId}&limit=1`);
      const data = await res.json();
      setExistingSessionId(Array.isArray(data) && data.length > 0 ? data[0].id : null);
    };
    check();
  }, [date, saveAsUserId, authUserId, editingSession]);

  const copyLastWorkout = async () => {
    const sessions = await fetch('/api/sessions?limit=1').then(r => r.json());
    if (!Array.isArray(sessions) || !sessions.length) {
      setToast({ message: 'Brak poprzednich treningów', type: 'error' }); return;
    }
    const last = sessions[0];
    setEntries(last.entries.map((e: {
      exerciseId: string; sets: number; reps: number; weight: number;
      rpe?: number | null; comment?: string | null; setsData?: SetData[]
    }, i: number) => {
      const sd: SetData[] = Array.isArray(e.setsData) && e.setsData.length > 0 ? e.setsData : [];
      return { key: String(Date.now() + i), exerciseId: e.exerciseId, sets: e.sets, reps: e.reps,
        weight: e.weight, rpe: e.rpe || undefined, comment: e.comment || undefined, setsData: sd,
        customSets: sd.length > 0, bodyweight: false };
    }));
    setToast({ message: 'Skopiowano ostatni trening', type: 'success' });
  };

  const loadTemplate = (tpl: Template) => {
    setEntries(tpl.entries.map((e, i) => ({
      key: String(Date.now() + i), exerciseId: e.exerciseId, sets: e.sets, reps: e.reps,
      weight: e.weight, customSets: false, setsData: [], bodyweight: false,
    })));
    setShowTemplates(false);
    setToast({ message: `Załadowano szablon "${tpl.name}"`, type: 'success' });
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

  const handleTcxFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseTcx(text);
    if (parsed) {
      setWatchData(parsed);
      setToast({ message: `Zegarek: ${parsed.kcal} kcal, ${formatDur(parsed.durationSec)}`, type: 'success' });
    } else {
      setToast({ message: 'Nie udało się odczytać pliku TCX', type: 'error' });
    }
    e.target.value = '';
  };

  const deleteTemplate = async (id: string) => {
    setConfirmDeleteTemplate(null);
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setTemplates(prev => prev.filter(t => t.id !== id));
      setToast({ message: 'Szablon usunięty', type: 'success' });
    } else {
      setToast({ message: 'Nie udało się usunąć szablonu', type: 'error' });
    }
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

  const copyLastSet = (entryKey: string) => {
    setEntries(prev => prev.map(e => {
      if (e.key !== entryKey || !e.setsData || e.setsData.length === 0) return e;
      const last = e.setsData[e.setsData.length - 1];
      return { ...e, setsData: [...e.setsData, { ...last }] };
    }));
  };

  const finishAndRedirect = async (sessionId: string, defaultMsg: string) => {
    try {
      const rating = await fetch(`/api/sessions/${sessionId}/rating`).then(r => r.json());
      if (rating?.prCount > 0) {
        setToast({
          message: `🏆 ${rating.prCount === 1 ? 'Nowy rekord!' : `${rating.prCount} nowe rekordy!`} Świetna robota! 💪`,
          type: 'success',
        });
        setTimeout(() => router.push('/'), 2500);
        return;
      }
    } catch { /* ignore — PR toast jest opcjonalny */ }
    setToast({ message: defaultMsg, type: 'success' });
    setTimeout(() => router.push('/'), 1500);
  };

  // Odhacz serię — zaznaczenie startuje timer przerwy
  const toggleSetDone = (entryKey: string, setIdx: number) => {
    const k = `${entryKey}-${setIdx}`;
    setDoneSets(prev => {
      const marking = !prev[k];
      if (marking) setRestEndsAt(Date.now() + restSecs * 1000);
      return { ...prev, [k]: marking };
    });
  };

  const addNewExercise = async () => {
    if (!newExName.trim()) return;
    const res = await fetch('/api/exercises', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newExName.trim() }),
    });
    if (res.status === 409) {
      // Ćwiczenie o tej nazwie już istnieje — wybierz je zamiast tworzyć duplikat
      const data = await res.json();
      const ex = data.existing;
      if (ex) {
        setExercises(prev => prev.some(p => p.id === ex.id) ? prev : [...prev, ex].sort((a, b) => a.name.localeCompare(b.name)));
        setEntries(prev => {
          const lastEmpty = [...prev].reverse().find(e => !e.exerciseId);
          if (lastEmpty) return prev.map(e => e.key === lastEmpty.key ? { ...e, exerciseId: ex.id } : e);
          return [...prev, { key: String(Date.now()), exerciseId: ex.id, sets: 3, reps: 10, weight: 0, customSets: false, setsData: [], bodyweight: false }];
        });
        setToast({ message: `"${ex.name}" już istnieje — wybrano je w formularzu`, type: 'success' });
        setNewExName(''); setShowNewEx(false);
      } else {
        setToast({ message: data.error || 'Ćwiczenie już istnieje', type: 'error' });
      }
      return;
    }
    if (res.ok) {
      const ex = await res.json();
      invalidateExerciseCache();
      setExercises(prev => [...prev, ex].sort((a, b) => a.name.localeCompare(b.name)));
      // Automatycznie przypisz nowe ćwiczenie do ostatniego pustego wiersza
      setEntries(prev => {
        const lastEmpty = [...prev].reverse().find(e => !e.exerciseId);
        if (lastEmpty) {
          return prev.map(e => e.key === lastEmpty.key ? { ...e, exerciseId: ex.id } : e);
        }
        return [...prev, { key: String(Date.now()), exerciseId: ex.id, sets: 3, reps: 10, weight: 0, customSets: false, setsData: [], bodyweight: false }];
      });
      setToast({ message: `Dodano "${ex.name}" i wybrano w formularzu`, type: 'success' });
      setNewExName(''); setShowNewEx(false);
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({ message: err.error || 'Nie udało się dodać ćwiczenia', type: 'error' });
    }
  };

  const validateEntries = (): boolean => {
    if (!date) { setToast({ message: 'Wybierz datę', type: 'error' }); return false; }
    for (const entry of entries) {
      if (!entry.exerciseId) { setToast({ message: 'Wybierz ćwiczenie', type: 'error' }); return false; }
      if (entry.customSets && (!entry.setsData || entry.setsData.length === 0)) {
        setToast({ message: 'Dodaj co najmniej jedną serię', type: 'error' }); return false;
      }
      if (!entry.customSets && !entry.weight && !entry.bodyweight) {
        setToast({ message: 'Podaj ciężar lub zaznacz "Własna masa"', type: 'error' }); return false;
      }
    }
    return true;
  };

  const buildEntryPayload = (entry: EntryRow) => {
    const sd = entry.setsData && entry.setsData.length > 0 ? entry.setsData : [];
    return {
      exerciseId: entry.exerciseId,
      sets: entry.customSets ? (sd.length || entry.sets) : entry.sets,
      reps: entry.reps,
      weight: entry.weight,
      rpe: entry.rpe,
      comment: entry.comment,
      setsData: sd,
    };
  };

  // Lista użytkowników, dla których zapisujemy
  const getTargetUserIds = (): string[] =>
    saveAsUserId === 'all' ? users.map(u => u.id) : [saveAsUserId || authUserId || ''];

  // Zapisz razem — dopisz ćwiczenia do istniejącej sesji tego dnia
  // (jeden atomowy request; przy "Oboje" dopisuje/tworzy dla każdego użytkownika)
  const handleSaveTogether = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEntries()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date, notes,
          entries: entries.filter(e => e.exerciseId).map(buildEntryPayload),
          targetUserIds: getTargetUserIds(),
          appendToExisting: true,
          watch: watchData || (manualKcal ? { kcal: Number(manualKcal) } : undefined),
        }),
      });
      if (res.ok) {
        activeSession.clear();
        localStorage.removeItem(DRAFT_KEY);
        const saved = await res.json().catch(() => null);
        const mainId = Array.isArray(saved) ? saved[0]?.id : saved?.id;
        if (mainId) {
          await finishAndRedirect(mainId, 'Ćwiczenia dodane do treningu z tego dnia!');
        } else {
          setToast({ message: 'Ćwiczenia dodane do treningu z tego dnia!', type: 'success' });
          setTimeout(() => router.push('/'), 1500);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ message: err.error || 'Błąd zapisu — nic nie zostało zapisane', type: 'error' });
      }
    } catch {
      setToast({ message: 'Błąd połączenia — nic nie zostało zapisane', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEntries()) return;
    setSaving(true);
    try {
      if (editingSession) {
        // Edycja istniejącej sesji
        const res = await fetch(`/api/sessions/${editingSession}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, notes, entries }),
        });
        if (res.ok) {
          activeSession.clear();
          localStorage.removeItem(DRAFT_KEY);
          await finishAndRedirect(editingSession, 'Trening zaktualizowany!');
        } else {
          const err = await res.json();
          setToast({ message: err.error || 'Błąd zapisu', type: 'error' });
        }
        return;
      }

      // Nowy trening — jeden atomowy request dla wszystkich użytkowników
      // (zapis dla obojga: albo zapisze się dla obu, albo dla nikogo)
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date, notes,
          entries: entries.filter(e => e.exerciseId).map(buildEntryPayload),
          targetUserIds: getTargetUserIds(),
          watch: watchData || (manualKcal ? { kcal: Number(manualKcal) } : undefined),
        }),
      });

      if (res.ok) {
        activeSession.clear();
        localStorage.removeItem(DRAFT_KEY);
        const saved = await res.json().catch(() => null);
        const mainId = Array.isArray(saved) ? saved[0]?.id : saved?.id;
        if (mainId && saveAsUserId !== 'all') {
          await finishAndRedirect(mainId, 'Trening zapisany!');
        } else {
          const msg = saveAsUserId === 'all'
            ? `Trening zapisany dla ${users.map(u => u.name).join(' i ')}!`
            : 'Trening zapisany!';
          setToast({ message: msg, type: 'success' });
          setTimeout(() => router.push('/'), 1500);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ message: err.error || 'Błąd zapisu — nic nie zostało zapisane', type: 'error' });
      }
    } catch {
      setToast({ message: 'Błąd połączenia — nic nie zostało zapisane', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const generateAiPlan = async () => {
    if (!aiMuscles.length) return;
    setAiLoading(true);
    setAiError('');
    setAiPlan(null);
    try {
      const res = await fetch('/api/ai/suggest-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muscleGroups: aiMuscles }),
      });
      const data = await res.json();
      if (!res.ok) { setAiError(data.error || 'Błąd AI'); return; }
      setAiPlan(data);
    } catch {
      setAiError('Błąd połączenia');
    } finally {
      setAiLoading(false);
    }
  };

  const loadAiPlan = () => {
    if (!aiPlan) return;
    const newEntries: EntryRow[] = aiPlan.exercises.map((ex, i) => ({
      key: String(Date.now() + i),
      exerciseId: ex.exerciseId,
      sets: ex.setsData.length,
      reps: ex.setsData[0]?.reps || 10,
      weight: ex.setsData[0]?.weight || 0,
      customSets: true,
      setsData: ex.setsData,
      bodyweight: ex.setsData.every(s => s.weight === 0),
    }));
    setEntries(newEntries);
    setShowAiPlanner(false);
    setAiPlan(null);
    setAiMuscles([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirmDeleteTemplate && (
        <ConfirmDialog
          isOpen={true}
          message={`Usunąć szablon "${confirmDeleteTemplate.name}"? Nie można cofnąć.`}
          onConfirm={() => deleteTemplate(confirmDeleteTemplate.id)}
          onCancel={() => setConfirmDeleteTemplate(null)}
        />
      )}
      <RestTimer
        endsAt={restEndsAt}
        secs={restSecs}
        onChangeSecs={setRestSecs}
        onExtend={ms => setRestEndsAt(prev => (prev ? prev + ms : prev))}
        onClose={() => setRestEndsAt(null)}
      />

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">{editingSession ? 'Edytuj trening' : 'Nowy trening'}</h1>
          {authName && <span className="text-sm text-blue-600 font-medium">{authName}</span>}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4 md:max-w-3xl lg:max-w-4xl md:mx-auto">
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Data</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Notatki (opcjonalne)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Np. dobry dzień, PR na klatce..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900" />
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={copyLastWorkout}
            className="flex-1 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-50 hover:border-gray-300 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            Kopiuj ostatni
          </button>
          <button type="button" onClick={() => setShowTemplates(o => !o)}
            className="flex-1 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-50 hover:border-gray-300 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            Szablony ({templates.length})
          </button>
          <button type="button" onClick={() => { setShowAiPlanner(o => !o); setAiPlan(null); setAiError(''); }}
            className="flex-1 bg-violet-600 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-violet-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            <Sparkles className="w-4 h-4" strokeWidth={2} />
            AI Plan
          </button>
        </div>

        {showAiPlanner && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4" strokeWidth={2} /> AI dobierze ćwiczenia</h2>
              <button type="button" onClick={() => setShowAiPlanner(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            {/* Wybór partii */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Które partie chcesz trenować?</p>
              <div className="flex flex-wrap gap-2">
                {AI_MUSCLE_GROUPS.map(g => (
                  <button
                    key={g} type="button"
                    onClick={() => setAiMuscles(prev =>
                      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
                    )}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                      aiMuscles.includes(g)
                        ? 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {aiError && (
              <div className="bg-red-50 text-red-700 text-sm rounded-xl px-3 py-2">{aiError}</div>
            )}

            {/* Wynik AI */}
            {aiPlan && (
              <div className="space-y-3">
                <p className="text-sm text-gray-700 bg-violet-50 rounded-xl px-3 py-2 italic">{aiPlan.intro}</p>
                <div className="space-y-2">
                  {aiPlan.exercises.map(ex => (
                    <div key={ex.exerciseId} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-sm font-semibold text-gray-900">{ex.name}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {ex.setsData.map((s, i) => `S${i + 1}: ${s.reps}×${s.weight}kg`).join(' · ')}
                      </p>
                      {ex.note && <p className="text-xs text-violet-600 mt-1 italic">{ex.note}</p>}
                    </div>
                  ))}
                </div>
                <button
                  type="button" onClick={loadAiPlan}
                  className="w-full bg-violet-600 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-colors hover:bg-violet-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  Załaduj plan do treningu <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </button>
                <button
                  type="button" onClick={generateAiPlan} disabled={aiLoading}
                  className="w-full bg-white border border-violet-200 text-violet-700 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-violet-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <RotateCcw className="w-4 h-4" strokeWidth={2} /> Wygeneruj inny plan
                </button>
              </div>
            )}

            {!aiPlan && (
              <button
                type="button" onClick={generateAiPlan}
                disabled={aiLoading || aiMuscles.length === 0}
                className="w-full bg-violet-600 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50 transition-colors hover:bg-violet-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {aiLoading
                  ? <span className="flex items-center justify-center gap-2"><span className="animate-spin inline-block">⏳</span> AI planuje...</span>
                  : aiMuscles.length === 0 ? 'Wybierz partie mięśniowe' : <span className="flex items-center justify-center gap-1.5"><Sparkles className="w-4 h-4" strokeWidth={2} /> Generuj plan ({aiMuscles.join(', ')})</span>
                }
              </button>
            )}
          </div>
        )}

        {showTemplates && (
          <div className="bg-white rounded-2xl p-4 space-y-2">
            {templates.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-2">Brak szablonów</p>
            ) : templates.map(tpl => (
              <div key={tpl.id} className="flex items-center justify-between">
                <button type="button" onClick={() => loadTemplate(tpl)}
                  className="text-sm font-medium text-blue-600 flex-1 text-left transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded">
                  {tpl.name}
                </button>
                <button type="button" onClick={() => setConfirmDeleteTemplate({ id: tpl.id, name: tpl.name })}
                  className="text-red-500 bg-red-50 hover:text-red-700 hover:bg-red-100 text-xs p-1.5 rounded-lg transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                  <Trash2 className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            ))}
            {!showSaveTemplate ? (
              <button type="button" onClick={() => setShowSaveTemplate(true)}
                className="w-full text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl py-2 mt-2 flex items-center justify-center gap-1.5 transition-colors hover:bg-gray-50 hover:border-gray-400 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                <Plus className="w-4 h-4" strokeWidth={2} /> Zapisz obecny jako szablon
              </button>
            ) : (
              <div className="flex gap-2 mt-2">
                <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Nazwa szablonu"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <button type="button" onClick={saveTemplate} disabled={savingTemplate}
                  className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-colors hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                  {savingTemplate ? '...' : 'Zapisz'}
                </button>
              </div>
            )}
          </div>
        )}

        {entries.map((entry, idx) => (
          <div key={entry.key} className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-500">Ćwiczenie {idx + 1}</span>
              {entries.length > 1 && (
                <button type="button" onClick={() => removeEntry(entry.key)}
                  className="text-red-400 hover:text-red-600 text-sm flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded px-1">
                  <Trash2 className="w-4 h-4" strokeWidth={2} /> Usuń
                </button>
              )}
            </div>
            <ExerciseSearch
              exercises={exercises}
              value={entry.exerciseId}
              onChange={val => updateEntry(entry.key, 'exerciseId', val)}
              onAddNew={() => setShowNewEx(true)}
              favoriteIds={favoriteIds}
              recentIds={recentIds}
              usageCounts={dbUsageCounts}
            />
            {(() => {
              const hint = entry.exerciseId && hintUserId ? lastResults[`${hintUserId}:${entry.exerciseId}`] : null;
              if (!hint) return null;
              return (
                <div className="text-xs bg-blue-50 text-blue-800 rounded-lg px-3 py-2 leading-snug">
                  Ostatnio{hint.date ? ` (${new Date(hint.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })})` : ''}:{' '}
                  {formatLastResult(hint)}
                  {hint.rpe != null && ` · RPE ${hint.rpe}`}
                  {' → '}<strong>{progressionHint(hint)}</strong>
                </div>
              );
            })()}
            <div className="flex gap-4 items-center">
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500">Rozpisz serie osobno</label>
                <button type="button" onClick={() => toggleCustomSets(entry.key, !entry.customSets)}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${entry.customSets ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-200 hover:bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${entry.customSets ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500">Własna masa</label>
                <button type="button"
                  onClick={() => setEntries(prev => prev.map(e =>
                    e.key === entry.key ? { ...e, bodyweight: !e.bodyweight, weight: 0, setsData: (e.setsData || []).map(s => ({ ...s, weight: 0 })) } : e
                  ))}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${entry.bodyweight ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-200 hover:bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${entry.bodyweight ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            {!entry.customSets ? (
              <>
              <div className={`grid gap-2 ${entry.bodyweight ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {[['Serie', 'sets'], ['Powt.', 'reps'], ...(!entry.bodyweight ? [['Ciężar kg', 'weight']] : [])].map(([label, field]) => (
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
              {!entry.bodyweight && (() => {
                const orm = calc1RM(entry.weight, entry.reps);
                return orm ? (
                  <div className="text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-1.5 text-center">
                    Szacowany 1RM: <strong>{orm} kg</strong>
                  </div>
                ) : null;
              })()}
              </>
            ) : (
              <div className="space-y-2">
                {(entry.setsData || []).map((s, si) => (
                  <div key={si} className="space-y-1">
                    {/* Reps row */}
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => toggleSetDone(entry.key, si)}
                        title="Odhacz serię i odpal timer przerwy"
                        className={`w-7 h-7 rounded-full border text-xs shrink-0 flex items-center justify-center transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                          doneSets[`${entry.key}-${si}`]
                            ? 'bg-green-500 border-green-500 text-white hover:bg-green-600'
                            : 'border-gray-300 text-gray-300 hover:border-gray-400 hover:text-gray-400'
                        }`}><Check className="w-4 h-4" strokeWidth={2.5} /></button>
                      <span className="text-xs text-gray-400 w-4 text-center shrink-0">{si + 1}.</span>
                      <button type="button"
                        onClick={() => updateSet(entry.key, si, 'reps', Math.max(1, s.reps - 1))}
                        className="w-8 h-8 rounded-lg bg-gray-100 font-bold text-gray-600 flex items-center justify-center shrink-0 text-lg transition-colors hover:bg-gray-200 active:scale-[0.97] active:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"><Minus className="w-4 h-4" strokeWidth={2} /></button>
                      <input type="number" min="1" inputMode="numeric"
                        value={s.reps === 0 ? '' : s.reps} placeholder="0"
                        onChange={e => updateSet(entry.key, si, 'reps', parseInt(e.target.value) || 1)}
                        className="w-12 border border-gray-200 rounded-lg px-1 py-1.5 text-sm text-center font-medium" />
                      <button type="button"
                        onClick={() => updateSet(entry.key, si, 'reps', s.reps + 1)}
                        className="w-8 h-8 rounded-lg bg-gray-100 font-bold text-gray-600 flex items-center justify-center shrink-0 text-lg transition-colors hover:bg-gray-200 active:scale-[0.97] active:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"><Plus className="w-4 h-4" strokeWidth={2} /></button>
                      <span className="text-xs text-gray-400 shrink-0">pow.</span>
                      <button type="button" onClick={() => removeSet(entry.key, si)}
                        className="ml-auto text-red-400 w-7 h-7 flex items-center justify-center shrink-0 transition-colors hover:text-red-600 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"><X className="w-4 h-4" strokeWidth={2} /></button>
                    </div>
                    {/* Weight row */}
                    {!entry.bodyweight && (
                      <div className="flex items-center gap-1.5 pl-11">
                        <button type="button"
                          onClick={() => updateSet(entry.key, si, 'weight', Math.max(0, Math.round((s.weight - 2.5) * 10) / 10))}
                          className="w-10 h-8 rounded-lg bg-gray-100 text-xs font-bold text-gray-600 flex items-center justify-center shrink-0 transition-colors hover:bg-gray-200 active:scale-[0.97] active:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">−2.5</button>
                        <input type="number" min="0" step="0.5" inputMode="decimal"
                          value={s.weight === 0 ? '' : s.weight} placeholder="0"
                          onChange={e => updateSet(entry.key, si, 'weight', parseFloat(e.target.value) || 0)}
                          className="w-14 border border-gray-200 rounded-lg px-1 py-1.5 text-sm text-center font-medium" />
                        <button type="button"
                          onClick={() => updateSet(entry.key, si, 'weight', Math.round((s.weight + 2.5) * 10) / 10)}
                          className="w-10 h-8 rounded-lg bg-gray-100 text-xs font-bold text-gray-600 flex items-center justify-center shrink-0 transition-colors hover:bg-gray-200 active:scale-[0.97] active:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">+2.5</button>
                        <span className="text-xs text-gray-400 shrink-0">kg</span>
                      </div>
                    )}
                  </div>
                ))}
                {!entry.bodyweight && (() => {
                  const best = (entry.setsData || []).reduce<number | null>((max, s) => {
                    const v = calc1RM(s.weight, s.reps);
                    return v && (max === null || v > max) ? v : max;
                  }, null);
                  return best ? (
                    <div className="text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-1.5 text-center">
                      Szacowany 1RM: <strong>{best} kg</strong>
                    </div>
                  ) : null;
                })()}
                <div className="flex gap-2 mt-1">
                  <button type="button" onClick={() => addSet(entry.key)}
                    className="flex-1 text-sm text-blue-600 border border-dashed border-blue-300 rounded-xl py-2 flex items-center justify-center gap-1.5 transition-colors hover:bg-blue-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                    <Plus className="w-4 h-4" strokeWidth={2} /> Dodaj serię
                  </button>
                  {(entry.setsData || []).length > 0 && (
                    <button type="button" onClick={() => copyLastSet(entry.key)}
                      className="text-sm text-gray-500 border border-gray-200 rounded-xl py-2 px-3 flex items-center justify-center gap-1.5 transition-colors hover:bg-gray-50 hover:border-gray-300 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                      <Clipboard className="w-4 h-4" strokeWidth={2} /> Kopiuj
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">RPE (opcjonalne)</label>
                <input type="number" min="1" max="10" step="0.5" value={entry.rpe || ''}
                  onChange={e => updateEntry(entry.key, 'rpe', parseFloat(e.target.value) || 0)}
                  placeholder="1-10" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Komentarz</label>
                <input type="text" value={entry.comment || ''} onChange={e => updateEntry(entry.key, 'comment', e.target.value)}
                  placeholder="np. zmęczony..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
        ))}

        <button type="button" onClick={addEntry}
          className="w-full bg-white border-2 border-dashed border-gray-300 text-gray-600 py-3 rounded-2xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-gray-50 hover:border-gray-400 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          <Plus className="w-4 h-4" strokeWidth={2} /> Dodaj ćwiczenie
        </button>

        {showNewEx ? (
          <div className="bg-white rounded-2xl p-4 flex gap-2">
            <input value={newExName} onChange={e => setNewExName(e.target.value)} placeholder="Nazwa ćwiczenia"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            <button type="button" onClick={addNewExercise}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">Dodaj</button>
            <button type="button" onClick={() => setShowNewEx(false)}
              className="text-gray-400 hover:text-gray-600 px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"><X className="w-5 h-5" strokeWidth={2} /></button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowNewEx(true)}
            className="w-full text-sm text-gray-500 py-2 flex items-center justify-center gap-1.5 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded">
            <Plus className="w-4 h-4" strokeWidth={2} /> Nowe ćwiczenie w bibliotece
          </button>
        )}

        {!editingSession && (
          <div className="bg-white rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Watch className="w-4 h-4" strokeWidth={2} /> Dane z zegarka <span className="text-gray-400">(opcjonalnie)</span></label>
              {watchData ? (
                <button type="button" onClick={() => setWatchData(null)}
                  className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded px-1">
                  <X className="w-3.5 h-3.5" strokeWidth={2} /> usuń
                </button>
              ) : (
                <label className="text-sm text-blue-600 font-medium cursor-pointer hover:text-blue-700 transition-colors">
                  Importuj TCX
                  <input type="file" accept=".tcx,.xml" onChange={handleTcxFile} className="hidden" />
                </label>
              )}
            </div>
            {watchData ? (
              <p className="text-sm text-gray-700 mt-2 bg-blue-50 rounded-lg px-3 py-2 flex items-center gap-1.5 flex-wrap">
                <Flame className="w-4 h-4 text-orange-500" strokeWidth={2} /> <strong>{watchData.kcal} kcal</strong> · <Timer className="w-4 h-4" strokeWidth={2} /> {formatDur(watchData.durationSec)}
                {watchData.avgHr && <> · <HeartPulse className="w-4 h-4 text-red-500 inline" strokeWidth={2} /> {watchData.avgHr}</>}
                {watchData.maxHr && <> / {watchData.maxHr} max</>}
              </p>
            ) : (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-gray-500 flex items-center gap-1"><Flame className="w-4 h-4 text-orange-500" strokeWidth={2} /> Kcal ręcznie:</span>
                <input
                  type="number" min="0" step="10" inputMode="numeric"
                  value={manualKcal}
                  onChange={e => setManualKcal(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="np. 350"
                  className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center"
                />
                <span className="text-sm text-gray-400">kcal</span>
              </div>
            )}
          </div>
        )}

        {users.length > 1 && !editingSession && (
          <div className="bg-white rounded-2xl p-4 space-y-2">
            <label className="text-sm font-medium text-gray-700 block">Zapisz dla</label>
            <div className="flex gap-2">
              {users.map(u => (
                <button key={u.id} type="button" onClick={() => setSaveAsUserId(u.id)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                    saveAsUserId === u.id
                      ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                  }`}>
                  {u.name}
                </button>
              ))}
              <button type="button" onClick={() => setSaveAsUserId('all')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors flex items-center justify-center gap-1.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                  saveAsUserId === 'all'
                    ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}>
                <Users className="w-4 h-4" strokeWidth={2} /> Oboje
              </button>
            </div>
            {saveAsUserId === 'all' && (
              <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
                Trening zostanie zapisany dla wszystkich użytkowników
              </p>
            )}
          </div>
        )}

        {existingSessionId && !editingSession ? (
          <div className="space-y-2">
            <p className="text-sm text-center text-amber-600 font-medium bg-amber-50 rounded-xl py-2 px-3 flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-4 h-4" strokeWidth={2} /> Masz już trening z tego dnia
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={handleSaveTogether}
                disabled={saving || !entries.some(e => e.exerciseId)}
                className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                {saving ? 'Zapisuję...' : <><Plus className="w-4 h-4" strokeWidth={2} /> Dodaj do istniejącego</>}
              </button>
              <button type="submit"
                disabled={saving || !entries.some(e => e.exerciseId)}
                className="flex-1 bg-gray-700 text-white py-4 rounded-2xl font-bold text-base disabled:opacity-50 transition-colors hover:bg-gray-800 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                Zapisz osobno
              </button>
            </div>
          </div>
        ) : (
          <button type="submit" disabled={saving || !entries.some(e => e.exerciseId)}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg disabled:opacity-50 transition-colors hover:bg-blue-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            {saving ? 'Zapisuję...' : editingSession ? 'Aktualizuj trening' : 'Zapisz trening'}
          </button>
        )}
      </form>
    </div>
  );
}

export default function TreningPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="px-4 py-4 space-y-4 md:max-w-3xl lg:max-w-4xl md:mx-auto">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    }>
      <TreningPage />
    </Suspense>
  );
}
