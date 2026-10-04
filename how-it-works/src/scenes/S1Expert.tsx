import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useCurrentFrame} from '../frame';
import {C, SANS, SERIF, ease, p, path, pop} from '../theme';
import {Backdrop, Shift, Cursor, Em, Erp, IconPaper, Paper, Person, Scanner, Zone, ccPoint} from '../ui';

export const S1_FRAMES = 270;

const ERP_X = 548;
const ERP_Y = 238;

const FileChip: React.FC<{x: number; y: number; opacity: number}> = ({x, y, opacity}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      opacity,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '9px 16px',
      borderRadius: 12,
      background: C.paper,
      color: C.ink,
      font: `700 16px ${SANS}`,
      boxShadow: '0 14px 30px rgba(0,0,0,.45)',
      zIndex: 25,
    }}
  >
    <IconPaper size={20} color={C.accent} />
    INV-4471.pdf
  </div>
);

export const S1Expert: React.FC = () => {
  const f = useCurrentFrame();

  // The sheet leaves the stack, lands on the glass, gets scanned.
  const slide = p(f, 62, 98);
  const sheet = {x: 76 + (312 - 76) * slide, y: 330 + (320 - 330) * slide - Math.sin(Math.PI * slide) * 30, rot: -5 * (1 - slide)};
  const scan = f >= 100 && f <= 130 ? p(f, 100, 130, (t) => t) : -1;
  const flash = p(f, 128, 134) * (1 - p(f, 134, 150));
  const led = f >= 100 ? 1 : 0;

  // The scanned file travels to the screen.
  const chipT = p(f, 134, 166);
  const chip = {x: 470 + (570 - 470) * ease(chipT), y: 318 - Math.sin(Math.PI * chipT) * 60};
  const chipOp = p(f, 134, 140) * (1 - p(f, 164, 172));

  const reveal = p(f, 166, 200);
  const cc = ccPoint(ERP_X, ERP_Y);
  const cursor = path(f, [
    [186, 980, 580],
    [212, cc.x, cc.y],
    [250, cc.x + 150, cc.y + 70],
  ]);
  const changed = f >= 214;
  const glow = p(f, 214, 224) * (1 - p(f, 238, 258));

  const bubble = p(f, 226, 244, pop);
  const retire = p(f, 246, 262);

  return (
    <AbsoluteFill>
      <Backdrop />
      <Shift>
      <Zone x={36} y={212} w={486} h={452} kind="physical" opacity={p(f, 10, 30)} />
      {/* stack of paper */}
      {[2, 1].map((i) => {
        const t = p(f, 30 + (2 - i) * 6, 52 + (2 - i) * 6, pop);
        return <Paper key={i} x={76 - i * 3} y={330 - i * 3 - (1 - t) * 40} w={150} rot={i === 2 ? 2 : -2} opacity={t} blank />;
      })}
      <Scanner x={272} y={290} w={230} scan={scan} led={led} opacity={p(f, 22, 44)} />
      <Paper x={sheet.x} y={sheet.y} rot={sheet.rot} w={150} lift={Math.sin(Math.PI * slide)} scanFlash={flash} opacity={p(f, 30, 50)} stamp={p(f, 36, 52)} />

      <Person name="Maria" role="24 years in accounts payable" initial="M" style={{position: 'absolute', left: 64, top: 236, opacity: p(f, 20, 40)}} />
      <div
        style={{
          position: 'absolute',
          left: 64,
          top: 582,
          width: 430,
          opacity: bubble,
          transform: `scale(${0.8 + 0.2 * bubble})`,
          transformOrigin: 'left bottom',
          background: C.paper,
          color: C.ink,
          borderRadius: 22,
          padding: '12px 16px',
          font: `italic 400 18px/1.3 ${SERIF}`,
          boxShadow: '0 14px 32px rgba(0,0,0,.4)',
        }}
      >
        “Equipment over €5,000 is always capex.”
        <div style={{marginTop: 8, font: `700 12px ${SANS}`, letterSpacing: '.1em', textTransform: 'uppercase', color: C.amberDk, fontStyle: 'normal'}}>Not in any manual</div>
      </div>

      <Zone x={540} y={212} w={704} h={452} kind="digital" opacity={p(f, 20, 40)} />
      <Erp x={ERP_X} y={ERP_Y} selected="INV-4471" cc={changed ? '0400 Capex' : '4711 Opex'} reveal={reveal} ccGlow={glow} opacity={p(f, 20, 40)} />
      <FileChip x={chip.x} y={chip.y} opacity={chipOp} />
      <Cursor x={cursor.x} y={cursor.y} clicks={[214]} opacity={p(f, 186, 196)} />

      <div style={{position: 'absolute', left: 0, right: 0, top: 674, display: 'flex', justifyContent: 'center', opacity: retire, transform: `translateY(${(1 - retire) * 10}px)`}}>
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderRadius: 999, background: 'rgba(224,73,63,.16)', border: '1px solid rgba(224,73,63,.6)', color: '#ffb4ad', font: `700 17px ${SANS}`}}>
          Maria retires in 3 months
        </span>
      </div>
      </Shift>
    </AbsoluteFill>
  );
};
