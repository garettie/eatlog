import type React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { M3 } from '../../theme/tokens';
import PrimaryButton from '../PrimaryButton';

interface EntryActionProps {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  hint: string;
  onPress: () => void;
}

function ActionRow({ icon, label, hint, onPress }: EntryActionProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      className="min-h-[52px] flex-row items-center gap-3 px-3 active:opacity-60"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-m3-surface-container-high">
        <MaterialIcons name={icon} size={20} color={M3.onSurfaceVariant} />
      </View>
      <Text className="flex-1 text-sm font-semibold text-m3-on-surface">{label}</Text>
      <MaterialIcons name="chevron-right" size={20} color={M3.onSurfaceVariant} />
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
  estimatesAvailable: boolean;
}

export default function EntryMethodState({
  onCamera,
  onGallery,
  onDescribe,
  onSearch,
  onRecentFoods,
  onWeight,
  estimatesAvailable,
}: EntryMethodStateProps) {
  return (
    <BottomSheetScrollView contentContainerClassName="px-5 pt-2 pb-6" showsVerticalScrollIndicator={false}>
      <View className="gap-4">
        <Text className="text-xl font-bold text-m3-on-surface">Add entry</Text>

        {estimatesAvailable ? (
          <View className="gap-2">
            <PrimaryButton
              title="Scan a meal"
              icon="photo-camera"
              iconPosition="left"
              accessibilityHint="Take a photo of food or a nutrition label"
              onPress={onCamera}
            />
            <View>
              <ActionRow
                icon="photo-library"
                label="Upload photo"
                hint="Choose an existing meal photo"
                onPress={onGallery}
              />
              <View className="ml-14 mr-3 h-px bg-m3-outline-variant/50" />
              <ActionRow
                icon="edit-note"
                label="Describe meal"
                hint="Type your meal for an estimate"
                onPress={onDescribe}
              />
            </View>
          </View>
        ) : (
          <View
            accessible
            accessibilityLabel="Food estimates are unavailable in this build. Recent meals and food search still work."
            className="flex-row items-start gap-2 rounded-xl bg-m3-surface-container-high px-3 py-3"
          >
            <MaterialIcons name="info-outline" size={18} color={M3.onSurfaceVariant} />
            <Text className="flex-1 text-sm text-m3-on-surface-variant">
              Food estimates are unavailable in this build. Recent meals and food search still work.
            </Text>
          </View>
        )}

        <View className="gap-1">
          <Text className="px-1 text-xs font-semibold text-m3-on-surface-variant">Quick log</Text>
          <View>
            <ActionRow icon="history" label="Recent meals" hint="Search meals from your log" onPress={onRecentFoods} />
            <View className="ml-14 mr-3 h-px bg-m3-outline-variant/50" />
            <ActionRow icon="search" label="Search foods" hint="Look up a food" onPress={onSearch} />
          </View>
        </View>

        <View className="border-t border-m3-outline-variant/50 pt-1">
          <ActionRow icon="monitor-weight" label="Log weight" hint="Add a check-in separately" onPress={onWeight} />
        </View>
      </View>
    </BottomSheetScrollView>
  );
}
