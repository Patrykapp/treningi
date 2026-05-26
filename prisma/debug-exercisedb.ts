// Diagnoza: co ExerciseDB faktycznie ma i jak nazywa ćwiczenia
const BASE = 'https://oss.exercisedb.dev';

interface Ex { exerciseId: string; name: string; bodyParts: string[]; }

async function fetchPage(url: string): Promise<{ data: Ex[]; nextCursor?: string; hasNextPage: boolean }> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = await res.json();
  return {
    data: json.data || [],
    nextCursor: json.meta?.nextCursor,
    hasNextPage: json.meta?.hasNextPage ?? false,
  };
}

async function main() {
  // Pobierz tylko pierwszą stronę (500 ćwiczeń) żeby sprawdzić nazewnictwo
  const first = await fetchPage(`${BASE}/api/v1/exercises?limit=500`);
  console.log(`Pierwsza strona: ${first.data.length} ćwiczeń, hasNextPage: ${first.hasNextPage}`);

  // Zbierz unikalne bodyParts
  const bpSet = new Set<string>();
  first.data.forEach(e => (e.bodyParts || []).forEach(bp => bpSet.add(bp)));
  console.log('\nUnikalne bodyParts w ExerciseDB:', [...bpSet].sort().join(', '));

  // Szukaj konkretnych słów
  const terms = ['plank', 'crunch', 'deadlift', 'romanian', 'squat', 'curl', 'press', 'row', 'fly', 'pulldown', 'lunge'];
  console.log('\n=== Wyszukiwanie terminów (na 500 ćwiczeniach) ===');
  for (const term of terms) {
    const hits = first.data.filter(e => e.name.toLowerCase().includes(term));
    console.log(`"${term}": ${hits.length} wyników`);
    hits.slice(0, 3).forEach(e => console.log(`   [${e.bodyParts?.join(',')}] ${e.name}`));
  }

  // Pokaż przykładowe ćwiczenia z brzucha/waist
  console.log('\n=== Przykładowe ćwiczenia z waist/core/abs ===');
  const waistEx = first.data.filter(e =>
    (e.bodyParts || []).some(bp => ['waist', 'core', 'abs', 'abdominals'].includes(bp.toLowerCase()))
  );
  console.log(`Znaleziono: ${waistEx.length}`);
  waistEx.slice(0, 10).forEach(e => console.log(`  [${e.bodyParts?.join(',')}] ${e.name}`));

  // Pokaż pierwsze 20 nazw żeby zobaczyć konwencję
  console.log('\n=== Pierwsze 20 ćwiczeń w bazie ===');
  first.data.slice(0, 20).forEach(e => console.log(`  [${e.bodyParts?.join(',')}] ${e.name}`));
}

main().catch(console.error);
