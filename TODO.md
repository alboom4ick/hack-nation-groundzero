# TODO: gaps between the code and the hackathon brief

Source of truth: [README.md](README.md) (the brief restated as requirements). Each item names the requirement it fixes (`C/M/T/E/A/S` ids from the README; `G` ids are the gaps below). What you must do yourself to close them is in [UNBLOCK.md](UNBLOCK.md).
Priority: **P0** = a "required" box in the brief, **P1** = Apprentice Test / strong submission, **P2** = stretch, moonshot.
Legend: `[x]` done, `[~]` code done, part still open (named under **Open**), `[ ]` not started.

Synced 2026-10-04 after the architecture pass. Nothing below has been rehearsed end to end with voice and a shared screen (G10). Evidence so far: `npm test`, a browser run of Capture and Teach with a synthetic screen and stubbed network, and the live model calls the README status table names.

## P0: required by the brief

- [ ] **G10: rehearse the "What good looks like" script end to end** (README §4) with two people and fix every place it breaks. Every `[~]` below that says "live" closes here.
  Watch for: whether 20 s between the first three questions feels pushy (`catchUpGapSec` in `public/pacing.js`), pause detection with real Scribe, the Picture-in-Picture island, the sandbox and the tutor in two real tabs.
- [~] **G1 (C2, C4, E4, A2): the interviewer agent does not see the screen.**
  Done: after each `/api/describe` the interviewer gets the event and the candidate questions as silent `[SCREEN]` context (`public/live.js`, `screenContext` in `public/asker.js`), and `[ASK]` lets its LLM reword the question; the pause still decides when it speaks (`public/screen-watch.js`, `public/pacing.js`).
  Open: events go as contextual updates, not through a client tool as the brief words it (E4); our vision model still proposes the questions, the agent's LLM only rewords them; needs a live session to tune.
- [x] **G2 (M4): "follow-ups not answered during the task" is not enforced.**
  Done: `sanitizeWorkMap` drops `unclear` entries the expert already answered live, `proposeWorkMap` regenerates once when fewer than 3 are left; the debrief loop is `public/debrief.js`.
- [~] **G3 (M1, M2, E1): the debrief and teach-back are not an ElevenAgents conversation.**
  Done: both run through the interviewer agent (`[ASK:debrief]`, `[TEACHBACK]` cues) via `public/voice-turn.js`, with the built-in voice (TTS, STT) as fallback.
  Open: needs the live rehearsal.
- [~] **G4 (T5, A4): "before it is saved" is not guaranteed.**
  Done: the screen is checked 4 s after a change once the new hire pauses, and the sandbox Save asks the open tutor first and stays unsaved on a violation or a check that could not run (`public/save-hold.js`).
  Open: live rehearsal with the sandbox and the tutor in two tabs. A save in an application other than the sandbox cannot be held, only caught at the next pause.
- [~] **G5 (C5, T5): demo needs a sandbox app with fake data.**
  Done: `public/sandbox/` with the four invoices (one over €5,000 equipment, the December double-biller, the Czech subsidiary, the unseen €7,200 case); sample timings fixed.
  Open: `public/workmaps/invoice_demo.json` is still hand-written (`sample: true`) and has no `screen_moment.uri`, so the tutor shows the time of the expert's screen moment but has no recording to replay (T3). Record a real expert session on the sandbox and commit that Work Map and its video as the sample.
- [~] **G12 (C5): at least three live questions is paced for, not forced.**
  Done: a guardrail question is guaranteed once a decisive step is seen (the fallback is added live if the vision model offers none), and the first three questions come 20 s apart instead of 45 s (`public/pacing.js`).
  Also done: the island shows "asked n of 3" and Stop needs a second click until three are asked and one is a guardrail (`shortfall` in `public/pacing.js`, Stop handler in `public/live.js`).
  Also done: a screen that stays still keeps its questions fresh while the minimum is missing (`stillFreshSec`), and a missing guardrail question is made up from the latest segment once one question is left to reach three (`public/pacing.js`). If the shared window is closed early, the shortfall is shown after the capture with a pointer to "Answer open questions".
  Open: closing the shared window cannot be held, so it can still end below three.
