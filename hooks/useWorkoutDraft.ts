'use client';

import { SetData } from '@/types';

export interface DraftEntry {
  id: string;
  exerciseId: string;
  exerciseName: string;
  sets: number;
  reps: number;
  weight: number;
  setsData: SetData[];
  rpe?: number;
  comment?: string;
}

export interface WorkoutDraft {
  date: string;
  userId: string;
  entries: DraftEntry[];
}

const DRAFT_KEY = 'workoutDraft';

function read(): WorkoutDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(draft: WorkoutDraft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export const workoutDraft = {
  get: read,

  add(entry: Omit<DraftEntry, 'id'>, date: string, userId: string) {
    const current = read();
    const newEntry: DraftEntry = { ...entry, id: String(Date.now()) };
    if (current) {
      write({ ...current, entries: [...current.entries, newEntry] });
    } else {
      write({ date, userId, entries: [newEntry] });
    }
    return newEntry;
  },

  remove(id: string) {
    const current = read();
    if (!current) return;
    const entries = current.entries.filter(e => e.id !== id);
    if (entries.length === 0) localStorage.removeItem(DRAFT_KEY);
    else write({ ...current, entries });
  },

  clear() {
    localStorage.removeItem(DRAFT_KEY);
  },

  setDate(date: string) {
    const current = read();
    if (current) write({ ...current, date });
  },

  setUser(userId: string) {
    const current = read();
    if (current) write({ ...current, userId });
  },
};
