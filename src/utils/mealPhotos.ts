import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const PHOTO_DIR = `${FileSystem.documentDirectory}meal-photos/`;
const MAX_PHOTO_DIMENSION = 1600;
const PHOTO_QUALITY = 0.75;

export function getMealPhotoDirectory(): string {
  return PHOTO_DIR;
}

export async function deleteAllMealPhotos(): Promise<void> {
  await FileSystem.deleteAsync(PHOTO_DIR, { idempotent: true });
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
  }
}

/**
 * Persist a meal photo to app-private storage.
 * Returns the file URI, or null on failure (photo is non-critical).
 */
export async function saveMealPhoto(
  sourceUri: string,
  width: number,
  height: number,
): Promise<string | null> {
  let optimizedUri: string | null = null;
  try {
    await ensureDir();
    const uri = `${PHOTO_DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const resize = Math.max(width, height) > MAX_PHOTO_DIMENSION
      ? width >= height
        ? [{ resize: { width: MAX_PHOTO_DIMENSION } }]
        : [{ resize: { height: MAX_PHOTO_DIMENSION } }]
      : [];
    const optimized = await manipulateAsync(sourceUri, resize, {
      compress: PHOTO_QUALITY,
      format: SaveFormat.JPEG,
    });
    optimizedUri = optimized.uri;
    await FileSystem.copyAsync({ from: optimizedUri, to: uri });
    return uri;
  } catch (e) {
    console.error('[mealPhotos] save failed', e);
    return null;
  } finally {
    if (optimizedUri) {
      await FileSystem.deleteAsync(optimizedUri, { idempotent: true }).catch(() => {});
    }
  }
}

/**
 * Delete photo files no longer referenced by any meal row.
 * Runs at app init — deletes are never eager, so undo-restore stays safe.
 */
export async function cleanupOrphanMealPhotos(
  activeUris: string[],
  createdBefore = Number.POSITIVE_INFINITY,
): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(PHOTO_DIR);
    if (!info.exists) return;
    const active = new Set(activeUris);
    const files = await FileSystem.readDirectoryAsync(PHOTO_DIR);
    await Promise.all(
      files
        .filter((f) => {
          const createdAt = Number(f.split('-', 1)[0]);
          return !active.has(PHOTO_DIR + f)
            && (!Number.isFinite(createdAt) || createdAt < createdBefore);
        })
        .map((f) =>
          FileSystem.deleteAsync(PHOTO_DIR + f, { idempotent: true }).catch(() => {})
        )
    );
  } catch (e) {
    console.error('[mealPhotos] orphan cleanup failed', e);
  }
}
