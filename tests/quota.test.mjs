// Unit tests for lib/server/quota.ts: the signed-cookie pass that counts a
// visitor's dreams, judge codes, and the daily dollar cap read from Reactor.
// Run with `npm test` (Node's built-in runner; no network, no keys needed).

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";

// The module reads its limits from the environment once, when it loads, so each
// test imports its own fresh copy (which also resets its cached spend).
let fresh = 0;
async function loadQuota(env = {}) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await import(`../lib/server/quota.ts?fresh=${++fresh}`);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const ENV_KEYS = [
  "YUME_QUOTA_SECRET",
  "REACTOR_API_KEY",
  "YUME_JUDGE_CODES",
  "YUME_QUOTA",
  "NODE_ENV",
  "YUME_VISITOR_MINUTES",
  "YUME_JUDGE_MINUTES",
  "YUME_DAILY_BUDGET_USD",
  "YUME_HARD_CAP_USD",
];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.YUME_QUOTA_SECRET = "test-secret";
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-24T10:00:00Z") });
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  mock.timers.reset();
  mock.restoreAll();
});

describe("the visitor's pass (signed cookie)", () => {
  test("a pass survives an encode/read round trip", async () => {
    const q = await loadQuota();
    const pass = { id: "abc", day: "2026-09-24", used: 3, judge: false };
    assert.deepEqual(q.readPass(q.encodePass(pass)), pass);
  });

  test("no cookie gives a fresh pass for today with nothing used", async () => {
    const q = await loadQuota();
    const pass = q.readPass(undefined);
    assert.equal(pass.used, 0);
    assert.equal(pass.judge, false);
    assert.equal(pass.day, "2026-09-24");
    assert.match(pass.id, /^[0-9a-f-]{36}$/);
  });

  test("an edited body (lower count, judge: true) with the old signature is rejected", async () => {
    const q = await loadQuota();
    const cookie = q.encodePass({ id: "abc", day: "2026-09-24", used: 6, judge: false });
    const [, mac] = cookie.split(".");
    const forged = Buffer.from(JSON.stringify({ id: "abc", day: "2026-09-24", used: 0, judge: true })).toString("base64url");
    const pass = q.readPass(`${forged}.${mac}`);
    assert.equal(pass.judge, false);
    assert.equal(pass.used, 0);
    assert.notEqual(pass.id, "abc");
  });

  test("a pass signed with another secret is rejected", async () => {
    process.env.YUME_QUOTA_SECRET = "secret-one";
    const q = await loadQuota();
    const cookie = q.encodePass({ id: "abc", day: "2026-09-24", used: 2, judge: true });
    process.env.YUME_QUOTA_SECRET = "secret-two";
    const pass = q.readPass(cookie);
    assert.notEqual(pass.id, "abc");
    assert.equal(pass.judge, false);
  });

  test("garbage and a missing signature are rejected", async () => {
    const q = await loadQuota();
    for (const raw of ["", "nodot", "a.b", ".", "x.y.z"]) {
      const pass = q.readPass(raw);
      assert.equal(pass.used, 0, raw);
      assert.equal(pass.judge, false, raw);
    }
  });

  test("a correctly signed body that is not a pass is rejected", async () => {
    const q = await loadQuota();
    // encodePass signs whatever it is given, so this is a valid signature over a bad shape.
    const cookie = q.encodePass({ id: 7, day: "2026-09-24", used: "lots", judge: true });
    const pass = q.readPass(cookie);
    assert.equal(pass.judge, false);
    assert.equal(pass.used, 0);
  });

  test("without YUME_QUOTA_SECRET the signing key is derived from REACTOR_API_KEY", async () => {
    delete process.env.YUME_QUOTA_SECRET;
    process.env.REACTOR_API_KEY = "key-a";
    const q = await loadQuota();
    const cookie = q.encodePass({ id: "abc", day: "2026-09-24", used: 1, judge: false });
    assert.equal(q.readPass(cookie).id, "abc");
    // Rotating the Reactor key therefore invalidates every pass (they start over).
    process.env.REACTOR_API_KEY = "key-b";
    assert.notEqual(q.readPass(cookie).id, "abc");
  });

  test("a new UTC day resets the count but keeps the id and judge status", async () => {
    const q = await loadQuota();
    const cookie = q.encodePass({ id: "abc", day: "2026-09-23", used: 6, judge: true });
    assert.deepEqual(q.readPass(cookie), { id: "abc", day: "2026-09-24", used: 0, judge: true });
  });
});

describe("allowances", () => {
  test("defaults: 30 visitor minutes = 6 dreams, 60 judge minutes = 12 dreams, $20 daily, $50 ceiling", async () => {
    const q = await loadQuota();
    assert.deepEqual(q.QUOTA, { visitorDreams: 6, judgeDreams: 12, dailyBudgetUsd: 20, hardCapUsd: 50 });
    assert.equal(q.allowance({ id: "a", day: "", used: 0, judge: false }), 6);
    assert.equal(q.allowance({ id: "a", day: "", used: 0, judge: true }), 12);
  });

  test("minutes round down to whole five-minute dreams; invalid values fall back to defaults", async () => {
    const q = await loadQuota({ YUME_VISITOR_MINUTES: "12", YUME_JUDGE_MINUTES: "not-a-number", YUME_HARD_CAP_USD: "-5" });
    assert.equal(q.QUOTA.visitorDreams, 2);
    assert.equal(q.QUOTA.judgeDreams, 12);
    assert.equal(q.QUOTA.hardCapUsd, 50);
  });

  test("quota is on in production only, unless YUME_QUOTA overrides it", async () => {
    const q = await loadQuota();
    process.env.NODE_ENV = "production";
    assert.equal(q.quotaOn(), true);
    process.env.NODE_ENV = "development";
    assert.equal(q.quotaOn(), false);
    process.env.YUME_QUOTA = "on";
    assert.equal(q.quotaOn(), true);
    process.env.NODE_ENV = "production";
    process.env.YUME_QUOTA = "off";
    assert.equal(q.quotaOn(), false);
  });
});

