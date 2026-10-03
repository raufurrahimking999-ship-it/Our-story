import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Repeat, Music2, X, SkipBack, SkipForward, ListMusic, Disc } from 'lucide-react';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { audioPlayer } from '../services/audioPlayerService';
import { localMusicService, SongItem } from '../services/localMusicService';

function formatAudioTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0 || !Number.isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const MusicPlayerCard: React.FC = () => {
  const {
    state,
    togglePlay,
    seek,
    toggleMute,
    toggleLoop,
    setSong,
  } = useAudioPlayer();

  const {
    isPlaying,
    duration,
    isMuted,
    isLooping,
    songName,
    songUrl,
  } = state;

  // Local music library state
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Request Android permissions & scan local music library on mount
  useEffect(() => {
    localMusicService.requestPermissionAndScan();
    const unsubscribe = localMusicService.subscribe((list) => {
      setSongs(list);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Find current song index in playlist
  const currentSongIndex = songs.findIndex((s) => s.url === songUrl || songName.includes(s.title));

  const handlePlayNext = () => {
    if (songs.length === 0) return;
    const nextIdx = currentSongIndex >= 0 ? (currentSongIndex + 1) % songs.length : 0;
    const nextSong = songs[nextIdx];
    if (nextSong) {
      setSong(nextSong.url, `${nextSong.title} — ${nextSong.artist}`);
    }
  };

  const handlePlayPrevious = () => {
    if (songs.length === 0) return;
    const prevIdx = currentSongIndex > 0 ? currentSongIndex - 1 : songs.length - 1;
    const prevSong = songs[prevIdx];
    if (prevSong) {
      setSong(prevSong.url, `${prevSong.title} — ${prevSong.artist}`);
    }
  };

  // Direct DOM element refs for 60fps/120fps updates (0 React re-renders per second)
  const trackContainerRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressKnobRef = useRef<HTMLDivElement>(null);
  const currentTimeSpanRef = useRef<HTMLSpanElement>(null);

  // Scratch mutable drag refs
  const isDraggingRef = useRef<boolean>(false);
  const dragTimeRef = useRef<number>(0);

  const validDuration = Number.isFinite(duration) && duration > 0 ? duration : 291.0;

  // Direct DOM updater helper
  const updateProgressDOM = (currentSec: number, totalDur: number) => {
    const validDur = totalDur > 0 ? totalDur : 291.0;
    const clampedSec = Math.max(0, Math.min(currentSec, validDur));
    const percent = Math.min(100, Math.max(0, (clampedSec / validDur) * 100));

    if (progressFillRef.current) {
      progressFillRef.current.style.width = `${percent}%`;
    }
    if (progressKnobRef.current) {
      progressKnobRef.current.style.left = `${percent}%`;
    }
    if (currentTimeSpanRef.current) {
      currentTimeSpanRef.current.textContent = formatAudioTime(clampedSec);
    }
  };

  // High-performance requestAnimationFrame loop running ONLY while playing
  useEffect(() => {
    let rafId: number | null = null;

    const tick = () => {
      if (!isDraggingRef.current) {
        const cur = audioPlayer.getCurrentTime();
        updateProgressDOM(cur, validDuration);
      }
      if (isPlaying) {
        rafId = requestAnimationFrame(tick);
      }
    };

    if (isPlaying) {
      rafId = requestAnimationFrame(tick);
    } else {
      const cur = audioPlayer.getCurrentTime();
      updateProgressDOM(cur, validDuration);
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }, [isPlaying, validDuration]);

  const computeTargetSecondsFromClientX = (clientX: number): number => {
    if (!trackContainerRef.current) return 0;
    const rect = trackContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * validDuration;
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDraggingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const targetSec = computeTargetSecondsFromClientX(e.clientX);
    dragTimeRef.current = targetSec;
    updateProgressDOM(targetSec, validDuration);
  };

  const handleTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();

    const targetSec = computeTargetSecondsFromClientX(e.clientX);
    dragTimeRef.current = targetSec;
    updateProgressDOM(targetSec, validDuration);
  };

  const handleTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    const finalTargetSec = computeTargetSecondsFromClientX(e.clientX);
    dragTimeRef.current = finalTargetSec;
    updateProgressDOM(finalTargetSec, validDuration);
    seek(finalTargetSec);
  };

  const handleTrackPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    seek(dragTimeRef.current);
    updateProgressDOM(dragTimeRef.current, validDuration);
  };

  const filteredSongs = songs.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.album.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full max-w-md px-2 relative">
      {/* Compact Glassmorphic Music Card */}
      <div className="glass-panel rounded-2xl p-3.5 sm:p-4 transition-all duration-300 relative overflow-hidden">
        {/* Subtle Ambient Backlight Glow inside Card while playing */}
        <div
          className={`absolute -top-12 -right-12 w-28 h-28 rounded-full bg-gradient-to-tr from-indigo-500/15 via-violet-600/10 to-indigo-400/10 blur-xl transition-opacity duration-1000 pointer-events-none ${
            isPlaying ? 'opacity-100 animate-pulse-glow' : 'opacity-0'
          }`}
        />

        {/* Top Header Row: Icon, Title & Controls */}
        <div className="flex items-center justify-between gap-2">
          {/* Left: Disc icon & Song meta */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Compact Spinning Disc Icon */}
            <div
              className={`relative w-8 h-8 rounded-full bg-slate-900/70 border border-white/[0.12] flex items-center justify-center shrink-0 shadow-inner transition-all duration-700 ${
                isPlaying
                  ? 'ring-1.5 ring-indigo-400/60 shadow-[0_0_14px_rgba(129,140,248,0.35)] animate-disc-glow'
                  : 'ring-1 ring-white/[0.08] shadow-none'
              }`}
            >
              <div
                className={`w-full h-full flex items-center justify-center transition-transform duration-700 ${
                  isPlaying ? 'animate-[spin_10s_linear_infinite]' : ''
                }`}
              >
                <Music2 className="w-3.5 h-3.5 text-indigo-200/90" />
              </div>
            </div>

            {/* Song Meta (Title + Playlist Button) */}
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsPlaylistModalOpen(true)}
                  className="text-xs sm:text-sm font-medium text-slate-100 truncate tracking-wide leading-tight text-left hover:text-indigo-200 transition-colors"
                  title="Open local music library playlist"
                >
                  {songName}
                </button>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span>{songs.length} local songs available</span>
              </div>
            </div>
          </div>

          {/* Right: Controls & Play/Pause */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Previous Song */}
            <button
              onClick={handlePlayPrevious}
              className="p-1.5 text-slate-300 hover:text-white transition-colors active:scale-95"
              title="Previous Song"
              aria-label="Previous Song"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            {/* Compact Play / Pause Button */}
            <button
              onClick={togglePlay}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-b from-indigo-500/30 to-violet-600/30 hover:from-indigo-500/40 hover:to-violet-600/40 border border-indigo-400/40 flex items-center justify-center text-white shadow-[0_0_12px_rgba(99,102,241,0.25)] active:scale-95 transition-all duration-150"
              aria-label={isPlaying ? 'Pause song' : 'Play song'}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current text-slate-100" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current text-slate-100 ml-0.5" />
              )}
            </button>

            {/* Next Song */}
            <button
              onClick={handlePlayNext}
              className="p-1.5 text-slate-300 hover:text-white transition-colors active:scale-95"
              title="Next Song"
              aria-label="Next Song"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Playlist Library Button */}
            <button
              onClick={() => setIsPlaylistModalOpen(true)}
              className="p-1.5 text-indigo-300 hover:text-indigo-200 transition-colors active:scale-95 ml-0.5"
              title="Open local music library"
              aria-label="Open local music library"
            >
              <ListMusic className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Slim, Elegant Progress Bar & Timestamps */}
        <div className="mt-2.5 space-y-1">
          {/* Synchronized Custom Progress Track Container */}
          <div
            ref={trackContainerRef}
            onPointerDown={handleTrackPointerDown}
            onPointerMove={handleTrackPointerMove}
            onPointerUp={handleTrackPointerUp}
            onPointerCancel={handleTrackPointerCancel}
            role="slider"
            aria-label="Seek progress"
            aria-valuemin={0}
            aria-valuemax={validDuration}
            tabIndex={0}
            className="relative w-full h-4 sm:h-5 flex items-center select-none cursor-pointer group touch-none"
          >
            {/* Background track line */}
            <div className="w-full h-1 sm:h-1.5 rounded-full bg-white/10 overflow-hidden relative pointer-events-none">
              <div
                ref={progressFillRef}
                className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-indigo-300 to-violet-400 will-change-[width]"
                style={{ width: '0%' }}
              />
            </div>

            {/* Round Progress Indicator Knob */}
            <div
              ref={progressKnobRef}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-slate-100 shadow-[0_0_8px_rgba(167,139,250,0.85)] border border-indigo-200 pointer-events-none transition-transform group-hover:scale-125 group-active:scale-125 will-change-[left]"
              style={{ left: '0%' }}
              aria-hidden="true"
            />
          </div>

          {/* Timestamp Indicators & Controls */}
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono tabular-nums px-0.5 pt-0.5 select-none">
            <span ref={currentTimeSpanRef}>00:00</span>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleMute}
                className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 active:scale-95"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX className="w-3 h-3 text-slate-400" />
                ) : (
                  <Volume2 className="w-3 h-3 text-indigo-300/80" />
                )}
              </button>
              <button
                onClick={toggleLoop}
                className={`p-0.5 transition-colors active:scale-95 ${
                  isLooping ? 'text-indigo-300' : 'text-slate-500 hover:text-slate-300'
                }`}
                aria-label="Toggle repeat"
                title={isLooping ? 'Repeat: On' : 'Repeat: Off'}
              >
                <Repeat className="w-3 h-3" />
              </button>
            </div>

            <span>{formatAudioTime(validDuration)}</span>
          </div>
        </div>
      </div>

      {/* Playlist / Local Music Library Modal */}
      {isPlaylistModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-digit-fade"
          onClick={() => setIsPlaylistModalOpen(false)}
        >
          <div
            className="glass-panel w-full max-w-lg rounded-2xl p-5 shadow-2xl border border-white/10 relative max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <Disc className="w-5 h-5 text-indigo-400 animate-spin-slow" />
                <div>
                  <h3 className="text-sm font-medium text-slate-100 tracking-wide">
                    Device Music Library
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    {songs.length} audio tracks available offline
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPlaylistModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                aria-label="Close library"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search filter input */}
            <div className="mt-3 shrink-0">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search songs, artists, albums..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/80 border border-white/10 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400/80 transition-colors"
              />
            </div>

            {/* Song List (Scrollable) */}
            <div className="mt-3 overflow-y-auto flex-1 space-y-1.5 pr-1 divide-y divide-white/[0.04]">
              {filteredSongs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No matching local songs found.
                </div>
              ) : (
                filteredSongs.map((song) => {
                  const isCurrent = song.url === songUrl || songName.includes(song.title);
                  return (
                    <div
                      key={song.id}
                      onClick={() => {
                        setSong(song.url, `${song.title} — ${song.artist}`);
                        setIsPlaylistModalOpen(false);
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                        isCurrent
                          ? 'bg-indigo-600/25 border border-indigo-400/40 shadow-inner'
                          : 'hover:bg-white/[0.06] border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isCurrent ? 'bg-indigo-500 text-white' : 'bg-white/10 text-indigo-300'
                        }`}>
                          <Music2 className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className={`text-xs font-medium truncate ${isCurrent ? 'text-indigo-200 font-semibold' : 'text-slate-200'}`}>
                            {song.title}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate">
                            {song.artist} {song.album ? `• ${song.album}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                          {formatAudioTime(song.duration)}
                        </span>
                        {isCurrent && isPlaying ? (
                          <span className="flex items-end gap-0.5 h-3 px-1">
                            <span className="w-0.5 h-full bg-indigo-400 animate-pulse" />
                            <span className="w-0.5 h-2/3 bg-indigo-300 animate-pulse delay-75" />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between shrink-0 text-[11px] text-slate-400">
              <span>Built-in & Local MediaStore</span>
              <button
                onClick={() => {
                  localMusicService.requestPermissionAndScan();
                }}
                className="text-indigo-300 hover:text-indigo-200 font-medium transition-colors"
              >
                Rescan Device Library
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
