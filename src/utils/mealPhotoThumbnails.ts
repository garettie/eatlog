import { useEffect, useMemo } from 'react';
import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { getMealPhotoThumbnailDirectory, mealPhotoThumbnailPath } from './mealPhotos';

/** Rails are 112dp wide and grow with the card; a 420px short side covers them at ~3x density. */
const THUMBNAIL_SHORT_SIDE = 420;
const THUMBNAIL_QUALITY = 0.8;

const ready = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
// One at a time: warming a month must not decode dozens of full photos at once.
let queue: Promise<unknown> = Promise.resolve();

function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

async function buildThumbnail(photoUri: string, target: string): Promise<string | null> {
  const info = await FileSystem.getInfoAsync(target);
  if (info.exists) return target;
  const { width, height } = await imageSize(photoUri);
  if (Math.min(width, height) <= THUMBNAIL_SHORT_SIDE) return photoUri;
  await FileSystem.makeDirectoryAsync(getMealPhotoThumbnailDirectory(), { intermediates: true }).catch(() => {});
  const resize = width <= height ? { width: THUMBNAIL_SHORT_SIDE } : { height: THUMBNAIL_SHORT_SIDE };
  const result = await manipulateAsync(photoUri, [{ resize }], {
    compress: THUMBNAIL_QUALITY,
    format: SaveFormat.JPEG,
  });
  await FileSystem.moveAsync({ from: result.uri, to: target });
  return target;
}

/** Resolves to a small copy of a stored meal photo, or null when none can be made. */
export function ensureMealPhotoThumbnail(photoUri: string): Promise<string | null> {
  const known = ready.get(photoUri);
  if (known) return Promise.resolve(known);
  const inFlight = pending.get(photoUri);
  if (inFlight) return inFlight;
  const target = mealPhotoThumbnailPath(photoUri);
  if (!target) return Promise.resolve(null);

  const task = queue
    .then(() => buildThumbnail(photoUri, target))
    .then((uri) => {
      if (uri) ready.set(photoUri, uri);
      return uri;
    })
    .catch(() => null) // A missing thumbnail only means the rail shows the full photo.
    .finally(() => pending.delete(photoUri));
  queue = task;
  pending.set(photoUri, task);
  return task;
}

export function warmMealPhotoThumbnails(photoUris: Iterable<string | null | undefined>): void {
  for (const uri of photoUris) {
    if (uri) void ensureMealPhotoThumbnail(uri);
  }
}

/**
 * The thumbnail when it is already built, otherwise the original photo while one is built for next
 * time. The source never switches under a mounted image, which would blank it while it reloads.
 */
export function useMealPhotoThumbnail(photoUri: string | null): string | null {
  const source = useMemo(() => (photoUri ? ready.get(photoUri) ?? photoUri : null), [photoUri]);
  useEffect(() => {
    if (photoUri && !ready.has(photoUri)) void ensureMealPhotoThumbnail(photoUri);
  }, [photoUri]);
  return source;
}
