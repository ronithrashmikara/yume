// Unit tests for the provider failover in lib/llm.ts: which provider is tried
// first, how long a failing one is skipped, and when a call moves on.
// fetch is replaced by a fake, so no network and no real keys are used.

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";

const KEYS = ["CEREBRAS_API_KEY", "GROQ_API_KEY", "GROQ_API_KEY_2", "FAL_KEY", "FAL_LLM_MODEL", "LLM_PROVIDER"];

let fresh = 0;
/** A fresh copy of lib/llm.ts, so each test starts with no provider cooling down. */
const loadLlm = () => import(`../lib/llm.ts?fresh=${++fresh}`);

let savedEnv;
beforeEach(() => {
  savedEnv = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  mock.timers.reset();
  mock.restoreAll();
});

const ok = (json) => Response.json({ choices: [{ message: { content: JSON.stringify(json) } }] });

/** Which configured provider a request went to (the Groq keys differ only by key). */
function providerOf(url, init) {
  const host = new URL(String(url)).hostname;
  if (host.includes("cerebras")) return "cerebras";
  if (host.includes("fal")) return "fal";
  return init.headers.Authorization === `Bearer ${process.env.GROQ_API_KEY_2}` ? "groq-2" : "groq";
}

/**
 * Replaces fetch. `script` maps each provider to its responses in order; the
 * last one repeats. A function entry is called instead (to reject, say).
 */
function fakeFetch(script) {
  const seen = [];
  mock.method(globalThis, "fetch", async (url, init) => {
    const name = providerOf(url, init);
    seen.push(name);
    const queue = script[name];
    if (!queue) throw new Error(`unexpected call to ${name}`);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return typeof next === "function" ? next() : next.clone();
  });
  return seen;
}

describe("provider configuration", () => {
  test("order is Cerebras, Groq, Groq 2, fal, for whichever keys are set", async () => {
    const llm = await loadLlm();
    assert.equal(llm.hasModel(), false);
    process.env.FAL_KEY = "f";
    process.env.GROQ_API_KEY_2 = "g2";
    process.env.CEREBRAS_API_KEY = "c";
    assert.deepEqual(llm.providers().map((p) => p.name), ["cerebras", "groq-2", "fal"]);
    process.env.GROQ_API_KEY = "g";
    assert.deepEqual(llm.providers().map((p) => p.name), ["cerebras", "groq", "groq-2", "fal"]);
    assert.equal(llm.hasModel(), true);
  });

  test("LLM_PROVIDER moves one provider to the front", async () => {
    const llm = await loadLlm();
    process.env.CEREBRAS_API_KEY = "c";
    process.env.GROQ_API_KEY = "g";
    process.env.LLM_PROVIDER = "groq";
    assert.deepEqual(llm.providers().map((p) => p.name), ["groq", "cerebras"]);
  });
});

describe("cool-down rules", () => {
  test("429 honours retry-after, defaults to 10 s, and a spent daily allowance means 15 min", async () => {
    const { cooldownMs } = await loadLlm();
    assert.equal(cooldownMs(429, "7", "slow down"), 7_000);
    assert.equal(cooldownMs(429, null, "slow down"), 10_000);
    assert.equal(cooldownMs(429, "garbage", "slow down"), 10_000);
    assert.equal(cooldownMs(429, "2", "Limit 200000, Used 199990 tokens per day (TPD)"), 15 * 60_000);
  });

  test("a refused key (401/403) is skipped for 10 min; other failures do not cool down", async () => {
    const { cooldownMs } = await loadLlm();
    assert.equal(cooldownMs(401, null, ""), 10 * 60_000);
    assert.equal(cooldownMs(403, null, ""), 10 * 60_000);
    assert.equal(cooldownMs(500, null, ""), null);
    assert.equal(cooldownMs(400, null, "json_validate_failed"), null);
  });

  test("providers still cooling down go last, soonest-free first; the rest keep their order", async () => {
    const { orderByCooldown } = await loadLlm();
    const list = [{ name: "cerebras" }, { name: "groq" }, { name: "groq-2" }, { name: "fal" }];
    const cooling = new Map([
      ["cerebras", 5_000],
      ["groq", 2_000],
      ["fal", 500], // already expired
    ]);
    assert.deepEqual(
      orderByCooldown(list, cooling, 1_000).map((p) => p.name),
      ["groq-2", "fal", "groq", "cerebras"],
    );
    assert.deepEqual(list.map((p) => p.name), ["cerebras", "groq", "groq-2", "fal"], "input is not mutated");
  });
});

