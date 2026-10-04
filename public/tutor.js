// Module 3: the voice tutor. The new hire shares their screen and works a case on their own. The tutor explains
// each Work Map step in the expert's words, asks them to predict the next decision, and checks the screen at
// natural pauses (or on demand) so a wrong decision is caught before it is saved.
import * as voice from './voice.js';
import { openAgent, agentAvailable } from './agent.js';
import { createScreenLog } from './screen-log.js';
import { builtinVoice } from './voice-turn.js';
import { openScreenWatch } from './screen-watch.js';
import { tutorPrompt, tutorCue } from './agent-prompts.js';
import { readWorkMap } from './workmap.js';
import { finalMap } from './tree-edit.js';
import { listCustom } from './tree-store.js';
import { answerSaves } from './save-hold.js';
import { ocrEnabled, setOcrEnabled } from './ocr-redact.js';
import { openIsland, closeIsland, dismissIsland } from './island.js';
import { stepGuide, explainStep, predictionPrompt, isJudgment, createLesson, summarySpeech, mmss, CHECK_SPEECH } from './tutor-logic.js';

const T = { checkGapSec: 4 }; // seconds between screen checks; when the new hire has paused is the screen watch's call
// The voice panel lives in the floating island, so lookups go through whichever document holds it.
const $ = voice.byId;
let EXPERT = 'the expert'; // the Work Map may name the expert (process.expert); the expert's words stay anonymous otherwise
const expertOf = (m) => m.process?.expert || 'the expert';

let workMap = null;
let lesson = null; // where the tutor is in the Work Map and what the new hire has proven

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? '', textContent: text ?? '' });

// ---------- loading ----------
function setMap(m, source) {
  try { readWorkMap(m); } catch (err) { $('load-msg').textContent = `That is ${err.message}.`; return; }
  workMap = m;
  EXPERT = expertOf(m);
  lesson = createLesson(m, EXPERT);
  $('load-msg').textContent = `Loaded ${m.process?.name ?? 'Work Map'} from ${source}.`;
  $('plan-title').textContent = m.process?.name ?? 'Work Map';
  $('plan').hidden = false;
  $('summary').hidden = true;
  renderSteps();
}

function renderSteps() {
  $('steps').replaceChildren(...workMap.steps.map((s, i) => {
    const r = lesson.record[s.id];
    const li = el('li', `tstep${i === lesson.current ? ' now' : ''}${r.predicted === 'right' ? ' right' : ''}${r.predicted === 'wrong' || r.violations ? ' wrong' : ''}`);
    li.append(el('h4', '', `${i + 1}. ${s.title}`));
    if (s.decision) li.append(el('div', 'meta', `Decision: ${s.decision}`));
    if (isJudgment(s)) li.append(el('div', 'meta', `${s.guardrails.length} guardrail${s.guardrails.length === 1 ? '' : 's'}`));
    return li;
  }));
  renderGuide();
}

// The island's checklist: where the new hire is in the Work Map and what to do on this step.
function renderGuide() {
  const g = $('guide');
  if (!g || !workMap) return;
  const n = workMap.steps.length, i = lesson.current;
  const step = lesson.step;
  $('guide-count').textContent = step ? `Step ${i + 1} of ${n}` : `${n} steps`;
  $('guide-dots').replaceChildren(...workMap.steps.map((s, k) => {
    const r = lesson.record[s.id];
    return el('span', `gdot${k === i ? ' now' : ''}${k < i || r.touched ? ' done' : ''}${r.violations ? ' wrong' : ''}`);
  }));
  $('guide-title').textContent = step ? step.title : 'Press Start practising to begin';
  $('guide-list').replaceChildren(...(step ? stepGuide(step) : []).map((l) => {
    const li = el('li', `g-${l.kind}`);
    li.append(el('b', '', l.label), ' ' + l.text);
    return li;
  }));
}

