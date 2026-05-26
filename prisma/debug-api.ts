// npx tsx prisma/debug-api.ts
const BASE = 'https://oss.exercisedb.dev';

async function main() {
  // Sprawdź pole meta
  const r1 = await fetch(`${BASE}/api/v1/exercises?limit=25`);
  const j1 = await r1.json();
  console.log('meta:', JSON.stringify(j1.meta, null, 2));

  // Sprawdź filtrowanie po bodyPart
  for (const bp of ['chest', 'back', 'shoulders', 'upper+arms', 'upper+legs', 'waist']) {
    const r = await fetch(`${BASE}/api/v1/exercises?limit=25&bodyParts=${bp}`);
    const j = await r.json();
    const d = Array.isArray(j) ? j : (j?.data ?? []);
    console.log(`bodyPart=${bp}: ${d.length} ćwiczeń, pierwsze: ${d[0]?.name}`);
  }
}
main().catch(console.error);
