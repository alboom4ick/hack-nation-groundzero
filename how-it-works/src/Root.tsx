import React from 'react';
import {Composition} from 'remotion';
import {FPS, H, W} from './theme';
import {withSpeed} from './frame';
import {S1Expert, S1_FRAMES} from './scenes/S1Expert';
import {S2Screen, S2_FRAMES} from './scenes/S2Screen';
import {S3Paper, S3_FRAMES} from './scenes/S3Paper';
import {S4Map, S4_FRAMES} from './scenes/S4Map';
import {S5Teach, S5_FRAMES} from './scenes/S5Teach';
import {S6Agent, S6_FRAMES} from './scenes/S6Agent';

// Each clip lasts as long as its voice-over (how-it-works/narration.json, see voice.mjs) plus a 0.35 s tail.
// `frames` is the real length; the scene itself is designed for its own S*_FRAMES and gets stretched to fit.
const clip = (id: string, Scene: React.FC, design: number, frames: number) => ({id, component: withSpeed(Scene, design / frames), frames});

export const SCENES = [
  clip('S1Expert', S1Expert, S1_FRAMES, 210),
  clip('S2Screen', S2Screen, S2_FRAMES, 199),
  clip('S3Paper', S3Paper, S3_FRAMES, 239),
  clip('S4Map', S4Map, S4_FRAMES, 222),
  clip('S5Teach', S5Teach, S5_FRAMES, 214),
  clip('S6Agent', S6Agent, S6_FRAMES, 250),
];

export const Root: React.FC = () => (
  <>
    {SCENES.map((s) => (
      <Composition key={s.id} id={s.id} component={s.component} durationInFrames={s.frames} fps={FPS} width={W} height={H} />
    ))}
  </>
);
