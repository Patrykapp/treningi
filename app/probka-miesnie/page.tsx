'use client';

// Strona-próbka do oceny wyglądu mapy mięśni (react-body-highlighter).
// Otwórz: /probka-miesnie po `npm install && npm run dev`.
// Można usunąć po decyzji.

import { MuscleMap } from '@/components/ui/MuscleMap';

const SAMPLES: { name: string; primary: string[]; secondary: string[] }[] = [
  { name: 'Wyciskanie sztangi na ławce', primary: ['pectorals'], secondary: ['triceps', 'shoulders'] },
  { name: 'Przysiad ze sztangą', primary: ['quads', 'glutes'], secondary: ['hamstrings', 'lower back'] },
  { name: 'Martwy ciąg', primary: ['lower back', 'glutes', 'hamstrings'], secondary: ['traps', 'forearms'] },
  { name: 'Uginanie ramion ze sztangą', primary: ['biceps'], secondary: ['forearms'] },
  { name: 'Podciąganie na drążku', primary: ['lats'], secondary: ['biceps', 'traps'] },
  { name: 'Wznosy bokiem', primary: ['shoulders'], secondary: [] },
];

export default function ProbkaMiesniePage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Próbka: mapa mięśni</h1>
      <p className="text-sm text-gray-500 mb-6">
        Podgląd komponentu <code>react-body-highlighter</code> na przykładowych ćwiczeniach.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLES.map(s => (
          <div key={s.name} className="bg-white rounded-2xl shadow-sm p-4 flex flex-col items-center">
            <h2 className="font-semibold text-gray-800 text-sm mb-3 text-center">{s.name}</h2>
            <MuscleMap primary={s.primary} secondary={s.secondary} />
          </div>
        ))}
      </div>
    </div>
  );
}
