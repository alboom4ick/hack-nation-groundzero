import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useCurrentFrame} from '../frame';
import {C, MONO, SANS, SERIF, ease, p, path, pop, typed} from '../theme';
import {Backdrop, Shift, ccPoint, Cursor, Em, Erp, IconCheck, Island, Keep, Paper, Tag, savePoint} from '../ui';

export const S5_FRAMES = 330;

const PX = 56;
const PY = 238;
const PW = 244;
const PH = 440;
const ERP_X = 352;
const ERP_Y = 238;

const Corner: React.FC<{x: number; y: number; r: number; color: string}> = ({x, y, r, color}) => (
  <i style={{position: 'absolute', left: x, top: y, width: 16, height: 16, borderColor: color, borderStyle: 'solid', borderWidth: 0, borderTopWidth: r < 2 ? 4 : 0, borderBottomWidth: r >= 2 ? 4 : 0, borderLeftWidth: r % 2 === 0 ? 4 : 0, borderRightWidth: r % 2 === 1 ? 4 : 0, borderRadius: 3}} />
);

export const S5Teach: React.FC = () => {
  const f = useCurrentFrame();

  /* ───── the phone: a physical step, guided in AR ───── */
  const jitter = {x: Math.sin(f / 11) * 2.5, y: Math.cos(f / 13) * 2};
  const lock = p(f, 56, 72);
  const bracketScale = 1.7 - 0.7 * ease(lock);
  const cardIn = p(f, 76, 98);
  const tapAt = 112;
  const done = f >= tapAt + 4;
  const qrGlow = lock;

  /* ───── the screen: a digital step on a case she never showed ───── */
  const erpOp = p(f, 108, 128);
  const reveal = p(f, 126, 156);
  const save = f < 190 ? 'idle' : f < 280 ? 'held' : f < 300 ? 'idle' : 'saved';
  const cc = f >= 272 ? '0400 Capex' : '4711 Opex';
  const ccGlow = p(f, 272, 282) * (1 - p(f, 292, 312));
  const sv = savePoint(ERP_X, ERP_Y);
  const cp = ccPoint(ERP_X, ERP_Y);
  const cursor = path(f, [
    [140, 880, 600],
    [184, sv.x, sv.y],
    [236, sv.x + 30, sv.y + 54],
    [268, cp.x, cp.y],
    [284, cp.x, cp.y],
    [298, sv.x, sv.y],
    [322, sv.x + 120, sv.y + 70],
  ]);

  const island = p(f, 192, 212);
  const state = f < 270 ? 'ask' : 'listen';
  const question = f < 270 ? typed('Hold on. Equipment over €5,000 is capex, not 4711.', f, 198, 30) : 'That matches Maria’s rule. You can save.';
  const mastery = p(f, 308, 324, pop);
  const next = p(f, 316, 330);

  return (
    <AbsoluteFill>
      <Backdrop />
      <Shift>
      {/* physical: phone */}
      <Tag kind="physical" size={14} style={{position: 'absolute', left: PX + 4, top: 190, opacity: p(f, 8, 26)}} />
      <div
        style={{
          position: 'absolute',
          left: PX,
          top: PY,
          width: PW,
          height: PH,
          opacity: p(f, 10, 30),
          transform: `translateY(${(1 - p(f, 10, 30)) * 24}px)`,
          borderRadius: 38,
          background: '#0a0f0e',
          border: '2px solid #2b3b37',
          boxShadow: '0 30px 70px rgba(0,0,0,.6)',
          padding: 9,
        }}
      >
        <div style={{position: 'relative', width: '100%', height: '100%', borderRadius: 30, overflow: 'hidden', background: 'linear-gradient(165deg,#34423e,#1a2724)'}}>
          <div style={{position: 'absolute', left: '50%', top: 8, width: 70, height: 18, marginLeft: -35, borderRadius: 10, background: '#0a0f0e', zIndex: 5}} />
          {/* camera view of the desk */}
          <div style={{position: 'absolute', inset: 0, transform: `translate(${jitter.x}px, ${jitter.y}px)`}}>
            <Paper x={40} y={60} w={132} rot={-6} stamp={1} qrGlow={qrGlow} />
          </div>
          {/* viewfinder locks onto the QR */}
          <div style={{position: 'absolute', left: 40 + jitter.x + 4, top: 182 + jitter.y, width: 54, height: 54, opacity: p(f, 40, 52), transform: `scale(${bracketScale})`}}>
            <Corner x={0} y={0} r={0} color={lock > 0.9 ? C.glow : '#fff'} />
            <Corner x={38} y={0} r={1} color={lock > 0.9 ? C.glow : '#fff'} />
            <Corner x={0} y={38} r={2} color={lock > 0.9 ? C.glow : '#fff'} />
            <Corner x={38} y={38} r={3} color={lock > 0.9 ? C.glow : '#fff'} />
          </div>
          <div style={{position: 'absolute', left: 14, top: 44, font: `700 12px ${SANS}`, letterSpacing: '.1em', color: '#d7e8e2', opacity: p(f, 18, 34)}}>{lock > 0.9 ? 'QR · INV-4471' : 'Scanning for QR…'}</div>
          {/* AR card */}
          <div
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: 14,
              padding: '12px 14px 14px',
              borderRadius: 18,
              background: C.paper,
              color: C.ink,
              opacity: cardIn,
              transform: `translateY(${(1 - ease(cardIn)) * 70}px)`,
              boxShadow: '0 14px 30px rgba(0,0,0,.45)',
            }}
          >
            <div style={{font: `700 11px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase', color: C.amberDk}}>AR · Step 2 · physical</div>
            <div style={{font: `700 19px/1.2 ${SERIF}`, marginTop: 5}}>{done ? 'Stamp checked' : 'Check the date stamp'}</div>
            <div style={{font: `400 14px/1.3 ${SANS}`, color: C.inkMuted, marginTop: 4}}>{done ? 'Newer than 30 days. Next: the screen.' : 'Older than 30 days? Stop and ask the controller.'}</div>
            <div style={{position: 'relative', marginTop: 10, height: 36, borderRadius: 999, background: done ? C.accent : C.blue, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, font: `700 16px ${SANS}`}}>
              {done ? <IconCheck size={18} color="#fff" /> : null}
              {done ? 'Done' : 'Tap when done'}
              {f >= tapAt && f < tapAt + 18 && <i style={{position: 'absolute', left: '50%', top: '50%', width: 30, height: 30, marginLeft: -15, marginTop: -15, borderRadius: '50%', border: '2px solid #fff', transform: `scale(${0.3 + 1.6 * ((f - tapAt) / 18)})`, opacity: 1 - (f - tapAt) / 18}} />}
            </div>
          </div>
        </div>
      </div>

      {/* digital: screen with the tutor */}
      <Tag kind="digital" size={14} style={{position: 'absolute', left: ERP_X, top: 190, opacity: erpOp}} />
      <Erp x={ERP_X} y={ERP_Y} selected="INV-4475" cc={cc} reveal={reveal} ccGlow={ccGlow} save={save} opacity={erpOp} />
      <Cursor x={cursor.x} y={cursor.y} clicks={[186, 270, 300]} opacity={p(f, 140, 152)} />

      <Island x={928} y={238} w={314} state={state} sub="tutor" question={question} gates={false} amp={state === 'ask' ? 0.7 : 0.08} opacity={island} />
      <Keep x={934} y={500} w={304} t={p(f, 246, 268)} label="Maria's words · replay 03:15" title="Equipment over €5,000 is booked as capex" quote="Equipment over 5,000 euro is always capex." />

      <div style={{position: 'absolute', left: ERP_X, top: 664, display: 'flex', gap: 12}}>
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 999, background: C.glow, color: '#032', font: `700 17px ${SANS}`, opacity: mastery, transform: `scale(${0.7 + 0.3 * mastery})`, transformOrigin: 'left center'}}>
          <IconCheck size={18} color="#032" /> Capex limit mastered
        </span>
        <span style={{display: 'inline-flex', alignItems: 'center', padding: '9px 18px', borderRadius: 999, border: `1px solid ${C.line}`, color: C.muted, font: `700 17px ${SANS}`, opacity: next}}>Next to practise: asset numbers</span>
      </div>
      </Shift>
    </AbsoluteFill>
  );
};
