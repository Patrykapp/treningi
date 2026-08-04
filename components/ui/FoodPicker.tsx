'use client';

/**
 * Wybór produktu do dziennika. Trzy drogi do tego samego celu:
 *   Szukaj — najpierw nasz katalog (własne + wcześniej zeskanowane),
 *            potem Open Food Facts, jeśli w katalogu nic nie ma
 *   Skanuj — kod kreskowy (Chrome na Androidzie)
 *   Nowy   — ręczne przepisanie z etykiety, dla rzeczy bez opakowania
 *
 * Komponent niczego nie zapisuje sam — zwraca wybrany produkt przez onPick,
 * a zapisem zajmuje się strona /dieta.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Camera, CameraOff, Search, PackagePlus, Flashlight, AlertTriangle, ArrowLeft } from 'lucide-react';

// --- typy Shape Detection API (brak w standardowych typach TS) ---
type DetectedBarcode = { rawValue: string; format: string };
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
};

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

/** Produkt gotowy do dodania — niezależnie od tego, skąd pochodzi. */
export type Candidate = {
  productId?: string; // ustawione tylko dla pozycji już zapisanych w katalogu
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  fiber100?: number | null;
  sugars100?: number | null;
  salt100?: number | null;
  servingG?: number | null;
  source: 'OWN' | 'SEED' | 'OFF';
};

type CatalogRow = {
  id: string; name: string; brand: string | null; barcode: string | null;
  kcal100: number; protein100: number; carbs100: number; fat100: number;
  fiber100: number | null; sugars100: number | null; salt100: number | null;
  servingG: number | null; source: string; usageCount: number;
};

type OffHit = {
  code: string; name: string; brand: string | null;
  kcal100: number | null; protein100: number | null; carbs100: number | null; fat100: number | null;
};

function fromCatalog(r: CatalogRow): Candidate {
  return {
    productId: r.id,
    name: r.name,
    brand: r.brand,
    barcode: r.barcode,
    kcal100: r.kcal100,
    protein100: r.protein100,
    carbs100: r.carbs100,
    fat100: r.fat100,
    fiber100: r.fiber100,
    sugars100: r.sugars100,
    salt100: r.salt100,
    servingG: r.servingG,
    source: r.source === 'SEED' ? 'SEED' : r.source === 'OFF' ? 'OFF' : 'OWN',
  };
}

const dec = (s: string) => parseFloat(s.replace(',', '.'));

