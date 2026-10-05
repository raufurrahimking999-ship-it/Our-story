package com.heartbeat.lovecounter;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * VaultStoragePlugin
 * 
 * Provides genuinely private internal storage for Memory Vault photos and videos.
 * - Stores files exclusively inside the app-private internal directory:
 *   /data/user/0/com.heartbeat.lovecounter/files/vault_media/
 * - Prevents Android MediaStore / Gallery indexing (sandboxed Linux UID + .nomedia).
 * - Never saves to DCIM, Pictures, Movies, Downloads, Music, or external storage.
 * - Verifies files immediately upon copying before confirming write.
 * - Provides web-servable URLs via Capacitor's local file bridge.
 */
@CapacitorPlugin(name = "VaultStorage")
public class VaultStoragePlugin extends Plugin {

    private File getVaultDirectory() {
        Context context = getContext();
        // Genuinely private internal files directory: context.getFilesDir()
        File vaultDir = new File(context.getFilesDir(), "vault_media");
        if (!vaultDir.exists()) {
            vaultDir.mkdirs();
        }

        // Add .nomedia file as secondary protection
        File noMedia = new File(vaultDir, ".nomedia");
        if (!noMedia.exists()) {
            try {
                noMedia.createNewFile();
            } catch (IOException ignored) {}
        }
        return vaultDir;
    }

    private String getLocalWebUrl(File file) {
        String localUrl = getBridge().getLocalUrl();
        if (localUrl != null && localUrl.endsWith("/")) {
            localUrl = localUrl.substring(0, localUrl.length() - 1);
        }
        return (localUrl != null ? localUrl : "") + "/_capacitor_file_" + file.getAbsolutePath();
    }

