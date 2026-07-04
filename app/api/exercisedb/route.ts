import { NextResponse } from 'next/server';
import { framesForName } from '@/lib/exerciseImages';

const BASE = 'https://oss.exercisedb.dev';

// Dokleja klatki animacji z free-exercise-db (host static.exercisedb.dev
// został wyłączony — patrz lib/exerciseImages.ts). Nadpisuje martwe gifUrl.
async function withImages<T extends { name?: string; gifUrl?: string }>(ex: T): Promise<T & { images: string[]; gifUrl: string }> {
  const frames = ex?.name ? await framesForName(ex.name) : null;
  return {
    ...ex,
    images: frames ?? [],
    gifUrl: frames?.[0] ?? '', // stare static.exercisedb.dev już nie żyje
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bodyPart = searchParams.get('bodyPart');
  const exId     = searchParams.get('id');

  let url: string;
  if (exId) {
    url = `${BASE}/api/v1/exercises/${encodeURIComponent(exId)}`;
  } else if (bodyPart) {
    url = `${BASE}/api/v1/exercises?limit=100&bodyParts=${encodeURIComponent(bodyPart)}`;
  } else {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return NextResponse.json([], { status: 200 });
    const json = await res.json();

    if (exId) {
      // { success: true, data: { exerciseId, name, ... } }
      const ex = json?.data ?? json;
      if (!ex || !ex.exerciseId) return NextResponse.json(null);
      return NextResponse.json(await withImages(ex));
    }

    // { success: true, data: [...] }
    const list: { name?: string; gifUrl?: string }[] = Array.isArray(json) ? json : (json?.data ?? []);
    const withImgs = await Promise.all(list.map(withImages));
    return NextResponse.json(withImgs);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
