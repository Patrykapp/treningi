// Wspólna konfiguracja modelu językowego (Groq).
//
// Jedno miejsce na model dla całej aplikacji — zmiana tutaj przestawia
// wszystkie funkcje AI naraz, bez szukania po plikach.
//
// GPT-OSS 120B jest na Groqu w wersji produkcyjnej, kosztuje tyle samo co
// Llama (nic) i wyraźnie lepiej trzyma się instrukcji oraz liczy. Ma jednak
// jedną istotną różnicę: to model rozumujący. Zanim odpowie, zużywa tokeny
// na wewnętrzne rozumowanie, a te liczą się do `max_tokens`. Przy limicie 90
// tokenów (jak w podpowiedzi dnia) odpowiedź po prostu by się nie zmieściła —
// dlatego `aiMaxTokens()` dokłada zapas, a `AI_EXTRA` zbija rozumowanie do
// minimum tam, gdzie nie jest potrzebne.

export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

/** Czy wybrany model najpierw rozumuje, a dopiero potem odpowiada. */
export const AI_IS_REASONING =
  /gpt-oss|deepseek-r1|qwen3|magistral/i.test(GROQ_MODEL);

/**
 * Parametry doklejane do zapytania. Dla modeli rozumujących ustawiamy niski
 * poziom rozumowania — zadania w tej aplikacji są proste, a krótsze myślenie
 * to szybsza odpowiedź i mniejsze ryzyko obcięcia.
 */
export const AI_EXTRA: Record<string, unknown> = AI_IS_REASONING
  ? { reasoning_effort: 'low' }
  : {};

/** Limit tokenów powiększony o zapas na rozumowanie. */
export function aiMaxTokens(forAnswer: number): number {
  return AI_IS_REASONING ? forAnswer + 900 : forAnswer;
}

/**
 * Wyciąga treść odpowiedzi. Groq zwraca rozumowanie w osobnym polu, ale część
 * modeli potrafi wkleić je w treść jako <think>…</think> — usuwamy na wszelki
 * wypadek, żeby użytkownikowi nie wyświetliły się rozmyślania modelu.
 */
export function aiContent(groqJson: unknown): string {
  const content = (groqJson as { choices?: { message?: { content?: string } }[] })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return '';
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();
}