    @PluginMethod
    public void saveFileToVault(PluginCall call) {
        String uriStr = call.getString("uri");
        String base64Data = call.getString("base64Data");
        String rawFileName = call.getString("fileName", "vault_media");
        String mimeType = call.getString("mimeType");
        boolean isMove = Boolean.TRUE.equals(call.getBoolean("isMove", false));

        if (uriStr == null && base64Data == null) {
            call.reject("Neither URI nor Base64 data was provided");
            return;
        }

        try {
            File vaultDir = getVaultDirectory();

            // Extract or infer safe extension
            String ext = "";
            int dot = rawFileName.lastIndexOf('.');
            if (dot != -1) {
                ext = rawFileName.substring(dot).replaceAll("[^a-zA-Z0-9.]", "").toLowerCase();
            } else if (mimeType != null && mimeType.contains("/")) {
                String sub = mimeType.substring(mimeType.indexOf('/') + 1);
                ext = "." + sub.replaceAll("[^a-zA-Z0-9]", "").toLowerCase();
            }
            if (ext.isEmpty()) {
                ext = (mimeType != null && mimeType.startsWith("video")) ? ".mp4" : ".jpg";
            }

            String uniqueName = "vault_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8) + ext;
            File targetFile = new File(vaultDir, uniqueName);

            long totalBytes = 0;

            if (uriStr != null) {
                Uri sourceUri = Uri.parse(uriStr);
                ContentResolver resolver = getContext().getContentResolver();

                try (InputStream in = resolver.openInputStream(sourceUri);
                     OutputStream out = new FileOutputStream(targetFile)) {
                    if (in == null) {
                        call.reject("Could not open input stream from URI: " + uriStr);
                        return;
                    }
                    byte[] buffer = new byte[65536];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        totalBytes += read;
                    }
                    out.flush();
                }

                // If user explicitly chose Move (and only after verified byte copy), attempt removal of public original
                if (isMove && targetFile.exists() && targetFile.length() > 0) {
                    try {
                        resolver.delete(sourceUri, null, null);
                    } catch (Exception ignored) {}
                }
            } else {
                // Decode base64
                String cleanBase64 = base64Data;
                int commaIndex = cleanBase64.indexOf(',');
                if (commaIndex != -1) {
                    cleanBase64 = cleanBase64.substring(commaIndex + 1);
                }
                cleanBase64 = cleanBase64.replaceAll("\\s+", "");
                byte[] decodedBytes = Base64.decode(cleanBase64, Base64.NO_WRAP);

                try (FileOutputStream fos = new FileOutputStream(targetFile)) {
                    fos.write(decodedBytes);
                    fos.flush();
                }
                totalBytes = decodedBytes.length;
            }

            // Strict verification: Target file must exist and be non-empty
            if (!targetFile.exists() || targetFile.length() == 0) {
                if (targetFile.exists()) targetFile.delete();
                call.reject("Verification failed: Target private file is empty or was not created.");
                return;
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("verified", true);
            ret.put("fileName", uniqueName);
            ret.put("filePath", targetFile.getAbsolutePath());
            ret.put("webUrl", getLocalWebUrl(targetFile));
            ret.put("size", targetFile.length());
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("Failed to save media into private vault: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void deleteVaultFile(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("filePath is required");
            return;
        }

        try {
            File target = new File(filePath);
            File vaultDir = getVaultDirectory();

            // Strict canonical path validation to prevent path traversal
            if (!target.getCanonicalPath().startsWith(vaultDir.getCanonicalPath())) {
                call.reject("Cannot delete file outside private vault storage");
                return;
            }

            boolean deleted = false;
            if (target.exists()) {
                deleted = target.delete();
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("deleted", deleted);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error deleting vault file: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void deleteVaultFilesBatch(PluginCall call) {
        JSArray paths = call.getArray("filePaths");
        if (paths == null) {
            call.resolve(new JSObject().put("success", true));
            return;
        }

        try {
            File vaultDir = getVaultDirectory();
            String vaultCanonical = vaultDir.getCanonicalPath();

            for (int i = 0; i < paths.length(); i++) {
                String path = paths.getString(i);
                if (path != null && !path.isEmpty()) {
                    File file = new File(path);
                    if (file.getCanonicalPath().startsWith(vaultCanonical) && file.exists()) {
                        file.delete();
                    }
                }
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error deleting vault files batch: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void checkVaultFile(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("exists", false);
            call.resolve(ret);
            return;
        }

        try {
            File file = new File(filePath);
            File vaultDir = getVaultDirectory();
            boolean valid = file.getCanonicalPath().startsWith(vaultDir.getCanonicalPath()) && file.exists() && file.length() > 0;

            JSObject ret = new JSObject();
            ret.put("exists", valid);
            ret.put("size", valid ? file.length() : 0);
            ret.put("webUrl", valid ? getLocalWebUrl(file) : null);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("exists", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void pickAndImportMedia(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addCategory(Intent.CATEGORY_OPENABLE);

        startActivityForResult(call, intent, "pickerCallback");
    }

    @ActivityCallback
    private void pickerCallback(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject emptyRet = new JSObject();
            emptyRet.put("items", new JSArray());
            call.resolve(emptyRet);
            return;
        }

        Intent data = result.getData();
        List<Uri> uris = new ArrayList<>();

        if (data.getClipData() != null) {
            int count = data.getClipData().getItemCount();
            for (int i = 0; i < count; i++) {
                uris.add(data.getClipData().getItemAt(i).getUri());
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }

        if (uris.isEmpty()) {
            JSObject emptyRet = new JSObject();
            emptyRet.put("items", new JSArray());
            call.resolve(emptyRet);
            return;
        }

        File vaultDir = getVaultDirectory();
        JSArray itemsArray = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();

        for (Uri uri : uris) {
            try {
                String displayName = "media_" + System.currentTimeMillis();
                long originalSize = -1;
                String mimeType = resolver.getType(uri);

                try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (nameIndex != -1) {
                            displayName = cursor.getString(nameIndex);
                        }
                        int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (sizeIndex != -1) {
                            originalSize = cursor.getLong(sizeIndex);
                        }
                    }
                }

                String ext = "";
                int dot = displayName.lastIndexOf('.');
                if (dot != -1) {
                    ext = displayName.substring(dot).replaceAll("[^a-zA-Z0-9.]", "").toLowerCase();
                } else if (mimeType != null && mimeType.contains("/")) {
                    ext = "." + mimeType.substring(mimeType.indexOf('/') + 1).replaceAll("[^a-zA-Z0-9]", "").toLowerCase();
                }
                if (ext.isEmpty()) {
                    ext = (mimeType != null && mimeType.startsWith("video")) ? ".mp4" : ".jpg";
                }

                String uniqueName = "vault_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8) + ext;
                File targetFile = new File(vaultDir, uniqueName);

                try (InputStream in = resolver.openInputStream(uri);
                     OutputStream out = new FileOutputStream(targetFile)) {
                    if (in == null) continue;
                    byte[] buffer = new byte[65536];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                    }
                    out.flush();
                }

                // Verify
                if (!targetFile.exists() || targetFile.length() == 0) {
                    if (targetFile.exists()) targetFile.delete();
                    continue;
                }

                String type = (mimeType != null && mimeType.startsWith("video")) ? "video" : "image";

                JSObject item = new JSObject();
                item.put("name", displayName);
                item.put("type", type);
                item.put("size", targetFile.length());
                item.put("filePath", targetFile.getAbsolutePath());
                item.put("webUrl", getLocalWebUrl(targetFile));
                item.put("verified", true);

                itemsArray.put(item);
            } catch (Exception ex) {
                // Ignore individual file copy errors and continue with others
            }
        }

        JSObject ret = new JSObject();
        ret.put("items", itemsArray);
        call.resolve(ret);
    }
}
