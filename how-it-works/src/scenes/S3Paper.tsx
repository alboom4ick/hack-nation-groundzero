import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useCurrentFrame} from '../frame';
import {C, MONO, SANS, SERIF, p, pop, typed} from '../theme';
import {Backdrop, Shift, Em, IconScreen, Island, Keep, Paper, Person, Scanner, Tag, Zone} from '../ui';

export const S3_FRAMES = 300;

const SX = 126;
const SY = 292;
const PW = 156;

const Card: React.FC<{x: number; y: number; w: number; t: number; children: React.ReactNode}> = ({x, y, w, t, children}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      opacity: t,
      transform: `translateY(${(1 - t) * 16}px)`,
      background: 'rgba(15,42,38,.9)',
      border: `1px solid ${C.line}`,
      borderRadius: 18,
      padding: '14px 18px 16px',
      boxShadow: '0 18px 40px rgba(0,0,0,.4)',
    }}
  >
    {children}
  </div>
);

export const S3Paper: React.FC = () => {
  const f = useCurrentFrame();

  const slide = p(f, 28, 60);
  const sheetX = 60 + (SX + 42 - 60) * slide;
  const sheetY = 300 + (SY + 31 - 300) * slide - Math.sin(Math.PI * slide) * 24;
  const scan = f >= 64 && f <= 92 ? p(f, 64, 92, (t) => t) : -1;
  const flash = p(f, 90, 96) * (1 - p(f, 96, 112));
  const qrGlow = p(f, 150, 162) * (1 - p(f, 224, 240));

  const stampRing = (p(f, 78, 88) * (1 - p(f, 112, 124))) * (0.7 + 0.3 * Math.sin(f / 3));

  const still = p(f, 100, 175, (t) => t);
  const quietUp = f < 132 ? 0 : p(f, 132, 186, (t) => t);
  const quiet = f >= 230 ? quietUp * (1 - p(f, 230, 238)) : quietUp;
  const state = f < 190 ? 'watch' : f < 230 ? 'ask' : 'listen';
  const sub = state === 'watch' ? 'screen events on' : state === 'ask' ? 'both signals agree' : 'her answer';

  const sayA = typed('“First I check the date stamp. If the page is crooked, I scan it again.”', f, 62, 28);
  const sayB = typed('“Then I stop and ask the controller.”', f, 236, 24);
  const talking = (f >= 62 && f < 134) || (f >= 236 && f < 266);
  const who = <b style={{color: C.fg, fontStyle: 'normal'}}>Maria:</b>;
  const say = f < 230 ? (sayA ? <>{who} {sayA}</> : null) : sayB ? <>{who} {sayB}</> : null;
  const question = typed('What if the stamp is older than 30 days?', f, 192, 28);

  return (
    <AbsoluteFill>
      <Backdrop />
      <Shift>
      <Zone x={36} y={212} w={420} h={452} kind="physical" opacity={p(f, 8, 28)} />
      <Person name="Maria" role="at the scanner" initial="M" style={{position: 'absolute', left: 64, top: 238, opacity: p(f, 14, 32)}} />
      <Scanner x={SX} y={SY} w={240} scan={scan} led={f >= 64 ? 1 : 0} opacity={p(f, 14, 34)} />
      <Paper x={sheetX} y={sheetY} w={PW} rot={-6 * (1 - slide)} lift={Math.sin(Math.PI * slide)} scanFlash={flash} qrGlow={qrGlow} opacity={p(f, 26, 40)} stamp={1} />
      {/* ring around the stamp while she says "date stamp" */}
      <div
        style={{
          position: 'absolute',
          left: SX + 42 + 108 * (PW / 150) - 42,
          top: SY + 31 + 81 * (PW / 150) - 26,
          width: 84,
          height: 52,
          borderRadius: 10,
          border: `3px solid ${C.amber}`,
          opacity: stampRing,
          boxShadow: '0 0 22px rgba(240,169,59,.7)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 64,
          top: 598,
          width: 364,
          opacity: p(f, 150, 170),
          transform: `translateY(${(1 - p(f, 150, 170)) * 12}px)`,
          font: `400 18px/1.4 ${SANS}`,
          color: C.fg,
        }}
      >
        <b style={{color: C.glow}}>QR on every page</b> ties this paper step to the invoice on screen.
      </div>

      <Island x={486} y={212} w={440} state={state} sub={sub} question={question} say={say} still={still} quiet={quiet} amp={talking ? 0.8 : 0.08} opacity={p(f, 14, 36)} />

      <Card x={950} y={212} w={294} t={p(f, 22, 42)}>
        <Tag kind="digital" size={13} />
        <div style={{display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10}}>
          <b style={{font: `700 40px/1 ${SERIF}`, color: C.fg}}>0</b>
          <span style={{font: `400 17px ${SANS}`, color: C.muted}}>screen events</span>
        </div>
        <div style={{marginTop: 6, font: `400 16px/1.35 ${SANS}`, color: C.muted}}>Nothing changes on screen.</div>
      </Card>

      <Card x={950} y={364} w={294} t={p(f, 136, 156)}>
        <Tag kind="physical" size={13} />
        <div style={{marginTop: 12, font: `700 21px/1.25 ${SERIF}`, color: C.fg}}>Check the date stamp. Crooked page? Scan again.</div>
        <div style={{marginTop: 10, font: `400 14px ${MONO}`, color: C.amber}}>heard, not seen</div>
      </Card>

      <Keep x={492} y={494} w={428} t={p(f, 268, 292)} label="Kept as a stop-and-ask" title="Stamp older than 30 days: ask the controller" quote="Then I stop and ask the controller." />
      </Shift>
    </AbsoluteFill>
  );
};
