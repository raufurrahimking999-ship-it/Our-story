package com.heartbeat.lovecounter;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class NativeAudioPlayerManager {

    public static class SongInfo {
        public String id = "";
        public String title = "Unknown Title";
        public String artist = "Local Music";
        public String album = "Local Album";
        public double duration = 0.0;
        public String url = "";
        public String artwork = "";

        public SongInfo() {}

        public SongInfo(String id, String title, String artist, String album, double duration, String url, String artwork) {
            this.id = id != null ? id : "";
            this.title = title != null ? title : "Unknown Title";
            this.artist = artist != null ? artist : "Local Music";
            this.album = album != null ? album : "Local Album";
            this.duration = duration;
            this.url = url != null ? url : "";
            this.artwork = artwork != null ? artwork : "";
        }
    }

    public interface PlaybackEventListener {
        void onPlaybackStateChanged(boolean isPlaying, int playbackState);
        void onTrackChanged(SongInfo song, int index);
        void onPositionDiscontinuity();
    }

    private static ExoPlayer player;
    private static MediaSession mediaSession;
    private static ForwardingPlayer forwardingPlayer;

    private static final List<SongInfo> playlist = new ArrayList<>();
    private static final List<Integer> shuffleIndices = new ArrayList<>();
    private static int shuffleCursor = -1;

    private static int currentIndex = -1;
    private static int repeatMode = 1; // 0 = off, 1 = all, 2 = one
    private static boolean isShuffle = false;

    private static SongInfo currentSong = null;
    private static PlaybackEventListener eventListener = null;

    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    public static void setEventListener(PlaybackEventListener listener) {
        eventListener = listener;
    }

    @OptIn(markerClass = UnstableApi.class)
    public static synchronized ExoPlayer getPlayer(Context context) {
        if (player == null) {
            final Context appContext = context.getApplicationContext();

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build();

            // Initialize singleton ExoPlayer with audio focus handling and local wake mode
            player = new ExoPlayer.Builder(appContext)
                .setAudioAttributes(audioAttributes, true) // Auto audio focus ducking/pausing for phone calls and other apps
                .setHandleAudioBecomingNoisy(true) // Auto-pause on headphone unplug
                .setWakeMode(C.WAKE_MODE_LOCAL) // Prevent Android OS from sleeping the audio thread
                .build();

            player.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int playbackState) {
                    if (playbackState == Player.STATE_ENDED) {
                        handleTrackEnded();
                    }
                    if (eventListener != null) {
                        eventListener.onPlaybackStateChanged(player != null && player.getPlayWhenReady(), playbackState);
                    }
                }

                @Override
                public void onIsPlayingChanged(boolean isPlaying) {
                    if (eventListener != null) {
                        eventListener.onPlaybackStateChanged(isPlaying, player != null ? player.getPlaybackState() : Player.STATE_IDLE);
                    }
                }

                @Override
                public void onPositionDiscontinuity(
                    Player.PositionInfo oldPosition,
                    Player.PositionInfo newPosition,
                    int reason
                ) {
                    if (eventListener != null) {
                        eventListener.onPositionDiscontinuity();
                    }
                }
            });

            // Wrap player with ForwardingPlayer so Next and Previous notification/lock-screen controls are always active
            forwardingPlayer = new ForwardingPlayer(player) {
                @Override
                public boolean isCommandAvailable(int command) {
                    if (command == COMMAND_SEEK_TO_NEXT || command == COMMAND_SEEK_TO_NEXT_MEDIA_ITEM
                        || command == COMMAND_SEEK_TO_PREVIOUS || command == COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM) {
                        return true;
                    }
                    return super.isCommandAvailable(command);
                }

                @Override
                public Commands getAvailableCommands() {
                    return super.getAvailableCommands().buildUpon()
                        .add(COMMAND_SEEK_TO_NEXT)
                        .add(COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                        .add(COMMAND_SEEK_TO_PREVIOUS)
                        .add(COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                        .build();
                }

                @Override
                public void seekToNext() {
                    playNext();
                }

                @Override
                public void seekToNextMediaItem() {
                    playNext();
                }

                @Override
                public void seekToPrevious() {
                    playPrevious();
                }

                @Override
                public void seekToPreviousMediaItem() {
                    playPrevious();
                }
            };
        }
        return player;
    }

    public static synchronized MediaSession getMediaSession(Context context) {
        if (mediaSession == null) {
            Context appContext = context.getApplicationContext();
            getPlayer(appContext);

            // Intent to open MainActivity when user taps the media notification
            Intent intent = new Intent(appContext, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                appContext,
                0,
                intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            );

            mediaSession = new MediaSession.Builder(appContext, forwardingPlayer)
                .setSessionActivity(pendingIntent)
                .build();
        }
        return mediaSession;
    }

    private static void runOnMainThread(Runnable action) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action.run();
        } else {
            mainHandler.post(action);
        }
    }

    public static void setPlaylist(List<SongInfo> newPlaylist, int initialIndex) {
        runOnMainThread(() -> {
            playlist.clear();
            if (newPlaylist != null) {
                playlist.addAll(newPlaylist);
            }
            rebuildShuffleIndices();
            if (initialIndex >= 0 && initialIndex < playlist.size()) {
                currentIndex = initialIndex;
                currentSong = playlist.get(currentIndex);
            }
        });
    }

    public static void setRepeatMode(int mode) {
        repeatMode = mode;
    }

    public static int getRepeatMode() {
        return repeatMode;
    }

    public static void setShuffle(boolean shuffle) {
        isShuffle = shuffle;
        if (isShuffle) {
            rebuildShuffleIndices();
        }
    }

    public static boolean isShuffle() {
        return isShuffle;
    }

    private static void rebuildShuffleIndices() {
        shuffleIndices.clear();
        for (int i = 0; i < playlist.size(); i++) {
            shuffleIndices.add(i);
        }
        if (isShuffle && playlist.size() > 1) {
            Collections.shuffle(shuffleIndices);
            // Ensure current playing song stays at the current cursor position
            if (currentIndex >= 0) {
                shuffleIndices.remove(Integer.valueOf(currentIndex));
                shuffleIndices.add(0, currentIndex);
                shuffleCursor = 0;
            }
        }
    }

    public static void playSongAtIndex(int index) {
        runOnMainThread(() -> {
            if (playlist.isEmpty()) return;
            if (index < 0 || index >= playlist.size()) return;

            currentIndex = index;
            SongInfo song = playlist.get(currentIndex);
            currentSong = song;

            if (isShuffle) {
                int pos = shuffleIndices.indexOf(currentIndex);
                if (pos >= 0) {
                    shuffleCursor = pos;
                }
            }

            playSongInternal(song);
        });
    }

    public static void playSong(SongInfo song) {
        runOnMainThread(() -> {
            if (song == null || song.url == null || song.url.isEmpty()) return;

            // Find in playlist if exists
            int foundIdx = -1;
            for (int i = 0; i < playlist.size(); i++) {
                if (playlist.get(i).url.equals(song.url) || (!song.id.isEmpty() && playlist.get(i).id.equals(song.id))) {
                    foundIdx = i;
                    break;
                }
            }

            if (foundIdx >= 0) {
                currentIndex = foundIdx;
                currentSong = playlist.get(foundIdx);
            } else {
                playlist.add(song);
                currentIndex = playlist.size() - 1;
                currentSong = song;
                rebuildShuffleIndices();
            }

            playSongInternal(currentSong);
        });
    }

    private static void playSongInternal(SongInfo song) {
        if (player == null) return;

        try {
            String resolvedUrl = song.url;
            if (resolvedUrl.startsWith("__capacitor_file_:///")) {
                resolvedUrl = "file://" + resolvedUrl.substring("__capacitor_file_:///".length() - 1);
            } else if (resolvedUrl.startsWith("/") && !resolvedUrl.startsWith("http")) {
                String cleanPath = resolvedUrl.startsWith("/") ? resolvedUrl.substring(1) : resolvedUrl;
                resolvedUrl = "asset:///public/" + cleanPath;
            }

            MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                .setTitle(song.title)
                .setArtist(song.artist)
                .setAlbumTitle(song.album);

            if (song.artwork != null && !song.artwork.isEmpty()) {
                try {
                    metaBuilder.setArtworkUri(Uri.parse(song.artwork));
                } catch (Exception ignored) {}
            }

            MediaItem mediaItem = new MediaItem.Builder()
                .setUri(resolvedUrl)
                .setMediaMetadata(metaBuilder.build())
                .build();

            player.setMediaItem(mediaItem);
            player.prepare();
            player.setPlayWhenReady(true);

            if (eventListener != null) {
                eventListener.onTrackChanged(song, currentIndex);
            }
        } catch (Exception e) {
            android.util.Log.e("NativeAudio", "Error playing song: " + e.getMessage(), e);
        }
    }

    public static void playNext() {
        runOnMainThread(() -> {
            if (playlist.isEmpty()) return;

            if (isShuffle && playlist.size() > 1) {
                shuffleCursor++;
                if (shuffleCursor >= shuffleIndices.size()) {
                    rebuildShuffleIndices();
                    shuffleCursor = 0;
                }
                int nextIdx = shuffleIndices.get(shuffleCursor);
                playSongAtIndex(nextIdx);
                return;
            }

            int nextIdx = (currentIndex + 1) % playlist.size();
            playSongAtIndex(nextIdx);
        });
    }

    public static void playPrevious() {
        runOnMainThread(() -> {
            if (playlist.isEmpty()) return;

            // If current position is greater than 3 seconds, restart current track
            if (player != null && player.getCurrentPosition() > 3000) {
                player.seekTo(0);
                return;
            }

            if (isShuffle && playlist.size() > 1) {
                shuffleCursor--;
                if (shuffleCursor < 0) {
                    shuffleCursor = shuffleIndices.size() - 1;
                }
                int prevIdx = shuffleIndices.get(shuffleCursor);
                playSongAtIndex(prevIdx);
                return;
            }

            int prevIdx = (currentIndex - 1 + playlist.size()) % playlist.size();
            playSongAtIndex(prevIdx);
        });
    }

    private static void handleTrackEnded() {
        if (repeatMode == 2) {
            // Repeat One: replay current track
            if (player != null) {
                player.seekTo(0);
                player.setPlayWhenReady(true);
            }
        } else if (repeatMode == 1) {
            // Repeat All: advance to next
            playNext();
        } else {
            // Repeat Off: if not at the end of playlist, advance, else stop
            if (isShuffle) {
                if (shuffleCursor < shuffleIndices.size() - 1) {
                    playNext();
                } else {
                    if (player != null) {
                        player.seekTo(0);
                        player.setPlayWhenReady(false);
                    }
                }
            } else {
                if (currentIndex < playlist.size() - 1) {
                    playNext();
                } else {
                    if (player != null) {
                        player.seekTo(0);
                        player.setPlayWhenReady(false);
                    }
                }
            }
        }
    }

    public static void pause() {
        runOnMainThread(() -> {
            if (player != null) {
                player.setPlayWhenReady(false);
            }
        });
    }

    public static void resume() {
        runOnMainThread(() -> {
            if (player != null) {
                if (player.getPlaybackState() == Player.STATE_IDLE && currentSong != null) {
                    playSongInternal(currentSong);
                } else {
                    player.setPlayWhenReady(true);
                }
            } else if (currentSong != null) {
                playSongInternal(currentSong);
            }
        });
    }

    public static void seekTo(long positionMs) {
        runOnMainThread(() -> {
            if (player != null) {
                player.seekTo(positionMs);
            }
        });
    }

    public static void setVolume(float volume) {
        runOnMainThread(() -> {
            if (player != null) {
                player.setVolume(volume);
            }
        });
    }

    public static SongInfo getCurrentSong() {
        return currentSong;
    }

    public static int getCurrentIndex() {
        return currentIndex;
    }

    public static boolean isPlaying() {
        return player != null && player.getPlayWhenReady();
    }

    public static double getCurrentPositionSec() {
        if (player == null) return 0.0;
        long pos = player.getCurrentPosition();
        return pos > 0 ? (pos / 1000.0) : 0.0;
    }

    public static double getDurationSec() {
        if (player == null) return currentSong != null ? currentSong.duration : 0.0;
        long dur = player.getDuration();
        if (dur > 0) {
            return dur / 1000.0;
        }
        return currentSong != null ? currentSong.duration : 0.0;
    }

    public static void release() {
        runOnMainThread(() -> {
            if (mediaSession != null) {
                mediaSession.release();
                mediaSession = null;
            }
            if (player != null) {
                player.release();
                player = null;
            }
            forwardingPlayer = null;
        });
    }
}
