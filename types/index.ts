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
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface NewEntryForm {
  exerciseId: string;
  sets: number;
  reps: number;
  weight: number;
  rpe?: number;
  comment?: string;
}
