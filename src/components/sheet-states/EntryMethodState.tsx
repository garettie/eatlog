import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

interface ActionRowProps {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}

function ActionRow({ icon, label, subtitle, onPress, disabled }: ActionRowProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} className={`flex-row items-center gap-4 px-4 py-4 ${disabled ? 'opacity-50' : 'active:opacity-60'}`}>
      <View className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center">
        <MaterialIcons name={icon} size={22} color="#e2e2e9" />
      </View>
      <View className="flex-1">
        <Text className="text-m3-on-surface font-semibold text-sm">{label}</Text>
        <Text className="text-m3-on-surface-variant text-sm mt-0.5">{subtitle}</Text>
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
  onManualEntry: () => void;
  onWeight: () => void;
  estimatesAvailable: boolean;
}

export default function EntryMethodState({
  onCamera,
  onGallery,
  onDescribe,
  onSearch,
  onRecentFoods,
  onManualEntry,
  onWeight,
  estimatesAvailable,
}: EntryMethodStateProps) {
  const [otherWaysExpanded, setOtherWaysExpanded] = useState(false);
  return (
    <BottomSheetScrollView contentContainerClassName="px-2 pt-1 pb-6" showsVerticalScrollIndicator={false}>
      <ActionRow icon="photo-camera" label="Scan with camera" subtitle={estimatesAvailable ? 'Take a photo of food or a nutrition label' : 'Food estimates are unavailable in this build'} onPress={onCamera} disabled={!estimatesAvailable} />
      <View className="h-px bg-m3-outline-variant/30 mx-4" />
      <ActionRow icon="photo-library" label="Choose photo" subtitle={estimatesAvailable ? 'Use an existing meal photo' : 'Food estimates are unavailable in this build'} onPress={onGallery} disabled={!estimatesAvailable} />
      <View className="h-px bg-m3-outline-variant/30 mx-4" />
      <ActionRow icon="edit-note" label="Describe meal" subtitle={estimatesAvailable ? 'Type your meal for an estimate' : 'Food estimates are unavailable in this build'} onPress={onDescribe} disabled={!estimatesAvailable} />
      <View className="h-px bg-m3-outline-variant/30 mx-4" />
      <Pressable onPress={() => setOtherWaysExpanded((expanded) => !expanded)} accessibilityRole="button" accessibilityLabel="Other ways to log" accessibilityState={{ expanded: otherWaysExpanded }} className="min-h-[48px] flex-row items-center justify-between px-4">
        <Text className="text-m3-on-surface font-semibold text-sm">Other ways to log</Text>
        <MaterialIcons name={otherWaysExpanded ? 'expand-less' : 'expand-more'} size={22} color="#c4c6d0" />
      </Pressable>
      {otherWaysExpanded && <>
        <View className="h-px bg-m3-outline-variant/30 mx-4" />
        <ActionRow icon="history" label="Recent foods" subtitle="Search foods from your log" onPress={onRecentFoods} />
        <View className="h-px bg-m3-outline-variant/30 mx-4" />
        <ActionRow icon="search" label="Search foods" subtitle="Look up a food" onPress={onSearch} />
        <View className="h-px bg-m3-outline-variant/30 mx-4" />
        <ActionRow icon="edit" label="Enter manually" subtitle="Add nutrition yourself" onPress={onManualEntry} />
      </>}
      <View className="mx-4 mt-2 border-t border-m3-outline-variant/30 pt-2" />
      <ActionRow icon="monitor-weight" label="Log weight" subtitle="Add a check-in separately" onPress={onWeight} />
    </BottomSheetScrollView>
  );
}