describe("judge codes", () => {
  test("only listed codes are accepted: trimmed, case-sensitive, exact length", async () => {
    const q = await loadQuota();
    process.env.YUME_JUDGE_CODES = " alpha , beta,,";
    assert.equal(q.isJudgeCode("alpha"), true);
    assert.equal(q.isJudgeCode(" beta "), true);
    assert.equal(q.isJudgeCode("ALPHA"), false);
    assert.equal(q.isJudgeCode("alph"), false);
    assert.equal(q.isJudgeCode(""), false);
    assert.equal(q.isJudgeCode(42), false);
    assert.equal(q.isJudgeCode(undefined), false);
    delete process.env.YUME_JUDGE_CODES;
    assert.equal(q.isJudgeCode("alpha"), false);
  });
});

describe("the daily dollar cap", () => {
  const dayStart = Date.parse("2026-09-24T00:00:00Z");
  const at = (hhmmss) => `2026-09-24T${hhmmss}Z`;

  test("closed sessions count by how long they ran (at most five minutes); open ones as a full five", async () => {
    const q = await loadQuota();
    const { seconds, older } = q.billedSecondsSince(
      [
        { created_at: at("09:00:00"), updated_at: at("09:02:00"), closed: true }, // 120 s
        { created_at: at("09:10:00"), updated_at: at("09:30:00"), state: "CLOSED" }, // capped at 300 s
        { created_at: at("09:50:00") }, // open: 300 s
      ],
      dayStart,
    );
    assert.equal(seconds, 720);
    assert.equal(older, false);
  });

  test("sessions from before midnight UTC are skipped and flagged; unparseable ones are ignored", async () => {
    const q = await loadQuota();
    const { seconds, older } = q.billedSecondsSince(
      [
        { created_at: at("00:01:00"), updated_at: at("00:02:00"), closed: true },
        { created_at: "2026-09-23T23:59:00Z", updated_at: "2026-09-24T00:03:00Z", closed: true },
        { created_at: "not a date" },
      ],
      dayStart,
    );
    assert.equal(seconds, 60);
    assert.equal(older, true);
  });

  test("a closed session without a readable end time counts as a full dream, not NaN", async () => {
    const q = await loadQuota();
    const { seconds } = q.billedSecondsSince([{ created_at: at("09:00:00"), closed: true }], dayStart);
    assert.equal(seconds, q.SECONDS_PER_DREAM);
  });

  test("a dream fits while spent + one dream stays within the cap; judges get the hard ceiling", async () => {
    const q = await loadQuota();
    const dream = q.SECONDS_PER_DREAM * q.USD_PER_SECOND; // $2.91
    const caps = { dailyBudgetUsd: 20, hardCapUsd: 50 };
    assert.equal(q.dreamFits(20 - dream, false, caps), true);
    assert.equal(q.dreamFits(20 - dream + 0.01, false, caps), false);
    assert.equal(q.dreamFits(30, false, caps), false);
    assert.equal(q.dreamFits(30, true, caps), true);
    assert.equal(q.dreamFits(50 - dream + 0.01, true, caps), false);
  });

  test("budgetAllows reads Reactor's session list, stops paging at yesterday, and caches for 20 s", async () => {
    const q = await loadQuota({ YUME_DAILY_BUDGET_USD: "5" });
    const calls = [];
    mock.method(globalThis, "fetch", async (url) => {
      const u = new URL(String(url));
      calls.push(u.pathname + u.search);
      if (u.pathname === "/me") return Response.json({ account_id: "acct" });
      if (!u.searchParams.get("cursor")) {
        return Response.json({
          sessions: [{ created_at: at("09:00:00"), updated_at: at("09:01:00"), closed: true }], // 60 s
          has_more: true,
          next_cursor: "p2",
        });
      }
      return Response.json({
        sessions: [
          { created_at: at("08:00:00"), updated_at: at("08:01:00"), closed: true }, // 60 s
          { created_at: "2026-09-23T20:00:00Z", updated_at: "2026-09-23T20:05:00Z", closed: true },
        ],
        has_more: true,
        next_cursor: "p3", // never fetched: this page already reached yesterday
      });
    });

    const spent = await q.spentToday();
    assert.ok(Math.abs(spent - 120 * q.USD_PER_SECOND) < 1e-9);
    assert.equal(calls.length, 3);
    // $1.16 spent + $2.91 for one more dream fits under $5 ...
    assert.equal(await q.budgetAllows(false), true);
    // ... and a dream just started counts before Reactor lists it: $4.07 + $2.91 does not.
    q.noteDreamStarted();
    assert.equal(await q.budgetAllows(false), false);
    assert.equal(await q.budgetAllows(true), true, "a judge is held only by the $50 ceiling");
    assert.equal(calls.length, 3, "cached for 20 s: no new requests");

    mock.timers.tick(20_001);
    await q.spentToday();
    assert.equal(calls.length, 5, "re-read after 20 s; the account id is remembered");
  });

  test("if Reactor cannot be read, budgetAllows fails open (the game stays playable)", async () => {
    const q = await loadQuota();
    mock.method(globalThis, "fetch", async () => new Response("down", { status: 503 }));
    mock.method(console, "error", () => {});
    assert.equal(await q.budgetAllows(false), true);
  });
});
