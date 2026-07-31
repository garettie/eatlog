import React from 'react';
import { Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { M3 } from '../../theme/tokens';

interface SheetBackButtonProps {
  onPress: () => void;
}

export default function SheetBackButton({ onPress }: SheetBackButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back"
      className="w-12 h-12 items-center justify-center -ml-2 active:opacity-60"
    >
      <MaterialIcons name="arrow-back" size={20} color={M3.onSurfaceVariant} />
    </Pressable>
  );
}
