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
}

export interface NewEntryForm {
  exerciseId: string;
  sets: number;
  reps: number;
  weight: number;
  rpe?: number;
  comment?: string;
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
  rpe?: number | null;
  comment?: string | null;
  setsData: SetData[];
  createdAt: string;
  updatedAt: string;
}
