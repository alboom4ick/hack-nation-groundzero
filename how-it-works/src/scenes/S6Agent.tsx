import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useCurrentFrame} from '../frame';
import {C, MONO, SANS, SERIF, ease, p, pop, typed} from '../theme';
import {Backdrop, Shift, Em, IconPaper, IconScreen} from '../ui';

export const S6_FRAMES = 300;

const Panel: React.FC<{x: number; w: number; t: number; title: string; children: React.ReactNode; accent?: string}> = ({x, w, t, title, children, accent = C.mint}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: 214,
      width: w,
      height: 392,
      opacity: t,
      transform: `translateY(${(1 - ease(t)) * 22}px)`,
      background: '#05100d',
      border: `1px solid ${C.line}`,
      borderRadius: 22,
      overflow: 'hidden',
      boxShadow: '0 30px 80px rgba(0,0,0,.5)',
    }}
  >
    <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderBottom: `1px solid ${C.line}`, font: `400 14px ${MONO}`, color: C.muted}}>
      {[0, 1, 2].map((i) => (
        <b key={i} style={{width: 11, height: 11, borderRadius: '50%', background: '#2b3b37'}} />
      ))}
      <span style={{marginLeft: 8, color: accent}}>{title}</span>
    </div>
    <div style={{padding: '16px 20px', font: `400 16px/1.62 ${MONO}`, color: '#cfe0da'}}>{children}</div>
  </div>
);

const k = (t: string) => <span style={{color: C.mint}}>{t}</span>;
const s_ = (t: string) => <span style={{color: '#f6d28a'}}>{t}</span>;
const c_ = (t: string) => <span style={{color: '#6f8a82'}}>{t}</span>;

/** A dot that runs along an arrow between two panels. */
const Flow: React.FC<{x1: number; x2: number; t: number; label: string; labelOp: number}> = ({x1, x2, t, label, labelOp}) => {
  const x = x1 + (x2 - x1) * t;
  return (
    <>
      <div style={{position: 'absolute', left: x1, top: 410, width: x2 - x1, height: 0, borderTop: `2px dashed ${C.amber}`, opacity: 0.7 * labelOp}} />
      <div style={{position: 'absolute', left: x - 7, top: 403, width: 14, height: 14, borderRadius: '50%', background: C.amber, boxShadow: '0 0 16px 4px rgba(240,169,59,.7)', opacity: t > 0 && t < 1 ? 1 : 0}} />
      <div style={{position: 'absolute', left: x1 - 14, width: x2 - x1 + 28, top: 354, textAlign: 'center', font: `700 13px/1.15 ${SANS}`, letterSpacing: '.08em', textTransform: 'uppercase', color: C.amber, opacity: labelOp}}>{label}</div>
    </>
  );
};

