# GroundZero: test to-do list (prod)

URL: https://groundzero-ar.vercel.app
Mark each item `[x]` when it passes. If it fails, write `FAIL:` and the error text (Console or Network → Response) under the item.
Spoken lines are in English; keep the language selector on English unless a step says otherwise.

## A. Setup

Cofounder:
- [ ] Chrome, microphone and screen-share allowed; nothing to install, no `.env`
- [ ] Three tabs open with DevTools Console: `/`, `/sandbox/`, `/tutor.html`
- [ ] `/sandbox/` → **Reset** pressed
- [ ] No console errors on load; no 4xx/5xx on `/api/...` in Network
- [ ] Notebook ready (time and text of every agent question)

## B. Sandbox page (`/sandbox/`)

- [ ] List shows 4 invoices: INV-4471 (€6,400), INV-4472 (€880, Brightwave), INV-4473 (€1,250, CZ), INV-4475 (€7,200)
- [ ] Clicking each invoice opens its detail (supplier, category, amount, PO, date, note)
- [ ] Cost center dropdown has 4711 Opex, 0400 Capex, 6100 Services
- [ ] Asset number field accepts text
- [ ] **Reset** restores all invoices
- [ ] Save with no tutor tab open: "Not saved: the tutor did not answer in time", invoice stays open
- [ ] Save when allowed: status becomes `posted`, fields and button locked

## C. Flow 1: Capture (`/`)

Start
- [ ] Language selector offers English and Deutsch; choice survives a reload
- [ ] OCR checkbox toggles; a11y panel in the header works
- [ ] **● Start showing my work** → share the `/sandbox/` tab, allow mic
- [ ] Floating helper (PiP, or pinned panel as fallback) appears, orb "breathes", agent greets by voice

INV-4471
- [ ] Say: "I'm opening invoice 4471 from Nordtech Maschinen, a CNC milling head, six thousand four hundred euros, coded to cost center 4711."
- [ ] Stay silent 5 s; note whether the agent asked anything
- [ ] Change Cost center → 0400 Capex
- [ ] Say: "I'm changing this to capex. Equipment over five thousand euros is always capex."
- [ ] Agent stays quiet while you talk or type
- [ ] Set Asset number `AST-2201`, stay silent 5 s, wait for a "why" question
- [ ] Answer: "It's equipment above five thousand euros, that's the company rule, so it goes to capex."

INV-4472
- [ ] Open INV-4472 and say: "Brightwave Print, eight hundred eighty euros, same invoice number as last week."
- [ ] Stay silent 5 s; if no question after 20 s, say: "This supplier always double-bills in December."
- [ ] Answer: "This supplier double-bills every December, so I hold the invoice until accounting confirms it's not a duplicate."
- [ ] At least one question was about a guardrail (limit, exception, when to stop and ask)
- [ ] Do not save; say: "I'm putting this one on hold."

INV-4473
- [ ] Open INV-4473 and say: "Moravia Components, Czechia, twelve hundred fifty euros, known supplier, PO matches, nothing unusual."
- [ ] Agent does not ask about things already visible on screen

Off the record
- [ ] Press **Off the record**: orb grey, state "private"
- [ ] Say: "My IBAN is DE89 3704 0044 0532 0130 00 and my email is test@example.com."
- [ ] No questions for 20 s while private
- [ ] Press again: capture resumes

Other
- [ ] **Skip this one** skips a question; the next does not arrive instantly
- [ ] **Stop** ends the session; "What would you like to do next?" shows **Build the Work Map** and **Answer open questions**
- [ ] Segment cards with frames and descriptions appear; pager works if there are many
- [ ] The IBAN and email from the off-the-record step appear nowhere
- [ ] Pass criteria met: at least 3 questions about on-screen things, at least 1 guardrail question
- [ ] Notebook: total questions, on-screen questions, guardrail questions

## D. Flow 2: Map (`/`)

Open questions
- [ ] **Answer open questions** → agent asks the queued questions one by one
- [ ] Answer: "If I've never seen the supplier before, I stop and ask the controller."
- [ ] Answer: "The purchase order has to match the invoice. No PO, I don't process it."
- [ ] Answer: "Over five thousand euros equipment goes to capex. Without an asset number I don't book capex, I ask the controller first."
- [ ] **Skip this one** works on one question; **Stop** ends it

Work Map
- [ ] **Build the Work Map**: progress shows, then the Work Map card opens (note if it hangs past 60 s)
- [ ] Timeline buttons scroll to their step
- [ ] Every step shows screen moment, decision, reason as a quote, guardrails
- [ ] Capex step: 4711 → 0400, reason "equipment over five thousand is always capex"
- [ ] Guardrail: December supplier is held
- [ ] Guardrail: no asset number, do not book capex
- [ ] Every guardrail links to a screen moment and the expert's words
- [ ] Steps with nothing said are marked as unlinked, not invented
- [ ] Off-the-record content is absent
- [ ] Deleting a step, answer or quote removes it from the map

