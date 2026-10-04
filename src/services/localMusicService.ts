import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
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
  private subscribers = new Set<(songs: SongItem[]) => void>();

  constructor() {
    this.songs = [...FALLBACK_LOCAL_SONGS];
    this.loadCustomSavedSongs();
  }

  /**
   * Scan device storage directories for audio files using Filesystem API
   */
  public async requestPermissionAndScan(): Promise<SongItem[]> {
    try {
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        // Try reading common music directories on Android
        const scannedSongs: SongItem[] = [];
        const audioExtensions = ['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg'];

        const searchDirectories = [
          Directory.Documents,
          Directory.ExternalStorage,
        ];

        for (const dir of searchDirectories) {
          try {
            const dirResult = await Filesystem.readdir({
              path: '',
              directory: dir,
            });

            if (dirResult && dirResult.files) {
              for (const fileObj of dirResult.files) {
                const fileName = typeof fileObj === 'string' ? fileObj : fileObj.name;
                const lowerName = fileName.toLowerCase();

                if (audioExtensions.some(ext => lowerName.endsWith(ext))) {
                  try {
                    const getUriRes = await Filesystem.getUri({
                      directory: dir,
                      path: fileName,
                    });

                    const webPath = Capacitor.convertFileSrc(getUriRes.uri);
                    const cleanTitle = fileName.replace(/\.[^/.]+$/, '');

                    scannedSongs.push({
                      id: `scanned-${dir}-${fileName}`,
                      title: cleanTitle,
                      artist: 'Local Device Music',
                      album: 'Storage Track',
                      duration: 180,
                      url: webPath,
                      isBuiltIn: false,
                    });
                  } catch (e) {
                    console.warn('Error reading file URI:', e);
                  }
                }
              }
            }
          } catch (e) {
            console.warn(`Could not read directory ${dir}:`, e);
          }
        }

        if (scannedSongs.length > 0) {
          // Merge scanned songs with built-in song and user imported songs
          const customSaved = this.getSavedCustomSongs();
          const combined = [BUILTIN_SONG, ...customSaved];

          for (const s of scannedSongs) {
            if (!combined.some(existing => existing.id === s.id || existing.url === s.url)) {
              combined.push(s);
            }
          }

          this.songs = combined;
          this.notify();
          return this.songs;
        }
      }
    } catch (e) {
      console.warn('Error scanning native music library:', e);
    }

    // Fallback: Return built-in song + saved imported songs
    const customSaved = this.getSavedCustomSongs();
    this.songs = [BUILTIN_SONG, ...customSaved];
    this.notify();
    return this.songs;
  }

  /**
   * Import a local song file selected by the user
   */
  public async addCustomSongFile(file: File): Promise<SongItem> {
    const objectUrl = URL.createObjectURL(file);
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '');

    const newSong: SongItem = {
      id: `imported-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: cleanTitle,
      artist: 'Local Music',
      album: 'Imported Track',
      duration: 180,
      url: objectUrl,
      isBuiltIn: false,
    };

    this.songs = [...this.songs, newSong];
    this.saveCustomSongMeta(newSong);
    this.notify();
    return newSong;
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

  private saveCustomSongMeta(song: SongItem) {
    try {
      const saved = this.getSavedCustomSongs();
      saved.push(song);
      localStorage.setItem('our_story_imported_songs', JSON.stringify(saved));
    } catch {}
  }

  private getSavedCustomSongs(): SongItem[] {
    try {
      const raw = localStorage.getItem('our_story_imported_songs');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }

  private loadCustomSavedSongs() {
    const saved = this.getSavedCustomSongs();
    if (saved.length > 0) {
      this.songs = [BUILTIN_SONG, ...saved];
    }
  }

  private notify() {
    for (const cb of this.subscribers) {
      cb(this.songs);
    }
  }
}

export const localMusicService = new LocalMusicService();
