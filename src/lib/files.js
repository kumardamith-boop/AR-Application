import { supabase, BUCKET, errText } from './supabase.js';

/** Shrink a phone photo to about 1600 px JPEG before upload. PDFs pass through. */
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  if (!file || !file.type.startsWith('image/')) return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bitmap.width, h = bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return blob || file;
}

export function newPath(prefix, ext = 'jpg') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}/${Date.now()}-${rand}.${ext}`;
}

export async function uploadFile(path, blob) {
  const contentType = blob.type || (path.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false });
  if (error) throw new Error('The photo could not be uploaded: ' + errText(error));
  return path;
}

const urlCache = new Map();
export async function signedUrl(path) {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) return null;
  urlCache.set(path, { url: data.signedUrl, until: Date.now() + 540000 });
  return data.signedUrl;
}

export async function downloadBlob(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(errText(error));
  return data;
}

export async function removeFiles(paths) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(errText(error));
}
