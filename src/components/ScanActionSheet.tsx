import React, { forwardRef, useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import SheetBackdrop from './SheetBackdrop';

interface ScanActionSheetProps {
  onCamera: () => void;
  onGallery: () => void;
  onDescribe: () => void;
}

interface ActionRowProps {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  subtitle: string;
  onPress: () => void;
}

function ActionRow({ icon, label, subtitle, onPress }: ActionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-4 px-4 py-4 active:opacity-60"
    >
      <View className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center">
        <MaterialIcons name={icon} size={22} color="#e2e2e9" />
      </View>
      <View className="flex-1">
        <Text className="text-m3-on-surface font-semibold text-sm">{label}</Text>
        <Text className="text-m3-on-surface-variant text-xs mt-0.5">{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#c4c6d0" />
    </Pressable>
  );
}

const ScanActionSheet = forwardRef<BottomSheetModal, ScanActionSheetProps>(
  ({ onCamera, onGallery, onDescribe }, ref) => {
    const run = useCallback(
      (fn: () => void) => {
        (ref as React.RefObject<BottomSheetModal>).current?.dismiss();
        setTimeout(fn, 300);
      },
      [ref],
    );

    return (
      <BottomSheetModal
        ref={ref}
        backgroundStyle={{ backgroundColor: '#1d2024' }}
        handleIndicatorStyle={{ backgroundColor: '#44474f', width: 40 }}
        animationConfigs={{ duration: 300 }}
        backdropComponent={SheetBackdrop}
      >
        <BottomSheetView className="px-2 pt-1 pb-4">
          <ActionRow
            icon="photo-camera"
            label="Camera"
            subtitle="Take a photo of your food or label"
            onPress={() => run(onCamera)}
          />
          <View className="h-px bg-m3-outline-variant/30 mx-4" />
          <ActionRow
            icon="photo-library"
            label="Gallery"
            subtitle="Use an existing photo"
            onPress={() => run(onGallery)}
          />
          <View className="h-px bg-m3-outline-variant/30 mx-4" />
          <ActionRow
            icon="edit-note"
            label="Describe"
            subtitle="Type your meal, AI estimates it"
            onPress={() => run(onDescribe)}
          />
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

ScanActionSheet.displayName = 'ScanActionSheet';
export default ScanActionSheet;
