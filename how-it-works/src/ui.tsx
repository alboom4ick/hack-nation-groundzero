import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useCurrentFrame} from './frame';
import {C, MONO, SANS, SERIF, ease, p, pop} from './theme';

/* ───────────── backdrop, shift ───────────── */

export const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(900px 620px at 90% -8%, rgba(45,212,191,.20), transparent 62%), radial-gradient(760px 520px at -6% 108%, rgba(240,169,59,.12), transparent 60%), ${C.night}`,
      }}
    >
      <svg width={1280} height={720} style={{position: 'absolute', inset: 0}}>
        {[0, 1, 2].map((i) => {
          const t = (f / 300 + i / 3) % 1;
          return <circle key={i} cx={1040} cy={380} r={60 + t * 560} fill="none" stroke={C.mint} strokeWidth={1.2} opacity={Math.sin(Math.PI * t) * 0.2} />;
        })}
      </svg>
    </AbsoluteFill>
  );
};

/** Scenes have no headline any more (the pop-up caption carries it), so pull the content up to sit centred in the frame. */
export const Shift: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div style={{position: 'absolute', inset: 0, transform: 'translateY(-70px)'}}>{children}</div>
);

export const Em: React.FC<{children: React.ReactNode; color?: string}> = ({children, color = C.mint}) => (
  <em style={{fontStyle: 'italic', color}}>{children}</em>
);

/* ───────────── icons ───────────── */

export const IconPaper: React.FC<{size?: number; color?: string}> = ({size = 20, color = 'currentColor'}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </svg>
);

export const IconScreen: React.FC<{size?: number; color?: string}> = ({size = 20, color = 'currentColor'}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
);

export const IconCheck: React.FC<{size?: number; color?: string}> = ({size = 20, color = 'currentColor'}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const IconLock: React.FC<{size?: number; color?: string}> = ({size = 20, color = 'currentColor'}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </svg>
);

/** "PHYSICAL" / "DIGITAL" tag used wherever the two halves of the job are told apart. */
export const Tag: React.FC<{kind: 'physical' | 'digital'; size?: number; style?: React.CSSProperties}> = ({kind, size = 15, style}) => {
  const phys = kind === 'physical';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 13px',
        borderRadius: 999,
        font: `700 ${size}px/1 ${SANS}`,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        background: phys ? 'rgba(240,169,59,.16)' : 'rgba(45,212,191,.14)',
        color: phys ? C.amber : C.glow,
        border: `1px solid ${phys ? 'rgba(240,169,59,.55)' : 'rgba(45,212,191,.5)'}`,
        ...style,
      }}
    >
      {phys ? <IconPaper size={size + 3} /> : <IconScreen size={size + 3} />}
      {phys ? 'Physical' : 'Digital'}
    </span>
  );
};

/* ───────────── people ───────────── */

export const Person: React.FC<{name: string; role: string; initial: string; tone?: 'amber' | 'mint'; style?: React.CSSProperties}> = ({name, role, initial, tone = 'amber', style}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 12, ...style}}>
    <div
      style={{
        width: 46,
        height: 46,
        borderRadius: '50%',
        background: tone === 'amber' ? C.amber : C.mint,
        color: '#201300',
        display: 'grid',
        placeItems: 'center',
        font: `700 22px ${SERIF}`,
      }}
    >
      {initial}
    </div>
    <div style={{lineHeight: 1.15}}>
      <div style={{font: `700 18px ${SANS}`, color: C.fg}}>{name}</div>
      <div style={{font: `400 15px ${SANS}`, color: C.muted}}>{role}</div>
    </div>
  </div>
);

/* ───────────── the sandbox ERP window ───────────── */

export const INVOICES: Record<string, {supplier: string; category: string; amount: string; asset: string}> = {
  'INV-4471': {supplier: 'Nordtech Maschinen GmbH', category: 'Equipment · CNC milling head', amount: '€6,400', asset: 'AST-2201'},
  'INV-4472': {supplier: 'Brightwave Print', category: 'Services · annual print run', amount: '€880', asset: '—'},
  'INV-4473': {supplier: 'Moravia Components s.r.o.', category: 'Parts', amount: '€1,250', asset: '—'},
  'INV-4475': {supplier: 'Alpenlicht Systems AG', category: 'Equipment · new, unseen case', amount: '€7,200', asset: 'none yet'},
};

export const ERP_LIST_W = 188;
export const ERP_BAR = 38;
const FIELD_TOP = {supplier: 62, category: 106, amount: 150, asset: 194, cc: 238, save: 300};

/** Screen position of the cost-center field for a window at (wx, wy). */
export const ccPoint = (wx: number, wy: number) => ({x: wx + ERP_LIST_W + 24 + 126 + 100, y: wy + ERP_BAR + FIELD_TOP.cc + 18});
export const savePoint = (wx: number, wy: number) => ({x: wx + ERP_LIST_W + 24 + 52, y: wy + ERP_BAR + FIELD_TOP.save + 23});
export const rowPoint = (wx: number, wy: number, i: number) => ({x: wx + 80, y: wy + ERP_BAR + 14 + i * 46 + 20});

export const ERP_W = 680;
export const ERP_H = ERP_BAR + 372;

export const Erp: React.FC<{
  x: number;
  y: number;
  selected: string;
  cc: string;
  reveal?: number;
  ccGlow?: number;
  save?: 'idle' | 'held' | 'saved' | 'none';
  opacity?: number;
  scale?: number;
  sharing?: number;
  children?: React.ReactNode;
}> = ({x, y, selected, cc, reveal = 1, ccGlow = 0, save = 'none', opacity = 1, scale = 1, sharing = 0, children}) => {
  const f = useCurrentFrame();
  const inv = INVOICES[selected];
  const rows = Object.keys(INVOICES);
  const fieldOp = (i: number) => Math.min(1, Math.max(0, reveal * 6 - i));
  const fields: [string, React.ReactNode][] = [
    ['Supplier', inv.supplier],
    ['Category', inv.category],
    ['Amount', <b key="a">{inv.amount}</b>],
    ['Asset no.', inv.asset],
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: ERP_W,
        height: ERP_H,
        opacity,
        transform: `translateY(${(1 - opacity) * 22}px) scale(${scale})`,
        transformOrigin: 'center',
        background: C.surface,
        borderRadius: 16,
        boxShadow: '0 40px 90px -20px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.08)',
        overflow: 'hidden',
        color: C.ink,
      }}
    >
      <div style={{height: ERP_BAR, background: '#e9e4da', borderBottom: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px'}}>
        {[0, 1, 2].map((i) => (
          <b key={i} style={{width: 11, height: 11, borderRadius: '50%', background: '#c9c3b6'}} />
        ))}
        <span style={{marginLeft: 10, font: `400 13px ${MONO}`, color: C.inkMuted}}>sandbox-erp / accounts-payable / {selected}</span>
        {sharing > 0 && (
          <span style={{marginLeft: 'auto', opacity: sharing, display: 'inline-flex', alignItems: 'center', gap: 8, font: `700 13px ${SANS}`, color: C.rec}}>
            <i style={{width: 9, height: 9, borderRadius: '50%', background: C.rec, opacity: 0.55 + 0.45 * Math.sin(f / 5)}} />
            Sharing screen
          </span>
        )}
      </div>
      <div style={{position: 'relative', height: ERP_H - ERP_BAR, font: `400 17px ${SANS}`}}>
        <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: ERP_LIST_W, background: '#faf7f1', borderRight: `1px solid ${C.rule}`}}>
          {rows.map((id, i) => (
            <div
              key={id}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 14 + i * 46,
                height: 40,
                padding: '0 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderLeft: `3px solid ${id === selected ? C.accent : 'transparent'}`,
                background: id === selected ? C.tint : 'transparent',
                color: id === selected ? C.ink : C.inkMuted,
                fontWeight: id === selected ? 700 : 400,
                fontSize: 15,
              }}
            >
              <span>{id}</span>
              <span>{INVOICES[id].amount}</span>
            </div>
          ))}
        </div>
        <div style={{position: 'absolute', left: ERP_LIST_W + 24, top: 20, right: 24}}>
          <div style={{font: `700 14px ${SANS}`, letterSpacing: '.1em', textTransform: 'uppercase', color: C.inkMuted, opacity: fieldOp(0)}}>Invoice {selected}</div>
        </div>
        {fields.map(([label, value], i) => (
          <div key={label} style={{position: 'absolute', left: ERP_LIST_W + 24, top: FIELD_TOP[(['supplier', 'category', 'amount', 'asset'] as const)[i]], opacity: fieldOp(i + 1), display: 'flex', alignItems: 'center', height: 36}}>
            <span style={{width: 126, color: C.inkMuted}}>{label}</span>
            <span>{value}</span>
          </div>
        ))}
        <div style={{position: 'absolute', left: ERP_LIST_W + 24, top: FIELD_TOP.cc, opacity: fieldOp(5), display: 'flex', alignItems: 'center', height: 36}}>
          <span style={{width: 126, color: C.inkMuted}}>Cost center</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 12px',
              border: `1px solid ${ccGlow > 0.05 ? C.amberDk : C.rule}`,
              borderRadius: 8,
              background: ccGlow > 0.05 ? '#fff8ea' : '#fff',
              boxShadow: `0 0 0 ${4 * ccGlow}px rgba(240,169,59,${0.35 * ccGlow})`,
              minWidth: 190,
            }}
          >
            {cc}
            <span style={{marginLeft: 'auto', color: C.inkMuted}}>▾</span>
          </span>
        </div>
        {save !== 'none' && (
          <div style={{position: 'absolute', left: ERP_LIST_W + 24, top: FIELD_TOP.save, display: 'flex', alignItems: 'center', gap: 12}}>
            <div
              style={{
                height: 46,
                padding: '0 26px',
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                font: `700 17px ${SANS}`,
                color: '#fff',
                background: save === 'held' ? '#8a8f89' : save === 'saved' ? C.accent : C.blue,
                outline: save === 'held' ? `3px solid ${C.rec}` : 'none',
                outlineOffset: 2,
              }}
            >
              {save === 'held' && <IconLock size={18} color="#fff" />}
              {save === 'saved' && <IconCheck size={18} color="#fff" />}
              {save === 'saved' ? 'Saved' : 'Save'}
            </div>
            {save === 'held' && <span style={{font: `700 15px ${SANS}`, color: C.rec}}>Held by the tutor</span>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

/* ───────────── cursor ───────────── */

export const Cursor: React.FC<{x: number; y: number; clicks?: number[]; opacity?: number}> = ({x, y, clicks = [], opacity = 1}) => {
  const f = useCurrentFrame();
  return (
    <div style={{position: 'absolute', left: x, top: y, width: 0, height: 0, opacity, zIndex: 30}}>
      {clicks.map((c) => {
        const t = f - c;
        if (t < 0 || t > 18) return null;
        const k = t / 18;
        return <i key={c} style={{position: 'absolute', left: -13, top: -13, width: 26, height: 26, borderRadius: '50%', border: `2px solid ${C.accent}`, transform: `scale(${0.3 + 1.9 * k})`, opacity: 1 - k}} />;
      })}
      <svg width={26} height={26} viewBox="0 0 22 22" style={{position: 'absolute', left: -3, top: -2, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.4))'}}>
        <path d="M3 2l14 8-6 1.6L8.4 18z" fill="#111" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/* ───────────── the voice island ───────────── */

export type IslandState = 'watch' | 'ask' | 'listen';
const ORB: Record<IslandState, string> = {
  watch: 'radial-gradient(circle at 35% 30%, #99f6e4, #0d9488)',
  ask: 'radial-gradient(circle at 35% 30%, #fde68a, #f0a93b)',
  listen: 'radial-gradient(circle at 35% 30%, #bbf7d0, #16a34a)',
};
const STATE_NAME: Record<IslandState, string> = {watch: 'Watching', ask: 'Asking', listen: 'Listening'};

export const Island: React.FC<{
  x: number;
  y: number;
  w?: number;
  state: IslandState;
  sub?: string;
  question?: string;
  say?: React.ReactNode;
  still?: number;
  quiet?: number;
  gates?: boolean;
  amp?: number;
  opacity?: number;
  scale?: number;
}> = ({x, y, w = 380, state, sub = '', question = '', say, still = 0, quiet = 0, gates = true, amp = 0.1, opacity = 1, scale = 1}) => {
  const f = useCurrentFrame();
  const pulse = state === 'ask' ? 1 + 0.1 * Math.sin(f / 3) : 1 + 0.05 * Math.sin(f / 9);
  const stateColor = state === 'ask' ? C.amber : state === 'listen' ? '#86efac' : C.glow;
  const gate = (label: string, v: number, target: number) => (
    <div style={{display: 'grid', gridTemplateColumns: '112px 1fr 44px', gap: 10, alignItems: 'center', font: `400 15px ${SANS}`, color: C.muted}}>
      <span>{label}</span>
      <div style={{height: 7, borderRadius: 7, background: 'rgba(255,255,255,.12)', overflow: 'hidden'}}>
        <i style={{display: 'block', height: '100%', width: `${Math.min(1, v) * 100}%`, background: v >= 1 ? C.amber : C.glow}} />
      </div>
      <b style={{font: `700 14px ${MONO}`, color: v >= 1 ? C.amber : C.muted}}>{(Math.min(1, v) * target).toFixed(1)}s</b>
    </div>
  );
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        opacity,
        transform: `translateY(${(1 - opacity) * 24}px) scale(${scale})`,
        transformOrigin: 'top left',
        background: 'rgba(11,29,26,.94)',
        color: C.fg,
        border: `1px solid ${C.line}`,
        borderRadius: 24,
        padding: '16px 18px 18px',
        boxShadow: '0 24px 60px rgba(0,0,0,.55)',
      }}
    >
      <div style={{display: 'flex', gap: 14, alignItems: 'center'}}>
        <div style={{flex: 'none', width: 48, height: 48, borderRadius: '50%', background: ORB[state], transform: `scale(${pulse})`, boxShadow: `0 0 ${state === 'ask' ? 22 : 12}px ${state === 'ask' ? 'rgba(240,169,59,.5)' : 'rgba(45,212,191,.4)'}`}} />
        <div style={{minWidth: 0, flex: 1}}>
          <div style={{font: `700 14px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase', color: C.muted}}>
            <b style={{color: stateColor}}>{STATE_NAME[state]}</b>
            {sub ? ` · ${sub}` : ''}
          </div>
          <div style={{minHeight: 44, marginTop: 6, font: `700 20px/1.3 ${SANS}`}}>{question}</div>
        </div>
      </div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 28, marginTop: 10}}>
        {Array.from({length: Math.round((w - 36) / 8)}, (_, i) => {
          const h = 4 + amp * 24 * (0.5 + 0.5 * Math.sin(f * 0.55 + i * 0.95)) * (0.6 + 0.4 * Math.sin(i * 2.3 + 1));
          return <i key={i} style={{width: 4, height: h, borderRadius: 2, background: state === 'ask' ? C.amber : C.mint}} />;
        })}
      </div>
      <div style={{marginTop: 8, minHeight: 24, font: `italic 400 16px/1.35 ${SANS}`, color: C.muted}}>{say}</div>
      {gates && (
        <div style={{display: 'grid', gap: 9, marginTop: 12}}>
          {gate('Screen still', still, 2.5)}
          {gate('Voice quiet', quiet, 1.8)}
        </div>
      )}
    </div>
  );
};

