package com.martialdex.testbuild;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.camera.core.CameraSelector;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FallbackStrategy;
import androidx.camera.video.FileOutputOptions;
import androidx.camera.video.PendingRecording;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.PermissionChecker;
import androidx.lifecycle.LifecycleService;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.util.UUID;
import java.util.concurrent.ExecutionException;

/**
 * Runs the ACTUAL sparring-recording camera capture, entirely independent of
 * the WebView. This is the piece that makes "화면이 꺼져도/백그라운드에서도
 * 촬영 계속" genuinely true rather than aspirational — a WebView's
 * getUserMedia() stream is suspended by Android itself the moment the app is
 * backgrounded (a platform media-session restriction no JavaScript can
 * override), but a proper camera-type foreground Service is explicitly the
 * OS-sanctioned way to keep camera hardware access alive under those same
 * conditions, same as any dash-cam/screen-recorder app.
 *
 * LifecycleService (not a plain Service) because CameraX's bindToLifecycle
 * requires a LifecycleOwner — this satisfies that without needing an
 * Activity around.
 */
public class BackgroundRecordingService extends LifecycleService {
    private static final String TAG = "SparringRecordingSvc";
    private static final String CHANNEL_ID = "sparring_recording";
    private static final int NOTIFICATION_ID = 4201;

    public static final String ACTION_START = "com.martialdex.testbuild.action.START_RECORDING";
    public static final String ACTION_PAUSE = "com.martialdex.testbuild.action.PAUSE_RECORDING";
    public static final String ACTION_RESUME = "com.martialdex.testbuild.action.RESUME_RECORDING";
    public static final String ACTION_STOP = "com.martialdex.testbuild.action.STOP_RECORDING";
    public static final String ACTION_DISCARD = "com.martialdex.testbuild.action.DISCARD_RECORDING";
    public static final String EXTRA_FACING = "facing"; // "front" | "back"

    /** Bridges service events back to the JS-facing plugin — both objects live in the same process, so a plain static callback is enough (no AIDL/Binder needed). */
    public interface RecordingCallback {
        void onStarted();
        void onError(String message);
        void onStopped(String filePath, long durationMs, boolean discarded, long fileSizeBytes);
        void onTick(long elapsedMs);
    }

    @Nullable private static RecordingCallback callback;
    public static void setCallback(@Nullable RecordingCallback cb) {
        callback = cb;
    }

