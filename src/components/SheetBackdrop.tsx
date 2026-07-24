import React from 'react';
import { BottomSheetBackdrop, BottomSheetBackdropProps } from '@gorhom/bottom-sheet';

/**
 * Shared sheet backdrop — dimmed scrim, tap-to-dismiss.
 * Used by every BottomSheetModal so all sheets behave identically.
 */
export default function SheetBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.6}
      pressBehavior="close"
    />
  );
}
