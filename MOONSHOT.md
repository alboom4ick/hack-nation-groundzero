# Moonshot slide: people first, then agents

**Headline:** Every expert who leaves takes their judgment with them. GroundZero keeps it, and then hands it to whoever works next: a new hire today, an AI agent tomorrow.

**What the MVP already proves (all in this repo)**
- Capture: an agent that asks *why* at natural pauses and learns limits, exceptions and when to stop and ask.
- Map: a Work Map where every decision carries the expert's own words, and every guardrail is checked verbatim.
- Teach: a tutor that stops a new hire before a wrong save, on a case the expert never showed.
- **Hand-off to agents (S3):** the same Work Map exports as agent instructions (`public/agent-export.js`). `node scripts/verify-export.js` runs the unseen EUR 7,200 case against an agent that has only that export and checks it stops and asks, like the expert would.
- **Guardrail lookup (E6):** `POST /mcp` serves the guardrails to any MCP client, so a tutor or a booking agent can ask "what is the limit here?" at decision time.

**What we build next**
1. **Two experts, one task (S1):** compare Work Maps and let the apprentice ask each expert why they differ. Disagreement is where the real knowledge is.
2. **People first, then agents:** an agent starts as a shadow beside the new hire, proposes the booking, and may act alone only where it matches the Work Map and stops at every stop-and-ask. Autonomy grows step by step as its stops match the expert's.
3. **Any desk, any language (S2):** the expert speaks German, the tutor teaches in English, the quotes keep both.

**Ask:** pilot partners with one retiring expert and one painful process.
