import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// How much live Orbis time a visitor gets, so a public link cannot spend the
// whole account. Orbis bills per second of an open session, and every token
// from /api/token allows ONE session of at most five minutes. So time is
// metered in dreams: a visitor's 30 minutes is six dreams of up to five minutes
// (a door or a refresh restarts inside the same session and costs no dream).
//
// Two limits, both checked before a token is minted:
//  - per visitor, per day: a signed cookie counts dreams. Clearing cookies
//    resets it, which is why the second limit exists;
//  - for everyone, per day: a dollar cap on what Orbis has actually run today,
//    read from Reactor's own session list, so it needs no database and counts
//    exactly what Reactor bills.
// Judges get a pass with a bigger allowance that the daily cap does not stop —
// only a hard ceiling does, so even a judge's code that leaked could not empty
// the account.
//
// All of it is configurable in the environment (see .env.example).

export const SECONDS_PER_DREAM = 300;
export const USD_PER_SECOND = 0.0097;
const DREAM_USD = SECONDS_PER_DREAM * USD_PER_SECOND;

const minutes = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const QUOTA = {
  /** Dreams a visitor gets per day: YUME_VISITOR_MINUTES, 30 by default. */
  visitorDreams: Math.floor(minutes("YUME_VISITOR_MINUTES", 30) / 5),
  /** Dreams a judge gets per day: YUME_JUDGE_MINUTES, 60 by default. */
  judgeDreams: Math.floor(minutes("YUME_JUDGE_MINUTES", 60) / 5),
  /** What everyone together may spend on Orbis per UTC day: YUME_DAILY_BUDGET_USD, $20 by default. */
  dailyBudgetUsd: minutes("YUME_DAILY_BUDGET_USD", 20),
  /** The ceiling nobody passes, judges included: YUME_HARD_CAP_USD, $50 by default. */
  hardCapUsd: minutes("YUME_HARD_CAP_USD", 50),
};

/** On in production; YUME_QUOTA=on or off overrides, so it can be tried locally. */
export function quotaOn(): boolean {
  if (process.env.YUME_QUOTA === "on") return true;
  if (process.env.YUME_QUOTA === "off") return false;
  return process.env.NODE_ENV === "production";
}

// ---- The visitor's pass: a signed cookie -------------------------------------------

export const PASS_COOKIE = "yume_pass";

