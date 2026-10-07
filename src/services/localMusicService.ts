import { Capacitor, registerPlugin } from '@capacitor/core';

export interface SongItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  url: string;
  artwork?: string;
}

const STORAGE_CACHE_KEY = 'our_story_device_audio_cache';

interface NativeAudioPlugin {
  scanDeviceAudio(): Promise<{ songs: SongItem[] }>;
  setPlaylist(options: { songs: SongItem[]; initialIndex?: number }): Promise<void>;
}

const NativeAudio = registerPlugin<NativeAudioPlugin>('NativeAudio');

class LocalMusicService {
  private songs: SongItem[] = [];
  private subscribers = new Set<(songs: SongItem[]) => void>();
  private isScanning = false;

  constructor() {
    this.songs = this.loadCachedSongs();
  }

  private loadCachedSongs(): SongItem[] {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch {}
    return [];
  }

  private saveCachedSongs(list: SongItem[]) {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(list));
      }
    } catch {}
  }

  /**
   * Automatically scan device audio/music files from Android MediaStore
   */
  public async requestPermissionAndScan(): Promise<SongItem[]> {
    if (this.isScanning) {
      return this.songs;
    }

    this.isScanning = true;
    try {
      if (Capacitor.isNativePlatform()) {
        const scanResult = await NativeAudio.scanDeviceAudio();
        if (scanResult && Array.isArray(scanResult.songs)) {
          this.songs = scanResult.songs;
          this.saveCachedSongs(this.songs);
          this.notify();

          // Sync full playlist to Android native player manager
          try {
            await NativeAudio.setPlaylist({ songs: this.songs });
          } catch (e) {
            console.warn('Error setting playlist on native audio:', e);
          }

          return this.songs;
        }
      }
    } catch (e) {
      console.warn('Error querying native device audio:', e);
    } finally {
      this.isScanning = false;
    }

    // Return cached songs if scan failed or in non-native environment
    this.notify();
    return this.songs;
  }

  public getSongs(): SongItem[] {
    return this.songs;
  }

  public subscribe(callback: (songs: SongItem[]) => void): () => void {
    this.subscribers.add(callback);
    callback(this.songs);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notify() {
    for (const cb of this.subscribers) {
      try {
        cb(this.songs);
      } catch (e) {
        console.error('Error notifying localMusicService subscriber:', e);
      }
    }
  }
}

export const localMusicService = new LocalMusicService();
