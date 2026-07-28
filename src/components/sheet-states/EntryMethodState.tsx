import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { RecentMeal } from '../../db/database';

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
  recentMeals?: RecentMeal[];
  onSelectRecentMeal?: (meal: RecentMeal) => void;
}

export default function EntryMethodState({
  onCamera,
  onGallery,
  onDescribe,
  onSearch,
  recentMeals,
  onSelectRecentMeal,
}: EntryMethodStateProps) {
  const hasRecents = !!(recentMeals && recentMeals.length > 0 && onSelectRecentMeal);

  return (
    <View className="px-2 pt-1 pb-6">
      {hasRecents && (
        <View className="px-2 pb-3 gap-1.5">
          <Text className="text-[10px] text-m3-on-surface-variant font-semibold uppercase tracking-wider px-2">
            Recent
          </Text>
          {recentMeals!.slice(0, 3).map((meal) => (
            <Pressable
              key={meal.meal_id}
              onPress={() => onSelectRecentMeal!(meal)}
              accessibilityRole="button"
              accessibilityLabel={`Repeat ${meal.meal_name}`}
              className="flex-row items-center px-4 py-2.5 bg-m3-surface-container rounded-xl border border-m3-outline-variant/30 active:opacity-70"
            >
              <View className="flex-1 mr-3">
                <Text className="text-m3-on-surface text-sm font-medium" numberOfLines={1}>{meal.meal_name}</Text>
                <Text className="text-m3-on-surface-variant text-[10px] mt-0.5">
                  {meal.component_count} {meal.component_count === 1 ? 'item' : 'items'}
                </Text>
              </View>
              <Text className="tabular-nums text-xs font-semibold text-m3-on-surface-variant mr-2">
                {Math.round(meal.total_calories)} kcal
              </Text>
              <MaterialIcons name="replay" size={16} color="#c4c6d0" />
            </Pressable>
          ))}
          <View className="h-px bg-m3-outline-variant/30 mx-2 mt-1" />
        </View>
      )}

      <ActionRow icon="photo-camera" label="Camera" subtitle="Take a photo of food or a nutrition label" onPress={onCamera} />
      <View className="h-px bg-m3-outline-variant/30 mx-4" />
      <ActionRow icon="edit-note" label="Describe" subtitle="Type your meal for instant estimates" onPress={onDescribe} />
      <View className="h-px bg-m3-outline-variant/30 mx-4" />
      <ActionRow icon="photo-library" label="Gallery" subtitle="Use an existing photo" onPress={onGallery} />
      <View className="h-px bg-m3-outline-variant/30 mx-4" />
      <ActionRow icon="search" label="Search" subtitle="Look up food in database" onPress={onSearch} />
    </View>
  );
}