/* ───────────── "kept" card ───────────── */

export const Keep: React.FC<{x: number; y: number; w?: number; t: number; label: string; title: string; quote: string}> = ({x, y, w = 380, t, label, title, quote}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      opacity: Math.min(1, t * 1.6),
      transform: `translateY(${(1 - ease(t)) * 36}px) rotate(${-2 * ease(t)}deg) scale(${0.94 + 0.06 * pop(t)})`,
      background: C.amber,
      color: '#201300',
      borderRadius: 18,
      padding: '16px 20px 18px',
      boxShadow: '0 22px 50px rgba(0,0,0,.5)',
      zIndex: 20,
    }}
  >
    <div style={{font: `700 13px ${SANS}`, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.72}}>{label}</div>
    <div style={{font: `700 21px/1.25 ${SERIF}`, marginTop: 8}}>{title}</div>
    <div style={{font: `400 17px/1.35 ${SANS}`, marginTop: 8}}>“{quote}”</div>
  </div>
);

/* ───────────── things on the desk ───────────── */

/** A pseudo-QR code; the same grid every frame so it reads as one object. */
const QR = (() => {
  const n = 11;
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const cells: boolean[][] = Array.from({length: n}, () => Array.from({length: n}, () => rnd() > 0.5));
  const finder = (r: number, c: number) => {
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 7; j++) {
        const edge = i === 0 || j === 0 || i === 6 || j === 6;
        const core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        if (r + i < n && c + j < n) cells[r + i][c + j] = edge || core;
      }
  };
  finder(0, 0);
  return {n, cells, finder};
})();