export const S6Agent: React.FC = () => {
  const f = useCurrentFrame();

  const mapIn = p(f, 8, 28);
  const flow1 = p(f, 44, 70, (t) => t);
  const codeIn = p(f, 64, 84);
  const flow2 = p(f, 150, 176, (t) => t);
  const termIn = p(f, 170, 190);
  const line = (n: number, at: number) => p(f, at + n * 9, at + n * 9 + 8);
  const stop = p(f, 236, 250, pop);
  const outro = p(f, 262, 282);

  const steps = [
    ['physical', 'Scan the page', false],
    ['physical', 'Check the stamp', true],
    ['digital', 'Open the invoice', false],
    ['digital', 'Code the cost center', true],
    ['digital', 'Save', false],
  ] as const;

  return (
    <AbsoluteFill>
      <Backdrop />
      <Shift>
      <Panel x={48} w={330} t={mapIn} title="Work Map" accent={C.mint}>
        <div style={{display: 'grid', gap: 12, marginTop: 4}}>
          {steps.map(([kind, label, guard], i) => {
            const t = p(f, 16 + i * 7, 30 + i * 7);
            const phys = kind === 'physical';
            return (
              <div key={label} style={{display: 'flex', alignItems: 'center', gap: 12, opacity: t, transform: `translateX(${(1 - t) * -14}px)`}}>
                <span style={{flex: 'none', width: 38, height: 38, borderRadius: '50%', border: `3px solid ${phys ? C.amber : C.glow}`, display: 'grid', placeItems: 'center', color: phys ? C.amber : C.glow}}>
                  {phys ? <IconPaper size={18} /> : <IconScreen size={18} />}
                </span>
                <span style={{font: `700 18px ${SANS}`, color: C.fg, flex: 1}}>{label}</span>
                {guard && <span style={{width: 12, height: 12, borderRadius: '50%', background: C.amber, boxShadow: `0 0 ${10 + 6 * Math.sin(f / 5)}px rgba(240,169,59,.8)`}} />}
              </div>
            );
          })}
        </div>
        <div style={{marginTop: 22, font: `400 14px ${SANS}`, color: C.muted, display: 'flex', alignItems: 'center', gap: 10}}>
          <span style={{width: 12, height: 12, borderRadius: '50%', background: C.amber}} /> guardrail, in her words
        </div>
      </Panel>

      <Flow x1={388} x2={452} t={flow1} label="Export" labelOp={p(f, 40, 52)} />

      <Panel x={462} w={382} t={codeIn} title="guardrails.json">
        <div style={{fontSize: 15, lineHeight: 1.7}}>
          {[
            <>{'{'} {k('"kind"')}: {s_('"limit"')},</>,
            <>&nbsp; {k('"rule"')}: {s_('"Equipment over')}</>,
            <>&nbsp;&nbsp;&nbsp;&nbsp;{s_('5,000 EUR is capex (0400)"')},</>,
            <>&nbsp; {k('"said"')}: {s_('"Equipment over 5,000')}</>,
            <>&nbsp;&nbsp;&nbsp;&nbsp;{s_('euro is always capex."')} {'}'},</>,
            <>{'{'} {k('"kind"')}: {s_('"stop_and_ask"')},</>,
            <>&nbsp; {k('"rule"')}: {s_('"No asset number:')}</>,
            <>&nbsp;&nbsp;&nbsp;&nbsp;{s_('do not book capex"')} {'}'},</>,
            <>{'{'} {k('"kind"')}: {s_('"stop_and_ask"')},</>,
            <>&nbsp; {k('"rule"')}: {s_('"Stamp older than')}</>,
            <>&nbsp;&nbsp;&nbsp;&nbsp;{s_('30 days"')} {'}'}</>,
          ].map((l, i) => (
            <div key={i} style={{opacity: p(f, 78 + i * 6, 86 + i * 6)}}>{l}</div>
          ))}
        </div>
      </Panel>

      <Flow x1={854} x2={918} t={flow2} label="Load" labelOp={p(f, 146, 158)} />

      <Panel x={928} w={304} t={termIn} title="agent · new case" accent={C.amber}>
        <div style={{fontSize: 15, lineHeight: 1.65}}>
          <div style={{opacity: line(0, 192)}}>{c_('# a case it has never seen')}</div>
          <div style={{opacity: line(1, 192)}}>invoice {s_('INV-4480')}</div>
          <div style={{opacity: line(2, 192)}}>{k('amount')} €7,200</div>
          <div style={{opacity: line(3, 192)}}>{k('type')} equipment</div>
          <div style={{opacity: line(4, 192)}}>{k('asset no.')} <span style={{color: C.amber}}>none</span></div>
          <div style={{marginTop: 10, opacity: p(f, 232, 242), color: '#ffd1cc'}}>guardrail hit: no asset number, do not book capex</div>
        </div>
        <div
          style={{
            marginTop: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            borderRadius: 12,
            background: 'rgba(224,73,63,.18)',
            border: '1px solid rgba(255,139,130,.7)',
            color: '#ff8b82',
            font: `700 17px ${SANS}`,
            opacity: stop,
            transform: `scale(${0.8 + 0.2 * stop})`,
            transformOrigin: 'left center',
          }}
        >
          <svg width={20} height={20} viewBox="0 0 20 20"><polygon points="6,1 14,1 19,6 19,14 14,19 6,19 1,14 1,6" fill="#ff8b82" /></svg>
          Stopped. Asking the controller.
        </div>
      </Panel>

      {/* closing card */}
      <AbsoluteFill style={{opacity: outro, background: `radial-gradient(900px 620px at 50% 40%, rgba(45,212,191,.2), transparent 62%), ${C.night}`, display: 'grid', placeItems: 'center'}}>
        <div style={{textAlign: 'center', transform: `translateY(${(1 - outro) * 16}px)`}}>
          <svg width={110} height={110} viewBox="0 0 34 34" style={{display: 'block', margin: '0 auto'}}>
            <circle cx={17} cy={17} r={15} fill="none" stroke={C.mint} strokeWidth={1.2} opacity={0.4} />
            <circle cx={17} cy={17} r={9.5} fill="none" stroke={C.mint} strokeWidth={1.6} opacity={0.8} />
            <circle cx={17} cy={17} r={3.6} fill={C.amber} />
          </svg>
          <div style={{font: `700 72px/1 ${SERIF}`, color: C.fg, marginTop: 22, letterSpacing: '-.02em'}}>GroundZero</div>
          <div style={{font: `700 26px ${SANS}`, color: C.mint, marginTop: 18, letterSpacing: '.06em'}}>Capture · Map · Teach</div>
          <div style={{font: `italic 400 28px ${SERIF}`, color: C.muted, marginTop: 22}}>The judgment stays when the expert leaves.</div>
        </div>
      </AbsoluteFill>
      </Shift>
    </AbsoluteFill>
  );
};
