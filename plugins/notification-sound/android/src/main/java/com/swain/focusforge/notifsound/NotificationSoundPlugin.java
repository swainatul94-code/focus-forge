package com.swain.focusforge.notifsound;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.List;

/**
 * Capacitor's local-notifications plugin only accepts sounds bundled in
 * res/raw. This plugin fills the two gaps Focus Forge needs:
 *
 *  - importSound: copies an audio file (sent as base64 from the WebView's
 *    file picker) into the system MediaStore Notifications collection
 *    (Android 10+) or app-private storage exposed via FileProvider
 *    (Android 9 and lower), returning a content:// URI the system UI can read.
 *
 *  - createChannel: like the stock createChannel but additionally accepts an
 *    arbitrary content:// sound URI and a custom vibration pattern.
 */
@CapacitorPlugin(name = "NotificationSound")
public class NotificationSoundPlugin extends Plugin {

    @PluginMethod
    public void importSound(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("data (base64) is required");
            return;
        }
        String fileName = call.getString("fileName", "focusforge_custom.mp3");
        String mimeType = call.getString("mimeType", "audio/mpeg");
        String previousUri = call.getString("previousUri");
        Context ctx = getContext();
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);

            // best-effort cleanup of the previously imported sound
            if (previousUri != null && previousUri.startsWith("content://media")) {
                try {
                    ctx.getContentResolver().delete(Uri.parse(previousUri), null, null);
                } catch (Exception ignored) {}
            }

            Uri uri;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Audio.Media.DISPLAY_NAME, fileName);
                v.put(MediaStore.Audio.Media.MIME_TYPE, mimeType);
                v.put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_NOTIFICATIONS + "/FocusForge");
                v.put(MediaStore.Audio.Media.IS_NOTIFICATION, 1);
                v.put(MediaStore.Audio.Media.IS_PENDING, 1);
                Uri collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                uri = ctx.getContentResolver().insert(collection, v);
                if (uri == null) {
                    call.reject("MediaStore insert failed");
                    return;
                }
                try (OutputStream os = ctx.getContentResolver().openOutputStream(uri)) {
                    os.write(bytes);
                }
                v.clear();
                v.put(MediaStore.Audio.Media.IS_PENDING, 0);
                ctx.getContentResolver().update(uri, v, null, null);
            } else {
                File dir = new File(ctx.getFilesDir(), "sounds");
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, fileName);
                try (FileOutputStream fos = new FileOutputStream(f)) {
                    fos.write(bytes);
                }
                uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
                grantSystemRead(ctx, uri);
            }

            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Sound import failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void createChannel(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        if (Build.VERSION.SDK_INT < 26) {
            call.resolve(); // pre-Oreo: no channels; per-notification sound applies
            return;
        }
        Context ctx = getContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);

        Integer importance = call.getInt("importance");
        NotificationChannel ch = new NotificationChannel(
            id,
            call.getString("name", id),
            importance != null ? importance : NotificationManager.IMPORTANCE_HIGH
        );
        ch.setDescription(call.getString("description", ""));

        ch.enableVibration(true);
        JSArray vib = call.getArray("vibration");
        if (vib != null) {
            try {
                List<Object> items = vib.toList();
                long[] pattern = new long[items.size()];
                for (int i = 0; i < items.size(); i++) pattern[i] = ((Number) items.get(i)).longValue();
                ch.setVibrationPattern(pattern);
            } catch (Exception ignored) {}
        }

        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        String soundUri = call.getString("soundUri");
        String soundName = call.getString("soundName");
        if (soundUri != null) {
            Uri u = Uri.parse(soundUri);
            if (soundUri.startsWith("content://") && !soundUri.startsWith("content://media")) {
                grantSystemRead(ctx, u); // FileProvider grants do not survive reboot; refresh
            }
            ch.setSound(u, attrs);
        } else if (soundName != null) {
            String base = soundName.contains(".") ? soundName.substring(0, soundName.lastIndexOf('.')) : soundName;
            int resId = ctx.getResources().getIdentifier(base, "raw", ctx.getPackageName());
            if (resId != 0) {
                ch.setSound(Uri.parse("android.resource://" + ctx.getPackageName() + "/" + resId), attrs);
            }
        }
        // neither soundUri nor soundName -> channel keeps the system default sound

        nm.createNotificationChannel(ch);
        call.resolve();
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context ctx = getContext();
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Context ctx = getContext();
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + ctx.getPackageName()))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        call.resolve();
    }

    private static void grantSystemRead(Context ctx, Uri uri) {
        ctx.grantUriPermission("com.android.systemui", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        ctx.grantUriPermission("android", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
    }
}
