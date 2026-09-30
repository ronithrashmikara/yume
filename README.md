<p align="center">
  <img src="docs/media/banner.webp" width="100%" alt="Yume 夢, Say it right, and the world changes: a papercraft dreamscape of floating islands with cherry trees, lanterns and pagodas around a red torii gate under a full moon, with a ribbon of light drifting across a night-blue sky">
</p>

<p align="center">
  <b>Say it in Japanese, and a live AI video world changes around you.</b><br>
  <sub>A language-learning game built on <a href="https://www.reactor.inc/models/visko-orbis-stable">Visko Orbis</a>, a real-time, steerable video model · made for the <a href="https://www.visko.ai/challenge/orbis-september-2026">Visko Orbis Online Challenge</a></sub>
</p>

<p align="center">
  <b><a href="https://yume-inky.vercel.app">▶ Play it: yume-inky.vercel.app</a></b>
</p>

<p align="center">
  <a href="#see-it-live">See it</a> ·
  <a href="#how-a-turn-works">How a turn works</a> ·
  <a href="#why-it-has-to-be-live-video">Why live video</a> ·
  <a href="#what-i-learned-about-orbis">What I learned about Orbis</a> ·
  <a href="#the-stack">Stack</a> ·
  <a href="#run-it-yourself">Run it</a>
</p>

---

**Yume** (夢, *dream*) drops you into a world that is being generated live, frame by frame, and keeps moving whether you speak or not. The only way to change it is to say what you want **in Japanese**. If you are understood, that same running world transforms in front of you. If you are not, nothing happens: no buzzer, no red cross, just a world that did not move.

**What Orbis is.** Visko Orbis is a real-time, steerable video model made by Visko and served through Reactor. It keeps generating video while it runs, and it can be re-prompted mid-stream. Yume connects to it with Reactor's JS SDK (`@reactor-team/js-sdk`), which carries the stream over WebRTC; Yume's own code does not implement any signalling or ICE. The server mints a short-lived session token (`app/api/token`) and the browser hands it to the SDK.

There is an old Japanese belief, *kotodama* (言霊), that words have a spirit, and that saying something can make it real. Yume is the place where that is literally true.

It starts from **zero Japanese**. A first-time player sees three stickers, each one word: say よる and night falls, say くじら and a whale leaps. After a few words the game quietly moves on to building short sentences a word at a time.

And it works **both ways**. Pick a world, and Yume asks what you want to learn: Japanese (with help in English), or English (with help in Japanese). A child in Tokyo can make the same dream answer to *"The moon rises"* that a child in London makes answer to *つきが のぼる*.

## Play it