- [x] **G13 (M5): a routine step can carry none of the expert's words.**
  Done: reasons and guardrails are the expert's verbatim words or are dropped; a step with neither carries what the expert said while doing it (`said`), and steps with nothing said are counted and reported when the Work Map is built (`unlinked`).
  Also done: up to two silent steps become debrief questions ("What were you doing at 02:10, and why?"); the answer links to the step as its `said` words (`silentQuestion` in `public/workmap.js`). Further silent steps stay counted as `unlinked`.

## P1: Apprentice Test and strong submission

- [~] **G6 (A5): personal data on screen frames is not protected.**
  Done: configurable regions are painted black and an opt-in in-browser OCR pass blacks out lines with an IBAN, email, phone or long number; one masked-frame path for Capture and Teach that withholds the frame if masking fails (`public/screen-watch.js`, `frame-redact.js`, `ocr-redact.js`). What the expert says is redacted wherever an answer or a transcript is kept (`voice-turn.js`, `screen-watch.js`).
  Open: names and addresses (Presidio-grade detection); the recorded video file itself is not redacted; OCR masking has not been run with real tesseract in a browser.
- [x] **G7 (A5): "take something off the record" works only live.**
  Done: the expert can remove a step, a reason, a guardrail, a quote or a debrief answer from the Work Map afterwards; the teach-back is voided and exports never carry it (`forget` in `public/workmap.js`).
- [~] **G8 (A1 to A5): write the five Apprentice Test answers into the pitch**, with a number for each (pause detection latency, questions per 10 min, follow-ups answered, prediction score, redaction count).
  Done: `PITCH.md`.
  Open: the measured numbers come from G10.
- [~] **G9 (E6): ElevenLabs MCP tool for the tutor** to look up guardrails.
  Done: `POST /mcp` serves `lookup_guardrails` (`lib/guardrail-mcp.js`).
  Done: the Vercel deploy now runs the same handler as `npm start` (`lib/app.js`, entry `api/index.js`, routes in `vercel.json`), so `/mcp` and `/api/*` are public; a preview answered `tools/list`.
  Open: set the env vars on the Vercel project, `vercel deploy --prod`, then register `https://<prod-domain>/mcp` as an MCP server on the tutor agent.
- [~] **G11 (E5): the Work Map reaches the tutor as a per-session prompt override, not as ElevenAgents knowledge base / Procedures.**
  Done: `POST /api/tutor/knowledge` uploads the Work Map as a knowledge-base document on the tutor agent per lesson and the prompt override shrinks to the step list; the full override is the fallback.
  Open: Procedures not done; endpoint shapes untested against the real ElevenLabs API.

## P2: stretch goals and moonshot

- [x] **S1: two experts, one task.** `public/compare.js` aligns two Work Maps, lists where decisions or guardrails differ and the why-question for each expert; shown in the Map screen under "Two experts, one task".
- [x] **S2: language.** The language picker (English/German) feeds `describe.js`, the interviewer agent, Scribe and the Work Map quotes with an English gloss; the tutor stays English.
- [x] **S3: verify the agent export is actually loadable.** Passed 2026-10-04 against the real model: an agent given only the exported instructions stops and asks on the unseen €7,200 case (`lib/verify-export.js`, `node scripts/verify-export.js`).
- [x] **MS: moonshot slide.** `MOONSHOT.md`.

## Done

- [x] Removed the AR player, physical-task vocabulary (`describe.js` prompt now describes screen events) and the video-upload mode; deleted the dead files.
- [x] BPMN editor replaced by the agent-ready export (S3, first version) and a clickable timeline strip on the Work Map.
- [x] UI wording uses the brief's module names (Capture, Map, Teach, Work Map).
- [x] README restates the brief as requirements; `.env.example` added; misspelt `ELEVENLAPS_API` alias removed.
- [x] Architecture pass (2026-10-04): one module each for the model call (`lib/model.js`), the voice turn (`public/voice-turn.js`), the screen watch (`public/screen-watch.js`), the debrief (`public/debrief.js`), question pacing (`public/pacing.js`), the lesson and save hold (`createLesson` in `public/tutor-logic.js`, `public/save-hold.js`) and reading a Work Map (`readWorkMap` in `public/workmap.js`). Domain terms are in `CONTEXT.md`.
- [x] The built-in voice no longer stalls when the app tab is in the background (silence detection ran on animation frames).
- [x] `npm test`: 111 tests pass (2026-10-04); every file and function named in the README exists.
