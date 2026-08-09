import type React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { M3 } from '../../theme/tokens';

interface EntryActionProps {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  hint: string;
  onPress: () => void;
}

function LeadAction({ icon, label, hint, onPress }: EntryActionProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      className="min-h-[56px] flex-row items-center justify-center gap-2.5 rounded-full bg-m3-primary px-5 active:opacity-90"
    >
      <MaterialIcons name={icon} size={20} color={M3.onPrimary} />
      <Text className="text-base font-bold text-m3-on-primary">{label}</Text>
    </Pressable>
  );
}

function MethodTile({ icon, label, hint, onPress }: EntryActionProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      className="min-h-[72px] flex-1 flex-row items-center gap-3 rounded-2xl border border-m3-outline-variant bg-m3-surface-container-high px-3 active:opacity-60"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-m3-surface-container-highest">
        <MaterialIcons name={icon} size={20} color={M3.onSurface} />
      </View>
      <Text className="min-w-0 flex-1 text-base font-semibold text-m3-on-surface">{label}</Text>
    </Pressable>
  );
}

function CompactActionRow({ icon, label, hint, onPress }: EntryActionProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      className="min-h-[56px] flex-row items-center gap-3 px-4 active:opacity-60"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container-highest">
        <MaterialIcons name={icon} size={20} color={M3.onSurface} />
      </View>
      <Text className="flex-1 text-base font-semibold text-m3-on-surface">{label}</Text>
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
        <Text accessibilityRole="header" className="text-xl font-bold text-m3-on-surface">Add entry</Text>

        {estimatesAvailable ? (
          <View className="gap-2">
            <LeadAction
              icon="photo-camera"
              label="Scan a meal"
              hint="Take a photo of food or a nutrition label"
              onPress={onCamera}
            />
            <View className="flex-row gap-3">
              <MethodTile
                icon="photo-library"
                label="Upload photo"
                hint="Choose an existing meal photo"
                onPress={onGallery}
              />
              <MethodTile
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

        <View className="gap-2">
          <Text accessibilityRole="header" className="px-1 text-sm font-semibold text-m3-on-surface-variant">Quick log</Text>
          <View className="overflow-hidden rounded-2xl border border-m3-outline-variant bg-m3-surface-container-high">
            <CompactActionRow icon="history" label="Recent meals" hint="Search meals from your log" onPress={onRecentFoods} />
            <View className="mx-4 h-px bg-m3-outline-variant" />
            <CompactActionRow icon="search" label="Search foods" hint="Look up a food" onPress={onSearch} />
          </View>
        </View>

        <View className="border-t border-m3-outline-variant pt-4">
          <View className="overflow-hidden rounded-2xl border border-m3-outline-variant bg-m3-surface-container-high">
            <CompactActionRow icon="monitor-weight" label="Log weight" hint="Add a check-in separately" onPress={onWeight} />
          </View>
        </View>
      </View>
    </BottomSheetScrollView>
  );
}
