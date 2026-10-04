// "How it works" pop-up: six Remotion clips (how-it-works/), played one after the other.
// Any element with data-how opens it. Loaded as a module by index.html and landing/index.html.
const DIALOG = `
<dialog class="how" id="how-dialog" aria-labelledby="how-cap-title" data-state="paused">
  <div class="how-card">
    <div class="how-head">
      <button class="how-x" type="button" aria-label="Close" data-how-close><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button>
    </div>
    <div class="how-stage">
      <video id="how-video" playsinline muted preload="auto"></video>
      <audio id="how-audio" preload="auto"></audio>
      <img class="how-poster" id="how-poster" alt="">
      <button class="how-big" id="how-big" type="button" aria-label="Play clip"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v13l11-6.5z"/></svg></button>
      <div class="how-end" id="how-end">
        <p>That is the loop: capture, map, teach.</p>
        <div class="cta">
          <button class="hbtn ghost" type="button" id="how-replay">Replay</button>
          <a class="hbtn amber" id="how-start" href="/">Start capturing <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5"/></svg></a>
          <a class="hbtn ghost" id="how-full" href="/landing/#how" data-how-close>Full walkthrough</a>
        </div>
      </div>
    </div>
    <ol class="how-tabs" id="how-tabs" aria-label="Clips"></ol>
    <div class="how-cap">
      <div class="how-text" aria-live="polite">
        <h3 id="how-cap-title"></h3>
        <p id="how-cap-text"></p>
      </div>
      <div class="how-ctl">
        <button class="how-b" id="how-prev" type="button" aria-label="Previous clip">←</button>
        <button class="how-b" id="how-play" type="button">Pause</button>
        <button class="how-b" id="how-sound" type="button" aria-pressed="true">Sound on</button>
        <button class="how-b" id="how-next" type="button" aria-label="Next clip">→</button>
      </div>
    </div>
    <p class="how-note">Maria is made up and the invoices are the sandbox’s fake data. Voice-over by ElevenLabs. ← → switch clips, space plays.</p>
  </div>
</dialog>
`;

