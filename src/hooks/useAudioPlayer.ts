import { useState, useEffect } from 'react';
import { audioPlayer, AudioPlayerState } from '../services/audioPlayerService';

export function useAudioPlayer(): {
  state: AudioPlayerState;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  toggleMute: () => void;
  toggleLoop: () => void;
  setSong: (url: string, name?: string) => void;
  resetToDefault: () => void;
} {
  const [state, setState] = useState<AudioPlayerState>(() => audioPlayer.getState());

  useEffect(() => {
    // Initialize singleton player engine on mount
    audioPlayer.init();

    // Subscribe to state updates from singleton player
    const unsubscribe = audioPlayer.subscribe((nextState) => {
      setState(nextState);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    state,
    play: () => audioPlayer.play(),
    pause: () => audioPlayer.pause(),
    togglePlay: () => audioPlayer.togglePlay(),
    seek: (seconds: number) => audioPlayer.seek(seconds),
    toggleMute: () => audioPlayer.toggleMute(),
    toggleLoop: () => audioPlayer.toggleLoop(),
    setSong: (url: string, name?: string) => audioPlayer.setSong(url, name),
    resetToDefault: () => audioPlayer.resetToDefault(),
  };
}
