import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useCurrentFrame} from '../frame';
import {C, p, path, typed} from '../theme';
import {Backdrop, Shift, ccPoint, Cursor, Em, Erp, EventLine, Island, Keep, rowPoint} from '../ui';

export const S2_FRAMES = 300;

const ERP_X = 48;
const ERP_Y = 196;

export const S2Screen: React.FC = () => {
  const f = useCurrentFrame();

  const selected = f < 56 ? 'INV-4472' : 'INV-4471';
  const reveal = f < 56 ? 1 : p(f, 58, 82);
  const changed = f >= 108;
  const glow = p(f, 108, 118) * (1 - p(f, 132, 160));

  const row = rowPoint(ERP_X, ERP_Y, 0);
  const cc = ccPoint(ERP_X, ERP_Y);
  const cursor = path(f, [
    [24, 520, 560],
    [52, row.x, row.y],
    [88, 640, 400],
    [106, cc.x, cc.y],
    [146, cc.x + 120, cc.y + 56],
  ]);

  // Two gates, real thresholds: screen still 2.5 s (75 frames), voice quiet 1.8 s (54 frames).
  const still = f < 112 ? 0 : p(f, 112, 187, (t) => t);
  const quietUp = f < 108 ? 0 : p(f, 108, 162, (t) => t);
  const quiet = f >= 224 ? quietUp * (1 - p(f, 224, 232)) : quietUp;

  const state = f < 190 ? 'watch' : f < 224 ? 'ask' : 'listen';
  const sub = state === 'watch' ? 'screen events on' : state === 'ask' ? 'both signals agree' : 'her answer';

  const sayA = typed('“Next one, a milling head from Nordtech. Cost center…”', f, 36, 26);
  const sayB = typed('“Equipment over 5,000 euro is always capex.”', f, 230, 24);
  const talking = (f >= 36 && f < 106) || (f >= 230 && f < 266);
  const say = f < 224 ? (sayA ? <><b style={{color: C.fg, fontStyle: 'normal'}}>Maria:</b> {sayA}</> : null) : sayB ? <><b style={{color: C.fg, fontStyle: 'normal'}}>Maria:</b> {sayB}</> : null;

  const question = typed('Why 0400, not 4711?', f, 192, 28);

  return (
    <AbsoluteFill>
      <Backdrop />
      <Shift>
      <Erp x={ERP_X} y={ERP_Y + 0} selected={selected} cc={changed ? '0400 Capex' : '4711 Opex'} reveal={reveal} ccGlow={glow} opacity={p(f, 8, 30)} sharing={p(f, 24, 40)} />
      <EventLine x={ERP_X} y={ERP_Y + 428} w={680} text="03:12 · EVENT · invoice 4471 · cost center 4711 → 0400" opacity={p(f, 112, 126)} />
      <Cursor x={cursor.x} y={cursor.y} clicks={[54, 108]} opacity={p(f, 24, 34)} />

      <Island x={820} y={206} w={420} state={state} sub={sub} question={question} say={say} still={still} quiet={quiet} amp={talking ? 0.8 : 0.08} opacity={p(f, 16, 38)} />

      <Keep x={826} y={500} w={408} t={p(f, 268, 292)} label="Kept as a limit · in her words · 03:15" title="Equipment over €5,000 is booked as capex (0400)" quote="Equipment over 5,000 euro is always capex." />
      </Shift>
    </AbsoluteFill>
  );
};
