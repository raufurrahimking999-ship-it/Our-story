package com.heartbeat.lovecounter;

import android.content.Intent;
import androidx.annotation.Nullable;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

public class AudioPlaybackService extends MediaSessionService {
    @Override
    public void onCreate() {
        super.onCreate();
        // Force-initialize the native player manager to bind the media session
        NativeAudioPlayerManager.getMediaSession(this);
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return NativeAudioPlayerManager.getMediaSession(this);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        // Survive swiping away from Recent Apps
        // If music is actively playing, keep the foreground service running!
        androidx.media3.common.Player player = NativeAudioPlayerManager.getPlayer(this);
        if (player != null && player.getPlayWhenReady()) {
            return;
        }
        NativeAudioPlayerManager.release();
        stopSelf();
    }
}
