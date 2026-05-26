import { NextResponse } from 'next/server';

const BASE = 'https://oss.exercisedb.dev';

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
      return NextResponse.json(ex && ex.exerciseId ? ex : null);
    }

    // { success: true, data: [...] }
    const list: unknown[] = Array.isArray(json) ? json : (json?.data ?? []);
    return NextResponse.json(list);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
