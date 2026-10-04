# How it works clips (Remotion)

Six short clips shown in the "How it works" pop-up on the landing page (`public/landing/index.html`).
Story: Maria, an accounts-payable clerk whose job is half paper (desk scanner) and half screen (ERP).
Scenes: 1 the problem, 2 Capture on screen, 3 Capture on paper, 4 Map, 5 Teach (AR phone + tutor), 6 agent export.

```bash
cd how-it-works
npm install
npm run studio          # edit and scrub the scenes
npm run render          # writes ../public/landing/how/<n>-<name>.mp4 and .jpg posters
node render.mjs 3-paper # one clip only
node voice.mjs          # voice-over mp3s from narration.json (ElevenLabs key from ../.env)
```

Each clip is as long as its voice-over: after changing `narration.json`, run `voice.mjs`, then set the new frame counts in `src/Root.tsx` (audio seconds + about 0.8 s, times 30) and render again.

Scenes live in `src/scenes/`, shared pieces (window, island, paper, scanner) in `src/ui.tsx`, colours and fonts in `src/theme.ts`.
The pop-up text under each clip is in the landing page script (`CLIPS`), keep it in step with the scenes.
This folder is not deployed (`.vercelignore`); only the rendered files in `public/landing/how/` are.
