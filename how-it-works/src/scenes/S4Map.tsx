import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useCurrentFrame} from '../frame';
import {C, MONO, SANS, SERIF, ease, p, pop, typed} from '../theme';
import {Backdrop, Shift, Em, IconCheck, IconPaper, IconScreen, Said} from '../ui';

export const S4_FRAMES = 300;

const LINE_Y = 336;
const NODES = [
  {x: 140, kind: 'physical', n: 1, label: 'Scan the page'},
  {x: 380, kind: 'physical', n: 2, label: 'Check the stamp'},
  {x: 620, kind: 'digital', n: 3, label: 'Open the invoice'},
  {x: 860, kind: 'digital', n: 4, label: 'Code the cost center', decision: true},
  {x: 1100, kind: 'digital', n: 5, label: 'Save'},
] as const;

const RED = '#ff8b82';

export const S4Map: React.FC = () => {
  const f = useCurrentFrame();

  // phase 1: debrief and teach-back
  const cardIn = p(f, 6, 22);
  const cardOut = p(f, 122, 138);
  const ask = typed('So: equipment over €5,000 is capex, and an old stamp means I stop and ask. Did I get that right?', f, 14, 40);
  const reply = p(f, 92, 106, pop);
  const confirm = p(f, 106, 120);

  // phase 2: the Work Map draws itself
  const draw = p(f, 134, 206, (t) => t);
  const sel = p(f, 214, 230);
  const legend = p(f, 134, 150);
  const cardT = p(f, 224, 248);
  
  return (
    <AbsoluteFill>
      <Backdrop />
      <Shift>
      {/* debrief card */}
      <div
        style={{
          position: 'absolute',
          left: 190,
          top: 214,
          width: 900,
          opacity: cardIn * (1 - cardOut),
          transform: `translateY(${(1 - cardIn) * 24 - cardOut * 24}px)`,
          background: 'rgba(11,29,26,.94)',
          border: `1px solid ${C.line}`,
          borderRadius: 26,
          padding: '22px 28px 26px',
          boxShadow: '0 24px 60px rgba(0,0,0,.55)',
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
          <div style={{width: 50, height: 50, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #fde68a, #f0a93b)', transform: `scale(${1 + 0.06 * Math.sin(f / 4)})`}} />
          <div style={{font: `700 15px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase', color: C.muted}}>
            <b style={{color: C.amber}}>Teach-back</b> · the apprentice plays it back
          </div>
          <span style={{marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: 'rgba(45,212,191,.14)', border: '1px solid rgba(45,212,191,.5)', color: C.glow, font: `700 15px ${SANS}`, opacity: p(f, 10, 26)}}>
            <IconCheck size={16} /> 3 follow-ups answered
          </span>
        </div>
        <div style={{marginTop: 20, minHeight: 112, font: `700 30px/1.3 ${SERIF}`, color: C.fg}}>“{ask}”</div>
        <div style={{display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 18, marginTop: 14, height: 62}}>
          <span style={{display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, background: 'rgba(45,212,191,.16)', border: '1px solid rgba(45,212,191,.55)', color: C.glow, font: `700 16px ${SANS}`, opacity: confirm, transform: `translateX(${(1 - confirm) * 14}px)`}}>
            <IconCheck size={18} /> Teach-back confirmed
          </span>
          <div style={{opacity: reply, transform: `scale(${0.9 + 0.1 * reply})`, transformOrigin: 'right center'}}>
            <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
              <div style={{background: C.paper, color: C.ink, borderRadius: '18px 18px 6px 18px', padding: '12px 20px', font: `italic 400 22px/1.2 ${SERIF}`}}>“Yes, exactly.”</div>
              <div style={{width: 42, height: 42, borderRadius: '50%', background: C.amber, color: '#201300', display: 'grid', placeItems: 'center', font: `700 20px ${SERIF}`}}>M</div>
            </div>
          </div>
        </div>
      </div>

      {/* the route map */}
      <div style={{position: 'absolute', left: 64, top: 206, right: 64, display: 'flex', alignItems: 'center', gap: 18, opacity: legend}}>
        <span style={{font: `700 15px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase', color: C.muted}}>Work Map</span>
        <span style={{font: `400 15px ${MONO}`, color: C.muted}}>supplier invoices → cost centers</span>
        <span style={{marginLeft: 'auto', display: 'flex', gap: 20, font: `400 15px ${SANS}`, color: C.muted}}>
          <span style={{display: 'inline-flex', alignItems: 'center', gap: 8}}><i style={{width: 14, height: 14, borderRadius: '50%', border: `3px solid ${C.amber}`}} />Physical step</span>
          <span style={{display: 'inline-flex', alignItems: 'center', gap: 8}}><i style={{width: 14, height: 14, borderRadius: '50%', border: `3px solid ${C.glow}`}} />Digital step</span>
          <span style={{display: 'inline-flex', alignItems: 'center', gap: 8}}><i style={{width: 11, height: 11, transform: 'rotate(45deg)', border: `3px solid ${C.glow}`}} />Decision</span>
        </span>
      </div>

      <svg width={1280} height={720} style={{position: 'absolute', inset: 0}}>
        <line x1={80} y1={LINE_Y} x2={1200} y2={LINE_Y} stroke="rgba(143,209,199,.16)" strokeWidth={4} strokeLinecap="round" opacity={legend} />
        <line x1={80} y1={LINE_Y} x2={1200} y2={LINE_Y} stroke={C.mint} strokeWidth={4} strokeLinecap="round" strokeDasharray={1120} strokeDashoffset={1120 * (1 - draw)} opacity={0.75} />
        <circle cx={80} cy={LINE_Y} r={8} fill={C.mint} opacity={legend} />
        <circle cx={1200} cy={LINE_Y} r={8} fill="none" stroke={C.mint} strokeWidth={3.5} opacity={p(f, 200, 212)} />
        <circle cx={1200} cy={LINE_Y} r={3.5} fill={C.mint} opacity={p(f, 200, 212)} />
        {/* stop-and-ask branch: ends in a stop */}
        <path d="M380 364 C 380 420, 400 426, 452 426" fill="none" stroke={RED} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={160} strokeDashoffset={160 * (1 - p(f, 176, 196))} />
        <polygon points="466,412 478,412 486,420 486,432 478,440 466,440 458,432 458,420" fill={RED} opacity={p(f, 194, 204, pop)} transform="translate(-6 0)" />
        {/* limit branch: forks off and rejoins */}
        <path d="M806 336 C 806 392, 826 402, 866 402 L 904 402 C 944 402, 964 392, 964 336" fill="none" stroke={C.amber} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={320} strokeDashoffset={320 * (1 - p(f, 196, 218))} />
      </svg>

      <div style={{position: 'absolute', left: 506, top: 404, width: 280, opacity: p(f, 196, 210), font: `400 17px/1.3 ${SANS}`, color: '#ffd1cc'}}>
        <b style={{color: RED}}>Stop and ask.</b> Stamp older than 30 days.
      </div>
      <div style={{position: 'absolute', left: 806, top: 412, width: 260, opacity: p(f, 214, 228), font: `400 17px/1.3 ${SANS}`, color: '#ffe3b4'}}>
        <b style={{color: C.amber}}>Limit.</b> Equipment over €5,000 is capex.
      </div>

      {NODES.map((nd, i) => {
        const t = p(f, 140 + i * 14, 156 + i * 14, pop);
        const phys = nd.kind === 'physical';
        const col = phys ? C.amber : C.glow;
        const isSel = i === 3;
        const k = isSel ? sel : 0;
        const size = 58;
        return (
          <React.Fragment key={nd.n}>
            <div style={{position: 'absolute', left: nd.x - 100, top: LINE_Y - 92, width: 200, textAlign: 'center', opacity: t, transform: `translateY(${(1 - t) * 10}px)`}}>
              <div style={{font: `700 13px ${SANS}`, letterSpacing: '.14em', textTransform: 'uppercase', color: C.muted}}>Step {nd.n}</div>
              <div style={{font: `700 20px/1.15 ${SERIF}`, color: C.fg, marginTop: 4}}>{nd.label}</div>
            </div>
            <div
              style={{
                position: 'absolute',
                left: nd.x - size / 2,
                top: LINE_Y - size / 2,
                width: size,
                height: size,
                borderRadius: 'decision' in nd ? 12 : '50%',
                transform: `scale(${t * (1 + 0.14 * k)}) ${'decision' in nd ? 'rotate(45deg)' : ''}`,
                background: k > 0.5 ? col : C.night2,
                border: `4px solid ${col}`,
                boxShadow: k > 0 ? `0 0 ${30 * k}px rgba(45,212,191,${0.55 * k})` : `0 0 0 6px ${C.night}`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <div style={{transform: 'decision' in nd ? 'rotate(-45deg)' : 'none', color: k > 0.5 ? '#032' : col, display: 'grid', placeItems: 'center'}}>
                {phys ? <IconPaper size={26} /> : <IconScreen size={26} />}
              </div>
            </div>
          </React.Fragment>
        );
      })}

      {/* the selected step, as in the app */}
      <div
        style={{
          position: 'absolute',
          left: 130,
          top: 486,
          width: 1020,
          opacity: cardT,
          transform: `translateY(${(1 - ease(cardT)) * 22}px)`,
          background: C.surface,
          color: C.ink,
          border: `2px solid ${C.accent}`,
          borderRadius: 20,
          padding: '16px 24px 20px',
          boxShadow: '0 24px 50px rgba(0,0,0,.45)',
        }}
      >
        <div style={{position: 'absolute', top: -11, left: 860 - 130 - 10, width: 20, height: 20, background: C.surface, borderLeft: `2px solid ${C.accent}`, borderTop: `2px solid ${C.accent}`, transform: 'rotate(45deg)'}} />
        <div style={{display: 'flex', alignItems: 'baseline', gap: 16}}>
          <b style={{font: `700 24px ${SERIF}`}}>Step 4 · Code the cost center</b>
          <span style={{font: `400 15px ${MONO}`, color: C.inkMuted}}>screen moment 03:12</span>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '.8fr 1.3fr 1fr', gap: 24, marginTop: 14}}>
          {[
            ['Decision', '4711 → 0400 (capex)'],
            ['Reason · her words', '“Equipment over €5,000 is always capex.”'],
            ['Guardrail', 'No asset number: do not book capex.'],
          ].map(([k, v], i) => (
            <div key={k} style={{opacity: p(f, 236 + i * 8, 250 + i * 8)}}>
              <div style={{font: `700 13px ${SANS}`, letterSpacing: '.08em', textTransform: 'uppercase', color: C.inkMuted}}>{k}</div>
              <div style={{marginTop: 4, font: i === 1 ? `italic 400 19px/1.3 ${SERIF}` : `400 18px/1.3 ${SANS}`}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      </Shift>
    </AbsoluteFill>
  );
};
