package com.martialdex.testbuild;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * JS-facing bridge for BackgroundRecordingService — see that class for why a
 * real foreground Service (not the WebView's getUserMedia()) is what
 * actually makes "화면이 꺼져도/백그라운드에서도 촬영 계속" true. This plugin
 * only ever starts/stops/queries the service and relays its events back to
 * JS as plugin events (recordingStarted/recordingTick/recordingStopped/
 * recordingError) — it holds no camera state of its own.
 */
@CapacitorPlugin(
    name = "SparringCamera",
    permissions = {
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"),
        // Only actually requested/checked pre-Android-10 (see
        // needsLegacyStoragePermission() below) — API 29+'s scoped storage
        // lets an app insert into its own MediaStore collection without any
        // permission at all, and the manifest caps this permission at
        // maxSdkVersion="28" so it's simply inert on modern devices.
        @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage")
    }
)
public class SparringCameraPlugin extends Plugin implements BackgroundRecordingService.RecordingCallback {

    @Override
    public void load() {
        super.load();
        BackgroundRecordingService.setCallback(this);
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        super.checkPermissions(call);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        String[] aliases = needsNotificationPermission()
            ? new String[] { "camera", "microphone", "notifications" }
            : new String[] { "camera", "microphone" };
        requestPermissionForAliases(aliases, call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        checkPermissions(call);
    }

    private boolean needsNotificationPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU;
    }

    private boolean hasRecordingPermissions() {
        boolean cameraOk = getPermissionState("camera") == com.getcapacitor.PermissionState.GRANTED;
        boolean micOk = getPermissionState("microphone") == com.getcapacitor.PermissionState.GRANTED;
        boolean notifOk = !needsNotificationPermission() || getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED;
        return cameraOk && micOk && notifOk;
    }

    @PluginMethod
    public void startRecording(PluginCall call) {
        if (!hasRecordingPermissions()) {
            call.reject("카메라/마이크/알림 권한이 필요합니다. requestPermissions()를 먼저 호출하세요.");
            return;
        }
        String facing = call.getString("facing", "back");
        Intent intent = new Intent(getContext(), BackgroundRecordingService.class);
        intent.setAction(BackgroundRecordingService.ACTION_START);
        intent.putExtra(BackgroundRecordingService.EXTRA_FACING, facing);
        ContextCompat.startForegroundService(getContext(), intent);
        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void pauseRecording(PluginCall call) {
        sendAction(BackgroundRecordingService.ACTION_PAUSE);
        JSObject result = new JSObject();
        result.put("paused", true);
        call.resolve(result);
    }

    @PluginMethod
    public void resumeRecording(PluginCall call) {
        sendAction(BackgroundRecordingService.ACTION_RESUME);
        JSObject result = new JSObject();
        result.put("resumed", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        pendingStopCall = call;
        call.setKeepAlive(true);
        sendAction(BackgroundRecordingService.ACTION_STOP);
    }

    @PluginMethod
    public void discardRecording(PluginCall call) {
        pendingStopCall = call;
        call.setKeepAlive(true);
        sendAction(BackgroundRecordingService.ACTION_DISCARD);
    }

    private void sendAction(String action) {
        Intent intent = new Intent(getContext(), BackgroundRecordingService.class);
        intent.setAction(action);
        getContext().startService(intent);
    }

    /**
     * "갤러리에서 보기" on Android — the video was recorded straight into the
     * app's PRIVATE internal storage (getFilesDir()/sparring-videos/, see
     * BackgroundRecordingService.startCapture()), which the system Gallery/
     * Photos app never scans (Android sandboxes private app storage; nothing
     * short of copying the file into shared/MediaStore storage — explicitly
     * NOT done here, see storage preservation requirements — would make it
     * show up in the Gallery app's own grid). The closest honest equivalent
     * is handing a content:// URI (via the FileProvider already declared in
     * AndroidManifest.xml / res/xml/file_paths.xml) to an ACTION_VIEW intent
     * with a video MIME type, which the OS resolves to whatever video-
     * capable app is installed (Google Photos, a gallery app, VLC, ...) —
     * functionally "open and view this video," not "browse it inside the
     * Gallery app's library." Never copies/moves the file.
     */
    @PluginMethod
    public void openInGallery(PluginCall call) {
        launchViewIntent(call, "video/*", "동영상 앱에서 열기");
    }

    /**
     * "파일로 이동하기" on Android — there is no OS-level equivalent of
     * Finder/Explorer's "reveal in folder" for an app's own private storage
     * (no file manager can browse there; DocumentsUI only sees shared/
     * external storage). Best-effort approximation: same content:// URI, but
     * with a generic MIME type so the chooser also surfaces file-manager-
     * style apps (e.g. Files by Google) alongside viewers, rather than
     * biasing toward video players the way openInGallery does. Honestly
     * distinct from openInGallery in intent, even though neither can
     * literally "reveal in folder" on this platform.
     */
    @PluginMethod
    public void openFileLocation(PluginCall call) {
        launchViewIntent(call, "*/*", "파일 관리자에서 열기");
    }

    private void launchViewIntent(PluginCall call, String mimeType, String chooserTitle) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("파일 경로가 없습니다.");
            return;
        }
        // The OLDER recording path (getUserMedia + @capacitor/filesystem's
        // Filesystem.writeFile, still readable for videos saved before this
        // plugin existed) stores localUri with a "file://" scheme prefix;
        // the newer CameraX path (BackgroundRecordingService) stores a raw
        // absolute path. java.io.File doesn't understand the "file://"
        // scheme itself, so strip it here rather than requiring the JS side
        // to know which shape it's holding.
        if (filePath.startsWith("file://")) {
            filePath = filePath.substring("file://".length());
        }
        File file = new File(filePath);
        if (!file.exists()) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("message", "영상 파일을 찾을 수 없습니다.");
            call.resolve(result);
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent viewIntent = new Intent(Intent.ACTION_VIEW);
            viewIntent.setDataAndType(uri, mimeType);
            viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(viewIntent, chooserTitle);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        } catch (ActivityNotFoundException e) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("message", "이 작업을 처리할 수 있는 앱을 찾지 못했습니다.");
            call.resolve(result);
        } catch (Exception e) {
            // Never lets a permission/provider/storage issue crash the app —
            // always resolves with a clear ok:false instead of rejecting or
            // throwing across the JS bridge.
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("message", "파일을 여는 중 오류가 발생했습니다.");
            call.resolve(result);
        }
    }

    /**
     * "갤러리로 복사" — unlike openInGallery/openFileLocation above (which
     * never touch the file), this DELIBERATELY makes a COPY of the video
     * into the device's real, shared Gallery/Photos library (MediaStore's
     * Movies collection) so it actually appears in the system Gallery app's
     * own grid — the thing openInGallery explicitly could NOT do without
     * violating "never move/duplicate the original". The original file in
     * the app's private storage (and its 촬영 목록 entry) is left completely
     * untouched; this only ever ADDS a second, independent copy the user
     * explicitly asked for. Android only (see nativeCameraPlugin.ts/
     * gallery.ts — Electron has no comparable "device gallery" concept).
     */
    @PluginMethod
    public void saveToGallery(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("파일 경로가 없습니다.");
            return;
        }
        if (filePath.startsWith("file://")) {
            filePath = filePath.substring("file://".length());
        }
        File source = new File(filePath);
        if (!source.exists()) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("message", "영상 파일을 찾을 수 없습니다.");
            call.resolve(result);
            return;
        }

        if (needsLegacyStoragePermission() && getPermissionState("storage") != com.getcapacitor.PermissionState.GRANTED) {
            pendingGalleryFilePath = source.getAbsolutePath();
            call.setKeepAlive(true);
            requestPermissionForAlias("storage", call, "galleryPermissionCallback");
            return;
        }
        performSaveToGallery(call, source);
    }

    @PermissionCallback
    private void galleryPermissionCallback(PluginCall call) {
        String pendingPath = pendingGalleryFilePath;
        pendingGalleryFilePath = null;
        if (getPermissionState("storage") != com.getcapacitor.PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("message", "저장소 접근 권한이 없어 갤러리에 저장할 수 없습니다.");
            call.resolve(result);
            return;
        }
        if (pendingPath == null) {
            call.reject("저장할 파일 정보를 찾을 수 없습니다.");
            return;
        }
        performSaveToGallery(call, new File(pendingPath));
    }

    private boolean needsLegacyStoragePermission() {
        // Scoped storage (API 29+) allows inserting into the app's own
        // MediaStore collection with no permission at all — the runtime
        // check/request only matters below that.
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q;
    }

    private void performSaveToGallery(PluginCall call, File source) {
        String displayName = source.getName();
        String mimeType = displayName.toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/webm";
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveToGalleryScoped(source, displayName, mimeType);
            } else {
                saveToGalleryLegacy(source, displayName, mimeType);
            }
            // copyStreamWithProgress caps its own reports at 99% (finalizing
            // the MediaStore entry/media-scan still has to happen after the
            // last byte is written) — only report 100% once everything
            // above has actually returned successfully.
            JSObject doneProgress = new JSObject();
            doneProgress.put("filePath", source.getAbsolutePath());
            doneProgress.put("percent", 100);
            doneProgress.put("copiedBytes", source.length());
            doneProgress.put("totalBytes", source.length());
            notifyListeners("galleryProgress", doneProgress);

            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        } catch (IOException e) {
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("message", "갤러리에 저장하는 중 오류가 발생했습니다.");
            call.resolve(result);
        } catch (Exception e) {
            // Same "never let a storage/permission edge case crash the app"
            // discipline as launchViewIntent above.
            JSObject result = new JSObject();
            result.put("ok", false);
            result.put("message", "갤러리에 저장하는 중 예상치 못한 오류가 발생했습니다.");
            call.resolve(result);
        }
    }

    // API 29+: MediaStore.Video's own collection — IS_PENDING brackets the
    // write so no other app (including the Gallery app itself) sees a
    // partially-written file while the copy is still in progress.
    private void saveToGalleryScoped(File source, String displayName, String mimeType) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Video.Media.DISPLAY_NAME, displayName);
        values.put(MediaStore.Video.Media.MIME_TYPE, mimeType);
        values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/MARTIALDEX");
        values.put(MediaStore.Video.Media.IS_PENDING, 1);

        Uri collection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri itemUri = resolver.insert(collection, values);
        if (itemUri == null) throw new IOException("MediaStore insert returned null");

        try (OutputStream out = resolver.openOutputStream(itemUri); FileInputStream in = new FileInputStream(source)) {
            if (out == null) throw new IOException("openOutputStream returned null");
            copyStreamWithProgress(in, out, source);
        } catch (IOException e) {
            resolver.delete(itemUri, null, null); // don't leave a half-written/stuck-pending gallery entry behind
            throw e;
        }

        ContentValues doneValues = new ContentValues();
        doneValues.put(MediaStore.Video.Media.IS_PENDING, 0);
        resolver.update(itemUri, doneValues, null, null);
    }

    // Pre-Q fallback: write straight into the public Movies directory (needs
    // the "storage" permission requested above) and explicitly ask the
    // media scanner to index it — without this, older Android versions
    // won't show a newly-written file in the Gallery app until the next
    // full media scan (which could be a long time, or never).
    private void saveToGalleryLegacy(File source, String displayName, String mimeType) throws IOException {
        File moviesDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "MARTIALDEX");
        if (!moviesDir.exists() && !moviesDir.mkdirs()) {
            throw new IOException("Could not create " + moviesDir);
        }
        File dest = new File(moviesDir, displayName);
        try (FileInputStream in = new FileInputStream(source); FileOutputStream out = new FileOutputStream(dest)) {
            copyStreamWithProgress(in, out, source);
        }
        MediaScannerConnection.scanFile(getContext(), new String[] { dest.getAbsolutePath() }, new String[] { mimeType }, null);
    }

    // A sparring clip can be hundreds of MB to a few GB (spec: 60분+ 영상).
    // The original implementation used an 8KB buffer, which for a file that
    // size means hundreds of thousands of tiny read()/write() calls — most
    // of the real-world slowness reported ("복사가 너무 느리다") is exactly
    // that per-call JNI/syscall overhead, not raw disk/flash throughput. A
    // much larger buffer (1MB) cuts the call count by ~128x. This also
    // doubles as the progress-reporting granularity: JS gets a
    // "galleryProgress" event (see gallery.ts/SparringVideoList.tsx) every
    // time the whole-percent value changes, so "저장 중..." can show a real
    // number instead of leaving the user unsure whether it's still running.
    private static final int COPY_BUFFER_SIZE = 1024 * 1024;

    private void copyStreamWithProgress(InputStream in, OutputStream out, File source) throws IOException {
        long totalBytes = source.length();
        long copiedBytes = 0;
        int lastReportedPercent = -1;
        byte[] buffer = new byte[COPY_BUFFER_SIZE];
        int len;
        while ((len = in.read(buffer)) > 0) {
            out.write(buffer, 0, len);
            copiedBytes += len;
            if (totalBytes > 0) {
                int percent = (int) Math.min(99, (copiedBytes * 100) / totalBytes); // 100 only reported once the copy (incl. MediaStore finalize below) actually completes
                if (percent != lastReportedPercent) {
                    lastReportedPercent = percent;
                    JSObject data = new JSObject();
                    data.put("filePath", source.getAbsolutePath());
                    data.put("percent", percent);
                    data.put("copiedBytes", copiedBytes);
                    data.put("totalBytes", totalBytes);
                    notifyListeners("galleryProgress", data);
                }
            }
        }
    }

    private String pendingGalleryFilePath;

    // ---- BackgroundRecordingService.RecordingCallback — always runs on the main thread (see the service's use of ContextCompat.getMainExecutor) ----

    private PluginCall pendingStopCall;

    @Override
    public void onStarted() {
        notifyListeners("recordingStarted", new JSObject());
    }

    @Override
    public void onError(String message) {
        JSObject data = new JSObject();
        data.put("message", message);
        notifyListeners("recordingError", data);
        if (pendingStopCall != null) {
            pendingStopCall.reject(message);
            pendingStopCall = null;
        }
    }

    @Override
    public void onStopped(String filePath, long durationMs, boolean discarded, long fileSizeBytes) {
        if (pendingStopCall != null) {
            JSObject result = new JSObject();
            result.put("filePath", filePath);
            result.put("durationSeconds", Math.round(durationMs / 1000.0));
            result.put("discarded", discarded);
            result.put("fileSizeBytes", fileSizeBytes);
            pendingStopCall.resolve(result);
            pendingStopCall = null;
        } else {
            // Service was stopped some other way (e.g. process death recovery) — still surface it as an event so the UI doesn't hang.
            JSObject data = new JSObject();
            data.put("filePath", filePath);
            data.put("durationSeconds", Math.round(durationMs / 1000.0));
            data.put("discarded", discarded);
            data.put("fileSizeBytes", fileSizeBytes);
            notifyListeners("recordingStopped", data);
        }
    }

    @Override
    public void onTick(long elapsedMs) {
        JSObject data = new JSObject();
        data.put("elapsedMs", elapsedMs);
        notifyListeners("recordingTick", data);
    }
}
