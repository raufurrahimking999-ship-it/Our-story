import { Capacitor, registerPlugin } from '@capacitor/core';
import { SongItem } from './localMusicService';

export type RepeatMode = 'off' | 'all' | 'one';

export interface AudioPlayerState {
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  isLoading: boolean;
  hasError: boolean;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  songUrl: string;
  songName: string;
  songArtist: string;
  songId: string;
  currentIndex: number;
}

interface NativeAudioPlugin {
  playSong(options: {
    url?: string;
    title?: string;
    artist?: string;
    album?: string;
    duration?: number;
    artwork?: string;
    id?: string;
    index?: number;
  }): Promise<{ success: boolean }>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(options: { seconds: number }): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  setRepeatMode(options: { mode: 'off' | 'all' | 'one' }): Promise<void>;
  setShuffle(options: { shuffle: boolean }): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  setPlaylist(options: { songs: SongItem[]; initialIndex?: number }): Promise<void>;
  getState(): Promise<{
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    url: string;
    title: string;
    artist: string;
    album: string;
    artwork: string;
    currentIndex: number;
    repeatMode: RepeatMode;
    isShuffle: boolean;
  }>;
  stopPlayback(): Promise<void>;
  addListener(eventName: string, listenerFunc: (data: any) => void): Promise<any>;
}

const NativeAudio = registerPlugin<NativeAudioPlugin>('NativeAudio');

const PERSISTENCE_KEY = 'our_story_audio_playback_persistence';

class AudioPlayerService {
  private audioElement: HTMLAudioElement | null = null;

  private isPlaying = false;
  private duration = 0;
  private currentTime = 0;
  private lastKnownTime = 0;
  private isSeeking = false;
  private seekTimeout: any = null;

  private isLoading = false;
  private hasError = false;
  private isMuted = false;
  private repeatMode: RepeatMode = 'all';
  private isShuffle = false;

  private songUrl = '';
  private songName = '';
  private songArtist = '';
  private songId = '';
  private currentIndex = -1;

  private onEndedCallback: (() => void) | null = null;
  private onNextCallback: (() => void) | null = null;
  private onPrevCallback: (() => void) | null = null;

  private subscribers = new Set<(state: AudioPlayerState) => void>();
  private pollInterval: any = null;

  constructor() {
    this.restorePersistedState();

    if (typeof window !== 'undefined') {
      this.initMediaSession();

      if (Capacitor.isNativePlatform()) {
        this.setupNativeListeners();
        this.startNativePolling();
        this.syncWithNative();
      }
    }
  }

