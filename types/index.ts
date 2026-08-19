export interface User {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup?: string | null;
  exerciseDbId?: string | null;
  // Klatki animacji z free-exercise-db (doklejane przez /api/exercises).
  // gifUrl = pierwsza klatka (miniatura), images = wszystkie klatki.
  gifUrl?: string | null;
  images?: string[];
  // Liczba wpisów treningowych (popularność) — z bazy, przez /api/exercises.
  usageCount?: number;
  // Wskazówka techniczna AI — generowana raz, cache w bazie.
  aiTip?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutSession {
  id: string;
  date: string;
  userId: string;
  user: User;
  notes?: string | null;
  entries: WorkoutEntry[];
  // Dane z zegarka (import TCX) — opcjonalne
  durationSec?: number | null;
  kcal?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  hrSeries?: number[];
  createdAt: string;
  updatedAt: string;
}

export interface SetData {
  reps: number;
  weight: number;
  // true = ta seria to drop kontynuujący poprzednią bez przerwy (dropset).
  // Pierwsza seria łańcucha zostaje bez tego pola.
  isDrop?: boolean;
}

export interface NewEntryForm {
  exerciseId: string;
  sets: number;
  reps: number;
  weight: number;
  // Ćwiczenia mierzone czasem (bieżnia, stepmill, ergometr, skakanka).
  // null/undefined = zwykłe ćwiczenie na serie i powtórzenia.
  durationSec?: number | null;
  rpe?: number;
  comment?: string;
  meta?: unknown;
  setsData: SetData[];
}

export interface WorkoutEntry {
  id: string;
  sessionId: string;
  exerciseId: string;
  exercise: Exercise;
  sets: number;
  reps: number;
  weight: number;
  durationSec?: number | null;
  rpe?: number | null;
  comment?: string | null;
  meta?: unknown; // dane techniczne (np. challenge) — nie do pokazywania wprost
  setsData: SetData[];
  createdAt: string;
  updatedAt: string;
}
