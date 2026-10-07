package com.heartbeat.lovecounter;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(PermissionBridgePlugin.class);
        registerPlugin(NativeAudioPlugin.class);

        // Seamless transparent status bar & edge-to-edge immersive display
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window window = getWindow();
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(android.graphics.Color.TRANSPARENT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowCompat.setDecorFitsSystemWindows(window, false);
            } else {
                window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                );
            }
        }
    }
}

@CapacitorPlugin(
    name = "PermissionBridge",
    permissions = {
        @Permission(
            strings = { Manifest.permission.READ_MEDIA_AUDIO },
            alias = "audio33"
        ),
        @Permission(
            strings = { Manifest.permission.READ_EXTERNAL_STORAGE },
            alias = "audioLegacy"
        )
    }
)
class PermissionBridgePlugin extends Plugin {

    private String getRequiredAudioPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return Manifest.permission.READ_MEDIA_AUDIO;
        } else {
            return Manifest.permission.READ_EXTERNAL_STORAGE;
        }
    }

    @PluginMethod
    public void checkAudioPermission(PluginCall call) {
        JSObject ret = new JSObject();
        String permission = getRequiredAudioPermission();
        int result = ContextCompat.checkSelfPermission(getContext(), permission);

        String status = "prompt";
        if (result == PackageManager.PERMISSION_GRANTED) {
            status = "granted";
        } else {
            android.app.Activity activity = getActivity();
            if (activity != null && ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)) {
                status = "prompt";
            } else {
                status = "prompt";
            }
        }

        ret.put("status", status);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestAudioPermission(PluginCall call) {
        String permission = getRequiredAudioPermission();
        if (ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("audio33", call, "audioCallback");
        } else {
            requestPermissionForAlias("audioLegacy", call, "audioCallback");
        }
    }

    @PermissionCallback
    private void audioCallback(PluginCall call) {
        JSObject ret = new JSObject();
        String permission = getRequiredAudioPermission();
        boolean granted = ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not open settings", e);
        }
    }
}

@CapacitorPlugin(name = "NativeAudio")
class NativeAudioPlugin extends Plugin {

    @Override
    public void load() {
        super.load();

        // Listen for track changes & playback state changes from native ExoPlayer/MediaSession
        NativeAudioPlayerManager.setEventListener(new NativeAudioPlayerManager.PlaybackEventListener() {
            @Override
            public void onPlaybackStateChanged(boolean isPlaying, int playbackState) {
                notifyListeners("onStateChange", getStateObject());
            }

            @Override
            public void onTrackChanged(NativeAudioPlayerManager.SongInfo song, int index) {
                JSObject data = new JSObject();
                data.put("index", index);
                if (song != null) {
                    data.put("id", song.id);
                    data.put("title", song.title);
                    data.put("artist", song.artist);
                    data.put("album", song.album);
                    data.put("duration", song.duration);
                    data.put("url", song.url);
                    data.put("artwork", song.artwork);
                }
                notifyListeners("onTrackChange", data);
                notifyListeners("onStateChange", getStateObject());
            }

            @Override
            public void onPositionDiscontinuity() {
                notifyListeners("onStateChange", getStateObject());
            }
        });
    }

    private void ensureServiceStarted() {
        try {
            Context context = getContext();
            Intent serviceIntent = new Intent(context, AudioPlaybackService.class);
            context.startService(serviceIntent);
        } catch (Exception e) {
            android.util.Log.w("NativeAudio", "Could not start service directly: " + e.getMessage());
        }
    }

