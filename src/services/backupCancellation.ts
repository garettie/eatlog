export function assertBackupNotCancelled(signal?: Pick<AbortSignal, 'aborted'>): void {
  if (signal?.aborted) throw new Error('Operation cancelled.');
}
