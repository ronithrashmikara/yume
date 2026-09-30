#!/usr/bin/env node
// Grading latency benchmark.
//
// Sends a fixed set of learner answers to the app's real grading route,
// POST /api/check-answer (the same route the game calls, which grades through
// lib/llm.ts), N times each, and reports p50 / p95 / p99 of the round trip as
// seen by the caller. Every request is written to a CSV under docs/bench/.
//
// It measures: HTTP round trip to a running Yume server -> route -> the model
// provider(s) lib/llm.ts picks -> back. It includes the Next.js route overhead
// and your network to the provider; it does not include speech recognition.
//
// Keys: this script holds none. The server you point it at reads them from its
// environment (.env.local), exactly as in play. To pin one provider, start the
// server with LLM_PROVIDER, e.g. only Groq first:
//
//   npm run build
//   LLM_PROVIDER=groq npm start          # PowerShell: $env:LLM_PROVIDER="groq"; npm start
//   node scripts/bench-grading.mjs --n 50
//
// Options (or environment variables):
//   --n <runs>        runs over the whole utterance set   (BENCH_N, default 50)
//   --base <url>      server to call                       (BENCH_BASE_URL, default http://localhost:3000)
//   --label <text>    free-text label stored in the CSV    (BENCH_LABEL, e.g. "groq, home wifi")
//   --delay <ms>      pause between requests               (BENCH_DELAY_MS, default 250)
//
// Costs real provider tokens and counts against free-tier limits (Groq's is
// 200,000 tokens a day), so it is never run in CI and refuses to when CI is set.
// Replies graded by the offline fallback (method "offline"/"error") are not
// model latency: they are counted and reported, but left out of the percentiles.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CI) {
  console.error("bench-grading: refusing to run in CI (it calls paid/limited model APIs).");
  process.exit(1);
}

const args = process.argv.slice(2);
const opt = (name, envName, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] !== undefined) return args[i + 1];
  return process.env[envName] ?? fallback;
};

const N = Number(opt("n", "BENCH_N", "50"));
const BASE = opt("base", "BENCH_BASE_URL", "http://localhost:3000").replace(/\/$/, "");
const LABEL = opt("label", "BENCH_LABEL", "");
const DELAY_MS = Number(opt("delay", "BENCH_DELAY_MS", "250"));
if (!Number.isInteger(N) || N < 1) {
  console.error("--n must be a positive integer");
  process.exit(1);
}

