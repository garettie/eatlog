import * as FileSystem from 'expo-file-system/legacy';

const PHOTO_DIR = `${FileSystem.documentDirectory}meal-photos/`;

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
export async function saveMealPhoto(base64: string): Promise<string | null> {
  try {
    await ensureDir();
    const uri = `${PHOTO_DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return uri;
  } catch (e) {
    console.error('[mealPhotos] save failed', e);
    return null;
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
