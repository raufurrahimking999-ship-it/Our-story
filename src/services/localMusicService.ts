import { DEFAULT_LOCAL_AUDIO_PATH, RELATIONSHIP_CONFIG } from '../config';

export interface SongItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  url: string;
  artwork?: string;
  isBuiltIn?: boolean;
}

export const BUILTIN_SONG: SongItem = {
  id: 'builtin-our-song',
  title: 'Our Special Song',
  artist: RELATIONSHIP_CONFIG.coupleSignature,
  album: 'Our Little Story',
  duration: 291,
  url: DEFAULT_LOCAL_AUDIO_PATH,
  isBuiltIn: true,
};

export const FALLBACK_LOCAL_SONGS: SongItem[] = [
  BUILTIN_SONG,
];

class LocalMusicService {
  private songs: SongItem[] = [...FALLBACK_LOCAL_SONGS];
  private permissionGranted: boolean = false;
  private subscribers = new Set<(songs: SongItem[]) => void>();

  constructor() {
    this.songs = [...FALLBACK_LOCAL_SONGS];
  }

  public async requestPermissionAndScan(): Promise<SongItem[]> {
    try {
      if (typeof window !== 'undefined') {
        const win = window as any;
        
        // Request Android permissions via Capacitor if available
        if (win.Capacitor && win.Capacitor.Plugins && win.Capacitor.Plugins.Permissions) {
          try {
            const permResult = await win.Capacitor.Plugins.Permissions.requestPermission({ name: 'audio' });
            if (permResult && (permResult.status === 'granted' || permResult.granted)) {
              this.permissionGranted = true;
            }
          } catch {
            this.permissionGranted = true;
          }
        } else {
          this.permissionGranted = true;
        }

        // Scan device MediaStore via native plugin if available
        if (win.Capacitor && win.Capacitor.Plugins && win.Capacitor.Plugins.LocalMusic) {
          try {
            const result = await win.Capacitor.Plugins.LocalMusic.getMusicLibrary();
            if (result && Array.isArray(result.songs) && result.songs.length > 0) {
              const nativeSongs: SongItem[] = result.songs.map((s: any, idx: number) => ({
                id: s.id || `native-${idx}`,
                title: s.title || 'Unknown Title',
                artist: s.artist || 'Unknown Artist',
                album: s.album || 'Unknown Album',
                duration: s.duration || 180,
                url: s.url || DEFAULT_LOCAL_AUDIO_PATH,
                artwork: s.artwork,
              }));

              if (!nativeSongs.some(s => s.url === DEFAULT_LOCAL_AUDIO_PATH)) {
                nativeSongs.unshift(BUILTIN_SONG);
              }
              this.songs = nativeSongs;
              this.notify();
              return this.songs;
            }
          } catch {}
        }
      }
    } catch {}

    this.songs = [...FALLBACK_LOCAL_SONGS];
    this.notify();
    return this.songs;
  }

  public getSongs(): SongItem[] {
    return this.songs;
  }

  public subscribe(callback: (songs: SongItem[]) => void) {
    this.subscribers.add(callback);
    callback(this.songs);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notify() {
    for (const cb of this.subscribers) {
      cb(this.songs);
    }
  }
}

export const localMusicService = new LocalMusicService();
