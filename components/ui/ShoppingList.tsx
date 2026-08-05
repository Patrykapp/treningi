'use client';

/**
 * Lista zakupów z odhaczaniem. Stan siedzi w bazie, więc odhaczone pozycje
 * zostają odhaczone po zamknięciu aplikacji — można z niej korzystać
 * w sklepie na telefonie.
 *
 * Pozycje grupują się po działach sklepu (kategoria produktu z katalogu),
 * żeby nie biegać po sklepie tam i z powrotem.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Plus, Trash2, Copy, Check, CalendarPlus, Eraser } from 'lucide-react';

type Item = {
  id: string; name: string; grams: number | null;
  category: string | null; checked: boolean;
};

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shift(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return iso(d);
}

const BRAK_DZIALU = 'Pozostałe';

export function ShoppingList({ anchorDate }: { anchorDate: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState<'checked' | 'all' | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/food/shopping');
      setItems(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (item: Item) => {
    // Optymistycznie — odhaczanie w sklepie ma być natychmiastowe.
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)));
    const res = await fetch(`/api/food/shopping/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: !item.checked }),
    });
    if (!res.ok) void load(); // cofnięcie przez ponowne wczytanie
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/food/shopping/${id}`, { method: 'DELETE' });
  };

  const addManual = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch('/api/food/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setNewName('');
        void load();
      }
    } finally {
      setBusy(false);
    }
  };

  /** Zaciągnięcie produktów z zaplanowanych dni — stąd bierze się lista na zakupy. */
  const addFromPlan = async (days: number) => {
    setBusy(true);
    setNote('');
    try {
      const from = anchorDate;
      const to = shift(anchorDate, days - 1);
      const res = await fetch('/api/food/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setNote(`Dodano ${body?.added ?? 0} nowych pozycji, ${body?.updated ?? 0} zsumowanych.`);
        void load();
      } else {
        setNote(body?.error || 'Nie udało się pobrać z planu.');
      }
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    const onlyChecked = confirmClear === 'checked';
    setConfirmClear(null);
    setBusy(true);
    try {
      await fetch(`/api/food/shopping${onlyChecked ? '?checked=1' : ''}`, { method: 'DELETE' });
      void load();
    } finally {
      setBusy(false);
    }
  };

  const copyAll = async () => {
    const text = items
      .filter((i) => !i.checked)
      .map((i) => `${i.name}${i.grams ? ` — ${Math.round(i.grams)} g` : ''}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNote('Przeglądarka nie pozwoliła skopiować listy.');
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const i of items) {
      const key = i.category || BRAK_DZIALU;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    }
    // Pozostałe zawsze na końcu, reszta alfabetycznie
    return [...map.entries()].sort(([a], [b]) =>
      a === BRAK_DZIALU ? 1 : b === BRAK_DZIALU ? -1 : a.localeCompare(b, 'pl')
    );
  }, [items]);

  const left = items.filter((i) => !i.checked).length;

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex justify-between items-baseline">
          <h2 className="font-semibold">Lista zakupów</h2>
          <span className="text-sm text-gray-500">
            {left} do kupienia{items.length > left && ` · ${items.length - left} odhaczone`}
          </span>
        </div>

        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addManual()}
            placeholder="Dopisz cokolwiek…"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2"
          />
          <button
            onClick={addManual}
            disabled={busy || !newName.trim()}
            className="px-4 rounded-lg bg-blue-600 text-white disabled:opacity-50 shrink-0"
            aria-label="Dodaj"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => addFromPlan(3)}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-50"
          >
            <CalendarPlus className="w-4 h-4" /> Z planu na 3 dni
          </button>
          <button
            onClick={() => addFromPlan(7)}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-50"
          >
            <CalendarPlus className="w-4 h-4" /> Na tydzień
          </button>
          <button
            onClick={copyAll}
            disabled={items.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-50"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Skopiowano' : 'Kopiuj'}
          </button>
        </div>

        {note && <p className="text-sm text-gray-600">{note}</p>}
        <p className="text-xs text-gray-400">
          „Z planu" bierze wszystko, co masz zapisane w dzienniku od dnia wybranego w widoku Dzień. Dania złożone
          rozbija na składniki.
        </p>
      </section>

      {loading && items.length === 0 && <p className="text-sm text-gray-400">Wczytuję…</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-gray-500">
          Lista jest pusta. Zaplanuj kilka dni w dzienniku i kliknij „Z planu", albo dopisz coś ręcznie.
        </p>
      )}

      {grouped.map(([category, list]) => (
        <section key={category} className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{category}</h3>
          <ul className="divide-y divide-gray-100">
            {list.map((i) => (
              <li key={i.id} className="py-2 flex items-center gap-3">
                <button
                  onClick={() => toggle(i)}
                  className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${
                    i.checked ? 'bg-green-500 border-green-500' : 'border-gray-300'
                  }`}
                  aria-label={i.checked ? 'Odznacz' : 'Odhacz'}
                >
                  {i.checked && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </button>
                <span className={`flex-1 min-w-0 ${i.checked ? 'line-through text-gray-400' : ''}`}>
                  <span className="block truncate">{i.name}</span>
                  {i.grams ? <span className="block text-xs text-gray-500">{Math.round(i.grams)} g</span> : null}
                </span>
                <button onClick={() => remove(i.id)} className="p-2 text-gray-300 hover:text-red-500" aria-label="Usuń">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {items.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => setConfirmClear('checked')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-300 text-sm"
          >
            <Eraser className="w-4 h-4" /> Usuń odhaczone
          </button>
          <button
            onClick={() => setConfirmClear('all')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-300 text-sm text-red-600"
          >
            <Trash2 className="w-4 h-4" /> Wyczyść listę
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmClear !== null}
        message={confirmClear === 'checked' ? 'Usunąć odhaczone pozycje?' : 'Wyczyścić całą listę zakupów?'}
        onConfirm={clear}
        onCancel={() => setConfirmClear(null)}
      />
    </div>
  );
}
