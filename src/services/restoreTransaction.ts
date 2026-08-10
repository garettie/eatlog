interface RestoreTransactionSteps {
  captureSafetyCopy(): Promise<void>;
  replaceAndVerify(): Promise<void>;
  restoreSafetyCopy(): Promise<void>;
}

export async function executeRestoreTransaction(steps: RestoreTransactionSteps): Promise<void> {
  let safetyCopyReady = false;
  try {
    await steps.captureSafetyCopy();
    safetyCopyReady = true;
    await steps.replaceAndVerify();
  } catch (restoreError) {
    if (!safetyCopyReady) throw restoreError;
    try {
      await steps.restoreSafetyCopy();
    } catch (rollbackError) {
      throw new AggregateError(
        [restoreError, rollbackError],
        'Restore failed and Eatlog could not complete its automatic rollback.',
      );
    }
    throw restoreError;
  }
}