    private JSObject getStateObject() {
        JSObject ret = new JSObject();
        NativeAudioPlayerManager.SongInfo current = NativeAudioPlayerManager.getCurrentSong();

        ret.put("isPlaying", NativeAudioPlayerManager.isPlaying());
        ret.put("currentTime", NativeAudioPlayerManager.getCurrentPositionSec());
        ret.put("duration", NativeAudioPlayerManager.getDurationSec());
        ret.put("currentIndex", NativeAudioPlayerManager.getCurrentIndex());

        int rep = NativeAudioPlayerManager.getRepeatMode();
        String repStr = rep == 2 ? "one" : (rep == 1 ? "all" : "off");
        ret.put("repeatMode", repStr);
        ret.put("isShuffle", NativeAudioPlayerManager.isShuffle());

        if (current != null) {
            ret.put("url", current.url);
            ret.put("title", current.title);
            ret.put("artist", current.artist);
            ret.put("album", current.album);
            ret.put("artwork", current.artwork);
        } else {
            ret.put("url", "");
            ret.put("title", "");
            ret.put("artist", "");
            ret.put("album", "");
            ret.put("artwork", "");
        }
        return ret;
    }

    @PluginMethod
    public void scanDeviceAudio(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();
        JSArray songList = new JSArray();

        String permission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            ? Manifest.permission.READ_MEDIA_AUDIO
            : Manifest.permission.READ_EXTERNAL_STORAGE;

        if (ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED) {
            android.util.Log.w("NativeAudio", "Cannot scan device audio: permission not granted.");
            ret.put("songs", songList);
            call.resolve(ret);
            return;
        }

        ContentResolver resolver = context.getContentResolver();
        Uri uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        String[] projection = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.ALBUM_ID
        };

        // Query all music/audio tracks that are at least 5 seconds long (filtering out brief sound alerts)
        String selection = "(" + MediaStore.Audio.Media.IS_MUSIC + " != 0 " +
            " OR " + MediaStore.Audio.Media.MIME_TYPE + " LIKE 'audio/%' " +
            " OR " + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.mp3' " +
            " OR " + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.m4a' " +
            " OR " + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.flac' " +
            " OR " + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.wav' " +
            " OR " + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.aac' " +
            " OR " + MediaStore.Audio.Media.DISPLAY_NAME + " LIKE '%.ogg') " +
            " AND " + MediaStore.Audio.Media.DURATION + " >= 5000";

        String sortOrder = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";
        Cursor cursor = null;

        try {
            cursor = resolver.query(uri, projection, selection, null, sortOrder);
            if (cursor != null && cursor.moveToFirst()) {
                int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int displayNameCol = cursor.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME);
                int albumIdCol = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM_ID);

