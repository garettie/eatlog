import type React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { M3 } from '../../theme/tokens';
import { useResponsiveLayout } from '../../theme/layout';

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

interface MethodTileProps extends EntryActionProps {
  compact: boolean;
}

function MethodTile({ icon, label, hint, onPress, compact }: MethodTileProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      className={compact
        ? 'min-h-[72px] flex-1 flex-row items-center gap-2 px-2 active:opacity-60'
        : 'min-h-[72px] flex-1 flex-row items-center gap-3 px-4 active:opacity-60'}
    >
      <View className={compact
        ? 'h-9 w-9 items-center justify-center rounded-full bg-m3-surface-container-high'
        : 'h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container-high'}
      >
        <MaterialIcons name={icon} size={compact ? 18 : 20} color={M3.onSurfaceVariant} />
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
      <View className="h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container-high">
        <MaterialIcons name={icon} size={20} color={M3.onSurfaceVariant} />
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
  onContentHeightChange: (height: number) => void;
}

export default function EntryMethodState({
  onCamera,
  onGallery,
  onDescribe,
  onSearch,
  onRecentFoods,
  onWeight,
  estimatesAvailable,
  onContentHeightChange,
}: EntryMethodStateProps) {
  const { isNarrow } = useResponsiveLayout();

  return (
    <BottomSheetScrollView
      contentContainerClassName="px-5 pt-2 pb-6"
      showsVerticalScrollIndicator
      persistentScrollbar
      onContentSizeChange={(_width, height) => onContentHeightChange(height)}
    >
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
            <View className={isNarrow ? 'flex-row gap-2' : 'flex-row gap-3'}>
              <MethodTile
                icon="photo-library"
                label="Upload photo"
                hint="Choose an existing meal photo"
                onPress={onGallery}
                compact={isNarrow}
              />
              <MethodTile
                icon="edit-note"
                label="Describe meal"
                hint="Type your meal for an estimate"
                onPress={onDescribe}
                compact={isNarrow}
              />
            </View>
          </View>
        ) : (
          <View
            accessible
            accessibilityLabel="Photo and description estimates are unavailable. You can still use Recent meals or Search foods."
            className="flex-row items-start gap-2 rounded-xl bg-m3-surface-container-high px-3 py-3"
          >
            <MaterialIcons name="info-outline" size={18} color={M3.onSurfaceVariant} />
            <Text className="flex-1 text-sm text-m3-on-surface-variant">
              Photo and description estimates are unavailable. You can still use Recent meals or Search foods.
            </Text>
          </View>
        )}

        <View className="gap-2">
          <Text accessibilityRole="header" className="px-1 text-sm font-semibold text-m3-on-surface-variant">Quick log</Text>
          <View>
            <CompactActionRow icon="history" label="Recent meals" hint="Search meals from your log" onPress={onRecentFoods} />
            <View className="ml-[68px] mr-4 h-px bg-m3-outline-variant/50" />
            <CompactActionRow icon="search" label="Search foods" hint="Look up a food" onPress={onSearch} />
          </View>
        </View>

        <View className="border-t border-m3-outline-variant/50 pt-2">
          <CompactActionRow icon="monitor-weight" label="Log weight" hint="Add a check-in separately" onPress={onWeight} />
        </View>
      </View>
    </BottomSheetScrollView>
  );
}