export const Qr: React.FC<{size: number; glow?: number}> = ({size, glow = 0}) => {
  const {n, cells} = QR;
  const u = size / n;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{background: '#fff', borderRadius: 4, boxShadow: glow > 0 ? `0 0 0 ${3 * glow}px ${C.glow}, 0 0 ${26 * glow}px rgba(45,212,191,${0.75 * glow})` : 'none'}}>
      {cells.map((row, r) => row.map((on, c) => (on ? <rect key={`${r}-${c}`} x={c * u} y={r * u} width={u + 0.4} height={u + 0.4} fill="#111" /> : null)))}
    </svg>
  );
};

export const Paper: React.FC<{x: number; y: number; w?: number; rot?: number; stamp?: number; qrGlow?: number; scanFlash?: number; opacity?: number; qr?: boolean; lift?: number; blank?: boolean}> = ({
  x,
  y,
  w = 150,
  rot = 0,
  stamp = 1,
  qrGlow = 0,
  scanFlash = 0,
  opacity = 1,
  qr = true,
  lift = 0,
  blank = false,
}) => {
  const s = w / 150;
  const h = w * 1.34;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        opacity,
        transform: `rotate(${rot}deg) scale(${1 + lift * 0.04})`,
        transformOrigin: 'center',
        background: '#fffefb',
        borderRadius: 3 * s,
        boxShadow: lift > 0 ? '0 18px 34px rgba(0,0,0,.45)' : '0 3px 8px rgba(0,0,0,.35)',
        color: '#2b2f2a',
        overflow: 'hidden',
      }}
    >
      {!blank && <div style={{padding: `${12 * s}px ${12 * s}px`}}>
        <div style={{font: `700 ${9.5 * s}px ${SANS}`, letterSpacing: '.04em', color: '#5b6159'}}>NORDTECH MASCHINEN GMBH</div>
        <div style={{font: `700 ${15 * s}px ${SERIF}`, marginTop: 7 * s}}>Invoice 4471</div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{display: 'flex', justifyContent: 'space-between', marginTop: 8 * s}}>
            <i style={{height: 4 * s, width: `${[54, 42, 60, 36][i]}%`, background: '#d6d2c8', borderRadius: 2}} />
            <i style={{height: 4 * s, width: `${[18, 14, 16, 12][i]}%`, background: '#d6d2c8', borderRadius: 2}} />
          </div>
        ))}
        <div style={{marginTop: 12 * s, textAlign: 'right', font: `700 ${14 * s}px ${SANS}`}}>€ 6,400.00</div>
      </div>}
      {!blank && <div
        style={{
          position: 'absolute',
          right: 9 * s,
          top: 66 * s,
          opacity: stamp,
          transform: `rotate(-13deg) scale(${1.4 - 0.4 * stamp})`,
          border: `${2 * s}px solid #2b56b3`,
          color: '#2b56b3',
          borderRadius: 4 * s,
          padding: `${3 * s}px ${7 * s}px`,
          font: `700 ${9 * s}px/1.15 ${SANS}`,
          letterSpacing: '.06em',
          textAlign: 'center',
          mixBlendMode: 'multiply',
        }}
      >
        RECEIVED
        <br />
        12 SEP
      </div>}
      {qr && !blank && (
        <div style={{position: 'absolute', left: 12 * s, bottom: 12 * s}}>
          <Qr size={38 * s} glow={qrGlow} />
        </div>
      )}
      {scanFlash > 0 && <div style={{position: 'absolute', inset: 0, background: `rgba(45,212,191,${0.35 * scanFlash})`}} />}
    </div>
  );
};

