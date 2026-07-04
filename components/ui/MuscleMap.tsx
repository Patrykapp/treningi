'use client';

import Model, { IExerciseData } from 'react-body-highlighter';

// Typ pojedynczego mięśnia akceptowanego przez react-body-highlighter
type Muscle = IExerciseData['muscles'][number];

// Mapowanie nazw mięśni (ExerciseDB / free-exercise-db / polskie grupy) → slug biblioteki.
// Klucze zawsze lowercase.
const MUSCLE_MAP: Record<string, Muscle[]> = {
  // Klatka
  'chest': ['chest'], 'pectorals': ['chest'], 'pectoralis': ['chest'], 'klatka': ['chest'], 'klatka piersiowa': ['chest'], 'klata': ['chest'],
  // Barki
  'shoulders': ['front-deltoids', 'back-deltoids'], 'delts': ['front-deltoids', 'back-deltoids'],
  'deltoids': ['front-deltoids', 'back-deltoids'], 'barki': ['front-deltoids', 'back-deltoids'],
  'front delts': ['front-deltoids'], 'rear delts': ['back-deltoids'],
  // Ramiona
  'biceps': ['biceps'], 'triceps': ['triceps'], 'forearms': ['forearm'], 'forearm': ['forearm'], 'przedramiona': ['forearm'],
  // Plecy
  'lats': ['upper-back'], 'latissimus dorsi': ['upper-back'], 'upper back': ['upper-back'], 'middle back': ['upper-back'], 'plecy': ['upper-back', 'trapezius'],
  'traps': ['trapezius'], 'trapezius': ['trapezius'],
  'lower back': ['lower-back'], 'spine': ['lower-back'], 'erector spinae': ['lower-back'],
  // Brzuch
  'abs': ['abs'], 'abdominals': ['abs'], 'core': ['abs'], 'brzuch': ['abs'], 'obliques': ['obliques'], 'serratus anterior': ['obliques'],
  // Nogi
  'quads': ['quadriceps'], 'quadriceps': ['quadriceps'], 'nogi': ['quadriceps', 'hamstring'],
  'hamstrings': ['hamstring'], 'hamstring': ['hamstring'],
  'glutes': ['gluteal'], 'gluteus': ['gluteal'], 'gluteus maximus': ['gluteal'],
  'calves': ['calves'], 'łydki': ['calves'],
  'adductors': ['adductor'], 'adductor': ['adductor'], 'abductors': ['abductors'],
  'neck': ['neck'], 'kark': ['neck'],
};

function toMuscles(names: string[] = []): Muscle[] {
  const out = new Set<Muscle>();
  for (const n of names) {
    const key = (n || '').toLowerCase().trim();
    (MUSCLE_MAP[key] || []).forEach(m => out.add(m));
  }
  return [...out];
}

const COLOR_SECONDARY = '#fca5a5';
const COLOR_PRIMARY = '#dc2626';

// Mapa mięśni (przód + tył) z podświetleniem: główne na czerwono, pomocnicze na jasnoczerwono.
export function MuscleMap({
  primary = [],
  secondary = [],
  width = '8.5rem',
}: {
  primary?: string[];
  secondary?: string[];
  width?: string;
}) {
  const prim = toMuscles(primary);
  const sec = toMuscles(secondary).filter(m => !prim.includes(m));

  // frequency=1 → COLOR_SECONDARY (index 0), frequency=2 → COLOR_PRIMARY (index 1)
  const data: IExerciseData[] = [
    { name: 'pomocnicze', muscles: sec, frequency: 1 },
    { name: 'główne', muscles: prim, frequency: 2 },
  ];
  const highlightedColors = [COLOR_SECONDARY, COLOR_PRIMARY];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-3 items-start justify-center">
        <Model data={data} type="anterior" highlightedColors={highlightedColors} style={{ width }} />
        <Model data={data} type="posterior" highlightedColors={highlightedColors} style={{ width }} />
      </div>
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLOR_PRIMARY }} /> główne
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLOR_SECONDARY }} /> pomocnicze
        </span>
      </div>
    </div>
  );
}