export type Pass = {
  /** A random id for this browser. */
  id: string;
  /** The UTC day `used` counts for, YYYY-MM-DD. */
  day: string;
  /** Dreams started that day. */
  used: number;
  judge: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

// Its own secret if one is set; otherwise one derived from the Reactor key, which
// is already secret and already required.
const secret = () =>
  process.env.YUME_QUOTA_SECRET ||
  createHash("sha256").update(`yume-pass:${process.env.REACTOR_API_KEY ?? ""}`).digest("hex");

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function encodePass(pass: Pass): string {
  const body = Buffer.from(JSON.stringify(pass)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** The pass in the cookie, rolled over to today; a fresh one if it is missing or forged. */
export function readPass(raw: string | undefined): Pass {
  const fresh: Pass = { id: randomUUID(), day: today(), used: 0, judge: false };
  if (!raw) return fresh;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return fresh;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return fresh;
  try {
    const pass = JSON.parse(Buffer.from(body, "base64url").toString()) as Pass;
    if (typeof pass.id !== "string" || typeof pass.used !== "number") return fresh;
    // A new day, a new allowance; a judge stays a judge.
    return pass.day === today() ? pass : { ...pass, day: today(), used: 0 };
  } catch {
    return fresh;
  }
}

export const passCookie = (pass: Pass) => ({
  name: PASS_COOKIE,
  value: encodePass(pass),
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 60,
});

export const allowance = (pass: Pass) => (pass.judge ? QUOTA.judgeDreams : QUOTA.visitorDreams);

/** Judge codes, from YUME_JUDGE_CODES (comma-separated). */
export function isJudgeCode(code: unknown): boolean {
  if (typeof code !== "string" || !code.trim()) return false;
  const codes = (process.env.YUME_JUDGE_CODES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const given = Buffer.from(code.trim());
  return codes.some((c) => {
    const known = Buffer.from(c);
    return known.length === given.length && timingSafeEqual(known, given);
  });
}

// ---- What Orbis has run today, for everyone ------------------------------------------

const REACTOR_API_URL = "https://api.reactor.inc";

export type ReactorSession = { created_at?: string; updated_at?: string; closed?: boolean; state?: string };

let accountId: string | null = null;
// Read at most every 20s; a dream minted in between is added straight away, so a
// burst of visitors cannot slip past the cap between two reads.
let spent: { at: number; usd: number } | null = null;

async function reactor(path: string) {
  const res = await fetch(`${REACTOR_API_URL}${path}`, {
    headers: { "Reactor-API-Key": process.env.REACTOR_API_KEY ?? "" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Reactor ${path} returned ${res.status}`);
  return res.json();
}

/**
 * Seconds of Orbis time the sessions started at or after `dayStart` account
 * for: closed sessions by how long they ran, open ones as a full five minutes
 * (they may yet run that long), each capped at five minutes. `older` says
 * whether any session started before `dayStart`.
 */
export function billedSecondsSince(sessions: ReactorSession[], dayStart: number): { seconds: number; older: boolean } {
  let seconds = 0;
  let older = false;
  for (const s of sessions) {
    const start = Date.parse(s.created_at ?? "");
    if (!Number.isFinite(start)) continue;
    if (start < dayStart) {
      older = true;
      continue;
    }
    const closed = s.closed || s.state === "CLOSED";
    const closedAt = closed ? Date.parse(s.updated_at ?? "") : NaN;
    // Open, or closed without a readable end time: count the full five minutes,
    // so one odd record cannot turn the day's total into NaN.
    const end = Number.isFinite(closedAt) ? closedAt : start + SECONDS_PER_DREAM * 1000;
    seconds += Math.min(SECONDS_PER_DREAM, Math.max(0, (end - start) / 1000));
  }
  return { seconds, older };
}

/** Whether one more dream fits under the cap: the daily budget, or the hard ceiling for a judge. */
export function dreamFits(spentUsd: number, judge: boolean, quota: Pick<typeof QUOTA, "dailyBudgetUsd" | "hardCapUsd"> = QUOTA): boolean {
  return spentUsd + DREAM_USD <= (judge ? quota.hardCapUsd : quota.dailyBudgetUsd);
}

/**
 * Dollars of Orbis time since midnight UTC: closed sessions by how long they
 * ran, open ones as a full five minutes (they may yet run that long).
 */
export async function spentToday(): Promise<number> {
  if (spent && Date.now() - spent.at < 20_000) return spent.usd;
  accountId ??= ((await reactor("/me")) as { account_id: string }).account_id;
  const dayStart = Date.parse(`${today()}T00:00:00Z`);
  let seconds = 0;
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const query = `limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const data = (await reactor(`/accounts/${accountId}/sessions?${query}`)) as {
      sessions?: ReactorSession[];
      next_cursor?: string | null;
      has_more?: boolean;
    };
    const counted = billedSecondsSince(data.sessions ?? [], dayStart);
    seconds += counted.seconds;
    const older = counted.older;
    // Newest first: once a page reaches yesterday, the rest is older still.
    if (older || !data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  spent = { at: Date.now(), usd: seconds * USD_PER_SECOND };
  return spent.usd;
}

/** Counts a dream just started against today's total before Reactor lists it. */
export function noteDreamStarted() {
  if (spent) spent = { ...spent, usd: spent.usd + DREAM_USD };
}

/**
 * Whether one more dream fits in today's budget: the daily budget for visitors,
 * the hard ceiling for judges. If Reactor cannot be read, the game stays open.
 */
export async function budgetAllows(judge = false): Promise<boolean> {
  try {
    return dreamFits(await spentToday(), judge);
  } catch (caught) {
    console.error("Could not read today's Orbis spend", caught);
    return true;
  }
}