    @Nullable private Recording activeRecording;
    @Nullable private File outputFile;
    private long recordingStartElapsedMs;
    private long pausedAccumMs;
    private long pausedAtElapsedMs = -1;
    private boolean isPaused;
    private final Handler tickHandler = new Handler(Looper.getMainLooper());
    private final Runnable tickRunnable = new Runnable() {
        @Override
        public void run() {
            if (activeRecording != null && callback != null) {
                long elapsed = SystemClock.elapsedRealtime() - recordingStartElapsedMs - pausedAccumMs;
                callback.onTick(elapsed);
            }
            tickHandler.postDelayed(this, 250);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "스파링 촬영",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("스파링 영상을 촬영하는 동안 표시됩니다.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        if (intent == null || intent.getAction() == null) return START_NOT_STICKY;

        switch (intent.getAction()) {
            case ACTION_START:
                startForeground(NOTIFICATION_ID, buildNotification("촬영 중"));
                startCapture(intent.getStringExtra(EXTRA_FACING));
                break;
            case ACTION_PAUSE:
                pause();
                break;
            case ACTION_RESUME:
                resume();
                break;
            case ACTION_STOP:
                stopCapture(false);
                break;
            case ACTION_DISCARD:
                stopCapture(true);
                break;
            default:
                break;
        }
        return START_NOT_STICKY;
    }

    private Notification buildNotification(String status) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MARTIALDEX 스파링 촬영")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE);
        Intent openApp = new Intent(this, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
        builder.setContentIntent(PendingIntent.getActivity(this, 0, openApp, flags));
        return builder.build();
    }

    private void updateNotification(String status) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || PermissionChecker.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) == PermissionChecker.PERMISSION_GRANTED) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(status));
        }
    }

    private void startCapture(@Nullable String facingExtra) {
        boolean useFront = "front".equals(facingExtra);
        if (ActivityCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA) != PermissionChecker.PERMISSION_GRANTED
            || ActivityCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) != PermissionChecker.PERMISSION_GRANTED) {
            reportErrorAndStop("카메라/마이크 권한이 없습니다.");
            return;
        }

        ListenableFuture<ProcessCameraProvider> providerFuture = ProcessCameraProvider.getInstance(this);
        providerFuture.addListener(() -> {
            try {
                ProcessCameraProvider cameraProvider = providerFuture.get();
                Recorder recorder = new Recorder.Builder()
                    .setQualitySelector(QualitySelector.from(Quality.HD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)))
                    .build();
                VideoCapture<Recorder> videoCapture = VideoCapture.withOutput(recorder);
                CameraSelector selector = useFront ? CameraSelector.DEFAULT_FRONT_CAMERA : CameraSelector.DEFAULT_BACK_CAMERA;

                cameraProvider.unbindAll();
                cameraProvider.bindToLifecycle(this, selector, videoCapture);

                File dir = new File(getFilesDir(), "sparring-videos");
                if (!dir.exists()) dir.mkdirs();
                outputFile = new File(dir, UUID.randomUUID().toString() + ".mp4");
                FileOutputOptions outputOptions = new FileOutputOptions.Builder(outputFile).build();

                PendingRecording pending = recorder.prepareRecording(this, outputOptions);
                if (ActivityCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) == PermissionChecker.PERMISSION_GRANTED) {
                    pending = pending.withAudioEnabled();
                }
                activeRecording = pending.start(ContextCompat.getMainExecutor(this), this::onVideoRecordEvent);

                recordingStartElapsedMs = SystemClock.elapsedRealtime();
                pausedAccumMs = 0;
                pausedAtElapsedMs = -1;
                isPaused = false;
                tickHandler.post(tickRunnable);
                if (callback != null) callback.onStarted();
            } catch (ExecutionException | InterruptedException e) {
                Log.e(TAG, "camera bind failed", e);
                reportErrorAndStop("카메라를 시작할 수 없습니다.");
            } catch (Exception e) {
                Log.e(TAG, "startCapture failed", e);
                reportErrorAndStop("촬영을 시작할 수 없습니다.");
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void onVideoRecordEvent(@NonNull VideoRecordEvent event) {
        if (event instanceof VideoRecordEvent.Finalize) {
            VideoRecordEvent.Finalize finalizeEvent = (VideoRecordEvent.Finalize) event;
            tickHandler.removeCallbacks(tickRunnable);
            long durationMs = SystemClock.elapsedRealtime() - recordingStartElapsedMs - pausedAccumMs;
            boolean hadError = finalizeEvent.hasError();
            String path = outputFile != null ? outputFile.getAbsolutePath() : null;
            // Read BEFORE any delete() below — this is the exact byte count
            // SparringVideo.fileSizeBytes ends up storing (service.ts's
            // saveNativeRecording), used by the 촬영 목록 file-size column and
            // nowhere else re-derived, so it must reflect the real finished file.
            long fileSizeBytes = outputFile != null && outputFile.exists() ? outputFile.length() : 0;
            activeRecording = null;

            boolean discarded = pendingDiscard;
            if (discarded && outputFile != null && outputFile.exists()) {
                //noinspection ResultOfMethodCallIgnored
                outputFile.delete();
            }

            if (hadError && !discarded && (outputFile == null || outputFile.length() == 0)) {
                if (callback != null) callback.onError("녹화 중 오류가 발생했습니다.");
            } else if (callback != null) {
                callback.onStopped(discarded ? null : path, durationMs, discarded, fileSizeBytes);
            }
            pendingDiscard = false;
            stopForeground(true);
            stopSelf();
        }
    }

    private boolean pendingDiscard = false;

    private void pause() {
        if (activeRecording != null && !isPaused) {
            activeRecording.pause();
            isPaused = true;
            pausedAtElapsedMs = SystemClock.elapsedRealtime();
            updateNotification("일시정지됨");
        }
    }

    private void resume() {
        if (activeRecording != null && isPaused) {
            activeRecording.resume();
            isPaused = false;
            if (pausedAtElapsedMs >= 0) pausedAccumMs += SystemClock.elapsedRealtime() - pausedAtElapsedMs;
            pausedAtElapsedMs = -1;
            updateNotification("촬영 중");
        }
    }

    private void stopCapture(boolean discard) {
        pendingDiscard = discard;
        if (activeRecording != null) {
            activeRecording.stop();
        } else {
            stopForeground(true);
            stopSelf();
        }
    }

    private void reportErrorAndStop(String message) {
        if (callback != null) callback.onError(message);
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        tickHandler.removeCallbacks(tickRunnable);
        super.onDestroy();
    }

    @Nullable
    @Override
    public android.os.IBinder onBind(Intent intent) {
        super.onBind(intent);
        return null; // never bound — controlled entirely via startService() actions
    }
}
