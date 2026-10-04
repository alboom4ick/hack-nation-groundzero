# What to do so the remaining items can finish

Each step is yours; after it, tell Claude the item id and it continues.

## 1. S3: verify the agent export (5 min)
Problem: the Anthropic key in `.env` is not scoped to a workspace, so every Anthropic call fails with 400 (`anthropic-workspace-id` missing). This also breaks `/api/describe`, `/api/workmap`, the tutor checks, so **nothing that uses Claude works until this is fixed**.
1. console.anthropic.com → Settings → API keys → create a key inside a workspace (or note the workspace id).
2. Put the new key in `.env` as `ANTHROPIC_API_KEY=`.
3. Run `node scripts/verify-export.js`. Expect `PASS: agent stops and asks on the unseen case.`
Alternative: tell Claude the workspace id and it adds the header in the code.

## 2. G1, G3, G11, G6: first real run (20 min, needs step 1)
1. `node scripts/setup-agents.js` is already done (both agent ids are in `.env`). If you changed prompts, delete the two `ELEVENAGENTS_*_ID` lines and rerun it so the agents get the new prompts and the `[SCREEN]`/`[TEACHBACK]` rules.
2. `npm start`, open http://localhost:3000 in Chrome.
3. Open `/sandbox/` in a second window. In the main page press "Start showing my work", share the sandbox window, process one invoice out loud.
4. Watch for: agent speaks only when you stop; its question mentions what was on screen; browser console has no errors.
5. Click "Build the Work Map", then "Debrief and teach-back": it should be the agent voice, not the plain voice.
6. Click "Teach it to a new hire": in the ElevenLabs dashboard, the tutor agent should now show a "Work Map: ..." knowledge-base document.
7. Tick the OCR checkbox, show a screen with an IBAN or email, check in DevTools → Network that the `/api/describe` frames have a black bar there.
Copy any error text or console output to Claude.

## 3. G5: record the real sample (10 min, needs step 2)
Do step 2.3 once, cleanly, covering all four invoices incl. the unseen EUR 7,200 case. Save the video and the downloaded `.work-map.json` in `public/workmaps/`, tell Claude: it replaces the hand-written sample and wires `screen_moment.uri`.

## 4. G9: MCP tool on the tutor (needs a public URL)
1. Say "deploy to Vercel" (the `.vercel` project exists); I will ask you to confirm before publishing.
2. In ElevenLabs → Agents → Tutor → Tools → add MCP server with `https://<your-deploy>/mcp`.
Or tell Claude to do it via the API once the URL exists.

## 5. G11 Procedures
I could not confirm the ElevenAgents Procedures API shape. Send Claude the docs link or an example JSON from the dashboard (Agent → Procedures → export/inspect request in DevTools).

## 6. G10: rehearsal (2 people, 30 min)
Follow README section 4 "What good looks like": one plays the expert, one the new hire. Write down every place it breaks and give Claude the list; also the numbers for `PITCH.md` (pause latency, questions per 10 min, follow-ups answered, prediction score, redactions).

## Not doable by me, FYI
- Presidio-grade name/address detection needs a Python service; say so if you want it.
- The recorded video file is not redacted (frames sent to models are).
