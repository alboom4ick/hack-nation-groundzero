# GroundZero: The AI Apprentice

Project for **Hack-Nation 7th Global AI Hackathon, Challenge 01: The AI Apprentice** (powered by ElevenLabs).
Source brief: `../File (1).pdf`. This README restates the brief as project requirements, one to one.
Open gaps are tracked in [TODO.md](TODO.md) as `G1…G13` (plus `S1…S3`, `MS`); what you must do yourself to close them is in [UNBLOCK.md](UNBLOCK.md).

## Status snapshot (2026-10-04)

`✅` met in code and checked (tests, or a live call to the real model); `⚠️` code is done but needs a live session with voice and a shared screen; `❌` open. Nothing has been rehearsed end to end yet (G10), so a tick is never a claim about the live demo.

| Area | Requirement ids | Status | Open gaps |
|---|---|---|---|
| Capture | C1, C2, C3, C5, C6 | ✅ code; pause timing and question quality need the rehearsal | G10 |
| Capture | C4 (screen events in the agent's context) | ⚠️ `public/asker.js` sends `[SCREEN]` context after each description; needs live tuning | G1 |
| Map | M3, M5 | ✅ every step in the sample links to a screen moment and the expert's words (a reason, a guardrail or, for a routine step, what was said while doing it) | |
| Map | M4 (follow-ups not answered during the task) | ✅ enforced in `sanitizeWorkMap` (G2) | |
| Map | M1, M2 (spoken debrief and teach-back) | ⚠️ run through the interviewer agent (`[ASK:debrief]`, `[TEACHBACK]`), plain TTS/STT as fallback; not run live | G3 |
| Teach | T1 to T4 | ✅ | |
| Teach | T5 (catch before save, unseen case) | ✅ `/api/tutor/check` flags code 4711 on the unseen EUR 7,200 invoice and quotes the expert (live call, 2026-10-04); ⚠️ the sandbox Save hold in a real browser is not rehearsed | G4, G10 |
| Apprentice Test | A1 to A4 | ✅ in code; the **measure** numbers in `PITCH.md` come from the rehearsal | G10 |
| Apprentice Test | A5 (off the record, PII) | ⚠️ speech by regex; frames by regions and opt-in OCR masking; the expert can delete anything afterwards (G7). Not done: names and addresses, the recorded video file | G6 |
| ElevenLabs | E2, E3 | ✅ | |
| ElevenLabs | E1, E4 (ElevenAgents, Expressive Mode, screen events as context) | ⚠️ needs a live session | G1, G3 |
| ElevenLabs | E5 (Work Map into the tutor) | ⚠️ uploaded as a knowledge-base document (`POST /api/tutor/knowledge`, shapes untested against the real API); Procedures not done | G11 |
| ElevenLabs | E6 (MCP guardrail lookup) | ⚠️ `POST /mcp` serves `lookup_guardrails`; not yet registered on the tutor (needs a public URL) | G9 |
| Stretch | S1 two experts, S2 German, S3 agent export | ✅ built; S3 verified with a real agent run on the unseen case (`node scripts/verify-export.js`, 2026-10-04) | |
| Pitch | MS moonshot, five Apprentice Test answers | ✅ `MOONSHOT.md`, `PITCH.md` | |
| Pitch | Real recorded sample Work Map; deliverables checklist (§8) | ❌ the sample is hand-written (`sample: true`) | G5, G10 |

## 1. What we build

A working end-to-end MVP that **captures** what an expert knows while they work on a screen, **maps** it into a workflow anyone can follow, and **teaches** it to the next generation.
An ElevenLabs voice agent watches the expert's screen, asks *why* at the right moments and runs a short debrief until it fully understands the process.

**An apprentice, not a recorder.** A recorder captures what happened. An automation tool copies clicks. An apprentice asks why, learns the rules and guardrails behind each step, and keeps asking until nothing is unclear. If a new person could not do the task from what it learned, it is not an AI Apprentice.

Problems we solve:

| Problem | Meaning |
|---|---|
| Knowledge lives in heads | What makes experienced people good was never written down |
| Recordings show what, not why | Screen recordings and click logs cannot tell a judgment call from a habit or a mistake |
| Guardrails are invisible | Limits, exceptions and the moment to stop and ask are rarely written down |

**Use case and interface are ours.** Running example: invoicing (accounts payable). Any knowledge-driven desk work fits. Interface: side panel, floating voice companion (Picture-in-Picture), replayable timeline.

## 2. Modules (all three are required)

### Module 1: Capture
A screen-share web app with a voice agent that asks why while the expert works.

| # | Requirement | Where |
|---|---|---|
| C1 | Web app: the expert shares their screen; an ElevenLabs agent listens in a side panel | `public/live.js`, `public/agent.js` |
| C2 | Every 1 to 2 seconds a frame goes to a vision model, which turns what changed into events ("invoice 4471 opened, cost center changed from 4711 to 0400") | `public/screen-watch.js` (`frameMs`), `public/live.js`, `lib/describe.js`, `lib/model.js`, `POST /api/describe` |
| C3 | The agent stays quiet while the expert types, reads or talks, and asks at natural pauses: why this step, is there a limit, when would you stop and ask someone | `public/pause.js`, `public/screen-watch.js` (Scribe v2 Realtime), `public/live.js` (question pacing) |
| C4 | Screen events reach the agent's context so it knows what is on screen | `agent.context()` in `public/agent.js`; the interviewer gets each described segment as `[SCREEN]` context (`public/live.js`, `screenContext` in `public/asker.js`), the tutor each screen check (`tutorCue.screen`) |
| **C5 (required)** | During a real task the agent asks **at least 3 questions**, each at a natural pause and about something **visible on screen**; **at least one is about a guardrail** | `public/pacing.js` (`minQuestions`, live guardrail fallback), `guardrail_question` |
| C6 | Ask less, later: 3 to 5 live questions per 10 minutes; the rest wait for the debrief | `public/pacing.js` (`maxPer10Min`, `gapSec`) |

### Module 2: Map
When the task ends, the apprentice runs a short spoken debrief and produces the **Work Map**: a clickable timeline where every step shows the screen moment, the decision, the reason in the expert's words and the guardrails around it.

| # | Requirement | Where |
|---|---|---|
| M1 | Spoken debrief that asks what is still unclear | `public/app.js` (`runDebrief`), `public/voice-turn.js` |
| M2 | The apprentice explains the whole process back in its own words so the expert can confirm or correct it (teach-back) | `lib/workmap.js` (`explainWorkMap`, `judgeTeachBack`) |
| M3 | Work Map is a **clickable timeline**; each step has: screen moment, decision, reason (expert's words), guardrails | `public/workmap.js`, `public/app.js` (`renderMap`) |
| **M4 (required)** | The debrief asks **at least 3 follow-up questions that were not answered during the task** and **ends with a teach-back the expert confirms** | `public/debrief.js`, `MIN_FOLLOWUPS`, `debriefStatus` |
| **M5 (required)** | **Every step and every guardrail links to a screen moment and to the expert's own words** | `sanitizeWorkMap` keeps only verbatim quotes; routine steps carry what the expert said while working (`said`), steps with nothing said are counted (`unlinked`) |

Example step: *Step 4 of 7: code the invoice to a cost center. Screen moment 03:12, invoice 4471, cost center field. Decision: re-coded from opex (4711) to capex (0400). Reason: "Equipment over €5,000 is always capex." (live question at 03:15). Guardrails: no asset number, no capex booking; unknown supplier, stop and ask the controller.*

### Module 3: Teach
The Work Map becomes a voice tutor for the next generation. The new hire works a case on their own screen while the tutor watches, explains each step the way the expert did, asks them to **predict the next decision**, steps in **before** a guardrail is broken, and replays the expert's screen moment when it helps. At the end it shows what they have mastered and what to practice next.

| # | Requirement | Where |
|---|---|---|
| T1 | Tutor watches the new hire's screen and explains each step in the expert's words | `public/tutor.js`, `public/agent-prompts.js` |
| T2 | Tutor asks the new hire to predict the next decision and where they would stop | `POST /api/tutor/predict` |
| T3 | Tutor steps in before a guardrail is broken and replays the expert's screen moment | `POST /api/tutor/check`, `createLesson` (`violated`) in `public/tutor-logic.js`, `public/save-hold.js` |
| T4 | End summary: what is mastered, what to practice next | `summarize`, `summarySpeech` |
| **T5 (required)** | A judge playing a new hire processes **a case the expert never showed**. The tutor **catches at least one wrong decision before it is saved** and explains it **using the reasoning the expert gave** | `public/tutor.js` |

## 3. The Apprentice Test (the demo must answer all five)

| # | Question | Our answer |
|---|---|---|
| A1 | **When to ask.** How does the agent know the expert has paused and stay quiet while they type, read or talk? | Scribe v2 Realtime partial/committed transcripts plus screen-activity probe (`pause.js`, `screen-watch.js`) |
| A2 | **What to ask.** How does it pick the question that reveals a reason or a guardrail instead of one the screen already answers? | Question ranking: guardrail, then decision, then missing slot; slots filled from the screen are never asked (`describe.js`, `pacing.js`) |
| A3 | **When it has understood.** How does the debrief decide it is done, and how does the teach-back prove it? | `debriefStatus`: ≥ 3 answered follow-ups and an expert-confirmed teach-back |
| A4 | **Whether the new hire learned.** How do you show they can handle a new case on their own? | Mastery record per step: predictions plus screen checks (`createLesson` in `tutor-logic.js`) |
| A5 | **Trust.** How can the expert take something off the record, and how is personal data on screen protected? | "Off the record" button pauses capture and questions; regex redaction (IBAN, email, phone) of what the expert says, applied wherever an answer is taken (`voice-turn.js`) or a transcript is kept (`screen-watch.js`). Personal data on screen frames: configurable regions are painted black before any frame is sent, and an opt-in in-browser OCR pass (tesseract.js) blacks out lines containing an IBAN, email, phone or long number, dropping the frame if OCR fails (one masked-frame path for Capture and Teach, `screen-watch.js`). Removing something after the fact: the expert can delete a step, answer or quote from the Work Map (G7). **Not yet:** Presidio-grade detection (names, addresses), and the recorded video file itself is not redacted |

## 4. What a strong submission looks like

| Strong | Weak |
|---|---|
| Asks at natural pauses, about what is on screen | Interrupts mid-typing, or asks generic questions |
| Captures guardrails: limits, exceptions, when to stop and ask | Captures only the happy path |
| The debrief closes gaps and ends with a teach-back | A summary written from the transcript afterwards |
| The tutor teaches a new hire to decide, in the expert's words | A screen recording nobody will watch |
| A pitch with a clear moonshot and a path to it | A demo that stops at the demo |

**Reference demo ("What good looks like").** A judge playing Sabine shares their screen and processes three invoices while talking. At a pause a calm voice asks "You moved that one to capex. What made you do that?" The judge explains equipment over €5,000 is always capex. In the debrief it asks "You held the December invoice. Is that for every supplier, and who decides when to release it?" Then it explains the whole process back in under a minute, and the judge corrects one detail. The Work Map shows seven steps, three judgment calls and four guardrails, each linked to its moment on screen. A second judge, playing a new hire, opens a fresh €7,200 equipment invoice and reaches for the opex code. The tutor says "Sabine would stop here. Why do you think?", replays her screen moment and lets them fix it. **That is the bar.**

**Bring your own workflow.** Best demo workflow: takes 5 to 10 minutes on screen, hides at least one judgment call that is not written down, has real guardrails (a limit, an exception, a moment to stop and ask). Run it on fake or sandbox data. Fallback: three supplier invoices in a sandbox ERP, one over the €5,000 capex line and one from a supplier that double-bills in December.

## 5. Built with ElevenLabs

| # | Requirement | Where |
|---|---|---|
| E1 | **ElevenAgents** plays both roles, interviewer and tutor, with **Expressive Mode** for a curious, patient voice | `lib/agents.js`, `scripts/setup-agents.js` |
| E2 | Our choice of LLM behind the agent decides what to ask, when, and when it has understood enough | `DEFAULT_LLM` in `lib/agents.js` |
| E3 | **Scribe v2 Realtime** listens while people work and knows when they pause | `public/scribe.js`, `GET /api/scribe/token` |
| E4 | Client tools push screen events into the ElevenAgents conversation | `TOOLS` in `public/agent-prompts.js` registers agent-to-browser tools; screen events go browser-to-agent as contextual updates, for both roles (G1) |
| E5 | The Work Map goes into the tutor's knowledge base and Procedures; the tutor watches the new hire's screen the same way | `POST /api/tutor/knowledge` (`syncKnowledge` in `lib/agents.js`) uploads it as a knowledge-base document per lesson, with `tutorPrompt()` as the fallback override; no Procedures (G11); screen watching: `public/screen-watch.js`, the same module Capture uses |
| E6 | (hint) The tutor can look up guardrails through an ElevenLabs MCP server | `lib/guardrail-mcp.js`, `POST /mcp`; not yet registered on the tutor agent (G9) |

Suggested wiring from the brief: (1) the browser shares the screen, a frame every 1 to 2 s goes to a vision model that returns events, not video; (2) client tools push those events into the conversation; (3) after the task an LLM merges events, transcript and answers into Work Map JSON and lists what is still unclear for the debrief; (4) the Work Map goes into the tutor.

## 6. Stretch goals and moonshot

| # | Item | Requirement |
|---|---|---|
| S1 | Two experts, one task | Show where two sessions differ and ask each expert why (`public/compare.js`, Map screen) |
| S2 | Any language | The expert explains in German; the tutor teaches a new hire in English (`public/language.js`) |
| S3 | Agent-ready guardrails | Export the Work Map as instructions an agent can load, so it follows the same steps and stops where the expert would (`public/agent-export.js`, button "Export for an agent") |
| MS | **Moonshot slide** | End the pitch with one slide: the moonshot we would build next and how today's MVP gets there. Directions: living company memory, always-on apprentice, people first then agents, the world's operations manual. Ours: people first, then agents (`MOONSHOT.md`) |

## 7. Data sources and tools (from the brief)

| Category | Source | Use |
|---|---|---|
| Own workflow | Record yourself or a teammate | Most honest test data |
| Agent brain | ElevenAgents LLM options | Model behind interviewer and tutor |
| Screen understanding | Any vision-capable model (we use Claude) | Describe what changed between frames |
| Debrief and Work Map | Agent framework of our choice | Merge events, transcript, answers; find gaps |
| Tools | ElevenLabs MCP tools | Let the tutor look up guardrails |
| Tasks and roles | O*NET database | Occupations and tasks for choosing a workflow |
| Screen sandbox | WebArena | Self-hosted web apps with fake data |
| Privacy | Microsoft Presidio | Redact personal data in transcripts and frames |

## 8. Deliverables checklist

- [~] Working end-to-end MVP: Capture, Map, Teach (all three modules): code done, not yet rehearsed end to end (G10)
- [~] A live demo that answers the five Apprentice Test questions: answers written in `PITCH.md`; the **measure** numbers wait for the rehearsal
- [x] A workflow on fake or sandbox data: `public/sandbox/` (four invoices, the invoicing running example)
- [x] One-slide moonshot at the end of the pitch: `MOONSHOT.md`
- [ ] Hackathon submission files (`../Final Submission Guide.md`): demo and tech videos, 1-page PDF, public repo, zip, form

## 9. Run it

```bash
npm install        # no dependencies, Node 20+
cp .env.example .env   # ELEVENLABS_API, ANTHROPIC_API_KEY
node scripts/setup-agents.js   # creates the interviewer and tutor agents, writes their ids to .env
npm start          # http://localhost:3000   (expert: /   tutor: /tutor.html   landing page: /landing/)
npm test
```

`.env` is git-ignored. Never commit keys.

Deploy: `vercel deploy --prod`. `api/index.js` runs the same handler (`lib/app.js`) as `npm start`; the env vars from `.env.example` and both `ELEVENAGENTS_*_ID` must be set on the Vercel project.

## 10. Out of scope (deliberately removed)

Anything not required by the brief was cut so the pitch stays Capture → Map → Teach: mobile AR workflow player, physical-task vocabulary, uploaded-video mode, the standalone BPMN action-tree editor (its useful part became the agent-ready export, S3).

## AR task per transaction (QR)

Each sandbox transaction has a QR code (`/ar/qr.html`, linked from the sandbox header). Scanning it opens `/ar/?tx=<invoice id>`, which shows simple actions over the camera feed: a key sequence (U, O, P), a hand gesture (fist, open hand, thumbs up; MediaPipe hand tracking, loaded from a CDN on first use) or taps. The task per invoice is in `public/ar/tasks.js` and printed under each QR for testing. The camera needs HTTPS (the Vercel deploy) or localhost; the key task needs a hardware keyboard. Gesture thresholds are untested on a real camera.