                do {
                    long id = cursor.getLong(idCol);
                    String title = cursor.getString(titleCol);
                    String artist = cursor.getString(artistCol);
                    String album = cursor.getString(albumCol);
                    long durationMs = cursor.getLong(durationCol);
                    String displayName = displayNameCol != -1 ? cursor.getString(displayNameCol) : null;
                    long albumId = albumIdCol != -1 ? cursor.getLong(albumIdCol) : -1;

                    if (title == null || title.trim().isEmpty() || title.equalsIgnoreCase("<unknown>")) {
                        if (displayName != null && !displayName.isEmpty()) {
                            title = displayName.replaceFirst("[.][^.]+$", "");
                        } else {
                            title = "Audio Track " + id;
                        }
                    }

                    if (artist == null || artist.trim().isEmpty() || artist.equalsIgnoreCase("<unknown>")) {
                        artist = "Device Audio";
                    }

                    if (album == null || album.trim().isEmpty() || album.equalsIgnoreCase("<unknown>")) {
                        album = "Local Music";
                    }

                    Uri contentUri = ContentUris.withAppendedId(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                        id
                    );

                    String artworkUri = "";
                    if (albumId > 0) {
                        artworkUri = "content://media/external/audio/albumart/" + albumId;
                    }

                    JSObject songObj = new JSObject();
                    songObj.put("id", "device-" + id);
                    songObj.put("title", title);
                    songObj.put("artist", artist);
                    songObj.put("album", album);
                    songObj.put("duration", durationMs > 0 ? (durationMs / 1000.0) : 0.0);
                    songObj.put("url", contentUri.toString());
                    songObj.put("artwork", artworkUri);

                    songList.put(songObj);
                } while (cursor.moveToNext());
            }
        } catch (Exception e) {
            android.util.Log.e("NativeAudio", "Error querying MediaStore: " + e.getMessage(), e);
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }

        ret.put("songs", songList);
        call.resolve(ret);
    }

    @PluginMethod
    public void setPlaylist(PluginCall call) {
        JSArray songsArray = call.getArray("songs");
        int initialIndex = call.getInt("initialIndex", 0);

        List<NativeAudioPlayerManager.SongInfo> list = new ArrayList<>();
        if (songsArray != null) {
            for (int i = 0; i < songsArray.length(); i++) {
                try {
                    JSONObject obj = songsArray.getJSONObject(i);
                    NativeAudioPlayerManager.SongInfo info = new NativeAudioPlayerManager.SongInfo(
                        obj.optString("id", ""),
                        obj.optString("title", "Unknown Title"),
                        obj.optString("artist", "Device Audio"),
                        obj.optString("album", "Local Music"),
                        obj.optDouble("duration", 0.0),
                        obj.optString("url", ""),
                        obj.optString("artwork", "")
                    );
                    list.add(info);
                } catch (Exception ignored) {}
            }
        }

        NativeAudioPlayerManager.setPlaylist(list, initialIndex);
        call.resolve();
    }

    @PluginMethod
    public void playSong(PluginCall call) {
        ensureServiceStarted();

        Integer index = call.getInt("index");
        if (index != null && index >= 0) {
            NativeAudioPlayerManager.playSongAtIndex(index);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
            return;
        }

        String url = call.getString("url");
        String title = call.getString("title", "Unknown Title");
        String artist = call.getString("artist", "Device Audio");
        String album = call.getString("album", "Local Music");
        Double duration = call.getDouble("duration", 0.0);
        String artwork = call.getString("artwork", "");
        String id = call.getString("id", "song-" + System.currentTimeMillis());

        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        NativeAudioPlayerManager.SongInfo song = new NativeAudioPlayerManager.SongInfo(
            id, title, artist, album, duration, url, artwork
        );
        NativeAudioPlayerManager.playSong(song);

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        NativeAudioPlayerManager.pause();
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        ensureServiceStarted();
        NativeAudioPlayerManager.resume();
        call.resolve();
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Double seconds = call.getDouble("seconds");
        if (seconds == null) {
            call.reject("seconds is required");
            return;
        }
        NativeAudioPlayerManager.seekTo((long) (seconds * 1000));
        call.resolve();
    }

    @PluginMethod
    public void next(PluginCall call) {
        ensureServiceStarted();
        NativeAudioPlayerManager.playNext();
        call.resolve();
    }

    @PluginMethod
    public void previous(PluginCall call) {
        ensureServiceStarted();
        NativeAudioPlayerManager.playPrevious();
        call.resolve();
    }

    @PluginMethod
    public void setRepeatMode(PluginCall call) {
        String mode = call.getString("mode", "all");
        int rep = 1;
        if ("one".equalsIgnoreCase(mode)) {
            rep = 2;
        } else if ("off".equalsIgnoreCase(mode)) {
            rep = 0;
        }
        NativeAudioPlayerManager.setRepeatMode(rep);
        call.resolve();
    }

    @PluginMethod
    public void setShuffle(PluginCall call) {
        Boolean shuffle = call.getBoolean("shuffle", false);
        NativeAudioPlayerManager.setShuffle(shuffle != null && shuffle);
        call.resolve();
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Double volume = call.getDouble("volume");
        if (volume != null) {
            NativeAudioPlayerManager.setVolume(volume.floatValue());
        }
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        call.resolve(getStateObject());
    }

    @PluginMethod
    public void stopPlayback(PluginCall call) {
        NativeAudioPlayerManager.release();
        call.resolve();
    }
}
