# TODO: gaps between the code and the hackathon brief

Source of truth: [README.md](README.md) (the brief restated as requirements). Each item names the requirement it fixes (`C/M/T/E/A/S` ids from the README; `G` ids are the gaps below).
Priority: **P0** = a "required" box in the brief, **P1** = Apprentice Test / strong submission, **P2** = stretch, moonshot.

## Cleanup left over from the scope cut (needs a human: file deletion was blocked in this session)

- [x] **X1** Deleted the dead files (AR player, segmenter, BPMN tree, lineage, split and their tests); misspelt `ELEVENLAPS_API` alias removed. Command that was run:
  ```bash
  cd hack-nation-groundzero
  rm -rf public/player.html public/player.js public/player.css public/runtime.js public/narrator.js public/detect.js public/workflows \
         public/segmenter.js public/tree.js public/bpmn.js lib/lineage.js lib/split.js \
         test/runtime.test.js test/narrator.test.js test/segmenter.test.js test/tree.test.js test/bpmn.test.js
  npm test
  ```

## P0: required by the brief

- [ ] **G1 (C2, C4, E4, A2): the interviewer agent does not see the screen.**
  Now: Claude (`describe.js`) picks the question beforehand and the agent only reads `[ASK] "..."` aloud. Brief: client tools push events into the ElevenAgents conversation so the agent knows what is on screen and its LLM decides what to ask.
  Fix: after each `/api/describe`, send the event (`agent.context("[SCREEN] ...")`, as `tutor.js` already does) and register a client tool; let the agent's LLM phrase and choose the question, keeping our pause gate as the only thing that unmutes it.
- [ ] **G2 (M4): "follow-ups not answered during the task" is not enforced.**
  Now: only the prompt asks for it (`lib/workmap.js` `SYSTEM`). Fix: in `sanitizeWorkMap` drop `unclear` entries that match a live answer (normalised overlap with `expert_answers`) and require ≥ 3 left, else regenerate once.
- [ ] **G3 (M1, M2, E1): the debrief and teach-back are not an ElevenAgents conversation.**
  Now: plain TTS and STT in `runDebrief` (`public/app.js`), no Expressive Mode. Fix: add a third agent role `debriefer` (or reuse the interviewer) with `[ASK]`/`[TEACHBACK]` cues, so the debrief has the same voice as the capture.
- [ ] **G4 (T5, A4): "before it is saved" is not guaranteed.**
  Now: the screen check runs after a pause with `checkGapSec: 20`, or on the "Check my work" button (`public/tutor.js`). The new hire can save inside the gap. Fix: cut the gap to ~4 s after any field change, check on every pause, and show a "Save" interception in the sandbox ERP (G5) that asks the tutor first.
- [ ] **G5 (C5, T5): demo needs a sandbox app with fake data.**
  Now: no ERP in the repo. `public/workmaps/invoice_demo.json` is hand-written (`sample: true`), has no `screen_moment.uri` so replay of the expert's moment does not work, and its times overlap (s4 ends at 192, its reason is at 195, s5 starts at 192).
  Fix: add `public/sandbox/` (a small static ERP page with three invoices: one over €5,000 equipment, one from the December double-biller, one from the Czech subsidiary, plus the unseen €7,200 case); record a real expert session on it; commit that Work Map and its video as the sample; fix the timings.

## P1: Apprentice Test and strong submission

- [ ] **G6 (A5): personal data on screen frames is not protected.**
  Now: `redact.js` (regex) only cleans speech. Frames go to Anthropic as is. Fix: run Microsoft Presidio (image redactor or OCR then mask) on frames before `/api/describe` and `/api/tutor/check`, or at minimum blur configurable regions; update README A5 once done.
- [ ] **G7 (A5): "take something off the record" works only live.**
  Now: the "Off the record" toggle stops capture. Fix: let the expert delete a step, answer or quote from the Work Map afterwards (and from the exported files).
- [ ] **G8 (A1 to A5): write the five Apprentice Test answers into the pitch** (one slide or one page), with a number for each (pause detection latency, questions per 10 min, follow-ups answered, prediction score, redaction count).
- [ ] **G9 (E6): ElevenLabs MCP tool for the tutor** to look up guardrails (brief hint, optional but cheap): serve `agent-export` JSON from a small MCP server and register it on the tutor.
- [ ] **G10: rehearse the "What good looks like" script end to end** (README §4) with two people and fix every place it breaks.

## P2: stretch goals and moonshot

- [ ] **S1: two experts, one task.** Compare two Work Maps by step, show where decisions or guardrails differ, and have the apprentice ask each expert why.
- [ ] **S2: language.** `agentConfig` hardcodes `language: 'en'`. Let the expert pick German (Scribe, interviewer, `describe.js` question language), keep the tutor in English; quotes stay in the original language with an English gloss.
- [ ] **S3: verify the agent export is actually loadable.** `public/agent-export.js` writes JSON and Markdown. Load it into an agent (ElevenAgents knowledge base or a tool-using Claude), run the €7,200 case and check it stops where the expert would. Add that as a test.
- [ ] **MS: moonshot slide.** One slide: what we build next and how this MVP gets there (suggested: *people first, then agents*, since S3 already exports guardrails agents can follow).

## Done

- [x] Removed the AR player, physical-task vocabulary (`describe.js` prompt now describes screen events) and the video-upload mode; deleted the dead files.
- [x] BPMN editor replaced by the agent-ready export (S3, first version) and a clickable timeline strip on the Work Map.
- [x] UI wording uses the brief's module names (Capture, Map, Teach, Work Map).
- [x] README restates the brief as requirements; `.env.example` added; misspelt `ELEVENLAPS_API` alias removed.
- [x] `npm test`: 44 tests pass (2026-10-04).