// A fixed set of answers to objectives from data/scenarios.json, each with the
// verdict this script expects. `expected` is only used to report how
// often the grader agreed; it plays no part in the timing.
const UTTERANCES = [
  { id: "cat-ok", objectiveEn: "Tell the world there is a cat in the park.", sampleAnswer: "こうえんに ねこが います。", learnerText: "こうえんに ねこが います", level: 5, expected: true },
  { id: "cat-noparticle", objectiveEn: "Tell the world there is a cat in the park.", sampleAnswer: "こうえんに ねこが います。", learnerText: "ねこ いる", level: 4, expected: true },
  { id: "cat-wrong-animal", objectiveEn: "Tell the world there is a cat in the park.", sampleAnswer: "こうえんに ねこが います。", learnerText: "こうえんに いぬが います", level: 5, expected: false },
  { id: "dog-ok", objectiveEn: "Now tell it a dog is next to the cat.", sampleAnswer: "いぬが ねこの となりに います。", learnerText: "いぬが ねこの となりに いる", level: 5, expected: true },
  { id: "weather-ok", objectiveEn: "Say the weather is beautiful.", sampleAnswer: "てんきは きれいです。", learnerText: "てんきが きれい", level: 4, expected: true },
  { id: "weather-english", objectiveEn: "Say the weather is beautiful.", sampleAnswer: "てんきは きれいです。", learnerText: "the weather is nice", level: 4, expected: false },
  { id: "rain-ok", objectiveEn: "Now make it start raining.", sampleAnswer: "あめが ふります。", learnerText: "あめが ふる", level: 4, expected: true },
  { id: "rain-opposite", objectiveEn: "Now make it start raining.", sampleAnswer: "あめが ふります。", learnerText: "はれです", level: 4, expected: false },
  { id: "en-cat-ok", objectiveEn: "Tell the world there is a cat in the park.", sampleAnswer: "There is a cat in the park.", learnerText: "there is cat in park", level: 5, learn: "en", expected: true },
  { id: "en-cat-wrong", objectiveEn: "Tell the world there is a cat in the park.", sampleAnswer: "There is a cat in the park.", learnerText: "the dog is sleeping", level: 5, learn: "en", expected: false },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function grade(u) {
  const body = { learnerText: u.learnerText, objectiveEn: u.objectiveEn, sampleAnswer: u.sampleAnswer, level: u.level, learn: u.learn ?? "ja" };
  const started = performance.now();
  let status = 0;
  let json = null;
  let error = "";
  try {
    const res = await fetch(`${BASE}/api/check-answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const ms = performance.now() - started;
  return { ms, status, method: json?.method ?? "", correct: typeof json?.correct === "boolean" ? json.correct : null, error };
}

function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  // Nearest-rank method.
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  // Refuse early, and warm the route: the first request compiles/loads it.
  const warm = await grade(UTTERANCES[0]);
  if (warm.error || warm.status !== 200) {
    console.error(`Could not reach ${BASE}/api/check-answer (${warm.error || `HTTP ${warm.status}`}). Is the server running?`);
    process.exit(1);
  }
  if (warm.method !== "model") {
    console.error(`The server graded with method "${warm.method}", not the model. Check its provider keys.`);
    process.exit(1);
  }

  const total = N * UTTERANCES.length;
  console.log(`Grading ${UTTERANCES.length} utterances x ${N} runs = ${total} requests against ${BASE} ...`);
  const rows = [];
  for (let run = 1; run <= N; run++) {
    for (const u of UTTERANCES) {
      const r = await grade(u);
      rows.push({ run, ...u, ...r });
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }
    process.stdout.write(`\r  run ${run}/${N}`);
  }
  process.stdout.write("\n");

  const model = rows.filter((r) => r.method === "model" && r.status === 200);
  const times = model.map((r) => r.ms).sort((a, b) => a - b);
  const agreed = model.filter((r) => r.correct === r.expected).length;
  const fmt = (ms) => `${(ms / 1000).toFixed(3)} s`;

  console.log("");
  console.log(`label:            ${LABEL || "(none)"}`);
  console.log(`requests:         ${rows.length}`);
  console.log(`graded by model:  ${model.length}`);
  console.log(`other outcomes:   ${rows.length - model.length} (offline fallback, errors, non-200)`);
  if (times.length) {
    console.log(`p50:              ${fmt(percentile(times, 50))}`);
    console.log(`p95:              ${fmt(percentile(times, 95))}`);
    console.log(`p99:              ${fmt(percentile(times, 99))}`);
    console.log(`min / max:        ${fmt(times[0])} / ${fmt(times[times.length - 1])}`);
    console.log(`agreed with expected verdict: ${agreed}/${model.length}`);
  }

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = join(root, "docs", "bench");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(dir, `grading-${stamp}.csv`);
  const header = ["run", "utterance_id", "learn", "level", "learner_text", "expected", "correct", "method", "status", "ms", "error", "label", "base_url"];
  const lines = rows.map((r) =>
    [r.run, r.id, r.learn ?? "ja", r.level, r.learnerText, r.expected, r.correct, r.method, r.status, r.ms.toFixed(1), r.error, LABEL, BASE]
      .map(csvCell)
      .join(","),
  );
  await writeFile(file, [header.join(","), ...lines].join("\n") + "\n", "utf8");
  console.log(`\nWrote ${rows.length} rows to ${file}`);
}

main().catch((caught) => {
  console.error(caught);
  process.exit(1);
});
