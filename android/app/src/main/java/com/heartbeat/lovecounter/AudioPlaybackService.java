package com.heartbeat.lovecounter;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

public class AudioPlaybackService extends MediaSessionService {

    public static final String CHANNEL_ID = "media_playback_channel";

    @OptIn(markerClass = UnstableApi.class)
    @Override
    public void onCreate() {
        super.onCreate();

        createNotificationChannel();

        // Configure custom notification provider using our professional heart icon
        try {
            DefaultMediaNotificationProvider notificationProvider =
                new DefaultMediaNotificationProvider.Builder(getApplicationContext())
                    .setChannelId(CHANNEL_ID)
                    .setChannelName(R.string.media_notification_channel_name)
                    .setSmallIcon(R.drawable.ic_stat_heart)
                    .build();
            setMediaNotificationProvider(notificationProvider);
        } catch (Exception e) {
            android.util.Log.w("AudioPlaybackService", "Could not configure custom notification provider: " + e.getMessage());
        }

        // Initialize NativeAudioPlayerManager and bind the MediaSession
        NativeAudioPlayerManager.getMediaSession(this);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.media_notification_channel_name),
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Background audio playback controls");
                channel.setShowBadge(false);
                channel.setSound(null, null);
                channel.enableVibration(false);
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return NativeAudioPlayerManager.getMediaSession(this);
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        // If audio is actively playing, keep foreground playback running seamlessly!
        if (NativeAudioPlayerManager.isPlaying()) {
            return;
        }
        NativeAudioPlayerManager.release();
        stopSelf();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
    }
}