export const Scanner: React.FC<{x: number; y: number; w?: number; scan?: number; led?: number; opacity?: number}> = ({x, y, w = 250, scan = -1, led = 0, opacity = 1}) => {
  const h = w * 1.2;
  const gx = 18;
  const gw = w - gx * 2;
  const gh = h - 52;
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w, height: h, opacity}}>
      <div style={{position: 'absolute', inset: 0, borderRadius: 24, background: 'linear-gradient(180deg,#34484a,#223335)', boxShadow: '0 26px 50px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.12)'}} />
      <div style={{position: 'absolute', left: gx, top: gx, width: gw, height: gh, borderRadius: 10, background: 'linear-gradient(160deg,#143030,#0c1f1e)', boxShadow: 'inset 0 0 0 2px rgba(143,209,199,.25)', overflow: 'hidden'}}>
        {scan >= 0 && scan <= 1 && (
          <>
            <div style={{position: 'absolute', top: 0, bottom: 0, left: `${scan * 100}%`, width: 4, background: C.glow, boxShadow: `0 0 26px 10px rgba(45,212,191,.7)`, transform: 'translateX(-2px)'}} />
            <div style={{position: 'absolute', top: 0, bottom: 0, left: 0, width: `${scan * 100}%`, background: 'linear-gradient(90deg, transparent, rgba(45,212,191,.12))'}} />
          </>
        )}
      </div>
      <div style={{position: 'absolute', left: gx + 2, bottom: 16, display: 'flex', alignItems: 'center', gap: 10, font: `700 13px ${MONO}`, color: C.mint, letterSpacing: '.08em'}}>
        <i style={{width: 11, height: 11, borderRadius: '50%', background: led > 0.5 ? C.glow : '#51625f', boxShadow: led > 0.5 ? '0 0 12px 3px rgba(45,212,191,.7)' : 'none'}} />
        SCANNER
      </div>
    </div>
  );
};

