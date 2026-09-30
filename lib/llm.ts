// The one place Yume calls a language model: grading answers, narrating the
// scene, voicing Hina, drifting the world, and building beginner cards. Every
// call sits in the live game loop — the player is waiting for the world to
// react — so speed matters as much as quality, and so does never stalling.
//
// The model is GPT-OSS 120B, served by whichever fast provider is configured:
//
//   Cerebras  ~3,000 tokens/s   CEREBRAS_API_KEY   tried first when present
//   Groq        ~500 tokens/s   GROQ_API_KEY       next, then GROQ_API_KEY_2
//   fal        ~2 s a call      FAL_KEY            the backstop: Gemini 2.5 Flash
//                                                  via fal's OpenRouter, paid from
//                                                  fal credits, with no daily cap
//
// Groq's free tier stops at 200,000 tokens a day, which one busy day of play
// uses up (it did, on 24 Sep); fal keeps the world talking when that happens.
//
// All three speak the OpenAI chat format, so one request shape serves each. When a
// provider rate-limits, errors or hangs, the call moves to the next one at once,
// and a rate-limited provider is skipped until its limit resets — so the free
// tiers of the two back each other up mid-session.

export type ProviderName = "cerebras" | "groq" | "groq-2" | "fal";

export type Provider = {
  name: ProviderName;
  url: string;
  key: string;
  model: string;
  /** The Authorization header's value. */
  auth: string;
  /** Parameters only this provider understands (undefined removes a default). */
  extra: Record<string, unknown>;
  /** How long a call may take before failing over. */
  timeoutMs?: number;
};

/** The providers configured in the environment, in the order they are tried. */
export function providers(): Provider[] {
  const list: Provider[] = [];
  if (process.env.CEREBRAS_API_KEY) {
    list.push({
      name: "cerebras",
      url: "https://api.cerebras.ai/v1/chat/completions",
      key: process.env.CEREBRAS_API_KEY,
      auth: `Bearer ${process.env.CEREBRAS_API_KEY}`,
      model: "gpt-oss-120b",
      extra: {},
    });
  }
  // Two Groq keys are two separate allowances (each 200,000 tokens a day on the
  // free tier): when one is spent, the other takes over.
  for (const [name, key] of [
    ["groq", process.env.GROQ_API_KEY],
    ["groq-2", process.env.GROQ_API_KEY_2],
  ] as const) {
    if (!key) continue;
    list.push({
      name,
      url: "https://api.groq.com/openai/v1/chat/completions",
      key,
      auth: `Bearer ${key}`,
      model: "openai/gpt-oss-120b",
      // GPT-OSS is a reasoning model — without this Groq leaks its
      // chain-of-thought into `content` and breaks JSON mode (a 400 with an
      // empty failed_generation). Cerebras returns reasoning separately.
      extra: { include_reasoning: false },
    });
  }
  if (process.env.FAL_KEY) {
    list.push({
      name: "fal",
      url: "https://fal.run/openrouter/router/openai/v1/chat/completions",
      key: process.env.FAL_KEY,
      auth: `Key ${process.env.FAL_KEY}`,
      model: process.env.FAL_LLM_MODEL ?? "google/gemini-2.5-flash",
      // Gemini thinks by default, which doubles the wait; these calls do not need it.
      extra: { reasoning: { enabled: false }, reasoning_effort: undefined },
      // A router hop, and now and then a cold start.
      timeoutMs: 12_000,
    });
  }
  // LLM_PROVIDER=groq keeps Groq first even when a Cerebras key is present.
  const preferred = process.env.LLM_PROVIDER;
  return preferred ? [...list.filter((p) => p.name === preferred), ...list.filter((p) => p.name !== preferred)] : list;
}

/** Whether any model provider is configured at all. */
export function hasModel(): boolean {
  return providers().length > 0;
}

// A provider that just rate-limited us, or refused its key, is skipped until
// this time (per server instance — enough to stop every call paying for a
// known failure first).
const coolingUntil = new Map<ProviderName, number>();

/** A hung provider must not hold the world still; give up and fail over. */
const TIMEOUT_MS = 8_000;

/** The provider cannot serve us for a while: rate-limited, or a key it refuses. */
class Unavailable extends Error {
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * How long to stop asking a provider after a failed response, or null when the
 * failure is not about availability (a 5xx, a bad request) and the next call
 * may try it again straight away.
 */
export function cooldownMs(status: number, retryAfterHeader: string | null, body: string): number | null {
  if (status === 429) {
    const retryAfter = Number(retryAfterHeader);
    // A daily allowance spent is not coming back in seconds, whatever
    // retry-after says; stop asking for a while.
    const daily = /per day|TPD|RPD/.test(body);
    return daily ? 15 * 60_000 : Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 10_000;
  }
  // A missing or revoked key will not fix itself mid-session; stop paying a
  // round trip for it on every call.
  if (status === 401 || status === 403) return 10 * 60_000;
  return null;
}

/**
 * Providers still cooling down go last rather than being dropped: if every
 * provider is limited, the one that frees up soonest is still worth a try.
 * Otherwise the configured order is kept (the sort is stable).
 */
export function orderByCooldown<P extends { name: ProviderName }>(
  list: readonly P[],
  cooling: ReadonlyMap<ProviderName, number>,
  now: number,
): P[] {
  const wait = (p: P) => Math.max(0, (cooling.get(p.name) ?? 0) - now);
  return [...list].sort((a, b) => wait(a) - wait(b));
}

/**
 * The model produced JSON that does not parse — a one-off glitch (a stray
 * "{" inside Hina's word list, seen live), not a pattern, so worth one retry.
 */
class Malformed extends Error {}

async function callProvider<T>(
  p: Provider,
  { system, user, temperature, maxTokens }: { system: string; user: string; temperature: number; maxTokens: number },
): Promise<T> {
  const response = await fetch(p.url, {
    method: "POST",
    headers: {
      Authorization: p.auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: p.model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      // Low effort keeps replies fast; the thinking these calls need is small.
      reasoning_effort: "low",
      ...p.extra,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(p.timeoutMs ?? TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    const cooldown = cooldownMs(response.status, response.headers.get("retry-after"), body);
    if (cooldown !== null) {
      throw new Unavailable(
        response.status === 429 ? `${p.name} rate-limited: ${body}` : `${p.name} refused the key (${response.status})`,
        cooldown,
      );
    }
    // Groq validates JSON mode itself and answers 400 when the model slips.
    if (body.includes("json_validate_failed")) throw new Malformed(`${p.name} generated invalid JSON`);
    throw new Error(`${p.name} returned ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text: string = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Malformed(`${p.name} returned an empty completion`);

  try {
    return JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim()) as T;
  } catch {
    throw new Malformed(`${p.name} returned JSON that does not parse`);
  }
}

export async function chatJson<T>({
  system,
  user,
  temperature = 0.3,
  maxTokens = 700,
}: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const all = providers();
  if (!all.length) throw new Error("No model provider is configured (CEREBRAS_API_KEY, GROQ_API_KEY or FAL_KEY)");

  const order = orderByCooldown(all, coolingUntil, Date.now());

  let lastError: unknown;
  for (const p of order) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await callProvider<T>(p, { system, user, temperature, maxTokens });
      } catch (error) {
        lastError = error;
        if (error instanceof Unavailable) coolingUntil.set(p.name, Date.now() + error.retryAfterMs);
        // A malformed reply gets one more try here; anything else — a limit,
        // a 5xx, a timeout — moves straight on to the next provider.
        if (!(error instanceof Malformed) || attempt > 0) break;
      }
    }
  }
  throw lastError;
}
