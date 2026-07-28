import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

interface ActionRowProps {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  subtitle: string;
  onPress: () => void;
}

function ActionRow({ icon, label, subtitle, onPress }: ActionRowProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-4 px-4 py-4 active:opacity-60">
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

interface EntryMethodStateProps {
  onCamera: () => void;
  onGallery: () => void;
  onDescribe: () => void;
  onSearch: () => void;
  onRecentFoods: () => void;
  onWeight: () => void;
}

export default function EntryMethodState({
  onCamera,
  onGallery,
  onDescribe,
  onSearch,
  onRecentFoods,
  onWeight,
}: EntryMethodStateProps) {
  return (
    <BottomSheetScrollView contentContainerClassName="px-2 pt-1 pb-6" showsVerticalScrollIndicator={false}>
      <ActionRow icon="history" label="Recent foods" subtitle="Search foods from your log" onPress={onRecentFoods} />
      <View className="h-px bg-m3-outline-variant/30 mx-4" />
      <ActionRow icon="photo-camera" label="Camera" subtitle="Take a photo of food or a nutrition label" onPress={onCamera} />
      <View className="h-px bg-m3-outline-variant/30 mx-4" />
      <ActionRow icon="edit-note" label="Describe" subtitle="Type your meal for instant estimates" onPress={onDescribe} />
      <View className="h-px bg-m3-outline-variant/30 mx-4" />
      <ActionRow icon="photo-library" label="Gallery" subtitle="Use an existing photo" onPress={onGallery} />
      <View className="h-px bg-m3-outline-variant/30 mx-4" />
      <ActionRow icon="search" label="Search" subtitle="Look up food in database" onPress={onSearch} />
      <View className="h-px bg-m3-outline-variant/30 mx-4" />
      <ActionRow icon="monitor-weight" label="Weight" subtitle="Log today or add a past check-in" onPress={onWeight} />
    </BottomSheetScrollView>
  );
}