$('load-sample').addEventListener('click', async () => {
  try { setMap(await (await fetch('workmaps/invoice_demo.json')).json(), 'the sample'); } catch (err) { $('load-msg').textContent = err.message; }
});
$('load-file').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  try { setMap(JSON.parse(await f.text()), f.name); } catch { $('load-msg').textContent = 'Could not read that file as JSON.'; }
});
// Saved action trees (the database, or this browser when none is connected) in a temporary window that closes as
// soon as one is chosen. A tree's switched-off branches are left out, so the tutor teaches the customized version.
const treeDialog = $('tree-dialog');
$('tree-open').addEventListener('click', async () => {
  const list = $('tree-list'), note = $('tree-loading-text');
  list.replaceChildren();
  $('tree-loading').hidden = false;
  note.textContent = 'Loading saved trees…';
  treeDialog.showModal();
  const slow = setTimeout(() => { note.textContent = 'Still loading. The database wakes up after being idle, which can take up to a minute.'; }, 4000);
  try {
    const trees = await listCustom();
    if (!treeDialog.open) return;
    if (!trees.length) { list.append(el('p', 'hint', 'No saved trees yet. Make one on the Action trees page.')); return; }
    list.replaceChildren(...trees.map((t) => {
      const b = el('button');
      b.type = 'button';
      b.append(el('b', '', t.name), el('span', '', `${t.draft.steps.length} steps · saved ${t.saved_at.slice(0, 10)}`));
      b.addEventListener('click', () => {
        treeDialog.close();
        try { setMap(finalMap(t.draft), `the saved tree \u201c${t.name}\u201d`); } catch (err) { $('load-msg').textContent = `That tree cannot be taught: ${err.message}.`; }
      });
      return b;
    }));
    list.querySelector('button')?.focus();
  } catch (err) {
    list.replaceChildren(el('p', 'hint', `Could not load saved trees: ${err.message}`));
  } finally { clearTimeout(slow); $('tree-loading').hidden = true; }
});
$('tree-close').addEventListener('click', () => treeDialog.close());
treeDialog.addEventListener('click', (ev) => { if (ev.target === treeDialog) treeDialog.close(); });
try {
  const saved = localStorage.getItem('groundzero.workmap');
  if (saved) setMap(JSON.parse(saved), 'the Work Map you just built');
} catch { /* storage unavailable: use the buttons */ }

// ---------- helpers ----------
const post = async (url, body) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
};
// The scripted tutor (no ElevenAgents) speaks and listens through the built-in voice.
const scripted = builtinVoice(voice, { onState: voice.setState });
const say = async (text) => { $('voice-q').textContent = text; try { await scripted.say(text); } catch (err) { $('voice-a').textContent = 'voice error: ' + err.message; } };
const hear = async () => {
  const text = await scripted.hear();
  if (text) $('voice-a').textContent = text;
  return text;
};

function showReplay(t, uri) {
  const v = $('replay');
  $('alert-moment').textContent = `Expert's screen moment at ${mmss(t)}`;
  v.hidden = true;
  if (uri) {
    v.onerror = () => { v.hidden = true; };
    v.onloadedmetadata = () => { v.currentTime = Math.max(t - 1, 0); v.hidden = false; v.play().catch(() => {}); };
    v.src = uri;
  }
}

// ---------- session ----------
let session = null;

