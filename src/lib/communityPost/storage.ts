import { supabase } from '../supabase/client';

// First feature in this codebase to use Supabase Storage (grep confirmed zero
// prior usage) — every other "upload" so far has been either local-only
// (sparringVideo/storage.ts's filesystem save) or a base64 inline payload to
// Gemini (nutrition/aiPhotoAnalysis.ts). Community media needs a real,
// publicly-fetchable URL other users' feeds can render, so Storage is
// genuinely required here.

const BUCKET = 'community-media';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB

export type UploadMediaOutcome = { ok: true; url: string; path: string } | { ok: false; message: string };

function extFromFile(file: File): string {
  const fromName = file.name.split('.').pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return file.type.split('/')[1] ?? 'bin';
}

/** Uploads one image/video into the CURRENT user's own folder (`{userId}/...`) — the only path storage.objects RLS (0026_community_posts.sql) allows this user to write to. */
export async function uploadCommunityMedia(file: File, userId: string, kind: 'image' | 'video'): Promise<UploadMediaOutcome> {
  if (!supabase) return { ok: false, message: 'Supabase 설정이 필요합니다.' };
  const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > maxBytes) {
    return { ok: false, message: `파일이 너무 큽니다 (최대 ${Math.round(maxBytes / (1024 * 1024))}MB).` };
  }
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extFromFile(file)}`;
  try {
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) return { ok: false, message: error.message };
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { ok: true, url: data.publicUrl, path };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '업로드에 실패했습니다.' };
  }
}

/** Best-effort — called when the author deletes a post/media item; a failed delete never blocks the DB row delete (the row is the source of truth for what's "live", an orphaned Storage object is harmless). */
export async function deleteCommunityMedia(path: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // swallow — see above
  }
}