export function FoodPicker({
  isOpen,
  mealLabel,
  onClose,
  onPick,
}: {
  isOpen: boolean;
  mealLabel: string;
  onClose: () => void;
  onPick: (c: Candidate, grams: number) => Promise<void>;
}) {
  const [tab, setTab] = useState<'search' | 'scan' | 'new'>('search');
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [grams, setGrams] = useState(100);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  // szukanie
  const [q, setQ] = useState('');
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [off, setOff] = useState<OffHit[]>([]);
  const [searching, setSearching] = useState(false);

  // skaner
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const lastCodeRef = useRef('');
  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [scannerReady, setScannerReady] = useState<boolean | null>(null);

  // ręczny wpis
  const [form, setForm] = useState({ name: '', brand: '', kcal: '', protein: '', carbs: '', fat: '', serving: '', barcode: '' });

  const stopScan = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  // Zamknięcie okna zawsze gasi kamerę — inaczej dioda świeci dalej.
  useEffect(() => {
    if (!isOpen) {
      stopScan();
      setPicked(null);
      setNote('');
      setQ('');
      setCatalog([]);
      setOff([]);
      setTab('search');
    }
  }, [isOpen, stopScan]);

  useEffect(() => stopScan, [stopScan]);

  useEffect(() => {
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    setScannerReady(Boolean(Ctor));
  }, []);

  const choose = useCallback((c: Candidate) => {
    setPicked(c);
    setGrams(c.servingG && c.servingG > 0 && c.servingG <= 500 ? Math.round(c.servingG) : 100);
    setNote('');
    stopScan();
  }, [stopScan]);

  // --- szukanie: katalog + Open Food Facts ---
  useEffect(() => {
    if (!isOpen || tab !== 'search') return;
    const term = q.trim();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const catRes = await fetch(`/api/food/products?q=${encodeURIComponent(term)}`);
        const cat: CatalogRow[] = catRes.ok ? await catRes.json() : [];
        setCatalog(cat);

        // Open Food Facts pytamy tylko wtedy, gdy katalog nie wystarcza —
        // oszczędza limit API i nie zaśmieca listy duplikatami.
        if (term.length >= 3 && cat.length < 8) {
          const offRes = await fetch(`/api/food/search?q=${encodeURIComponent(term)}`);
          const hits: OffHit[] = offRes.ok ? await offRes.json() : [];
          const known = new Set(cat.map((c) => c.barcode).filter(Boolean));
          setOff(hits.filter((h) => !known.has(h.code)));
        } else {
          setOff([]);
        }
      } finally {
        setSearching(false);
      }
    }, term ? 400 : 0);
    return () => clearTimeout(t);
  }, [q, tab, isOpen]);

  // --- skaner ---
  const lookupBarcode = useCallback(async (code: string) => {
    setNote('Szukam produktu…');
    // 1) nasz katalog — natychmiast, bez ruszania zewnętrznego API
    const mine = await fetch(`/api/food/products?barcode=${code}`).then((r) => (r.ok ? r.json() : []));
    if (Array.isArray(mine) && mine.length > 0) {
      choose(fromCatalog(mine[0]));
      return;
    }
    // 2) Open Food Facts
    const res = await fetch(`/api/food/barcode?code=${code}`);
    if (res.status === 404) {
      setNote(`Kodu ${code} nie ma w bazie — przepisz wartości z etykiety.`);
      setForm((f) => ({ ...f, barcode: code }));
      setTab('new');
      return;
    }
    if (!res.ok) {
      setNote(`Nie udało się pobrać produktu (HTTP ${res.status}).`);
      return;
    }
    const p = await res.json();
    choose({
      name: p.name,
      brand: p.brand,
      barcode: p.code,
      kcal100: p.per100g.kcal ?? 0,
      protein100: p.per100g.protein ?? 0,
      carbs100: p.per100g.carbs ?? 0,
      fat100: p.per100g.fat ?? 0,
      fiber100: p.per100g.fiber,
      sugars100: p.per100g.sugars,
      salt100: p.per100g.salt,
      servingG: p.servingSizeG,
      source: 'OFF',
    });
  }, [choose]);

  const startScan = useCallback(async () => {
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Ctor) {
      setNote('Ta przeglądarka nie ma czytnika kodów. Użyj Chrome na Androidzie albo dodaj produkt ręcznie.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      detectorRef.current = new Ctor({ formats: FORMATS });
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorchAvailable(Boolean(caps?.torch));
      lastCodeRef.current = '';
      setScanning(true);
      setNote('Przyłóż kod kreskowy do kadru.');
    } catch (e) {
      setNote(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Brak zgody na kamerę — zezwól w ustawieniach strony.'
          : 'Nie udało się uruchomić kamery (wymagane HTTPS).'
      );
    }
  }, []);

  // Strumień podpinamy dopiero, gdy <video> jest w DOM.
  useEffect(() => {
    if (!scanning) return;
    const v = videoRef.current;
    const stream = streamRef.current;
    if (!v || !stream) return;
    v.srcObject = stream;
    void v.play().catch(() => setNote('Nie udało się uruchomić podglądu kamery.'));

    const id = window.setInterval(async () => {
      const d = detectorRef.current;
      if (!videoRef.current || !d || videoRef.current.readyState < 2) return;
      try {
        const found = await d.detect(videoRef.current);
        const code = found.find((b) => /^\d{6,14}$/.test(b.rawValue))?.rawValue;
        if (code && code !== lastCodeRef.current) {
          lastCodeRef.current = code;
          navigator.vibrate?.(60);
          stopScan();
          void lookupBarcode(code);
        }
      } catch {
        /* nieudana klatka — nieistotne */
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [scanning, lookupBarcode, stopScan]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  const pickManual = () => {
    const kcal = dec(form.kcal);
    if (!form.name.trim() || !Number.isFinite(kcal)) return;
    choose({
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      barcode: form.barcode.replace(/\D/g, '') || null,
      kcal100: kcal,
      protein100: Number.isFinite(dec(form.protein)) ? dec(form.protein) : 0,
      carbs100: Number.isFinite(dec(form.carbs)) ? dec(form.carbs) : 0,
      fat100: Number.isFinite(dec(form.fat)) ? dec(form.fat) : 0,
      servingG: Number.isFinite(dec(form.serving)) ? dec(form.serving) : null,
      source: 'OWN',
    });
  };

  const confirm = async () => {
    if (!picked || grams <= 0) return;
    setSaving(true);
    try {
      await onPick(picked, grams);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 w-full';
  const tabCls = (t: string) =>
    `flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
    }`;

  const f = grams / 100;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={picked ? 'Ile zjadłeś?' : `Dodaj do: ${mealLabel}`}>
      {picked ? (
        <div className="space-y-4">
          <button onClick={() => setPicked(null)} className="flex items-center gap-1 text-sm text-blue-600">
            <ArrowLeft className="w-4 h-4" /> wróć do listy
          </button>

          <div>
            <p className="font-semibold">{picked.name}</p>
            <p className="text-sm text-gray-500">
              {picked.brand || 'bez marki'} ·{' '}
              {picked.source === 'OWN' ? 'twój produkt' : picked.source === 'SEED' ? 'baza podstawowa' : 'Open Food Facts'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              value={grams}
              onChange={(e) => setGrams(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold"
              autoFocus
            />
            <span className="text-gray-600">g</span>
            {[50, 100, 150, 200].map((g) => (
              <button key={g} onClick={() => setGrams(g)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-sm">
                {g}
              </button>
            ))}
            {picked.servingG ? (
              <button
                onClick={() => setGrams(Math.round(picked.servingG!))}
                className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm"
              >
                porcja {Math.round(picked.servingG)} g
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { l: 'kcal', v: Math.round(picked.kcal100 * f) },
              { l: 'Białko', v: Math.round(picked.protein100 * f * 10) / 10 },
              { l: 'Węgle', v: Math.round(picked.carbs100 * f * 10) / 10 },
              { l: 'Tłuszcz', v: Math.round(picked.fat100 * f * 10) / 10 },
            ].map((x) => (
              <div key={x.l} className="rounded-lg bg-gray-50 py-2">
                <p className="text-lg font-bold">{x.v}</p>
                <p className="text-xs text-gray-500">{x.l}</p>
              </div>
            ))}
          </div>

          <button
            onClick={confirm}
            disabled={saving || grams <= 0}
            className="w-full rounded-xl bg-green-600 text-white py-3 font-semibold disabled:opacity-50"
          >
            {saving ? 'Zapisuję…' : `Dodaj do: ${mealLabel}`}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={() => { stopScan(); setTab('search'); }} className={tabCls('search')}>Szukaj</button>
            <button onClick={() => setTab('scan')} className={tabCls('scan')}>Skanuj</button>
            <button onClick={() => { stopScan(); setTab('new'); }} className={tabCls('new')}>Nowy</button>
          </div>

          {note && <p className="text-sm text-amber-700">{note}</p>}

          {tab === 'search' && (
            <>
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-gray-400 shrink-0" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Nazwa produktu…"
                  className={inputCls}
                  autoFocus
                />
              </div>
              {searching && <p className="text-sm text-gray-500">Szukam…</p>}

              {catalog.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    {q.trim() ? 'Z twojej bazy' : 'Ostatnio używane'}
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {catalog.map((c) => (
                      <li key={c.id}>
                        <button onClick={() => choose(fromCatalog(c))} className="w-full text-left py-2 flex justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate">{c.name}</span>
                            <span className="block text-xs text-gray-500">{c.brand || '—'}</span>
                          </span>
                          <span className="text-sm text-gray-600 shrink-0">{Math.round(c.kcal100)} kcal</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {off.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Open Food Facts</p>
                  <ul className="divide-y divide-gray-100">
                    {off.map((h) => (
                      <li key={h.code}>
                        <button
                          onClick={() =>
                            choose({
                              name: h.name,
                              brand: h.brand,
                              barcode: h.code,
                              kcal100: h.kcal100 ?? 0,
                              protein100: h.protein100 ?? 0,
                              carbs100: h.carbs100 ?? 0,
                              fat100: h.fat100 ?? 0,
                              source: 'OFF',
                            })
                          }
                          className="w-full text-left py-2 flex justify-between gap-3"
                        >
                          <span className="min-w-0">
                            <span className="block truncate">{h.name}</span>
                            <span className="block text-xs text-gray-500">{h.brand || '—'}</span>
                          </span>
                          <span className="text-sm text-gray-600 shrink-0">{Math.round(h.kcal100 ?? 0)} kcal</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!searching && q.trim().length >= 3 && catalog.length === 0 && off.length === 0 && (
                <div className="text-sm text-gray-600 space-y-2">
                  <p>Nic nie znalazłem — pieczywa na wagę i warzyw w otwartych bazach po prostu nie ma.</p>
                  <button
                    onClick={() => { setForm((x) => ({ ...x, name: q.trim() })); setTab('new'); }}
                    className="text-blue-600 underline"
                  >
                    Dodaj „{q.trim()}" ręcznie
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'scan' && (
            <div className="space-y-3">
              {scannerReady === false && (
                <p className="text-sm text-amber-700 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  Ta przeglądarka nie ma czytnika kodów — na Windowsie nie ma go nawet Chrome. Skaner działa na
                  Chrome na Androidzie.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={scanning ? stopScan : startScan}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white py-2.5 font-medium"
                >
                  {scanning ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                  {scanning ? 'Zatrzymaj' : 'Włącz kamerę'}
                </button>
                {scanning && torchAvailable && (
                  <button
                    onClick={toggleTorch}
                    className={`px-4 rounded-lg border ${torchOn ? 'bg-amber-100 border-amber-300' : 'border-gray-300'}`}
                    aria-label="Latarka"
                  >
                    <Flashlight className="w-5 h-5" />
                  </button>
                )}
              </div>
              {scanning && (
                <div className="relative rounded-lg overflow-hidden bg-black">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video ref={videoRef} playsInline muted className="w-full aspect-[4/3] object-cover" />
                  <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-24 border-2 border-white/70 rounded-lg" />
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  inputMode="numeric"
                  placeholder="…albo wpisz kod ręcznie"
                  className={inputCls}
                />
                <button
                  onClick={() => form.barcode && lookupBarcode(form.barcode.replace(/\D/g, ''))}
                  className="px-4 rounded-lg border border-gray-300 shrink-0"
                >
                  Szukaj
                </button>
              </div>
            </div>
          )}

          {tab === 'new' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <PackagePlus className="w-4 h-4" /> Wartości na 100 g
              </div>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nazwa (np. Bułka kajzerka)" className={inputCls} autoFocus />
              <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Marka / sklep (opcjonalnie)" className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['kcal', 'kcal / 100 g *'],
                  ['protein', 'Białko / 100 g'],
                  ['carbs', 'Węglowodany / 100 g'],
                  ['fat', 'Tłuszcz / 100 g'],
                  ['serving', 'Typowa porcja w g'],
                  ['barcode', 'Kod kreskowy (opcj.)'],
                ] as const).map(([k, label]) => (
                  <input
                    key={k}
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    inputMode={k === 'barcode' ? 'numeric' : 'decimal'}
                    placeholder={label}
                    className={inputCls}
                  />
                ))}
              </div>
              <button
                onClick={pickManual}
                disabled={!form.name.trim() || !form.kcal.trim()}
                className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium disabled:opacity-50"
              >
                Dalej
              </button>
              <p className="text-xs text-gray-500">
                Produkt zapisze się w twojej bazie przy dodaniu do dziennika — następnym razem znajdziesz go od razu.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
