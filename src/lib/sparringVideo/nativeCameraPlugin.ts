import { registerPlugin, Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { CameraFacing } from './types';

// TS-side mirror of android/app/src/main/java/com/martialdex/testbuild/
// SparringCameraPlugin.java — this is what actually makes background/
// screen-off recording work on Android: it drives a CameraX foreground
// Service that holds the camera hardware directly, instead of the
// getUserMedia()/MediaRecorder path in camera.ts, which the OS suspends the
// moment the app is backgrounded (a platform restriction, not a bug in this
// app's JS). Only registered/used on native Android — see
// isNativeAndroidRecordingAvailable() below, and the branch in
// SparringRecord.tsx that picks between this and camera.ts.
export interface SparringCameraPermissionStatus {
  camera: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
  microphone: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
  notifications: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
}

export interface SparringCameraStopResult {
  filePath: string | null;
  durationSeconds: number;
  discarded: boolean;
  fileSizeBytes: number;
}

export interface SparringCameraOpenResult {
  ok: boolean;
  message?: string;
}

export interface SparringCameraTickEvent {
  elapsedMs: number;
}

export interface SparringCameraErrorEvent {
  message: string;
}

export interface SparringCameraGalleryProgressEvent {
  filePath: string;
  /** 0-99 while copying (see SparringCameraPlugin.java's copyStreamWithProgress — capped below 100 until the MediaStore entry is actually finalized/media-scanned), then exactly 100 once saveToGallery's promise resolves ok. */
  percent: number;
  copiedBytes: number;
  totalBytes: number;
}

export interface SparringCameraPlugin {
  checkPermissions(): Promise<SparringCameraPermissionStatus>;
  requestPermissions(): Promise<SparringCameraPermissionStatus>;
  startRecording(options: { facing: 'front' | 'back' }): Promise<{ started: true }>;
  pauseRecording(): Promise<{ paused: true }>;
  resumeRecording(): Promise<{ resumed: true }>;
  stopRecording(): Promise<SparringCameraStopResult>;
  discardRecording(): Promise<SparringCameraStopResult>;
  /** ACTION_VIEW with a video MIME type via FileProvider — opens the clip in whatever video app the device has (Google Photos, a gallery app, VLC, ...). Never copies/moves the file; see SparringCameraPlugin.java's doc comment for why this — not literal Gallery-app-grid visibility — is the honest achievable equivalent for a file in app-private storage. */
  openInGallery(options: { filePath: string }): Promise<SparringCameraOpenResult>;
  /** Best-effort — Android has no OS-level "reveal in folder" for private app storage; this offers a broader app chooser (file-manager-capable apps included) than openInGallery's video-biased one. */
  openFileLocation(options: { filePath: string }): Promise<SparringCameraOpenResult>;
  /** Copies (never moves) the video into the device's real, shared Gallery/Photos library (MediaStore Movies collection) so it actually shows up in the Gallery app's own grid — the thing openInGallery explicitly can't do without touching the original. The app-internal original and its 촬영 목록 entry are left completely untouched. May prompt for a legacy storage permission on Android 9 and below (API 29+ needs none). */
  saveToGallery(options: { filePath: string }): Promise<SparringCameraOpenResult>;
  addListener(eventName: 'recordingStarted', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'recordingTick', listenerFunc: (event: SparringCameraTickEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'recordingError', listenerFunc: (event: SparringCameraErrorEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'recordingStopped', listenerFunc: (event: SparringCameraStopResult) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'galleryProgress', listenerFunc: (event: SparringCameraGalleryProgressEvent) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const SparringCamera = registerPlugin<SparringCameraPlugin>('SparringCamera');

/** True only on native Android — this plugin doesn't exist on iOS/web/Electron, which keep using the existing getUserMedia() path in camera.ts. */
export function isNativeAndroidRecordingAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function toNativeFacing(facing: CameraFacing): 'front' | 'back' {
  return facing === 'user' ? 'front' : 'back';
}
