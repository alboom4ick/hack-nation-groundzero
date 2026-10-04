import React, {createContext, useContext} from 'react';
import {useCurrentFrame as remotionFrame} from 'remotion';

// A scene is animated in "design frames". Speed < 1 stretches it, so a clip can last as long as its voice-over.
const SpeedContext = createContext(1);

export const useCurrentFrame = () => remotionFrame() * useContext(SpeedContext);

export const withSpeed = (Scene: React.FC, speed: number): React.FC => () => (
  <SpeedContext.Provider value={speed}>
    <Scene />
  </SpeedContext.Provider>
);
