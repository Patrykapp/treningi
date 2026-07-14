'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDate, formatDateInput } from '@/lib/utils';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SkeletonCard, Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { Ruler, Lock, Trash2, ArrowLeft, Plus, X } from 'lucide-react';

interface CustomMeasurement { label: string; value: number; }

interface BodyMeasurementEntry {
  id: string;
  date: string;
  waist?: number | null;
  chest?: number | null;
  biceps?: number | null;
  thigh?: number | null;
  hips?: number | null;
  calf?: number | null;
  forearm?: number | null;
  custom?: CustomMeasurement[];
  notes?: string | null;
}

type FixedKey = 'waist' | 'chest' | 'biceps' | 'thigh' | 'hips' | 'calf' | 'forearm';

const FIELDS: { key: FixedKey; label: string }[] = [
  { key: 'waist', label: 'Talia' },
  { key: 'chest', label: 'Klatka' },
  { key: 'biceps', label: 'Biceps' },
  { key: 'thigh', label: 'Udo' },
  { key: 'hips', label: 'Biodra' },
  { key: 'calf', label: 'Łydka' },
  { key: 'forearm', label: 'Przedramię' },
];

interface Metric { key: string; label: string; isCustom: boolean; }

function getValue(entry: BodyMeasurementEntry, metric: Metric): number | null {
  if (!metric.isCustom) {
    const v = entry[metric.key as FixedKey];
    return typeof v === 'number' ? v : null;
  }
  const c = (entry.custom || []).find(x => x.label.toLowerCase() === metric.label.toLowerCase());
  return c ? c.value : null;
}

