package com.heartbeat.lovecounter;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import androidx.core.app.ActivityCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.getcapacitor.BridgeActivity;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(PermissionBridgePlugin.class);
        registerPlugin(NativeAudioPlugin.class);
        
        // Enable seamless transparent status bar & edge-to-edge immersive background display
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            android.view.Window window = getWindow();
            window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(android.graphics.Color.TRANSPARENT);
            
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                WindowCompat.setDecorFitsSystemWindows(window, false);
            } else {
                window.getDecorView().setSystemUiVisibility(
                    android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                    android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
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

    @PluginMethod
    public void checkAudioPermission(PluginCall call) {
        JSObject ret = new JSObject();
        String status = "prompt";
        android.app.Activity activity = getActivity();
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            int result = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_MEDIA_AUDIO);
            if (result == PackageManager.PERMISSION_GRANTED) {
                status = "granted";
            } else if (activity != null && ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.READ_MEDIA_AUDIO)) {
                status = "prompt";
            } else {
                status = "denied";
            }
        } else {
            int result = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE);
            if (result == PackageManager.PERMISSION_GRANTED) {
                status = "granted";
            } else if (activity != null && ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.READ_EXTERNAL_STORAGE)) {
                status = "prompt";
            } else {
                status = "denied";
            }
        }
        
        ret.put("status", status);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestAudioPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("audio33", call, "audioCallback");
        } else {
            requestPermissionForAlias("audioLegacy", call, "audioCallback");
        }
    }

    @PermissionCallback
    private void audioCallback(PluginCall call) {
        JSObject ret = new JSObject();
        boolean granted = false;
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            granted = getPermissionState("audio33") == com.getcapacitor.PermissionState.GRANTED;
        } else {
            granted = getPermissionState("audioLegacy") == com.getcapacitor.PermissionState.GRANTED;
        }
        
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
    private String currentUrl = "";
    private String currentTitle = "";
    private String currentArtist = "";

    @PluginMethod
    public void playSong(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "Our Special Song");
        String artist = call.getString("artist", "Our Little Story");

        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        currentUrl = url;
        currentTitle = title;
        currentArtist = artist;

        getBridge().getActivity().runOnUiThread(() -> {
            try {
                Context context = getContext();
                
                // Start background Media3 foreground service
                Intent serviceIntent = new Intent(context, AudioPlaybackService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }

                ExoPlayer player = NativeAudioPlayerManager.getPlayer(context);
                if (player == null) {
                    call.reject("Could not initialize ExoPlayer");
                    return;
                }

                // Resolve URLs (supports both __capacitor_file_ and relative assets URLs)
                String resolvedUrl = url;
                if (url.startsWith("__capacitor_file_:///")) {
                    resolvedUrl = "file://" + url.substring("__capacitor_file_:///".length() - 1);
                } else if (url.startsWith("/") || !url.startsWith("http")) {
                    String cleanPath = url;
                    if (cleanPath.startsWith("/")) {
                        cleanPath = cleanPath.substring(1);
                    }
                    resolvedUrl = "asset:///public/" + cleanPath;
                }

                // Setup Media Metadata for Notification Shade & Lockscreen
                MediaMetadata metadata = new MediaMetadata.Builder()
                    .setTitle(title)
                    .setArtist(artist)
                    .build();

                MediaItem mediaItem = new MediaItem.Builder()
                    .setUri(resolvedUrl)
                    .setMediaMetadata(metadata)
                    .build();

                player.setMediaItem(mediaItem);
                player.prepare();
                player.setPlayWhenReady(true);

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Error in native playback", e);
            }
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        getBridge().getActivity().runOnUiThread(() -> {
            ExoPlayer player = NativeAudioPlayerManager.getPlayer(getContext());
            if (player != null) {
                player.setPlayWhenReady(false);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void resume(PluginCall call) {
        getBridge().getActivity().runOnUiThread(() -> {
            ExoPlayer player = NativeAudioPlayerManager.getPlayer(getContext());
            if (player != null) {
                player.setPlayWhenReady(true);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Double seconds = call.getDouble("seconds");
        if (seconds == null) {
            call.reject("seconds is required");
            return;
        }

        getBridge().getActivity().runOnUiThread(() -> {
            ExoPlayer player = NativeAudioPlayerManager.getPlayer(getContext());
            if (player != null) {
                player.seekTo((long) (seconds * 1000));
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Double volume = call.getDouble("volume");
        if (volume == null) {
            call.reject("volume is required");
            return;
        }

        getBridge().getActivity().runOnUiThread(() -> {
            ExoPlayer player = NativeAudioPlayerManager.getPlayer(getContext());
            if (player != null) {
                player.setVolume(volume.floatValue());
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        getBridge().getActivity().runOnUiThread(() -> {
            ExoPlayer player = NativeAudioPlayerManager.getPlayer(getContext());
            JSObject ret = new JSObject();
            if (player == null) {
                ret.put("isPlaying", false);
                ret.put("currentTime", 0);
                ret.put("duration", 0);
                ret.put("url", "");
                ret.put("title", "");
                ret.put("artist", "");
                call.resolve(ret);
                return;
            }

            ret.put("isPlaying", player.getPlayWhenReady());
            ret.put("currentTime", player.getCurrentPosition() / 1000.0);
            
            double dur = player.getDuration() / 1000.0;
            if (dur < 0) {
                dur = 0;
            }
            ret.put("duration", dur);
            ret.put("url", currentUrl);
            ret.put("title", currentTitle);
            ret.put("artist", currentArtist);
            ret.put("isEnded", player.getPlaybackState() == Player.STATE_ENDED);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void stopPlayback(PluginCall call) {
        getBridge().getActivity().runOnUiThread(() -> {
            ExoPlayer player = NativeAudioPlayerManager.getPlayer(getContext());
            if (player != null) {
                player.stop();
            }
            NativeAudioPlayerManager.release();
            call.resolve();
        });
    }
}