**[yume-inky.vercel.app](https://yume-inky.vercel.app)** runs in Chrome or Edge on a computer, with a microphone (typing works too). Pick a world, choose Japanese or English, and say one of the magic words.

Every visitor gets **30 minutes of live dreaming a day**: six dreams of up to five minutes each, because every second of a live Orbis world is paid for. Your stickers, words and dream reels are kept in your browser.

### For judges

Each judge has a personal link, given with this submission, that looks like `https://yume-inky.vercel.app/?judge=…`. Open it once and that browser gets a judge pass: **60 minutes a day**, shown on the home page as “Judge pass”, and not held back when many visitors have played that day. The code disappears from the address bar and the pass stays in the browser, so after the first visit the plain address works too.

The best first five minutes: pick **こうえん The Park**, say one of the three magic words (say よる and night falls), then say **みぎ** and the camera turns. Keep going, and a quest turns up, then a magic door to another world.

## See it live

<table>
  <tr>
    <td width="50%"><img src="docs/media/words.gif" alt="Learning a sentence one word at a time"></td>
    <td width="50%"><img src="docs/media/spell.gif" alt="Saying the whole sentence casts a spell and the park turns to a starry night"></td>
  </tr>
  <tr>
    <td><b>Learn a sentence, one word at a time.</b> Each word is spoken, glossed, and lights up when you say it back.</td>
    <td><b>Say it whole, and your words cast a spell.</b> よるが くる, "night comes", and the live park turns to a starry night.</td>
  </tr>
  <tr>
    <td><img src="docs/media/wrong-right.gif" alt="A wrong answer changes nothing; the right answer steers the world"></td>
    <td><img src="docs/media/hina.gif" alt="Hina, a companion who talks with you"></td>
  </tr>
  <tr>
    <td><b>A wrong answer changes nothing.</b> The right one steers the world, and the magic plays while Orbis redraws it.</td>
    <td><b>Walk with Hina.</b> She answers in Japanese (with English at your level), and what she says changes the world too.</td>
  </tr>
  <tr>
    <td><img src="docs/media/quest.gif" alt="A quest: the shy whale is told to jump, and leaps out of the sea"></td>
    <td><img src="docs/media/door.gif" alt="A magic door: saying the words opens it, and the same live session starts afresh in the Sky Islands"></td>
  </tr>
  <tr>
    <td><b>The world asks for things.</b> A quest: the whale is shy. たかく とんで, "jump high!", and it leaps. A gold sticker for that.</td>
    <td><b>Open the magic door.</b> ドアを あける, and behind the mist the same live session starts afresh in a new world.</td>
  </tr>
</table>

<sub>Real recordings of live Orbis sessions, sped up about 1.5×. Only the player's voice was simulated: a stand-in recogniser was fed the Japanese a player would say.</sub>

## What's in it

- **A living world.** When you go quiet for a while (about 20 seconds), the world drifts on its own: a petal falls, a firefly glows. It is a place, not a clip waiting for input.
- **One word is enough.** The first rung is three magic words, each a sticker. Tap one to hear it; say it and it happens, and you earn that sticker. At this rung quests and the magic door take one word too (とんで, あけて).
- **Look around.** Say ひだり, みぎ or うしろ (left, right, behind) at any time and the camera turns to show another part of the world.
- **A ladder from zero.** Eight rungs, from one magic word to describing the scene freely. It adjusts itself as you play and never announces it.
- **Magic that covers the wait.** A live world takes a few seconds to change. The moment your words land, mist rolls in, the Japanese you said floats up and bursts into stars, and a music-box tune plays (synthesised in the browser, never the same twice). The mist holds until the video itself has changed, then clears on the new world.
- **Hina, a companion.** Talk to her in Japanese or English. She replies aloud, her face is steered to talk while her voice plays, and her replies steer the world.
- **Always-on voice.** Nothing to press; just speak. Or type, and romaji counts.
- **Words that stay.** Every word is hoverable for its reading and meaning. Double-click to save it, and it comes back on a spaced-repetition schedule: Leitner boxes (five boxes, due again after 1, 2, 4, 8 and 16 days; a miss drops the word back to box 1), kept in the browser (`lib/vocab.ts`).
- **Free play.** Describe any world you like and build it sentence by sentence.
- **Learn English too.** The same game the other way round: an English-speaking recogniser, a native English voice, English sentences to build, and every meaning in simple Japanese.
- **Your words turn into their meaning.** When a sentence lands, it floats up and flips into what it means, with a little chime: よるが くる becomes *Night comes!*, and *The moon rises* becomes つきが のぼる！
- **Quests.** Every couple of changes the world asks for something ("the whale is shy!"), with its own sentence to learn. Solve it for a gold sticker.
- **A sticker book.** Everything your words create becomes a sticker with a tiny photo of the world you made it in. 55 are pre-drawn; anything new is drawn on the spot by fal (FLUX, cut out with BiRefNet).
- **The magic door.** After a few changes a door appears. Say the magic words and Orbis restarts somewhere new (a toy room, a candy town, a garden on the moon) inside the same session: no new GPU, no 20-second wait. Nobody takes the door? The dream quietly refreshes itself before the picture starts to drift.
- **A world you can hear.** Orbis generates each world's own sound live, and it plays from the start, dipping under every voice so the Japanese stays clear. With the sound off, an ambience synthesised in the browser (waves, crickets, rain) stands in for it.
- **Hina remembers you.** Your last dreams are kept on your device, and she brings them up: "Last time you made a whale jump!"
- **Play together.** A two-player shared-screen mode (hot-seat on one computer, not networked): player 1 learns Japanese, player 2 learns English, and the turn passes with every spell (`passTurn()` in `components/isekai-game.tsx`).
- **A dream reel to share.** When the dream ends, the moments your words changed the world become a short vertical video (under 30 seconds), recorded straight off the live stream: each moment is a tiny lesson with the sentence spoken again, and it ends with the words you learned. Share it or download it; the moments stay as memory cards.

### The ladder

| | Rung | What you do |
|---|---|---|
| ★ | ことば · One word | Say one of three magic words (each a sticker): that thing happens |
| 0 | つなぐ · Build a sentence | Learn a sentence word by word, then say it whole: the world transforms |
| 1 | えらぶ · Choose | Pick one of two things to happen, written in kana |
| 2 | うめる · Fill the gap | The sentence is written for you; supply the missing word |
| 3 | ひとこと · Single word | Answer with one word |
| 4 | フレーズ · Short phrase | Two or three words, starting to use particles |
| 5 | ぶん · Full sentence | A complete sentence with a verb |
| 6 | びょうしゃ · Description | Describe the scene richly |

## How a turn works

```mermaid
sequenceDiagram
    autonumber
    actor You
    participant Yume as Yume<br/>browser + Next.js
    participant LLM as GPT-OSS 120B<br/>Cerebras, Groq backup
    participant Orbis as Orbis<br/>live video
    participant Fish as Fish Audio<br/>voice

    You->>Yume: say it in Japanese
    alt rung 0: a sentence you were taught
        Note over Yume: matched on the device, instantly
        opt no match: did the mic mishear it?
            Yume->>LLM: same words, spelled differently?
            LLM-->>Yume: yes or no
        end
    else rungs 3–6 and free play
        Yume->>LLM: was the meaning understood?
        LLM-->>Yume: yes or no, and the change to make
    end
    alt understood
        Yume->>Orbis: set_prompt: one clear change
        Note over You,Orbis: mist, stars and music while Orbis redraws (6–9s)
        Orbis-->>You: the same world, transformed
        Yume->>LLM: describe the new world at your level
        LLM-->>Yume: a line of Japanese
        Yume->>Fish: speak the description
        Fish-->>You: the world, in Japanese
    else not understood
        Note over Orbis: the world does not move
        Yume->>Fish: speak the right Japanese
        Fish-->>You: hear it said correctly, try again
    end
```

If you aren't understood, Orbis is never steered: the world simply doesn't move, and you hear how to say it instead. The video itself is the feedback. (On rungs 1 and 2 you tap the thing you want to happen, so that choice goes straight to step 6.)

## Why it has to be live video

A learner's next sentence is unpredictable, so the world cannot be pre-rendered. Most AI video works like an oven: describe it, wait, get a finished clip. Orbis doesn't finish. It keeps generating, and it can be steered while it runs, so one world stays alive and every sentence changes *that same world*, mid-flight.

That is the whole game. The video isn't decoration; it's the listener.

## What I learned about Orbis

Observed on live sessions while building this, 23–24 September 2026. These are informal development observations, not a benchmark: the number of runs behind each figure was not recorded, so treat them as rough.

| | |
|---|---|
| **A steer lands at the next chunk** | Orbis streams in 33-frame chunks (~1.8s). A whole-world change like nightfall then took **6–9 seconds** to fully land. |
| **Some changes render, some don't** | Steering the same park: **night, morning and fireworks** came through clearly. **Snow, rain, sunset, autumn leaves and floating lanterns** were faint or absent within 10 seconds. So beginner sentences only offer the ones that render. |
| **One change per prompt** | Following the Orbis prompt guide, every steer after the first describes one visible change. Restating the whole scene each time reads to the model as a rebuild, and the picture degrades. |
| **A live world is never still** | To time the magic's reveal, Yume compares the average colour of a 4×3 grid of the stream against the moment you spoke. Drifting petals barely move that; a sky turning to night moves it a lot. |
| **Cold start** | A brand-new session took roughly **17–25 seconds** to go live (informal dev observation, n not recorded), so the loading screen explains that a GPU is waking up. |
| **Resolution** | The default stream is 2K, upscaled from 832×480. Yume asks for 1080p: the same picture for less bandwidth and decoding on a normal laptop. |
| **The camera turns, loosely** | Steering the view: *turn left*, *turn right* and *turn around* swung the picture onto a new part of the park within **5–12s**. *Tilt up*, *tilt down*, *move closer* and *fly overhead* barely moved it in two runs, so the game only offers turning. |
| **Every world has its own sound** | The stream carries an audio track that Orbis generates to match the scene. Measured live: continuous, around −20 dB, never silent. |
| **A fresh start without a new GPU** | Sending `reset` and then a new prompt restarts generation inside the same session. Orbis's `generation_started` message came back about **2.5 s** after the reset (informal dev observation, n not recorded), against roughly 17–25 s for a brand-new session to go live. That 2.5 s is not time-to-picture: the first new frames arrive a few seconds after `generation_started`, so the mist holds until the video has actually painted again. That is how the magic door works. |
| **No lip sync from audio** | Orbis can't be driven by a voice track, so Hina is steered into *talking* before her voice starts and back to *listening* just before it ends. |

## The stack

| Layer | Tool | Its job in Yume |
|---|---|---|
| World | **[Visko Orbis](https://www.reactor.inc/models/visko-orbis-stable)** via Reactor's JS SDK over WebRTC | The live, steerable video world: `set_image` anchors Hina, `set_prompt` steers the running scene |
| Brain | **GPT-OSS 120B** on **Cerebras** (vendor-quoted ~3,000 tokens/s) and **Groq** (two keys), then **Gemini 2.5 Flash** through **fal** as a last resort | Grades meaning, narrates the scene word by word, speaks as Hina, drifts the world, writes beginner sentences, quests, choices and fill-the-gaps, and double-checks what the mic heard. A rate-limited provider is skipped until it recovers, so play never stops. Grading took **≈0.85 s median on Groq** (informal dev measurement, n not recorded; [measure it yourself](#measuring-grading-latency)) |
| Voice | **[Fish Audio](https://fish.audio)** | A Japanese voice and a native English one: narrator, Hina, corrections, every word read aloud |
| Ears | **Web Speech API** (ja-JP) | Always-on microphone; deaf only while Yume's own voice is audible |
| Magic and sound | **Web Audio API** | The music-box spells (a new melody every time) and each world's ambience, synthesised live |
| Art | **[fal](https://fal.ai)**: FLUX1.1 [pro] ultra, FLUX dev, BiRefNet, GPT Image 2.5, MiniMax Hailuo-02 | Every illustration and animation on the site and in this README, the sticker set, and new stickers drawn live while you play |
| App | **Next.js 16 · React 19 · TypeScript** | The site, the game, and API routes that keep every key on the server |

## Run it yourself

```bash
npm install
cp .env.example .env.local   # then add your keys
npm run dev                  # http://localhost:3000
```

| Key | Needed for |
|---|---|
| `REACTOR_API_KEY` | The live Orbis world ([reactor.inc](https://www.reactor.inc)). Required. |
| `CEREBRAS_API_KEY`, `GROQ_API_KEY`, `GROQ_API_KEY_2` | The model. Any one works; each one present is tried in that order. |
| `FISH_API_KEY` | The voices. Optional: without it the game is silent. |
| `FAL_KEY` | New stickers drawn live, the model of last resort, and the one-off art scripts in `scripts/`. Optional. |

**Tests.** `npm test` runs the unit tests in `tests/` with Node's built-in test runner (Node 22.6 or newer, for `--experimental-strip-types`). They cover the signed-cookie pass, judge codes and the daily dollar cap in `lib/server/quota.ts`, and the provider order, cool-downs and failover in `lib/llm.ts`. `fetch` is faked, so they need no keys and make no network calls. `npm run typecheck` runs `tsc --noEmit`.

**Rehearsal mode.** Open `http://localhost:3000/?rehearse` under `npm run dev` and everything runs (grading, voices, Hina, the ladder, the magic) except Orbis, which is replaced by the world's artwork and the exact prompt it would have been sent. It is free, and it's how most of this was built and tested.

Orbis bills per second of an open session (about $0.58 a minute), and each session is capped at five minutes.

**Sharing it publicly.** In production each visitor gets 30 minutes of live dreaming a day (six dreams of up to five minutes), and everyone together is capped at $20 of Orbis a day, read from Reactor's own session list. Judges get 60 minutes that the daily cap does not stop, from a link like `/?judge=CODE`; only a $50 ceiling stops everyone, so even a leaked code cannot empty the account. All of it is set in the environment: `YUME_VISITOR_MINUTES`, `YUME_JUDGE_MINUTES`, `YUME_DAILY_BUDGET_USD`, `YUME_HARD_CAP_USD`, `YUME_JUDGE_CODES` (see `lib/server/quota.ts`). Keep the codes out of the repository.

### Security and cost notes

What the code does, including its weak points:

- **The per-visitor limit is a fairness limit, not a security boundary.** Dreams are counted in an HMAC-signed, httpOnly cookie. An edited or forged cookie is rejected, but clearing cookies (or opening a private window) starts a fresh allowance. The real protection is the global dollar cap, checked against Reactor's own session list before every session token is minted.
- **Set `YUME_QUOTA_SECRET`.** Without it, the cookie-signing key falls back to a SHA-256 hash of `REACTOR_API_KEY`. That works, but it ties the two secrets together, and rotating the Reactor key silently resets every visitor's pass.
- **The dollar cap fails open.** If Reactor's session list cannot be read, `budgetAllows()` lets the session through, so the game stays playable during a Reactor API hiccup. In that window only the per-visitor cookie and each token's own limits (one session, five minutes) apply.
- **The spend figure is cached per server instance** for 20 seconds, and a newly started dream is added only to that instance's figure. With several warm serverless instances, a burst of new sessions can overshoot the daily cap slightly before the next read. The price per second (`USD_PER_SECOND`) is a constant in the code, not read from billing.
- **Only `/api/token` (Orbis) is behind the quota.** The model, voice and sticker routes are not rate-limited by the app; their spend is bounded by the provider accounts' own limits (for example Groq's free-tier daily allowance) and the fal balance.

### Measuring grading latency

`scripts/bench-grading.mjs` sends a fixed set of ten learner answers (Japanese and English, right and wrong) to the app's real grading route, `POST /api/check-answer`, N times each (50 by default). It prints p50, p95 and p99 of the round trip, and how often the grader's verdict matched the expected one, and writes every request to a CSV in `docs/bench/`. It measures what the caller sees: the Next.js route plus the model provider that `lib/llm.ts` picks. Speech recognition is not included.

```bash
npm run build
LLM_PROVIDER=groq npm start       # keys come from .env.local; LLM_PROVIDER picks the provider tried first
npm run bench:grading -- --n 50 --label "groq, home connection"
```

In PowerShell, start the server with `$env:LLM_PROVIDER="groq"; npm start`. The script holds no keys and refuses to run when `CI` is set, because it spends real tokens on rate-limited accounts. Replies graded by the offline fallback instead of the model are counted but left out of the percentiles. No benchmark results are committed yet.

## Project layout

```
app/api/            Server routes: grading, narration, Hina, drift, magic words, sentences, quests, choices,
                    fill-the-gaps, stickers, speech double-check, Fish Audio proxy, Orbis tokens
components/         isekai-game.tsx (the game), world-magic.tsx (the spells),
                    sentence-card, choice-cards, fill-card, narration, vocabulary
lib/                llm.ts (provider failover), magic-sound.ts, ambience.ts, levels.ts (the ladder),
                    romaji.ts and english.ts (on-device matching), look.ts, portals.ts, dreams.ts,
                    sticker-set.ts, stickers.ts, scene.ts, companion.ts, vocab.ts
public/stickers/    The pre-drawn sticker set (scripts/generate-stickers.mjs)
hooks/              The Orbis session, and the rehearsal stand-in
data/scenarios.json The scripted worlds and their objectives
scripts/            One-off art generation (fal), Orbis checks, and bench-grading.mjs
tests/              Unit tests for the quota and the model failover (npm test)
docs/media/         The images in this README
docs/bench/         Where bench-grading.mjs writes its CSVs
```

## Honest limitations

- This is a one-week prototype. It has not been tested with real learners yet, so it makes no claims about how well anyone learns.
- Orbis renders some changes far better than others (see above), and small objects, like the cat in the scripted park, often don't appear at all.
- A world takes about 20 seconds to wake up, and a session ends after five minutes.
- In one long recorded test, a third world in a row lost its connection partway through. Re-run the same way, it passed; the world-ended screen offers a fresh start when it happens.
- Speech recognition works best in Chrome and Edge. Everywhere else, typing (romaji is fine) always works.
- The grader agreed with me on 21 of 22 hand-labelled sentences, including trick answers. That is a sanity check, not a benchmark.

## How this was built

Built solo by **Honey Bird** (Ronith Rashmikara) for the [Visko Orbis Online Challenge](https://www.visko.ai/challenge/orbis-september-2026) (September 2026), starting from Visko's [Orbis starter](https://github.com/Visko-Platform/orbis-online-hackathon-starter), with [Claude Code](https://claude.com/claude-code) as an AI pair-programmer. 34 of the 48 commits made during the build (19–25 September 2026) carry a `Co-Authored-By: Claude` trailer, and later maintenance commits (tests, the benchmark script, README fixes) were made the same way. The architecture decisions, the testing and the measurements are his.

## Credits

Thank you to [Visko](https://www.visko.ai) and [Reactor](https://www.reactor.inc) for Orbis, [Groq](https://groq.com) and [Cerebras](https://www.cerebras.ai) for fast inference, [Fish Audio](https://fish.audio) for the voice, and [fal](https://fal.ai) for the art and the stickers.

## License

[MIT](LICENSE) © 2026 Ronith Rashmikara.

がんばってください！ 🌸
