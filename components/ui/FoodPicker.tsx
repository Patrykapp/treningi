'use client';

/**
 * Wybór posiłku do dziennika. Cztery drogi do tego samego celu:
 *   Szukaj — najpierw nasz katalog (ulubione, własne, baza podstawowa),
 *            potem Open Food Facts, jeśli w katalogu nic nie ma
 *   Opisz  — całe zdanie („pulpety, puree i surówka") rozbijane przez AI
 *            na pozycje z bazy; makro liczy serwer, nie model
 *   Skanuj — kod kreskowy (Chrome na Androidzie)
 *   Nowy   — ręczne przepisanie z etykiety, dla rzeczy bez opakowania
 *
 * Komponent niczego nie zapisuje sam — oddaje wybór przez onPick (pojedynczy
 * produkt) albo onPickMeal (posiłek złożony), a zapisem zajmuje się /dieta.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Camera, CameraOff, Search, PackagePlus, Flashlight, AlertTriangle, ArrowLeft, Star, Sparkles, Link as LinkIcon } from 'lucide-react';

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
  unit: 'g' | 'ml';
  source: 'OWN' | 'SEED' | 'OFF';
};

type CatalogRow = {
  id: string; name: string; brand: string | null; barcode: string | null;
  kcal100: number; protein100: number; carbs100: number; fat100: number;
  fiber100: number | null; sugars100: number | null; salt100: number | null;
  servingG: number | null; source: string; usageCount: number;
  unit?: string; isFavorite?: boolean; recipe?: string | null;
};

type ParsedIngredient = {
  name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number;
  // Wartości na 100 g/ml — dzięki nim przeliczenie jest bezstratne i działa
  // także po wyczyszczeniu pola do zera.
  kcal100: number; protein100: number; carbs100: number; fat100: number;
};
type ParsedMeal = { title: string; ingredients: ParsedIngredient[]; unmatched: string[] };

/** Posiłek złożony — z zakładki „Opisz". Zapisuje się jako jedna pozycja w dzienniku. */
export type ComposedMeal = {
  title: string;
  recipe: string;
  ingredients: { name: string; grams: number }[];
  kcal: number; protein: number; carbs: number; fat: number;
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
    unit: r.unit === 'ml' ? 'ml' : 'g',
    source: r.source === 'SEED' ? 'SEED' : r.source === 'OFF' ? 'OFF' : 'OWN',
  };
}

const dec = (s: string) => parseFloat(s.replace(',', '.'));

