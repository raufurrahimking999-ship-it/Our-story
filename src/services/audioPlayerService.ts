/**
 * High-Performance Singleton Audio Player Service for "Our Little Story"
 * Inspired by Lark Player capabilities
 * 
 * Bundled Offline Native Audio Engine:
 * - Direct local asset playback via persistent singleton HTMLAudioElement (Web)
 * - 100% offline ready for built Android APK & Capacitor WebViews (Native)
 * - Uses native AndroidX Media3 ExoPlayer & MediaSessionService in the native layer (survives swipes)
 * - Native lock screen & media notification integration
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { RELATIONSHIP_CONFIG, DEFAULT_LOCAL_AUDIO_PATH } from '../config';

export type RepeatMode = 'off' | 'all' | 'one';

export interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  setVolume: (volume: number) => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  mute: () => void;
  unMute: () => void;
  loadVideoById: (videoId: string) => void;
  getPlayerState: () => number;
  destroy: () => void;
}

export interface YTReadyEvent {
  target: YTPlayerInstance;
}

export interface YTStateChangeEvent {
  data: number;
  target: YTPlayerInstance;
}

export interface YTPlayerOptions {
  videoId?: string;
  playerVars?: Record<string, unknown>;
  events?: {
    onReady?: (event: YTReadyEvent) => void;
    onStateChange?: (event: YTStateChangeEvent) => void;
    onError?: (event: { data: number; target?: YTPlayerInstance }) => void;
  };
}

export interface YTGlobal {
  Player: new (elementId: string | HTMLElement, options: YTPlayerOptions) => YTPlayerInstance;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

export interface ExtendedWindow extends Window {
  YT?: YTGlobal;
  onYouTubeIframeAPIReady?: () => void;
}

export interface AudioPlayerState {
  isPlaying: boolean;
  duration: number;
  isLoading: boolean;
  hasError: boolean;
  isMuted: boolean;
  isLooping: boolean;
  repeatMode: RepeatMode;
  songUrl: string;
  songName: string;
  isCustom: boolean;
  isYouTube: boolean;
}

export function extractYouTubeId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  return match ? match[1] : null;
}

// -------------------------------------------------------------------------
// Capacitor Native Audio Plugin Bridge
// -------------------------------------------------------------------------
interface NativeAudioPlugin {
  playSong(options: { url: string; title: string; artist: string }): Promise<{ success: boolean }>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(options: { seconds: number }): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  getState(): Promise<{
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    url: string;
    title: string;
    artist: string;
    isEnded: boolean;
  }>;
  stopPlayback(): Promise<void>;
}

const NativeAudio = registerPlugin<NativeAudioPlugin>('NativeAudio');

class AudioPlayerService {
  private audioElement: HTMLAudioElement | null = null;
  private ytPlayer: YTPlayerInstance | null = null;
  private ytContainer: HTMLDivElement | null = null;
  private isYtReady = false;

  private isPlaying = false;
  private duration = 291.0; // 04:51 exact track length
  private lastKnownTime = 0;
  private isLoading = true;
  private hasError = false;
  private isMuted = false;
  private repeatMode: RepeatMode = 'all';

  private songUrl: string = DEFAULT_LOCAL_AUDIO_PATH;
  private songName: string = RELATIONSHIP_CONFIG.songName;
  private isCustom = false;

  private onEndedCallback: (() => void) | null = null;
  private onNextCallback: (() => void) | null = null;
  private onPrevCallback: (() => void) | null = null;

  private subscribers = new Set<(state: AudioPlayerState) => void>();

  // Background Web Audio Keep-Alive Context & Wakelock
  private keepAliveCtx: AudioContext | null = null;
  private keepAliveOsc: OscillatorNode | null = null;
  private keepAliveGain: GainNode | null = null;
  private wakeLock: any = null;

  // Native Polling
  private nativePollInterval: any = null;

  constructor() {
    this.loadSavedSong();
    if (typeof window !== 'undefined') {
      this.initGlobalGestureUnlock();
      this.initMediaSession();
      
      // Auto-start polling if native
      if (Capacitor.isNativePlatform()) {
        this.startNativePolling();
        this.syncNativeState();
      }
    }
  }

  private getWin(): ExtendedWindow | null {
    return typeof window !== 'undefined' ? (window as ExtendedWindow) : null;
  }

  private loadSavedSong() {
    this.songUrl = DEFAULT_LOCAL_AUDIO_PATH;
    this.songName = RELATIONSHIP_CONFIG.songName;
    this.isCustom = false;
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

  // Polling loop to keep web UI and native player 100% in-sync
  private startNativePolling() {
    if (this.nativePollInterval) return;
    this.nativePollInterval = setInterval(async () => {
      await this.syncNativeState();
    }, 400);
  }

  private async syncNativeState() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const state = await NativeAudio.getState();
      this.isPlaying = state.isPlaying;
      this.isLoading = false;
      
      if (state.duration > 0) {
        this.duration = state.duration;
      }
      if (state.currentTime >= 0) {
        this.lastKnownTime = state.currentTime;
      }

      if (state.isEnded) {
        this.handleNativeEnded();
      }

      // If a song is currently playing in background and we re-open the app,
      // update our web state variables to match the background player dynamically!
      if (state.url && state.url !== this.songUrl) {
        this.songUrl = state.url;
        this.songName = state.title || 'Our Special Song';
        this.isCustom = true;
      }
      this.notify();
    } catch (e) {
      console.warn('Error syncing native player state:', e);
    }
  }

  private handleNativeEnded() {
    if (this.repeatMode === 'one') {
      NativeAudio.seek({ seconds: 0 });
      NativeAudio.resume();
    } else if (this.onEndedCallback) {
      this.onEndedCallback();
    } else if (this.repeatMode === 'all') {
      NativeAudio.seek({ seconds: 0 });
      NativeAudio.resume();
    } else {
      this.isPlaying = false;
      this.notify();
    }
  }

  public init() {
    if (typeof window === 'undefined') return;

    if (Capacitor.isNativePlatform()) {
      this.isLoading = false;
      this.syncNativeState();
      return;
    }

    const ytId = extractYouTubeId(this.songUrl);
    if (ytId) {
      this.initYouTubePlayer(ytId);
    } else {
      this.initHTMLAudio(this.songUrl);
    }
  }

  private initHTMLAudio(src: string) {
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.preload = 'auto';
      this.audioElement.loop = false; // We handle loop via repeatMode
      this.audioElement.volume = this.isMuted ? 0 : 1.0;
      this.audioElement.setAttribute('playsinline', '');

      this.audioElement.addEventListener('durationchange', () => {
        if (Number.isFinite(this.audioElement?.duration) && (this.audioElement?.duration ?? 0) > 0) {
          this.duration = this.audioElement!.duration;
          this.notify();
        }
      });

      this.audioElement.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(this.audioElement?.duration) && (this.audioElement?.duration ?? 0) > 0) {
          this.duration = this.audioElement!.duration;
          this.isLoading = false;
          this.notify();
        }
      });

      this.audioElement.addEventListener('play', () => {
        this.isPlaying = true;
        this.isLoading = false;
        this.setSystemVolume(1.0);
        this.updateMediaSessionState('playing');
        this.startBackgroundKeepAlive();
        this.notify();
      });

      this.audioElement.addEventListener('pause', () => {
        this.isPlaying = false;
        if (Number.isFinite(this.audioElement?.currentTime)) {
          this.lastKnownTime = this.audioElement!.currentTime;
        }
        this.updateMediaSessionState('paused');
        this.stopBackgroundKeepAlive();
        this.notify();
      });

      this.audioElement.addEventListener('waiting', () => {
        this.isLoading = true;
        this.notify();
      });

      this.audioElement.addEventListener('playing', () => {
        this.isLoading = false;
        this.hasError = false;
        this.isPlaying = true;
        this.setSystemVolume(1.0);
        this.updateMediaSessionState('playing');
        this.startBackgroundKeepAlive();
        this.notify();
      });

      this.audioElement.addEventListener('ended', () => {
        if (this.repeatMode === 'one') {
          this.audioElement!.currentTime = 0;
          this.audioElement!.play().catch(() => {});
        } else {
          if (this.onEndedCallback) {
            this.onEndedCallback();
          } else if (this.repeatMode === 'all') {
            this.audioElement!.currentTime = 0;
            this.audioElement!.play().catch(() => {});
          } else {
            this.isPlaying = false;
            this.lastKnownTime = 0;
            this.updateMediaSessionState('paused');
            this.stopBackgroundKeepAlive();
            this.notify();
          }
        }
      });

      this.audioElement.addEventListener('error', () => {
        if (this.audioElement && this.audioElement.src && !this.audioElement.src.includes('Hawayein.mp3')) {
          this.audioElement.src = '/audio/Hawayein.mp3';
          this.audioElement.load();
          this.audioElement.play().catch(() => {});
        } else {
          this.isLoading = false;
          this.hasError = true;
          this.stopBackgroundKeepAlive();
          this.notify();
        }
      });
    }

    const resolvedSrc = src.startsWith('http') || src.startsWith('blob:') || src.startsWith('data:')
      ? src
      : src.startsWith('/') ? src : `/${src}`;

    if (!this.audioElement.src || !this.audioElement.src.endsWith(resolvedSrc)) {
      this.audioElement.src = resolvedSrc;
      this.audioElement.load();
    }

    this.audioElement.volume = this.isMuted ? 0 : 1.0;
    this.audioElement.play().catch(() => {
      this.isPlaying = false;
      this.isLoading = false;
      this.notify();
    });

    this.updateMediaSessionMetadata();
  }

  private initYouTubePlayer(videoId: string) {
    if (typeof document === 'undefined') return;

    if (!this.ytContainer) {
      this.ytContainer = document.createElement('div');
      this.ytContainer.id = 'singleton-yt-player-container';
      this.ytContainer.style.position = 'fixed';
      this.ytContainer.style.left = '0px';
      this.ytContainer.style.top = '0px';
      this.ytContainer.style.width = '2px';
      this.ytContainer.style.height = '2px';
      this.ytContainer.style.opacity = '0.001';
      this.ytContainer.style.pointerEvents = 'none';
      this.ytContainer.style.zIndex = '-9999';
      this.ytContainer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(this.ytContainer);
    }

    const win = this.getWin();
    const createPlayer = () => {
      const winRef = this.getWin();
      if (!winRef || !winRef.YT || !winRef.YT.Player || !this.ytContainer) return;

      try {
        this.ytPlayer = new winRef.YT.Player(this.ytContainer, {
          videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            iv_load_policy: 3,
            origin: typeof window !== 'undefined' && window.location.origin ? window.location.origin : undefined,
          },
          events: {
            onReady: (e: YTReadyEvent) => {
              this.isYtReady = true;
              this.isLoading = false;
              const d = e.target.getDuration();
              if (Number.isFinite(d) && d > 0) {
                this.duration = d;
              }

              if (this.isMuted) {
                e.target.mute();
                e.target.setVolume(0);
              } else {
                e.target.unMute();
                e.target.setVolume(100);
              }

              try {
                e.target.playVideo();
              } catch {}
              this.updateMediaSessionMetadata();
              this.notify();
            },
            onStateChange: (event: YTStateChangeEvent) => {
              if (event.data === 1) { // PLAYING
                this.isPlaying = true;
                this.isLoading = false;
                this.hasError = false;
                this.setSystemVolume(1.0);
                this.updateMediaSessionState('playing');
                this.startBackgroundKeepAlive();
              } else if (event.data === 2) { // PAUSED
                this.isPlaying = false;
                this.isLoading = false;
                try {
                  const cur = event.target.getCurrentTime();
                  if (Number.isFinite(cur)) this.lastKnownTime = cur;
                } catch {}
                this.updateMediaSessionState('paused');
                this.stopBackgroundKeepAlive();
              } else if (event.data === 3) { // BUFFERING
                this.isLoading = true;
              } else if (event.data === 0) { // ENDED
                if (this.repeatMode === 'one') {
                  try {
                    event.target.seekTo(0, true);
                    event.target.playVideo();
                  } catch {}
                } else if (this.onEndedCallback) {
                  this.onEndedCallback();
                } else if (this.repeatMode === 'all') {
                  try {
                    event.target.seekTo(0, true);
                    event.target.playVideo();
                  } catch {}
                } else {
                  this.isPlaying = false;
                  this.lastKnownTime = 0;
                  this.updateMediaSessionState('paused');
                  this.stopBackgroundKeepAlive();
                }
              }
              this.notify();
            },
            onError: () => {
              this.isYtReady = false;
              this.isLoading = false;
              this.hasError = true;
              this.stopBackgroundKeepAlive();
              this.notify();
            },
          },
        });
      } catch (err) {
        console.warn('Error creating YouTube player:', err);
      }
    };

    if (win && win.YT && win.YT.Player) {
      if (this.ytPlayer && typeof this.ytPlayer.loadVideoById === 'function') {
        try {
          this.ytPlayer.loadVideoById(videoId);
          this.isYtReady = true;
        } catch {
          createPlayer();
        }
      } else {
        createPlayer();
      }
    } else {
      const existingScript = document.getElementById('youtube-iframe-api');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }
      if (win) {
        const prevCallback = win.onYouTubeIframeAPIReady;
        win.onYouTubeIframeAPIReady = () => {
          if (prevCallback) prevCallback();
          createPlayer();
        };
      }
    }
  }

  private initMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        this.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        this.pause();
      });
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
    } catch (err) {
      console.warn('MediaSession action handlers not supported:', err);
    }
  }

  private updateMediaSessionMetadata() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.songName,
        artist: RELATIONSHIP_CONFIG.coupleSignature,
        album: 'Our Little Story',
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

  private initGlobalGestureUnlock() {
    const handleGesture = async () => {
      if (Capacitor.isNativePlatform()) return;
      const isYt = Boolean(extractYouTubeId(this.songUrl));
      if (isYt) {
        if (this.ytPlayer && this.isYtReady && !this.isPlaying) {
          try {
            this.setSystemVolume(1.0);
            this.ytPlayer.playVideo();
          } catch {}
        }
      } else if (this.audioElement && this.audioElement.paused && !this.isPlaying) {
        try {
          this.setSystemVolume(1.0);
          await this.audioElement.play();
        } catch {}
      }
    };

    const events = ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'];
    const onFirstUserEvent = () => {
      handleGesture();
      events.forEach((evt) => window.removeEventListener(evt, onFirstUserEvent));
    };

    events.forEach((evt) => window.addEventListener(evt, onFirstUserEvent, { passive: true, once: true }));
  }

  private setSystemVolume(vol: number) {
    if (Capacitor.isNativePlatform()) {
      NativeAudio.setVolume({ volume: this.isMuted ? 0 : vol });
      return;
    }
    const isYt = Boolean(extractYouTubeId(this.songUrl));
    if (isYt && this.ytPlayer && this.isYtReady) {
      try {
        if (this.isMuted) {
          this.ytPlayer.mute();
          this.ytPlayer.setVolume(0);
        } else {
          this.ytPlayer.unMute();
          this.ytPlayer.setVolume(vol * 100);
        }
      } catch {}
    } else if (this.audioElement) {
      this.audioElement.volume = this.isMuted ? 0 : vol;
    }
  }

  // Web Audio Context Keep-Alive & WakeLock
  private startBackgroundKeepAlive() {
    if (Capacitor.isNativePlatform()) return;
    try {
      if (typeof window === 'undefined') return;
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.keepAliveCtx) {
        this.keepAliveCtx = new AudioContextClass();
      }

      const ctx = this.keepAliveCtx;
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume();
        }

        if (!this.keepAliveOsc) {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          
          this.keepAliveOsc = osc;
          this.keepAliveGain = gainNode;
          
          gainNode.gain.value = 0.001; 
          
          osc.connect(gainNode);
          gainNode.connect(ctx.destination);
          
          osc.start();
        }
      }

      this.requestWakeLock();
    } catch (e) {
      console.warn('Keep-Alive initialization failed:', e);
    }
  }

  private stopBackgroundKeepAlive() {
    if (Capacitor.isNativePlatform()) return;
    try {
      if (this.keepAliveOsc) {
        try { this.keepAliveOsc.stop(); } catch {}
        this.keepAliveOsc.disconnect();
        this.keepAliveOsc = null;
      }
      if (this.keepAliveGain) {
        this.keepAliveGain.disconnect();
        this.keepAliveGain = null;
      }
      if (this.keepAliveCtx && this.keepAliveCtx.state !== 'closed') {
        this.keepAliveCtx.suspend();
      }
      this.releaseWakeLock();
    } catch (e) {
      console.warn('Keep-Alive termination failed:', e);
    }
  }

  private async requestWakeLock() {
    try {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      }
    } catch {}
  }

  private releaseWakeLock() {
    try {
      if (this.wakeLock) {
        this.wakeLock.release().then(() => {
          this.wakeLock = null;
        });
      }
    } catch {}
  }

  public getCurrentTime(): number {
    if (Capacitor.isNativePlatform()) {
      return this.lastKnownTime;
    }
    const isYt = Boolean(extractYouTubeId(this.songUrl));
    if (isYt && this.ytPlayer && this.isYtReady) {
      try {
        const t = this.ytPlayer.getCurrentTime();
        if (Number.isFinite(t)) {
          this.lastKnownTime = t;
          return t;
        }
      } catch {}
    } else if (!isYt && this.audioElement) {
      const t = this.audioElement.currentTime;
      if (Number.isFinite(t)) {
        this.lastKnownTime = t;
        return t;
      }
    }
    return this.lastKnownTime;
  }

  public async play(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await NativeAudio.resume();
      this.isPlaying = true;
      this.notify();
      return;
    }

    const isYt = Boolean(extractYouTubeId(this.songUrl));
    this.setSystemVolume(1.0);

    if (isYt) {
      if (this.ytPlayer && this.isYtReady) {
        try {
          this.ytPlayer.playVideo();
          this.updateMediaSessionState('playing');
          this.startBackgroundKeepAlive();
          return;
        } catch (err) {
          console.warn('YouTube play failed:', err);
        }
      } else {
        this.isLoading = true;
        this.notify();
        return;
      }
    }

    if (!isYt && this.audioElement) {
      try {
        await this.audioElement.play();
        this.isPlaying = true;
        this.updateMediaSessionState('playing');
        this.startBackgroundKeepAlive();
        this.notify();
        return;
      } catch (err) {
        console.warn('Audio play failed:', err);
      }
    }
  }

  public pause(): void {
    if (Capacitor.isNativePlatform()) {
      NativeAudio.pause();
      this.isPlaying = false;
      this.notify();
      return;
    }

    const isYt = Boolean(extractYouTubeId(this.songUrl));

    if (isYt && this.ytPlayer) {
      try {
        this.ytPlayer.pauseVideo();
        const cur = this.ytPlayer.getCurrentTime();
        if (Number.isFinite(cur)) this.lastKnownTime = cur;
      } catch {}
    } else if (this.audioElement) {
      try {
        this.audioElement.pause();
        if (Number.isFinite(this.audioElement.currentTime)) {
          this.lastKnownTime = this.audioElement.currentTime;
        }
      } catch {}
    }

    this.isPlaying = false;
    this.updateMediaSessionState('paused');
    this.stopBackgroundKeepAlive();
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
    const safeTarget = Math.max(0, Math.min(targetSeconds, Math.max(0, this.duration - 0.1)));
    this.lastKnownTime = safeTarget;

    if (Capacitor.isNativePlatform()) {
      NativeAudio.seek({ seconds: safeTarget });
      this.notify();
      return;
    }

    const isYt = Boolean(extractYouTubeId(this.songUrl));
    this.setSystemVolume(1.0);

    if (isYt && this.ytPlayer && this.isYtReady) {
      try {
        this.ytPlayer.seekTo(safeTarget, true);
        if (this.isPlaying) {
          this.ytPlayer.playVideo();
        }
      } catch {}
    } else if (this.audioElement && Number.isFinite(safeTarget)) {
      try {
        this.audioElement.currentTime = safeTarget;
        if (this.isPlaying) {
          this.audioElement.play().catch(() => {});
        }
      } catch {}
    }
  }

  public toggleMute(): void {
    this.isMuted = !this.isMuted;
    this.setSystemVolume(1.0);
    this.notify();
  }

  public cycleRepeatMode(): RepeatMode {
    if (this.repeatMode === 'off') this.repeatMode = 'all';
    else if (this.repeatMode === 'all') this.repeatMode = 'one';
    else this.repeatMode = 'off';

    this.notify();
    return this.repeatMode;
  }

  public toggleLoop(): void {
    this.cycleRepeatMode();
  }

  public setSong(url: string, name?: string): void {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    this.pause();
    this.lastKnownTime = 0;

    let detectedName = name?.trim();
    if (!detectedName) {
      const ytId = extractYouTubeId(trimmedUrl);
      if (ytId) {
        detectedName = 'YouTube Song';
      } else {
        const parts = trimmedUrl.split('/');
        const filename = parts[parts.length - 1]?.split('?')[0];
        detectedName = filename ? decodeURIComponent(filename).replace(/\.[^/.]+$/, '') : 'Custom Song';
      }
    }

    this.songUrl = trimmedUrl;
    this.songName = detectedName || 'Custom Song';
    this.isCustom = true;

    if (Capacitor.isNativePlatform()) {
      NativeAudio.playSong({ 
        url: trimmedUrl, 
        title: this.songName, 
        artist: RELATIONSHIP_CONFIG.coupleSignature 
      });
      this.isPlaying = true;
      this.notify();
      return;
    }

    this.updateMediaSessionMetadata();

    const isYt = Boolean(extractYouTubeId(this.songUrl));
    if (isYt) {
      const ytId = extractYouTubeId(this.songUrl)!;
      this.initYouTubePlayer(ytId);
    } else {
      if (this.ytPlayer) {
        try { this.ytPlayer.stopVideo(); } catch {}
      }
      this.initHTMLAudio(this.songUrl);
    }

    this.notify();
    this.play();
  }

  public resetToDefault(): void {
    this.pause();
    this.lastKnownTime = 0;

    this.songUrl = DEFAULT_LOCAL_AUDIO_PATH;
    this.songName = RELATIONSHIP_CONFIG.songName;
    this.isCustom = false;

    if (Capacitor.isNativePlatform()) {
      NativeAudio.playSong({
        url: DEFAULT_LOCAL_AUDIO_PATH,
        title: RELATIONSHIP_CONFIG.songName,
        artist: RELATIONSHIP_CONFIG.coupleSignature
      });
      this.isPlaying = true;
      this.notify();
      return;
    }

    this.updateMediaSessionMetadata();

    if (this.ytPlayer) {
      try { this.ytPlayer.stopVideo(); } catch {}
    }
    this.initHTMLAudio(this.songUrl);

    this.notify();
    this.play();
  }

  public getState(): AudioPlayerState {
    return {
      isPlaying: this.isPlaying,
      duration: this.duration,
      isLoading: this.isLoading,
      hasError: this.hasError,
      isMuted: this.isMuted,
      isLooping: this.repeatMode !== 'off',
      repeatMode: this.repeatMode,
      songUrl: this.songUrl,
      songName: this.songName,
      isCustom: this.isCustom,
      isYouTube: Boolean(extractYouTubeId(this.songUrl)),
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
    this.subscribers.forEach((fn) => fn(state));
  }
}

// Global Singleton Instance
export const audioPlayer = new AudioPlayerService();