async function start() {
  if (session || !workMap) return;
  const shareP = navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
  const islandP = openIsland({ width: 400, height: 330 }); // needs the click's activation too, so start it with the share prompt
  let display;
  try { display = await shareP; } catch (err) { closeIsland(); $('load-msg').textContent = 'Screen sharing was cancelled: ' + err.message; return; }
  await islandP;
  // The tutor watches the new hire's screen the same way the apprentice watched the expert's.
  let watch;
  try { watch = await openScreenWatch({ display }); } catch (err) { closeIsland(); $('load-msg').textContent = err.message; return; }

  const s = session = { t0: performance.now(), busy: true, ended: false, lastCheck: -Infinity, changed: false, frames: [], said: '', checking: false };
  const now = () => (performance.now() - s.t0) / 1000;

  // ElevenAgents plays the tutor when it has been set up; otherwise the scripted TTS loop below runs.
  const screenLog = createScreenLog();
  const seen = (obs, verdict) => { screenLog.record(obs); agent.context(tutorCue.screen(obs, verdict)); };
  let agent = null, pendingMute = false, finishing = false, summarySpoken = false, summaryCued = false;
  const agentMode = await agentAvailable('tutor');
  EXPERT = expertOf(workMap);
  lesson = createLesson(workMap, EXPERT); // every lesson starts with a clean record
  const reveal = (step, text) => { $('alert').hidden = false; $('alert-text').textContent = text; showReplay(step.screen_moment.t, step.screen_moment.uri); };
  const releaseAgent = () => { pendingMute = false; agent?.mute(true); s.busy = false; voice.setState('watching'); };
  let watchdog = null;
  const handBackSoon = () => { clearTimeout(watchdog); watchdog = setTimeout(() => { if (s.busy && !finishing) releaseAgent(); }, 90000); };
  // E5: put the Work Map in the tutor's knowledge base for this lesson; if that fails the full prompt override still works.
  let kbLoaded = false;
  if (agentMode) {
    try { kbLoaded = (await fetch('/api/tutor/knowledge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workMap }) })).ok; } catch { /* keep the prompt override */ }
  }
  if (agentMode) {
    try {
      agent = await openAgent({
        role: 'tutor', prompt: tutorPrompt(workMap, EXPERT, { kb: kbLoaded }),
        tools: {
          set_step: ({ step_id }) => { if (lesson.goTo(step_id)) renderSteps(); },
          record_prediction: ({ step_id, correct }) => {
            const p = lesson.predicted(step_id, correct === true || correct === 'true');
            if (!p) return;
            if (!p.right) reveal(p.step, p.reveal);
            renderSteps();
          },
          hand_back: () => { pendingMute = true; handBackSoon(); },
          finish_lesson: () => { pendingMute = true; finishing = true; },
          get_screen_state: () => screenLog.state(),
        },
        onMessage: ({ source, message }) => {
          if (source === 'user') { s.said = message; $('voice-a').textContent = message; } else $('voice-q').textContent = message;
        },
        onMode: (mode) => {
          if (mode === 'speaking') { voice.setState('speaking'); if (summaryCued) summarySpoken = true; return; }
          if (summaryCued && summarySpoken) { agent.end(); return; }
          if (pendingMute) { releaseAgent(); if (finishing) end(); } else voice.setState('listening');
        },
        onError: (m) => { $('voice-a').textContent = 'agent: ' + m; },
      });
    } catch (err) {
      $('load-msg').textContent = `ElevenAgents unavailable (${err.message}); using the scripted tutor.`;
      agent = null;
    }
  }

  lesson.goTo(0);
  renderSteps();
  $('start').disabled = true;
  $('summary').hidden = true;
  $('alert').hidden = true;
  voice.setState('watching');

  const watchLabel = (screenActive, voiceActive, note) => {
    $('watch').replaceChildren();
    const dot = (on, label) => $('watch').append(Object.assign(document.createElement('span'), { className: 'dot' + (on ? ' on' : '') }), label + '  ');
    dot(screenActive, 'screen');
    dot(voiceActive, 'voice');
    $('watch').append(note ?? '');
  };

  // The tutor's own speech is the only thing that suppresses checks; the new hire talking just waits.
  const intervene = async (result) => {
    const { step, intervention: iv } = lesson.violated(result);
    renderSteps();
    s.busy = true;
    $('alert').hidden = false;
    $('alert-text').textContent = `${result.observed} — ${iv.explain}`;
    showReplay(iv.t, step.screen_moment?.uri);
    if (agent) {
      agent.mute(false);
      seen(result.observed);
      agent.cue(tutorCue.intervene(step, iv.words));
      s.lastCheck = now();
      handBackSoon();
      return;
    }
    await say(iv.ask);
    const reply = await hear();
    if (s.ended) return;
    if (reply) s.said = reply;
    await say(iv.explain);
    s.lastCheck = now();
    s.busy = false;
    voice.setState('watching');
  };

  // Returns the verdict ('ok' | 'violation' | 'unsure') or null when no check ran.
  const check = async (forced) => {
    if (s.checking || s.busy || s.ended) return null;
    s.checking = true;
    let verdict = null;
    try {
      const frame = await watch.frame();
      s.frames = [...s.frames.slice(-1), frame];
      watchLabel(false, false, 'checking the screen…');
      const result = await post('/api/tutor/check', { workMap, frames: s.frames, said: s.said });
      s.lastCheck = now();
      s.changed = false;
      verdict = result.verdict;
      if (result.verdict === 'violation') await intervene(result);
      else if (agent) {
        seen(result.observed, result.verdict);
        if (forced) {
          s.busy = true; agent.mute(false);
          agent.cue(tutorCue.say(CHECK_SPEECH[result.verdict] ?? CHECK_SPEECH.unsure));
          handBackSoon();
        }
      } else if (forced) {
        await say(CHECK_SPEECH[result.verdict] ?? CHECK_SPEECH.unsure);
        voice.setState('watching');
      }
    } catch (err) {
      $('voice-a').textContent = 'check failed: ' + err.message;
    } finally { s.checking = false; }
    return verdict;
  };
  $('check-now').onclick = () => check(true);

  // The sandbox ERP asks before it saves (T5, A4): hold the save while the tutor looks, release it only on a
  // clean check. A violation (or a check that could not run) keeps the invoice unsaved.
  const stopAnsweringSaves = answerSaves(() => check(true));

  // Runs while the tutor is not speaking: something changed on screen and the new hire has paused, so look.
  const onTick = ({ t, moved, screenActive, voiceActive, paused }) => {
    if (moved) s.changed = true;
    watchLabel(screenActive, voiceActive, s.changed ? 'will check when you pause' : '');
    if (s.changed && paused && t - s.lastCheck >= T.checkGapSec) check(false);
  };

  // ---- the lesson ----
  let nextResolve = null;
  $('voice-end').textContent = 'Next step';
  $('voice-end').onclick = () => {
    if (!agent) { nextResolve?.(); return; }
    lesson.stepDone();
    $('alert').hidden = true;
    s.said = '';
    s.busy = true;
    agent.mute(false);
    agent.cue(tutorCue.next());
    handBackSoon();
  };
  const waitNext = () => new Promise((r) => { nextResolve = r; });

  const end = async () => {
    if (s.ended) return;
    s.ended = true;
    watch.stop();
    stopAnsweringSaves();
    scripted.cancel();
    display.getTracks().forEach((t) => t.stop());
    clearTimeout(watchdog);
    const sum = lesson.finish();
    $('mastered').replaceChildren(...(sum.mastered.length ? sum.mastered.map((m) => el('li', '', m.title)) : [el('li', 'hint', 'Nothing proven yet.')]));
    $('practice').replaceChildren(...(sum.practice.length ? sum.practice.map((p) => el('li', '', `${p.title} (${p.why})`)) : [el('li', 'hint', 'Nothing left to practice.')]));
    $('summary').hidden = false;
    renderSteps();
    $('start').disabled = false;
    $('voice-end').textContent = 'Close';
    $('voice-end').onclick = dismissIsland;
    voice.setState('idle');
    session = null;
    s.busy = true;
    if (agent) {
      summaryCued = true;
      agent.mute(false);
      agent.cue(tutorCue.summary(sum));
      setTimeout(() => agent?.end(), 40000);
      return;
    }
    await say(summarySpeech(sum));
    voice.setState('idle');
  };
  display.getVideoTracks()[0].addEventListener('ended', end);

  // Scribe v2 Realtime (inside the watch) knows when the new hire is talking or has paused, and writes down what
  // they think aloud (the agent's own mic is muted while they work, so this is the only record of it).
  await watch.start({
    now, busy: () => s.busy, onTick,
    onSaid: (text) => { s.said = `${s.said} ${text}`.trim().slice(-600); },
    onNotice: (m) => { $('load-msg').textContent = m; },
  });
  if (s.ended) return;

  if (agent) {
    voice.setState('listening');
    $('voice-a').textContent = 'Say hello to your tutor, or press Next step when you are ready for the next one.';
    return;
  }
  (async () => {
    await say(`Let's work through ${workMap.process?.name ?? 'this process'}. I will explain each step the way ${EXPERT} did. Do the step on your own screen, then press Next.`);
    for (let i = 0; i < workMap.steps.length && !s.ended; i++) {
      const step = workMap.steps[i];
      lesson.goTo(i);
      renderSteps();
      if (lesson.needsPrediction(i)) {
        s.busy = true;
        await say(predictionPrompt(step, EXPERT));
        const answer = await hear();
        if (answer && !s.ended) {
          try {
            const g = await post('/api/tutor/predict', { step, answer });
            const p = lesson.predicted(step.id, g.correct);
            await say(g.feedback || (p.right ? 'Yes, that is what they did.' : 'Not quite.'));
            if (!p.right) reveal(step, p.reveal);
          } catch (err) { $('voice-a').textContent = 'grading failed: ' + err.message; }
        } else lesson.skipped(step.id);
        renderSteps();
      }
      s.busy = true;
      await say(explainStep(step, EXPERT));
      if (s.ended) return;
      s.said = '';
      s.busy = false;
      voice.setState('watching');
      $('voice-a').textContent = i < workMap.steps.length - 1 ? 'Do this step, then press Next.' : 'Do this last step, then press Finish.';
      await waitNext();
      if (s.ended) return;
      lesson.goTo(i); // an intervention may have moved the lesson to another step meanwhile
      lesson.stepDone();
      $('alert').hidden = true;
    }
    await end();
  })().catch((err) => { $('voice-a').textContent = 'tutor error: ' + err.message; });
}

$('start').addEventListener('click', start);

$('ocr-pii').checked = ocrEnabled();
$('ocr-pii').addEventListener('change', () => setOcrEnabled($('ocr-pii').checked));
