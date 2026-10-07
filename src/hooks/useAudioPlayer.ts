import { useState, useEffect } from 'react';
import { audioPlayer, AudioPlayerState, RepeatMode } from '../services/audioPlayerService';
import { SongItem } from '../services/localMusicService';

export function useAudioPlayer(): {
  state: AudioPlayerState;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  next: () => void;
  previous: () => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => RepeatMode;
  toggleLoop: () => void;
  setSong: (url: string, name?: string) => void;
  playSongItem: (song: SongItem, playlist?: SongItem[]) => void;
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
    next: () => audioPlayer.next(),
    previous: () => audioPlayer.previous(),
    toggleMute: () => audioPlayer.toggleMute(),
    toggleShuffle: () => audioPlayer.toggleShuffle(),
    cycleRepeatMode: () => audioPlayer.cycleRepeatMode(),
    toggleLoop: () => audioPlayer.cycleRepeatMode(),
    setSong: (url: string, name?: string) => audioPlayer.setSong(url, name),
    playSongItem: (song: SongItem, playlist?: SongItem[]) => audioPlayer.playSongItem(song, playlist),
    resetToDefault: () => audioPlayer.resetToDefault(),
  };
}
