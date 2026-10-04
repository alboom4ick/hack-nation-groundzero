# GroundZero: the five Apprentice Test answers (one page for the pitch)

Numbers marked **config** are limits set in code today. Numbers marked **measure** must be filled in during the rehearsal (TODO G10); do not claim them before then.

| # | Question | Our answer | Number |
|---|---|---|---|
| A1 | **When to ask?** | The agent asks only when two signals agree: Scribe v2 Realtime says the expert stopped talking (a committed transcript, partial transcripts mean speech) and a 128x72 pixel probe says the screen has been still. It never asks in the first 20 s, never closer than 45 s to the last question. | Screen still **2.5 s**, voice quiet **1.8 s** (**config**). Pause detection latency: **measure** (target under 3 s). |
| A2 | **What to ask?** | Questions are ranked guardrail, then decision, then a missing slot. A slot the screen already shows is never asked. At least one guardrail question per task is guaranteed (`ensureGuardrailQuestion`). | At most **5 live questions per 10 min** (**config**). Questions per 10 min in the rehearsal: **measure**. |
| A3 | **When has it understood?** | The debrief ends only when the expert answered at least 3 follow-ups on things not yet explained (follow-ups already answered while working are dropped in code, `answeredLive`) and confirmed the apprentice's spoken teach-back. A correction counts as not confirmed. | **>= 3** follow-ups answered, teach-back confirmed (**config**). Follow-ups answered in the rehearsal: **measure**. |
| A4 | **Did the new hire learn?** | The tutor keeps a mastery record per judgment step: a correct prediction of the expert's next decision, or a screen check that matched the Work Map. On the unseen EUR 7,200 equipment invoice it checks the screen after every field change and the sandbox ERP asks the tutor before it saves, so a wrong cost center is caught before it is saved. One check against the real model (2026-10-04): a screenshot of the unseen invoice with code 4711 and no asset number came back as a violation of the capex limit, quoting the expert's words. The browser save hold is not rehearsed yet. | Check gap **4 s** after a change, plus on every save (**config**). Prediction score (right / asked) on the unseen case: **measure**. |
| A5 | **Trust.** | "Off the record" pauses capture and questions. Anything can be removed afterwards (a step, a reason, a guardrail, a debrief answer) and the exports then no longer contain it. IBAN, email and phone in speech are replaced before storage or any model call. Personal data on screen: configurable regions are painted black before any frame leaves the browser, and an opt-in OCR pass (in the browser, tesseract.js) blacks out lines with an IBAN, email, phone or long number, and drops the frame if OCR fails. Every quote in the Work Map is verbatim from the expert or it is dropped. **Not yet:** names and addresses on screen (needs Presidio, a Python service), and the recorded video file itself is not redacted. | Redactions and masked frames in the rehearsal: **measure**. OCR masking has not been run in a real browser yet. |

## One line per module

- **Capture**: voice agent asks why at natural pauses, about what is on screen.
- **Map**: spoken debrief, teach-back, then a Work Map with decision, the expert's own words and guardrails per step.
- **Teach**: a tutor explains each step in the expert's words and stops a wrong save, on a case the expert never showed.

Moonshot (MS, see `MOONSHOT.md`): the same Work Map exports guardrails an AI agent can load, so the next hire can also be an agent that stops where the expert would. Checked with a real agent run on the unseen EUR 7,200 invoice (`node scripts/verify-export.js`, 2026-10-04): it stops and asks the controller because there is no asset number.
