import { setMusicLevel } from './music';
import { setSfxVolume } from './sfx';

/** Levels applied automatically when a round starts. Players can adjust both afterwards. */
export const ROUND_MIX = { music: 0.2, sfx: 0.9 };

export function applyRoundMix() {
  setMusicLevel(ROUND_MIX.music);
  setSfxVolume(ROUND_MIX.sfx);
}