Debrief and teach-back
- [ ] **Debrief and teach-back** runs in the agent voice (not plain TTS)
- [ ] Agent asks at least 3 follow-ups that were not asked during capture; `debrief-status` tracks them
- [ ] Answer: "It's for that one supplier only, Brightwave. Accounting decides when to release it, after they confirm the original was paid."
- [ ] Answer: "Five thousand is a hard line. Exactly five thousand is still opex, above that it's capex."
- [ ] Answer: "The controller issues the asset number. I never make one up."
- [ ] Answer: "Unknown supplier, missing asset number, or anything that looks like a duplicate: stop and ask."
- [ ] Teach-back try 1, say: "No, not quite. The December hold applies to Brightwave only, not all suppliers." → not counted as confirmed, debrief continues
- [ ] Teach-back try 2, say: "Yes, that's exactly how I do it." → status confirmed, debrief ends
- [ ] Negative: rerun the debrief and say "yes" at the first teach-back with fewer than 3 follow-ups → it must not finish

Files
- [ ] **Download Work Map** saves a `.json` (keep it for flow 3); it contains your quotes and no IBAN or email
- [ ] **Export for an agent** saves instructions with "stop and ask" guardrails

Two experts
- [ ] Expert A and B = the same file → **Compare** shows no or almost no differences
- [ ] Edit 5000 → 3000 in one guardrail, save as `b.json`, use as Expert B → difference and a question to each expert
- [ ] A non-JSON file as Expert B → clear error

## E. Flow 3: Teach (`/tutor.html` + `/sandbox/`)

Load
- [ ] `/sandbox/` → **Reset**
- [ ] **Try the sample invoice guide** → plan with 7 steps and **● Start practising**
- [ ] Reload, load your own downloaded `.json` via "open a guide file" → plan loads
- [ ] Load a non-JSON or foreign JSON file → clear error

Practice
- [ ] **● Start practising**, share the `/sandbox/` tab
- [ ] Panel shows step counter, dots, step title, Do / Watch hints
- [ ] Tutor explains each step in the expert's words
- [ ] Wrong prediction, say: "I'd just post it, nothing to check." → dot orange, tutor corrects
- [ ] Right prediction, say: "I'd check if it's equipment over five thousand, then code it to capex." → dot green

Unseen case INV-4475 (main test)
- [ ] Open INV-4475 (€7,200, cost center 4711, asset empty), change nothing, **Save and post**
- [ ] Overlay "Checking with your tutor before saving…"
- [ ] Message "Not saved: your tutor flagged this. Talk it through first.", invoice stays open
- [ ] On `/tutor.html`: red card "Stop: the expert would pause here"
- [ ] Card quotes the expert's capex reasoning and shows the screen moment or replay
- [ ] Tutor asks why; answer: "Because it's equipment over five thousand euros, so it should be capex, not opex."
- [ ] Set 0400 Capex with asset still empty → **Save** → blocked again (no asset number)
- [ ] Add `AST-2300` → **Save** → "Saved after the tutor check.", status `posted`, fields locked
- [ ] **Check my work** on a wrong invoice flags the problem without saving

Other invoices
- [ ] INV-4472 **Save** → blocked by the December rule
- [ ] INV-4473 **Save** → saves without a block
- [ ] INV-4471 with 0400 and asset number → saves without a block

Tutor offline
- [ ] Close `/tutor.html`, **Save** on an open invoice → "tutor did not answer in time", not posted

Finish
- [ ] **I am finished** → "What you have mastered" and "Practice next" are filled and match your answers
- [ ] Tutor reads the summary aloud

## F. Privacy, language and edge cases

- [ ] OCR on: share a tab showing `DE89 3704 0044 0532 0130 00` and `test@example.com` for 10 s; in Network, a `describe` request frame has a black bar there
- [ ] OCR failure drops the frame; the app does not crash
- [ ] Deutsch: reload keeps it; say "Ich öffne die Rechnung 4471 und buche sie auf Anlagevermögen um, weil Anlagen über fünftausend Euro immer aktiviert werden." → agent replies in German
- [ ] Cancel the screen-share dialog → clear message, no crash
- [ ] Block the microphone → clear message
- [ ] **Start** then immediately **Stop** → no crash
- [ ] Close sharing via Chrome's "Stop sharing" mid-session → session ends cleanly

## G. Landing (`/landing/`, optional)

- [ ] Loads without errors; menu links scroll to The problem, How it works, Apprentice Test, Moonshot
- [ ] "Open the app" and "Start capturing" go to `/`
- [ ] Demo "You're the new hire": pick a cost center, **Save booking** → tutor warning; **Reset** restores it
- [ ] Mobile width (~375 px) does not break

## H. Send back to Ostap

- [ ] Table of item → pass or fail, with error text for each fail
- [ ] Numbers for the pitch: seconds from silence to question, questions in Capture (and how many on guardrails), follow-ups in the debrief, correct predictions out of total, redactions (IBAN, email, phone)
- [ ] Screenshots: the red "Stop: the expert would pause here" card and the finished Work Map

## Known limits (not bugs)

- The sample Work Map is hand-written (`sample: true`), not recorded live
- Names and addresses are not redacted (only IBAN, email, phone), and the recorded video file is not redacted
- The guardrail-lookup MCP tool is not registered on the tutor yet
- ElevenAgents Procedures are not built
- Vercel functions stop at 60 s (`maxDuration`); a long Build the Work Map may time out