/** Dashed frame that names one half of the job. */
export const Zone: React.FC<{x: number; y: number; w: number; h: number; kind: 'physical' | 'digital'; opacity?: number; children?: React.ReactNode}> = ({x, y, w, h, kind, opacity = 1, children}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h, opacity, transform: `translateY(${(1 - opacity) * 18}px)`}}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 26,
        border: `2px dashed ${kind === 'physical' ? 'rgba(240,169,59,.45)' : 'rgba(45,212,191,.4)'}`,
        background: kind === 'physical' ? 'rgba(240,169,59,.045)' : 'rgba(45,212,191,.04)',
      }}
    />
    <Tag kind={kind} style={{position: 'absolute', left: 22, top: -20, background: C.night}} />
    {children}
  </div>
);

/** A little label that points at something, e.g. an event line under the screen. */
export const EventLine: React.FC<{x: number; y: number; w: number; text: string; opacity?: number}> = ({x, y, w, text, opacity = 1}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      opacity,
      transform: `translateY(${(1 - opacity) * 10}px)`,
      padding: '10px 14px',
      borderRadius: 12,
      background: '#10241f',
      border: `1px solid ${C.line}`,
      color: '#bfe9e1',
      font: `400 15px/1.4 ${MONO}`,
    }}
  >
    {text}
  </div>
);

/** A speech bubble for what the expert says. */
export const Said: React.FC<{x: number; y: number; w: number; text: string; initial?: string; opacity?: number; tone?: 'amber' | 'mint'}> = ({x, y, w, text, initial = 'M', opacity = 1, tone = 'amber'}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, opacity, transform: `translateY(${(1 - opacity) * 14}px)`, display: 'flex', gap: 12, alignItems: 'flex-start'}}>
    <div style={{flex: 'none', width: 40, height: 40, borderRadius: '50%', background: tone === 'amber' ? C.amber : C.mint, color: '#201300', display: 'grid', placeItems: 'center', font: `700 19px ${SERIF}`}}>{initial}</div>
    <div style={{background: C.paper, color: C.ink, borderRadius: '6px 18px 18px 18px', padding: '12px 16px', font: `italic 400 19px/1.35 ${SERIF}`, boxShadow: '0 12px 30px rgba(0,0,0,.4)'}}>{text}</div>
  </div>
);