(() => {
  if (typeof HTMLDialogElement === 'undefined') return; // triggers keep their normal href
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/how.css';
  document.head.append(css);
  document.body.insertAdjacentHTML('beforeend', DIALOG);
  const dlg = document.getElementById('how-dialog');
  // On the app page "Start capturing" scrolls to the capture card; on the landing page the full walkthrough is the #how section.
  const capture = document.getElementById('live-card');
  if (capture) { const a = dlg.querySelector('#how-start'); a.setAttribute('href', '#live-card'); a.dataset.howClose = ''; }
  if (document.getElementById('how')) dlg.querySelector('#how-full').setAttribute('href', '#how');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s) => dlg.querySelector(s);
  const video = $('#how-video'), tabsEl = $('#how-tabs'), titleEl = $('#how-cap-title'), textEl = $('#how-cap-text');
  const audio = $('#how-audio'), soundBtn = $('#how-sound'), poster = $('#how-poster'), play = $('#how-play'), prev = $('#how-prev'), next = $('#how-next');
  const BASE = '/landing/how/';
  const CLIPS = [
    { file: '1-expert', tab: 'Meet Maria', title: 'Meet Maria: half paper, half screen', text: 'Maria has booked supplier invoices for 24 years. She scans paper on a desk scanner (the physical half) and codes it in the ERP (the digital half). The why behind her calls was never written down, and she retires in three months.' },
    { file: '2-screen', tab: 'The screen', title: 'Capture, the digital half: it waits for a pause', text: 'Maria shares her screen and works as usual. GroundZero turns what changes into events and stays quiet. Only when the screen has been still for 2.5 s and her voice for 1.8 s does it ask why, and it keeps her answer in her own words.' },
    { file: '3-paper', tab: 'The paper', title: 'Capture, the physical half: it listens', text: 'Paper steps leave nothing on the screen, so the apprentice listens. What she says at the scanner becomes a physical step, and a QR code on each page ties it to the invoice on screen.' },
    { file: '4-map', tab: 'The Work Map', title: 'Map: a debrief, a teach-back, a Work Map', text: 'After the task comes a spoken debrief with follow-ups, then a teach-back she confirms. The result is a clickable Work Map: every step with its screen moment, the decision, her words and the guardrails around it.' },
    { file: '5-teach', tab: 'The new hire', title: 'Teach: a coach for both halves', text: 'The new hire scans the page’s QR code and a phone guides the physical step in AR. On screen, the tutor watches a case Maria never showed and holds a wrong save before it happens, quoting her own words.' },
    { file: '6-agent', tab: 'The agent', title: 'Beyond: the next colleague can be an agent', text: 'The same Work Map exports guardrails an AI agent can load. On a case it has never seen, the agent stops where Maria would stop and asks the controller.' },
  ];
  const last = CLIPS.length - 1;
  let i = 0, switching = false;

  // Voice-over: one mp3 per clip, started and paused together with the video. The choice is remembered.
  let sound = true;
  try { sound = localStorage.getItem('gz-how-sound') !== 'off'; } catch {}
  const showSound = () => { audio.muted = !sound; soundBtn.setAttribute('aria-pressed', String(sound)); soundBtn.textContent = sound ? 'Sound on' : 'Sound off'; };
  showSound();
  soundBtn.addEventListener('click', () => { sound = !sound; try { localStorage.setItem('gz-how-sound', sound ? 'on' : 'off'); } catch {} showSound(); });

  const tabs = CLIPS.map((c, k) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<span class="bar"><i></i></span><span class="t"><b>' + (k + 1) + '</b><em>' + c.tab + '</em></span>';
    b.setAttribute('aria-label', 'Clip ' + (k + 1) + ': ' + c.tab);
    b.addEventListener('click', () => go(k));
    li.append(b); tabsEl.append(li);
    return b;
  });

  const state = (v) => { dlg.dataset.state = v; play.textContent = v === 'playing' ? 'Pause' : 'Play'; };
  const progress = (frac) => tabs[i].style.setProperty('--p', frac);

  function load(n, autoplay) {
    i = Math.max(0, Math.min(last, n));
    const c = CLIPS[i];
    titleEl.textContent = (i + 1) + ' of ' + CLIPS.length + ' · ' + c.title;
    textEl.textContent = c.text;
    tabs.forEach((t, k) => { t.setAttribute('aria-current', k === i ? 'step' : 'false'); t.style.setProperty('--p', k < i ? 1 : 0); });
    prev.disabled = i === 0; next.disabled = i === last;
    video.setAttribute('aria-label', c.title);
    audio.src = BASE + c.file + '.mp3';
    audio.load();
    switching = true;
    poster.src = BASE + c.file + '.jpg'; // shown until the clip really starts, e.g. when autoplay is blocked
    dlg.dataset.fresh = '1';
    video.src = BASE + c.file + '.mp4';
    video.load(); // without it Chrome aborts a play() issued straight after the src change
    state(autoplay ? 'playing' : 'paused');
    if (autoplay) video.play().catch(() => state('paused'));
  }
  const go = (n) => load(n, true);
  const toggle = () => { if (dlg.dataset.state === 'done') return load(0, true); if (video.paused) video.play().catch(() => {}); else video.pause(); };

  video.addEventListener('playing', () => { switching = false; delete dlg.dataset.fresh; state('playing'); audio.play().catch(() => {}); });
  video.addEventListener('pause', () => { audio.pause(); if (!switching && !video.ended) state('paused'); });
  video.addEventListener('timeupdate', () => { if (video.duration) progress(video.currentTime / video.duration); });
  video.addEventListener('ended', () => { progress(1); if (i < last) go(i + 1); else state('done'); });
  video.addEventListener('click', toggle);
  $('#how-big').addEventListener('click', toggle);
  play.addEventListener('click', toggle);
  prev.addEventListener('click', () => go(i - 1));
  next.addEventListener('click', () => go(i + 1));
  $('#how-replay').addEventListener('click', () => go(0));

  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && i < last) { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); go(i - 1); }
    else if (e.key === ' ' && !e.target.closest('button, a')) { e.preventDefault(); toggle(); }
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-how-close]')) dlg.close(); });
  dlg.addEventListener('close', () => { audio.pause(); audio.removeAttribute('src'); audio.load(); video.pause(); video.removeAttribute('src'); video.load(); });

  document.querySelectorAll('[data-how]').forEach((el) => {
    el.setAttribute('aria-haspopup', 'dialog');
    el.addEventListener('click', (e) => { e.preventDefault(); dlg.showModal(); load(0, !RM); });
  });
})();