  private restorePersistedState() {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(PERSISTENCE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            this.songUrl = parsed.songUrl || '';
            this.songName = parsed.songName || '';
            this.songArtist = parsed.songArtist || '';
            this.songId = parsed.songId || '';
            this.duration = typeof parsed.duration === 'number' ? parsed.duration : 0;
            this.currentTime = typeof parsed.currentTime === 'number' ? parsed.currentTime : 0;
            this.lastKnownTime = this.currentTime;
            this.repeatMode = parsed.repeatMode || 'all';
            this.isShuffle = !!parsed.isShuffle;
            this.currentIndex = typeof parsed.currentIndex === 'number' ? parsed.currentIndex : -1;
          }
        }
      }
    } catch {}
  }

  private persistState() {
    try {
      if (typeof window !== 'undefined') {
        const toSave = {
          songUrl: this.songUrl,
          songName: this.songName,
          songArtist: this.songArtist,
          songId: this.songId,
          duration: this.duration,
          currentTime: this.lastKnownTime,
          repeatMode: this.repeatMode,
          isShuffle: this.isShuffle,
          currentIndex: this.currentIndex,
        };
        localStorage.setItem(PERSISTENCE_KEY, JSON.stringify(toSave));
      }
    } catch {}
  }

  public setTrackCallbacks(callbacks: {
    onEnded?: () => void;
    onNext?: () => void;
    onPrev?: () => void;
  }) {
    if (callbacks.onEnded) this.onEndedCallback = callbacks.onEnded;
    if (callbacks.onNext) this.onNextCallback = callbacks.onNext;
    if (callbacks.onPrev) this.onPrevCallback = callbacks.onPrev;
  }

  private setupNativeListeners() {
    try {
      NativeAudio.addListener('onTrackChange', (data: any) => {
        if (data) {
          if (data.title) this.songName = data.title;
          if (data.artist) this.songArtist = data.artist;
          if (data.url) this.songUrl = data.url;
          if (data.id) this.songId = data.id;
          if (typeof data.duration === 'number' && data.duration > 0) {
            this.duration = data.duration;
          }
          if (typeof data.index === 'number') {
            this.currentIndex = data.index;
          }
          this.persistState();
          this.notify();
        }
      }).catch(() => {});

      NativeAudio.addListener('onStateChange', (data: any) => {
        if (data) {
          this.isPlaying = !!data.isPlaying;
          if (!this.isSeeking && typeof data.currentTime === 'number') {
            this.lastKnownTime = data.currentTime;
            this.currentTime = data.currentTime;
          }
          if (typeof data.duration === 'number' && data.duration > 0) {
            this.duration = data.duration;
          }
          if (data.title && (!this.songName || this.songName !== data.title)) {
            this.songName = data.title;
          }
          if (data.url && (!this.songUrl || this.songUrl !== data.url)) {
            this.songUrl = data.url;
          }
          this.notify();
        }
      }).catch(() => {});
    } catch (e) {
      console.warn('Native listener setup warning:', e);
    }
  }

  private startNativePolling() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(async () => {
      await this.syncWithNative();
    }, 400);
  }

  private async syncWithNative() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const state = await NativeAudio.getState();
      this.isPlaying = !!state.isPlaying;
      this.isLoading = false;

      if (state.duration > 0) {
        this.duration = state.duration;
      }
      if (!this.isSeeking && typeof state.currentTime === 'number') {
        this.lastKnownTime = state.currentTime;
        this.currentTime = state.currentTime;
      }

      if (state.url && state.url !== this.songUrl) {
        this.songUrl = state.url;
        this.songName = state.title || this.songName;
        this.songArtist = state.artist || this.songArtist;
        this.currentIndex = state.currentIndex >= 0 ? state.currentIndex : this.currentIndex;
      }

      if (state.repeatMode) {
        this.repeatMode = state.repeatMode;
      }
      this.isShuffle = !!state.isShuffle;

      this.notify();
    } catch {}
  }

  public init() {
    if (typeof window === 'undefined') return;

    if (Capacitor.isNativePlatform()) {
      this.syncWithNative();
      return;
    }

    if (this.songUrl) {
      this.initHTMLAudio(this.songUrl, false);
    }
  }

  private initHTMLAudio(src: string, autoPlay = true) {
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.preload = 'metadata';
      this.audioElement.volume = this.isMuted ? 0 : 1.0;
      this.audioElement.setAttribute('playsinline', '');

      this.audioElement.addEventListener('durationchange', () => {
        if (this.audioElement && Number.isFinite(this.audioElement.duration) && this.audioElement.duration > 0) {
          this.duration = this.audioElement.duration;
          this.notify();
        }
      });

      this.audioElement.addEventListener('loadedmetadata', () => {
        if (this.audioElement && Number.isFinite(this.audioElement.duration) && this.audioElement.duration > 0) {
          this.duration = this.audioElement.duration;
          this.isLoading = false;
          this.notify();
        }
      });

      this.audioElement.addEventListener('play', () => {
        this.isPlaying = true;
        this.isLoading = false;
        this.updateMediaSessionState('playing');
        this.notify();
      });

      this.audioElement.addEventListener('pause', () => {
        this.isPlaying = false;
        if (this.audioElement && Number.isFinite(this.audioElement.currentTime)) {
          this.lastKnownTime = this.audioElement.currentTime;
          this.currentTime = this.lastKnownTime;
        }
        this.updateMediaSessionState('paused');
        this.persistState();
        this.notify();
      });

      this.audioElement.addEventListener('timeupdate', () => {
        if (!this.isSeeking && this.audioElement && Number.isFinite(this.audioElement.currentTime)) {
          this.lastKnownTime = this.audioElement.currentTime;
          this.currentTime = this.lastKnownTime;
        }
      });

      this.audioElement.addEventListener('waiting', () => {
        this.isLoading = true;
        this.notify();
      });

      this.audioElement.addEventListener('playing', () => {
        this.isLoading = false;
        this.hasError = false;
        this.isPlaying = true;
        this.updateMediaSessionState('playing');
        this.notify();
      });

      this.audioElement.addEventListener('ended', () => {
        if (this.repeatMode === 'one') {
          if (this.audioElement) {
            this.audioElement.currentTime = 0;
            this.audioElement.play().catch(() => {});
          }
        } else if (this.onEndedCallback) {
          this.onEndedCallback();
        } else if (this.repeatMode === 'all') {
          if (this.onNextCallback) {
            this.onNextCallback();
          } else if (this.audioElement) {
            this.audioElement.currentTime = 0;
            this.audioElement.play().catch(() => {});
          }
        } else {
          this.isPlaying = false;
          this.lastKnownTime = 0;
          this.currentTime = 0;
          this.updateMediaSessionState('paused');
          this.notify();
        }
      });

      this.audioElement.addEventListener('error', () => {
        this.isLoading = false;
        this.hasError = true;
        this.isPlaying = false;
        this.notify();
      });
    }

    if (!src) return;

    const resolvedSrc = src.startsWith('http') || src.startsWith('blob:') || src.startsWith('data:')
      ? src
      : src.startsWith('/') ? src : `/${src}`;

    if (!this.audioElement.src || !this.audioElement.src.endsWith(resolvedSrc)) {
      this.audioElement.src = resolvedSrc;
      this.audioElement.load();
    }

    this.audioElement.volume = this.isMuted ? 0 : 1.0;
    if (autoPlay) {
      this.audioElement.play().catch(() => {
        this.isPlaying = false;
        this.isLoading = false;
        this.notify();
      });
    }

    this.updateMediaSessionMetadata();
  }

  private initMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          this.seek(details.seekTime);
        }
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (this.onPrevCallback) this.onPrevCallback();
        else this.seek(0);
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (this.onNextCallback) this.onNextCallback();
      });
    } catch {}
  }

  private updateMediaSessionMetadata() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.songName || 'Unknown Title',
        artist: this.songArtist || 'Device Audio',
        album: 'My Music',
        artwork: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      });
    } catch {}
  }

  private updateMediaSessionState(state: 'playing' | 'paused') {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch {}
  }

  public getCurrentTime(): number {
    return this.lastKnownTime;
  }

  public async play(): Promise<void> {
    if (!this.songUrl) return;

    if (Capacitor.isNativePlatform()) {
      try {
        await NativeAudio.resume();
        this.isPlaying = true;
        this.notify();
      } catch (e) {
        console.warn('Native resume error:', e);
      }
      return;
    }

    if (this.audioElement) {
      try {
        await this.audioElement.play();
        this.isPlaying = true;
        this.updateMediaSessionState('playing');
        this.notify();
      } catch {}
    } else if (this.songUrl) {
      this.initHTMLAudio(this.songUrl, true);
    }
  }

  public pause(): void {
    if (Capacitor.isNativePlatform()) {
      try {
        NativeAudio.pause();
        this.isPlaying = false;
        this.notify();
      } catch {}
      return;
    }

    if (this.audioElement) {
      try {
        this.audioElement.pause();
        if (Number.isFinite(this.audioElement.currentTime)) {
          this.lastKnownTime = this.audioElement.currentTime;
          this.currentTime = this.lastKnownTime;
        }
      } catch {}
    }

    this.isPlaying = false;
    this.updateMediaSessionState('paused');
    this.persistState();
    this.notify();
  }

  public togglePlay(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public seek(targetSeconds: number): void {
    const maxDur = this.duration > 0 ? this.duration : 0;
    const safeTarget = Math.max(0, Math.min(targetSeconds, Math.max(0, maxDur - 0.1)));

    this.lastKnownTime = safeTarget;
    this.currentTime = safeTarget;
    this.isSeeking = true;

    if (this.seekTimeout) {
      clearTimeout(this.seekTimeout);
    }
    this.seekTimeout = setTimeout(() => {
      this.isSeeking = false;
    }, 500);

    if (Capacitor.isNativePlatform()) {
      NativeAudio.seek({ seconds: safeTarget }).catch(() => {});
      this.notify();
      return;
    }

    if (this.audioElement && Number.isFinite(safeTarget)) {
      try {
        this.audioElement.currentTime = safeTarget;
      } catch {}
    }
    this.notify();
  }

  public toggleMute(): void {
    this.isMuted = !this.isMuted;
    if (Capacitor.isNativePlatform()) {
      NativeAudio.setVolume({ volume: this.isMuted ? 0 : 1.0 }).catch(() => {});
    } else if (this.audioElement) {
      this.audioElement.volume = this.isMuted ? 0 : 1.0;
    }
    this.notify();
  }

  public cycleRepeatMode(): RepeatMode {
    if (this.repeatMode === 'off') this.repeatMode = 'all';
    else if (this.repeatMode === 'all') this.repeatMode = 'one';
    else this.repeatMode = 'off';

    if (Capacitor.isNativePlatform()) {
      NativeAudio.setRepeatMode({ mode: this.repeatMode }).catch(() => {});
    }

    this.persistState();
    this.notify();
    return this.repeatMode;
  }

  public setShuffle(shuffle: boolean): void {
    this.isShuffle = shuffle;
    if (Capacitor.isNativePlatform()) {
      NativeAudio.setShuffle({ shuffle }).catch(() => {});
    }
    this.persistState();
    this.notify();
  }

  public toggleShuffle(): void {
    this.setShuffle(!this.isShuffle);
  }

  public playSongItem(song: SongItem, playlist?: SongItem[]): void {
    if (!song || !song.url) return;

    this.pause();
    this.lastKnownTime = 0;
    this.currentTime = 0;
    this.songUrl = song.url;
    this.songName = song.title;
    this.songArtist = song.artist || 'Device Audio';
    this.songId = song.id;
    this.duration = song.duration > 0 ? song.duration : 0;

    if (playlist && playlist.length > 0) {
      const idx = playlist.findIndex((s) => s.id === song.id || s.url === song.url);
      this.currentIndex = idx >= 0 ? idx : 0;
    }

    this.persistState();

    if (Capacitor.isNativePlatform()) {
      NativeAudio.playSong({
        url: song.url,
        title: song.title,
        artist: song.artist || 'Device Audio',
        album: song.album || 'Local Music',
        duration: song.duration,
        artwork: song.artwork,
        id: song.id,
        index: this.currentIndex >= 0 ? this.currentIndex : undefined,
      }).then(() => {
        this.isPlaying = true;
        this.notify();
      }).catch((e) => {
        console.warn('Native playSong error:', e);
      });
      return;
    }

    this.updateMediaSessionMetadata();
    this.initHTMLAudio(this.songUrl, true);
    this.notify();
  }

  public setSong(url: string, name?: string): void {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    let detectedName = name?.trim();
    if (!detectedName) {
      const parts = trimmedUrl.split('/');
      const filename = parts[parts.length - 1]?.split('?')[0];
      detectedName = filename ? decodeURIComponent(filename).replace(/\.[^/.]+$/, '') : 'Local Track';
    }

    const song: SongItem = {
      id: `song-${Date.now()}`,
      title: detectedName,
      artist: 'Device Audio',
      album: 'Local Music',
      duration: this.duration,
      url: trimmedUrl,
    };

    this.playSongItem(song);
  }

  public async next(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await NativeAudio.next();
      return;
    }
    if (this.onNextCallback) {
      this.onNextCallback();
    }
  }

  public async previous(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await NativeAudio.previous();
      return;
    }
    if (this.onPrevCallback) {
      this.onPrevCallback();
    }
  }

  public resetToDefault(): void {
    this.pause();
    this.lastKnownTime = 0;
    this.currentTime = 0;
    this.notify();
  }

  public getState(): AudioPlayerState {
    return {
      isPlaying: this.isPlaying,
      duration: this.duration,
      currentTime: this.lastKnownTime,
      isLoading: this.isLoading,
      hasError: this.hasError,
      isMuted: this.isMuted,
      repeatMode: this.repeatMode,
      isShuffle: this.isShuffle,
      songUrl: this.songUrl,
      songName: this.songName || 'No track selected',
      songArtist: this.songArtist,
      songId: this.songId,
      currentIndex: this.currentIndex,
    };
  }

  public subscribe(listener: (state: AudioPlayerState) => void): () => void {
    this.subscribers.add(listener);
    listener(this.getState());
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private notify() {
    const state = this.getState();
    this.subscribers.forEach((fn) => {
      try {
        fn(state);
      } catch (e) {
        console.error('Error notifying audioPlayer subscriber:', e);
      }
    });
  }
}

export const audioPlayer = new AudioPlayerService();