export default function PomiaryPage() {
  const [entries, setEntries] = useState<BodyMeasurementEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { isLoggedIn, name: authName } = useAuth();

  // Formularz
  const [formDate, setFormDate] = useState(formatDateInput(new Date()));
  const [formValues, setFormValues] = useState<Record<FixedKey, string>>({
    waist: '', chest: '', biceps: '', thigh: '', hips: '', calf: '', forearm: '',
  });
  const [formCustom, setFormCustom] = useState<{ label: string; value: string }[]>([]);
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<Metric | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const data = await fetch('/api/measurements').then(r => r.json());
    setEntries(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Dostępne metryki: stałe pola z co najmniej jedną wartością + niestandardowe etykiety z historii
  const availableMetrics = useMemo<Metric[]>(() => {
    const fixed = FIELDS
      .filter(f => entries.some(e => typeof e[f.key] === 'number'))
      .map(f => ({ key: f.key, label: f.label, isCustom: false }));
    const seen = new Set<string>();
    const custom: Metric[] = [];
    for (const e of entries) {
      for (const c of e.custom || []) {
        const k = c.label.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          custom.push({ key: k, label: c.label, isCustom: true });
        }
      }
    }
    return [...fixed, ...custom];
  }, [entries]);

  useEffect(() => {
    if (!selectedMetric && availableMetrics.length > 0) setSelectedMetric(availableMetrics[0]);
  }, [availableMetrics, selectedMetric]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

  const handleSave = async () => {
    const customRows = formCustom
      .map(r => ({ label: r.label.trim(), value: parseFloat(r.value) }))
      .filter(r => r.label && Number.isFinite(r.value));
    const hasFixed = FIELDS.some(f => formValues[f.key].trim() !== '');
    if (!hasFixed && customRows.length === 0) {
      showToast('Wpisz przynajmniej jeden pomiar', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { date: formDate, notes: formNotes || null, custom: customRows };
      for (const f of FIELDS) {
        payload[f.key] = formValues[f.key].trim() === '' ? null : parseFloat(formValues[f.key]);
      }
      const res = await fetch('/api/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast('Pomiar zapisany!');
        setFormValues({ waist: '', chest: '', biceps: '', thigh: '', hips: '', calf: '', forearm: '' });
        setFormCustom([]);
        setFormNotes('');
        loadEntries();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Błąd zapisu', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/measurements/${id}`, { method: 'DELETE' });
    setEntries(prev => prev.filter(e => e.id !== id));
    setConfirmDeleteId(null);
  };

  const chartData = selectedMetric
    ? [...entries].reverse()
        .map(e => ({ date: formatDate(e.date), value: getValue(e, selectedMetric) }))
        .filter((d): d is { date: string; value: number } => d.value !== null)
    : [];

  const latestFor = (metric: Metric): number | null => {
    for (const e of entries) {
      const v = getValue(e, metric);
      if (v !== null) return v;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {confirmDeleteId && (
        <ConfirmDialog
          isOpen={true}
          message="Usunąć ten pomiar? Nie można cofnąć."
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-blue-600 font-medium rounded-lg px-1 -mx-1 transition-colors hover:text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2} /> Wróć
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Pomiary ciała</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto md:max-w-3xl lg:max-w-4xl">
        {authName && (
          <p className="text-sm text-gray-500 text-center">Twoje pomiary, {authName}</p>
        )}

        {/* Ostatnie wartości */}
        {loading && (
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-[72px]" />
            <Skeleton className="h-[72px]" />
            <Skeleton className="h-[72px]" />
          </div>
        )}
        {!loading && availableMetrics.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {availableMetrics.map(m => {
              const v = latestFor(m);
              const active = selectedMetric?.key === m.key && selectedMetric?.isCustom === m.isCustom;
              return (
                <button
                  key={`${m.isCustom ? 'c' : 'f'}-${m.key}`}
                  type="button"
                  onClick={() => setSelectedMetric(m)}
                  className={`bg-white rounded-2xl p-3 text-center shadow-sm border-2 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                    active ? 'border-blue-400' : 'border-transparent hover:border-gray-200'
                  }`}
                >
                  <div className="text-lg font-bold text-blue-600">{v !== null ? `${v}cm` : '—'}</div>
                  <div className="text-xs text-gray-600 font-medium mt-0.5 truncate">{m.label}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Wykres */}
        {selectedMetric && chartData.length >= 2 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Wykres — {selectedMetric.label}</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} unit="cm" domain={['auto', 'auto']} />
                <Tooltip formatter={(v) => [`${v}cm`, selectedMetric.label]} />
                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Formularz dodawania */}
        {isLoggedIn && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <h3 className="font-bold text-gray-900">Dodaj pomiar</h3>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data</label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{f.label} (cm)</label>
                  <input
                    type="number"
                    min="0"
                    max="300"
                    step="0.1"
                    value={formValues[f.key]}
                    onChange={e => setFormValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="opcjonalnie"
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              ))}
            </div>

            {/* Pomiary niestandardowe */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700">Pomiary niestandardowe</label>
              {formCustom.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={row.label}
                    onChange={e => setFormCustom(prev => prev.map((r, idx) => idx === i ? { ...r, label: e.target.value } : r))}
                    placeholder="np. nadgarstek"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={row.value}
                    onChange={e => setFormCustom(prev => prev.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))}
                    placeholder="cm"
                    className="w-20 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setFormCustom(prev => prev.filter((_, idx) => idx !== i))}
                    className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <X className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFormCustom(prev => [...prev, { label: '', value: '' }])}
                className="inline-flex items-center gap-1 text-sm text-blue-600 font-medium rounded-lg px-2 py-1 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <Plus className="w-4 h-4" strokeWidth={2} /> Dodaj pomiar niestandardowy
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notatka (opcjonalne)</label>
              <input
                type="text"
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="np. rano, na czczo"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold transition-colors hover:bg-blue-700 active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {saving ? 'Zapisuję...' : 'Zapisz pomiar'}
            </button>
          </div>
        )}

        {!isLoggedIn && (
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-700 text-center py-4 rounded-2xl font-medium transition-colors hover:bg-gray-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <Lock className="w-4 h-4" strokeWidth={2} /> Zaloguj się aby dodawać pomiary
          </Link>
        )}

        {/* Historia */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Historia</h3>
          {loading ? (
            <div className="space-y-2">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-gray-600 bg-white rounded-2xl">
              <Ruler className="w-8 h-8 mx-auto mb-2 text-gray-400" strokeWidth={2} />
              <p>Brak pomiarów. Dodaj pierwszy!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map(entry => {
                const chips = [
                  ...FIELDS.filter(f => typeof entry[f.key] === 'number').map(f => `${f.label}: ${entry[f.key]}cm`),
                  ...(entry.custom || []).map(c => `${c.label}: ${c.value}cm`),
                ];
                return (
                  <div key={entry.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium text-gray-900">{formatDate(entry.date)}</span>
                      {chips.length > 0 && (
                        <p className="text-sm text-gray-700 mt-0.5">{chips.join(' · ')}</p>
                      )}
                      {entry.notes && <p className="text-xs text-gray-500 mt-0.5">{entry.notes}</p>}
                    </div>
                    {isLoggedIn && (
                      <button
                        onClick={() => setConfirmDeleteId(entry.id)}
                        className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shrink-0"
                        title="Usuń pomiar"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