export function FoodPicker({
  isOpen,
  mealKey,
  mealLabel,
  onClose,
  onPick,
  onPickMeal,
}: {
  isOpen: boolean;
  mealKey: string | null;
  mealLabel: string;
  onClose: () => void;
  onPick: (c: Candidate, grams: number) => Promise<void>;
  onPickMeal: (m: ComposedMeal) => Promise<void>;
}) {
  const [tab, setTab] = useState<'search' | 'describe' | 'scan' | 'new'>('search');

  // zakładka „Opisz"
  const [describeText, setDescribeText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [composed, setComposed] = useState<ParsedMeal | null>(null);
  const [picked, setPicked] = useState<Candidate | null>(null);
  // Gramatura trzymana jako TEKST. Przy trzymaniu liczby `parseInt('') || 0`
  // zamieniał puste pole na „0" i nie dawało się skasować ostatniej cyfry,
  // żeby wpisać wartość od nowa.
  const [gramsStr, setGramsStr] = useState('100');
  const grams = parseInt(gramsStr, 10) || 0;
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  // szukanie
  const [q, setQ] = useState('');
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [off, setOff] = useState<OffHit[]>([]);
  const [searching, setSearching] = useState(false);
  // Filtr listy: wszystko / tylko ulubione / tylko zapisane dania.
  const [filter, setFilter] = useState<'all' | 'fav' | 'dishes'>('all');

  // skaner
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const lastCodeRef = useRef('');
  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [scannerReady, setScannerReady] = useState<boolean | null>(null);

  // import przepisu z adresu strony
  const [recipeUrl, setRecipeUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importInfo, setImportInfo] = useState('');

  // ręczny wpis
  const [form, setForm] = useState({ name: '', brand: '', kcal: '', protein: '', carbs: '', fat: '', serving: '', barcode: '' });
  const [formUnit, setFormUnit] = useState<'g' | 'ml'>('g');

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
      setDescribeText('');
      setComposed(null);
      setRecipeUrl('');
      setImportInfo('');
      setForm({ name: '', brand: '', kcal: '', protein: '', carbs: '', fat: '', serving: '', barcode: '' });
      setFormUnit('g');
    }
  }, [isOpen, stopScan]);

  useEffect(() => stopScan, [stopScan]);

  useEffect(() => {
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    setScannerReady(Boolean(Ctor));
  }, []);

  const choose = useCallback((c: Candidate) => {
    setPicked(c);
    setGramsStr(String(c.servingG && c.servingG > 0 && c.servingG <= 500 ? Math.round(c.servingG) : 100));
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
        const params = new URLSearchParams({ q: term });
        if (mealKey) params.set('meal', mealKey);
        if (filter === 'fav') params.set('favorites', '1');
        if (filter === 'dishes') params.set('dishes', '1');
        const catRes = await fetch(`/api/food/products?${params.toString()}`);
        const cat: CatalogRow[] = catRes.ok ? await catRes.json() : [];
        setCatalog(cat);

        // Open Food Facts pytamy tylko wtedy, gdy katalog nie wystarcza —
        // oszczędza limit API i nie zaśmieca listy duplikatami.
        // Open Food Facts tylko przy swobodnym szukaniu — filtry dotyczą
        // wyłącznie naszego katalogu.
        if (filter === 'all' && term.length >= 3 && cat.length < 8) {
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
  }, [q, tab, isOpen, mealKey, filter]);

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
    // Sporo wpisów w OFF to sama nazwa i zdjęcie. Dodanie takiego produktu
    // wpisałoby do dziennika 0 kcal, co jest gorsze niż brak wpisu.
    if (!p.hasNutrition) {
      setNote(
        `„${p.name}" jest w bazie, ale bez wartości odżywczych. Przepisz je z etykiety — zapamiętam ten kod.`
      );
      setForm((f) => ({
        ...f,
        name: p.name || '',
        brand: p.brand || '',
        barcode: p.code || '',
        kcal: '', protein: '', carbs: '', fat: '',
        serving: p.servingSizeG ? String(p.servingSizeG) : '',
      }));
      setFormUnit(p.unit === 'ml' ? 'ml' : 'g');
      setTab('new');
      return;
    }
    choose({
      name: p.name,
      brand: p.brand,
      barcode: p.code,
      unit: p.unit === 'ml' ? 'ml' : 'g',
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

  /** Rozpoznanie posiłku opisanego zdaniem — model mapuje tekst na produkty z bazy. */
  const parseDescription = async () => {
    const text = describeText.trim();
    if (text.length < 3) return;
    setParsing(true);
    setNote('');
    setComposed(null);
    try {
      const res = await fetch('/api/ai/parse-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNote(body?.error || 'Nie udało się rozpoznać posiłku.');
        return;
      }
      setComposed(body);
    } catch {
      setNote('Brak połączenia z serwerem.');
    } finally {
      setParsing(false);
    }
  };

  /** Zmiana gramatury pojedynczego składnika — makro przeliczamy proporcjonalnie. */
  const setIngredientGrams = (idx: number, grams: number) => {
    setComposed((prev) => {
      if (!prev) return prev;
      const ing = [...prev.ingredients];
      const old = ing[idx];
      if (!old) return prev;
      // Liczymy zawsze od wartości na 100 — nigdy od poprzedniego wyniku.
      // Wcześniej po wyczyszczeniu pola gramatura zostawała na zerze i każda
      // kolejna zmiana była odrzucana, więc pole zostawało puste na zawsze.
      const g = Number.isFinite(grams) && grams > 0 ? grams : 0;
      const f = g / 100;
      ing[idx] = {
        ...old,
        grams: g,
        kcal: Math.round(old.kcal100 * f),
        protein: Math.round(old.protein100 * f * 10) / 10,
        carbs: Math.round(old.carbs100 * f * 10) / 10,
        fat: Math.round(old.fat100 * f * 10) / 10,
      };
      return { ...prev, ingredients: ing };
    });
  };

  const toggleFavorite = async (row: CatalogRow) => {
    const next = !row.isFavorite;
    setCatalog((prev) => prev.map((c) => (c.id === row.id ? { ...c, isFavorite: next } : c)));
    await fetch(`/api/food/products/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: next }),
    });
  };

  /**
   * Import przepisu z bloga kulinarnego. Wypełnia formularz niżej, więc
   * przed zapisaniem widzisz i możesz poprawić każdą wartość.
   */
  const importRecipe = async () => {
    const url = recipeUrl.trim();
    if (!url) return;
    setImporting(true);
    setImportInfo('');
    setNote('');
    try {
      const res = await fetch('/api/food/recipe-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const b = await res.json();
      if (!res.ok) {
        setNote(b?.error || 'Nie udało się zaimportować przepisu.');
        return;
      }
      setForm({
        name: b.name || '',
        brand: '',
        kcal: String(b.kcal100 ?? ''),
        protein: String(b.protein100 ?? ''),
        carbs: String(b.carbs100 ?? ''),
        fat: String(b.fat100 ?? ''),
        serving: b.servingG ? String(b.servingG) : '',
        barcode: '',
      });
      setImportInfo(`${b.note ?? ''} Źródło: ${b.source}.${b.servingLabel ? ` Wydajność: ${b.servingLabel}.` : ''}`);
    } catch {
      setNote('Brak połączenia z serwerem.');
    } finally {
      setImporting(false);
    }
  };

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
      unit: formUnit,
      source: 'OWN',
    });
  };

  const confirm = async () => {
    if (!picked || grams <= 0) return;
    setSaving(true);
    try {
      await onPick(picked, grams);
      // Okno zostaje otwarte — jeden posiłek to zwykle kilka pozycji, a
      // zamykanie po każdej zmuszało do otwierania go od nowa.
      setPicked(null);
      setQ('');
      setNote(`Dodano: ${picked.name}`);
    } finally {
      setSaving(false);
    }
  };

  /** Dodanie od razu, bez ekranu gramatury — dla pozycji z typową porcją. */
  const quickAdd = async (c: Candidate) => {
    const g = c.servingG && c.servingG > 0 ? Math.round(c.servingG) : 100;
    setSaving(true);
    try {
      await onPick(c, g);
      setNote(`Dodano: ${c.name} (${g} ${c.unit})`);
    } finally {
      setSaving(false);
    }
  };

  const composedTotals = (composed?.ingredients ?? []).reduce(
    (a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const saveComposed = async () => {
    if (!composed || composed.ingredients.length === 0) return;
    setSaving(true);
    try {
      await onPickMeal({
        title: composed.title,
        // Przepis budujemy ze składu — przy takim wpisie nie ma sensu prosić
        // model o instrukcję gotowania czegoś, co użytkownik właśnie zjadł.
        recipe: composed.ingredients.map((i) => `${i.name} ${i.grams} g`).join(', '),
        ingredients: composed.ingredients.map((i) => ({ name: i.name, grams: i.grams })),
        kcal: Math.round(composedTotals.kcal),
        protein: Math.round(composedTotals.protein * 10) / 10,
        carbs: Math.round(composedTotals.carbs * 10) / 10,
        fat: Math.round(composedTotals.fat * 10) / 10,
      });
      setComposed(null);
      setDescribeText('');
      setNote('Dodano do dziennika.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 w-full';
  const tabCls = (t: string) =>
    `flex-1 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
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
              type="text"
              inputMode="numeric"
              value={gramsStr}
              onChange={(e) => setGramsStr(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold"
              autoFocus
            />
            <span className="text-gray-600">{picked.unit}</span>
            {(picked.unit === 'ml' ? [200, 250, 330, 500] : [50, 100, 150, 200]).map((g) => (
              <button key={g} onClick={() => setGramsStr(String(g))} className="px-3 py-1.5 rounded-lg bg-gray-100 text-sm">
                {g}
              </button>
            ))}
            {picked.servingG ? (
              <button
                onClick={() => setGramsStr(String(Math.round(picked.servingG!)))}
                className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm"
              >
                porcja {Math.round(picked.servingG)} {picked.unit}
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
          <div className="flex gap-1.5">
            <button onClick={() => { stopScan(); setTab('search'); }} className={tabCls('search')}>Szukaj</button>
            <button onClick={() => { stopScan(); setTab('describe'); }} className={tabCls('describe')}>Opisz</button>
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

              <div className="flex gap-2">
                {([
                  ['all', 'Wszystko'],
                  ['fav', '★ Ulubione'],
                  ['dishes', 'Moje dania'],
                ] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setFilter(v)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${
                      filter === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {searching && <p className="text-sm text-gray-500">Szukam…</p>}

              {catalog.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    {q.trim() ? 'Z twojej bazy' : 'Ulubione i ostatnio używane'}
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {catalog.map((c) => (
                      <li key={c.id} className="flex items-center gap-1">
                        <button onClick={() => choose(fromCatalog(c))} className="flex-1 min-w-0 text-left py-2 flex justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate">{c.name}</span>
                            <span className="block text-xs text-gray-500">
                              {c.brand || (c.recipe ? 'twoje danie' : '—')}
                              {c.servingG ? ` · porcja ${Math.round(c.servingG)} ${c.unit === 'ml' ? 'ml' : 'g'}` : ''}
                            </span>
                          </span>
                          <span className="text-sm text-gray-600 shrink-0">
                            {Math.round(c.kcal100)} kcal<span className="text-gray-400">/100{c.unit === 'ml' ? 'ml' : 'g'}</span>
                          </span>
                        </button>
                        <button
                          onClick={() => toggleFavorite(c)}
                          className="p-2 shrink-0"
                          aria-label={c.isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
                        >
                          <Star
                            className={`w-4 h-4 ${c.isFavorite ? 'text-amber-400' : 'text-gray-300'}`}
                            fill={c.isFavorite ? 'currentColor' : 'none'}
                          />
                        </button>
                        {/* Dodanie typowej porcji bez wchodzenia w szczegóły */}
                        {c.servingG ? (
                          <button
                            onClick={() => quickAdd(fromCatalog(c))}
                            disabled={saving}
                            className="px-2 py-1 shrink-0 rounded-lg bg-green-50 text-green-700 text-xs font-medium border border-green-200 disabled:opacity-50"
                            title={`Dodaj ${Math.round(c.servingG)} ${c.unit === 'ml' ? 'ml' : 'g'}`}
                          >
                            +{Math.round(c.servingG)}
                          </button>
                        ) : null}
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
                              unit: 'g',
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

              {!searching && filter !== 'all' && catalog.length === 0 && (
                <p className="text-sm text-gray-500">
                  {filter === 'fav'
                    ? 'Nie masz jeszcze ulubionych. Kliknij gwiazdkę przy produkcie, żeby trzymać go na górze listy.'
                    : 'Nie masz jeszcze zapisanych dań. Powstają z generatora jadłospisu, z zakładki „Opisz" i z importu przepisu.'}
                </p>
              )}

              {!searching && filter === 'all' && q.trim().length >= 3 && catalog.length === 0 && off.length === 0 && (
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

          {tab === 'describe' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Napisz, co zjadłeś, zwykłym zdaniem. Rozbiję to na składniki z bazy i policzę makro
                z prawdziwych wartości — możesz potem poprawić każdą gramaturę.
              </p>
              <textarea
                value={describeText}
                onChange={(e) => setDescribeText(e.target.value)}
                rows={2}
                placeholder="np. pulpety, puree i surówka z marchewki"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                autoFocus
              />
              <button
                onClick={parseDescription}
                disabled={parsing || describeText.trim().length < 3}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white py-2.5 font-medium disabled:opacity-50"
              >
                <Sparkles className="w-5 h-5" />
                {parsing ? 'Rozpoznaję…' : 'Rozpoznaj posiłek'}
              </button>

              {composed && (
                <div className="space-y-3 border-t border-gray-200 pt-3">
                  <p className="font-semibold">{composed.title}</p>

                  <ul className="space-y-2">
                    {composed.ingredients.map((i, idx) => (
                      <li key={`${i.name}-${idx}`} className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 text-sm truncate">{i.name}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={i.grams === 0 ? '' : String(i.grams)}
                          onChange={(e) => setIngredientGrams(idx, parseInt(e.target.value.replace(/\D/g, '').slice(0, 4), 10) || 0)}
                          className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm text-right"
                        />
                        <span className="text-xs text-gray-500 w-16 text-right shrink-0">{i.kcal} kcal</span>
                        <button
                          onClick={() =>
                            setComposed((prev) =>
                              prev ? { ...prev, ingredients: prev.ingredients.filter((_, k) => k !== idx) } : prev
                            )
                          }
                          className="text-gray-300 hover:text-red-500 shrink-0"
                          aria-label="Usuń składnik"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>

                  {composed.unmatched.length > 0 && (
                    <p className="text-xs text-amber-700 flex gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      Nie znalazłem w bazie: {composed.unmatched.join(', ')}. Dodaj to osobno przez zakładkę „Nowy".
                    </p>
                  )}

                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { l: 'kcal', v: Math.round(composedTotals.kcal) },
                      { l: 'Białko', v: Math.round(composedTotals.protein * 10) / 10 },
                      { l: 'Węgle', v: Math.round(composedTotals.carbs * 10) / 10 },
                      { l: 'Tłuszcz', v: Math.round(composedTotals.fat * 10) / 10 },
                    ].map((x) => (
                      <div key={x.l} className="rounded-lg bg-gray-50 py-2">
                        <p className="text-lg font-bold">{x.v}</p>
                        <p className="text-xs text-gray-500">{x.l}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={saveComposed}
                    disabled={saving || composed.ingredients.length === 0}
                    className="w-full rounded-xl bg-green-600 text-white py-3 font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Zapisuję…' : `Dodaj do: ${mealLabel}`}
                  </button>
                  <p className="text-xs text-gray-400">
                    Zapisze się jako jedna pozycja „{composed.title}". Skład zobaczysz w dzienniku pod ikoną czapki.
                  </p>
                </div>
              )}
            </div>
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
              {/* Import z przepisu — wypełnia formularz niżej */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-sm text-blue-800">
                  <LinkIcon className="w-4 h-4" /> Z przepisu w internecie
                </div>
                <div className="flex gap-2">
                  <input
                    value={recipeUrl}
                    onChange={(e) => setRecipeUrl(e.target.value)}
                    placeholder="https://aniagotuje.pl/przepis/..."
                    className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={importRecipe}
                    disabled={importing || !recipeUrl.trim()}
                    className="px-4 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50 shrink-0"
                  >
                    {importing ? '…' : 'Pobierz'}
                  </button>
                </div>
                {importInfo && <p className="text-xs text-blue-800">{importInfo}</p>}
                <p className="text-xs text-gray-500">
                  Czytam tabelę wartości odżywczych z przepisu. Jeśli autor jej nie podał, liczę ze składników.
                </p>
              </div>

              <div className="flex items-center gap-2 font-semibold text-sm pt-1">
                <PackagePlus className="w-4 h-4" /> Wartości na 100 {formUnit}
              </div>

              <div className="flex gap-2">
                {(['g', 'ml'] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => setFormUnit(u)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                      formUnit === u ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {u === 'g' ? 'Waga (g)' : 'Objętość (ml)'}
                  </button>
                ))}
              </div>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nazwa (np. Bułka kajzerka)" className={inputCls} autoFocus />
              <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Marka / sklep (opcjonalnie)" className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['kcal', `kcal / 100 ${formUnit} *`],
                  ['protein', `Białko / 100 ${formUnit}`],
                  ['carbs', `Węglowodany / 100 ${formUnit}`],
                  ['fat', `Tłuszcz / 100 ${formUnit}`],
                  ['serving', `Typowa porcja w ${formUnit}`],
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