describe("chatJson failover", () => {
  const call = (llm) => llm.chatJson({ system: "s", user: "u" });

  test("a rate-limited provider fails over at once, and goes last until retry-after passes", async () => {
    const llm = await loadLlm();
    process.env.CEREBRAS_API_KEY = "c";
    process.env.GROQ_API_KEY = "g";
    const seen = fakeFetch({
      cerebras: [new Response("too many", { status: 429, headers: { "retry-after": "30" } })],
      groq: [ok({ correct: true })],
    });
    assert.deepEqual(await call(llm), { correct: true });
    assert.deepEqual(seen, ["cerebras", "groq"]);

    await call(llm);
    assert.deepEqual(seen.slice(2), ["groq"], "cerebras is cooling down, so groq goes first");

    mock.timers.tick(30_001);
    mock.restoreAll();
    fakeFetch({ cerebras: [ok({ correct: false })], groq: [ok({ correct: true })] });
    assert.deepEqual(await call(llm), { correct: false }, "after retry-after, cerebras is first again");
  });

  test("a malformed JSON reply gets one retry on the same provider before moving on", async () => {
    const llm = await loadLlm();
    process.env.GROQ_API_KEY = "g";
    process.env.GROQ_API_KEY_2 = "g2";
    const bad = new Response(JSON.stringify({ choices: [{ message: { content: "{not json" } }] }));
    const seen = fakeFetch({ groq: [bad], "groq-2": [ok({ n: 2 })] });
    assert.deepEqual(await call(llm), { n: 2 });
    assert.deepEqual(seen, ["groq", "groq", "groq-2"]);
  });

  test("Groq's json_validate_failed 400 counts as malformed: retried, then returned if it parses", async () => {
    const llm = await loadLlm();
    process.env.GROQ_API_KEY = "g";
    const seen = fakeFetch({
      groq: [new Response('{"error":{"code":"json_validate_failed"}}', { status: 400 }), ok({ n: 1 })],
    });
    assert.deepEqual(await call(llm), { n: 1 });
    assert.deepEqual(seen, ["groq", "groq"]);
  });

  test("a 5xx moves straight on, without a retry and without a cool-down", async () => {
    const llm = await loadLlm();
    process.env.CEREBRAS_API_KEY = "c";
    process.env.GROQ_API_KEY = "g";
    const seen = fakeFetch({
      cerebras: [new Response("oops", { status: 502 }), ok({ from: "cerebras" })],
      groq: [ok({ from: "groq" })],
    });
    assert.deepEqual(await call(llm), { from: "groq" });
    assert.deepEqual(await call(llm), { from: "cerebras" }, "not cooled down, so tried first again");
    assert.deepEqual(seen, ["cerebras", "groq", "cerebras"]);
  });

  test("a timeout or network error also fails over", async () => {
    const llm = await loadLlm();
    process.env.CEREBRAS_API_KEY = "c";
    process.env.FAL_KEY = "f";
    const seen = fakeFetch({
      cerebras: [() => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"))],
      fal: [ok({ from: "fal" })],
    });
    assert.deepEqual(await call(llm), { from: "fal" });
    assert.deepEqual(seen, ["cerebras", "fal"]);
  });

  test("markdown code fences around the JSON are tolerated", async () => {
    const llm = await loadLlm();
    process.env.GROQ_API_KEY = "g";
    fakeFetch({
      groq: [new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"ok":1}\n```' } }] }))],
    });
    assert.deepEqual(await call(llm), { ok: 1 });
  });

  test("when every provider fails the last error is thrown; with none configured, it says so", async () => {
    const llm = await loadLlm();
    await assert.rejects(call(llm), /No model provider is configured/);
    process.env.CEREBRAS_API_KEY = "c";
    process.env.GROQ_API_KEY = "g";
    fakeFetch({
      cerebras: [new Response("", { status: 401 })],
      groq: [new Response("down", { status: 503 })],
    });
    await assert.rejects(call(llm), /groq returned 503/);
  });
});
