package com.heartbeat.lovecounter;

import android.content.Context;
import android.os.Looper;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;

public class NativeAudioPlayerManager {
    private static ExoPlayer player;
    private static MediaSession mediaSession;

    public static ExoPlayer getPlayer(Context context) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            // Safe fallback: if not on main thread, cannot initialize.
            // But we will access it strictly on the main thread.
            return player;
        }
        if (player == null) {
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build();

            player = new ExoPlayer.Builder(context.getApplicationContext())
                .setAudioAttributes(audioAttributes, true)
                .setHandleAudioBecomingNoisy(true)
                .build();
        }
        return player;
    }

    public static MediaSession getMediaSession(Context context) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            return mediaSession;
        }
        if (mediaSession == null) {
            ExoPlayer p = getPlayer(context);
            if (p != null) {
                mediaSession = new MediaSession.Builder(context.getApplicationContext(), p).build();
            }
        }
        return mediaSession;
    }

    public static void release() {
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
