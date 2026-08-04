'use client';

/**
 * PROTOTYP — test skanera kodów kreskowych i bazy produktów.
 *
 * Cel: sprawdzić na prawdziwym telefonie, ile produktów z Lidla/Biedronki
 * faktycznie znajdzie się w Open Food Facts, zanim powstanie właściwy moduł
 * diety z zapisem do bazy.
 *
 * Ta strona NIC nie zapisuje — "dziennik" niżej żyje tylko w pamięci karty
 * i znika po odświeżeniu. Cały prototyp to 3 pliki, można je skasować bez
 * śladu w schemacie bazy:
 *   app/dieta-test/page.tsx, app/api/food/barcode/route.ts, app/api/food/search/route.ts
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Camera, CameraOff, Search, Plus, Trash2, Flashlight, AlertTriangle } from 'lucide-react';

// --- typy Shape Detection API (brak w standardowych typach TS) ---
type DetectedBarcode = { rawValue: string; format: string };
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
};

type Product = {
  code: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  quantity: string | null;
  servingSizeG: number | null;
  per100g: {
    kcal: number | null; protein: number | null; carbs: number | null; sugars: number | null;
    fat: number | null; saturated: number | null; fiber: number | null; salt: number | null;
  };
  completeness: number;
};

type SearchHit = {
  code: string; name: string; brand: string | null; imageUrl: string | null;
  kcal100: number | null; protein100: number | null; carbs100: number | null; fat100: number | null;
};

type LogItem = { id: string; name: string; grams: number; kcal: number; p: number; c: number; f: number };

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

function r(n: number | null | undefined, d = 1): string {
  return n === null || n === undefined ? '—' : (Math.round(n * 10 ** d) / 10 ** d).toString();
}

export default function DietaTestPage() {
  const { isLoggedIn } = useAuth();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const loopRef = useRef<number | null>(null);
  const lastCodeRef = useRef<string>('');

  const [support, setSupport] = useState<{ available: boolean; formats: string[] } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [status, setStatus] = useState<string>('');

  const [manualCode, setManualCode] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [grams, setGrams] = useState(100);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [log, setLog] = useState<LogItem[]>([]);

  // --- wykrycie wsparcia przeglądarki ---
  useEffect(() => {
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Ctor) {
      setSupport({ available: false, formats: [] });
      return;
    }
    Ctor.getSupportedFormats()
      .then((f) => setSupport({ available: true, formats: f }))
      .catch(() => setSupport({ available: true, formats: [] }));
  }, []);

  const lookup = useCallback(async (code: string) => {
    setLoading(true);
    setStatus('');
    try {
      const res = await fetch(`/api/food/barcode?code=${encodeURIComponent(code)}`);
      if (res.status === 404) {
        setProduct(null);
        setStatus(`Kod ${code} — brak w bazie Open Food Facts. Taki produkt trzeba by dodać ręcznie.`);
        return;
      }
      if (!res.ok) {
        setProduct(null);
        setStatus('Błąd pobierania danych produktu.');
        return;
      }
      const p: Product = await res.json();
      setProduct(p);
      setGrams(p.servingSizeG && p.servingSizeG > 0 && p.servingSizeG <= 500 ? p.servingSizeG : 100);
      setStatus('');
    } finally {
      setLoading(false);
    }
  }, []);

  const stopScan = useCallback(() => {
    if (loopRef.current !== null) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  const startScan = useCallback(async () => {
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Ctor) {
      setStatus('Ta przeglądarka nie ma BarcodeDetector. Na Androidzie użyj Chrome; wpisz kod ręcznie poniżej.');
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

      // Podgląd montuje się dopiero teraz — strumień podpina useEffect niżej.
      // (Trzymanie <video> pod display:none potrafi wstrzymać dekodowanie klatek,
      // a wtedy detektor nie ma czego czytać.)
      setScanning(true);
      setStatus('Skanuję… przyłóż kod kreskowy do kadru.');
    } catch (e) {
      setStatus(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Brak zgody na kamerę. Zezwól w ustawieniach strony i spróbuj ponownie.'
          : 'Nie udało się uruchomić kamery. Kamera działa tylko po HTTPS.'
      );
    }
  }, []);

  // Podpięcie strumienia i pętla detekcji — dopiero gdy <video> jest w DOM.
  useEffect(() => {
    if (!scanning) return;
    const v = videoRef.current;
    const stream = streamRef.current;
    if (!v || !stream) return;

    v.srcObject = stream;
    void v.play().catch(() => setStatus('Nie udało się uruchomić podglądu kamery.'));

    const id = window.setInterval(async () => {
      const d = detectorRef.current;
      if (!videoRef.current || !d || videoRef.current.readyState < 2) return;
      try {
        const found = await d.detect(videoRef.current);
        const code = found.find((b) => /^\d{6,14}$/.test(b.rawValue))?.rawValue;
        if (code && code !== lastCodeRef.current) {
          lastCodeRef.current = code;
          navigator.vibrate?.(60);
          setManualCode(code);
          stopScan();
          void lookup(code);
        }
      } catch {
        /* pojedyncza nieudana klatka nie ma znaczenia */
      }
    }, 250);
    loopRef.current = id;

    return () => window.clearInterval(id);
  }, [scanning, lookup, stopScan]);

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

  // sprzątanie kamery przy wyjściu ze strony
  useEffect(() => stopScan, [stopScan]);

  // wyszukiwanie po nazwie, z debounce (limit OFF!)
  useEffect(() => {
    if (q.trim().length < 3) {
      setHits(null);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/food/search?q=${encodeURIComponent(q.trim())}`);
        setHits(res.ok ? await res.json() : []);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [q]);

  const factor = grams / 100;
  const addToLog = () => {
    if (!product?.per100g.kcal) return;
    setLog((prev) => [
      {
        id: `${product.code}-${prev.length}`,
        name: `${product.brand ? product.brand + ' ' : ''}${product.name}`,
        grams,
        kcal: Math.round(product.per100g.kcal! * factor),
        p: Math.round((product.per100g.protein ?? 0) * factor * 10) / 10,
        c: Math.round((product.per100g.carbs ?? 0) * factor * 10) / 10,
        f: Math.round((product.per100g.fat ?? 0) * factor * 10) / 10,
      },
      ...prev,
    ]);
  };

  const totals = log.reduce(
    (a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }),
    { kcal: 0, p: 0, c: 0, f: 0 }
  );

  if (isLoggedIn === false) {
    return (
      <div className="max-w-2xl mx-auto p-4 pb-24">
        <p className="text-gray-600">Zaloguj się, żeby przetestować prototyp.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24 space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Dieta — prototyp</h1>
        <p className="text-sm text-gray-500">
          Test skanera i bazy Open Food Facts. Nic się nie zapisuje — dziennik znika po odświeżeniu.
        </p>
      </header>

      {/* Diagnostyka przeglądarki */}
      <div className="rounded-lg border border-gray-200 p-3 text-sm">
        {support === null ? (
          <span className="text-gray-500">Sprawdzam obsługę skanera…</span>
        ) : support.available ? (
          <span className="text-green-700">
            ✓ BarcodeDetector dostępny{support.formats.length > 0 && ` (${support.formats.length} formatów)`}
          </span>
        ) : (
          <span className="text-amber-700 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            Brak BarcodeDetector w tej przeglądarce. Na Androidzie działa Chrome; na iPhone trzeba dołożyć
            bibliotekę ZXing. Kod można wpisać ręcznie.
          </span>
        )}
      </div>

      {/* Skaner */}
      <section className="rounded-lg border border-gray-200 p-3 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={scanning ? stopScan : startScan}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white py-2.5 font-medium active:bg-blue-700"
          >
            {scanning ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
            {scanning ? 'Zatrzymaj' : 'Skanuj kod'}
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
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            inputMode="numeric"
            placeholder="…albo wpisz kod ręcznie"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2"
          />
          <button
            onClick={() => manualCode && lookup(manualCode)}
            disabled={loading}
            className="px-4 rounded-lg border border-gray-300 disabled:opacity-50"
          >
            Sprawdź
          </button>
        </div>

        {status && <p className="text-sm text-amber-700">{status}</p>}
      </section>

      {/* Wynik */}
      {product && (
        <section className="rounded-lg border border-gray-200 p-3 space-y-3">
          <div className="flex gap-3">
            {product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt="" className="w-16 h-16 object-contain rounded" />
            )}
            <div className="min-w-0">
              <p className="font-semibold truncate">{product.name}</p>
              <p className="text-sm text-gray-500">
                {product.brand || 'bez marki'} {product.quantity && `· ${product.quantity}`}
              </p>
              <p className="text-xs text-gray-400">
                kod {product.code} · kompletność wpisu {Math.round(product.completeness * 100)}%
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Porcja</label>
            <input
              type="number"
              value={grams}
              onChange={(e) => setGrams(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-24 rounded-lg border border-gray-300 px-3 py-2"
            />
            <span className="text-sm text-gray-600">g</span>
            {product.servingSizeG && (
              <button onClick={() => setGrams(product.servingSizeG!)} className="text-sm text-blue-600 underline">
                porcja producenta ({product.servingSizeG} g)
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { l: 'kcal', v: product.per100g.kcal !== null ? Math.round(product.per100g.kcal * factor) : null, d: 0 },
              { l: 'Białko', v: product.per100g.protein !== null ? product.per100g.protein * factor : null, d: 1 },
              { l: 'Węgle', v: product.per100g.carbs !== null ? product.per100g.carbs * factor : null, d: 1 },
              { l: 'Tłuszcz', v: product.per100g.fat !== null ? product.per100g.fat * factor : null, d: 1 },
            ].map((x) => (
              <div key={x.l} className="rounded-lg bg-gray-50 py-2">
                <p className="text-lg font-bold">{r(x.v, x.d)}</p>
                <p className="text-xs text-gray-500">{x.l}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400">
            Na 100 g: {r(product.per100g.kcal, 0)} kcal · B {r(product.per100g.protein)} · W{' '}
            {r(product.per100g.carbs)} (w tym cukry {r(product.per100g.sugars)}) · T {r(product.per100g.fat)} (nasyc.{' '}
            {r(product.per100g.saturated)}) · błonnik {r(product.per100g.fiber)} · sól {r(product.per100g.salt)}
          </p>

          <button
            onClick={addToLog}
            disabled={product.per100g.kcal === null}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-600 text-white py-2.5 font-medium disabled:opacity-50"
          >
            <Plus className="w-5 h-5" /> Dodaj do dziennika
          </button>
        </section>
      )}

      {/* Wyszukiwanie po nazwie */}
      <section className="rounded-lg border border-gray-200 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj po nazwie (np. skyr, kefir, bułka)"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
        {searching && <p className="text-sm text-gray-500">Szukam…</p>}
        {hits !== null && !searching && hits.length === 0 && (
          <p className="text-sm text-amber-700">
            Brak wyników w polskiej części bazy. Właśnie po to moduł będzie potrzebował własnej tabeli produktów.
          </p>
        )}
        {hits && hits.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {hits.map((h) => (
              <li key={h.code}>
                <button
                  onClick={() => { setManualCode(h.code); void lookup(h.code); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="w-full text-left py-2 flex justify-between gap-3 active:bg-gray-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{h.name}</span>
                    <span className="block text-xs text-gray-500">{h.brand || '—'}</span>
                  </span>
                  <span className="text-sm text-gray-600 shrink-0">{r(h.kcal100, 0)} kcal/100g</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Dziennik (tylko w pamięci) */}
      {log.length > 0 && (
        <section className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="flex justify-between items-baseline">
            <h2 className="font-semibold">Dziennik (nie zapisuje się)</h2>
            <span className="text-sm text-gray-600">
              {totals.kcal} kcal · B {r(totals.p)} · W {r(totals.c)} · T {r(totals.f)}
            </span>
          </div>
          <ul className="divide-y divide-gray-100">
            {log.map((i) => (
              <li key={i.id} className="py-2 flex justify-between items-center gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{i.name}</span>
                  <span className="block text-xs text-gray-500">{i.grams} g · {i.kcal} kcal</span>
                </span>
                <button
                  onClick={() => setLog((p) => p.filter((x) => x.id !== i.id))}
                  className="p-2 text-gray-400"
                  aria-label="Usuń"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-gray-400">
        Dane produktów: Open Food Facts (licencja ODbL).
      </p>
    </div>
  );
}
