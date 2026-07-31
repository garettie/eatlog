import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { M3 } from '../theme/tokens';

interface TappableRowProps {
  icon?: keyof typeof MaterialIcons.glyphMap | keyof typeof MaterialCommunityIcons.glyphMap;
  /** Render icon from MaterialCommunityIcons instead of MaterialIcons. */
  community?: boolean;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}

export default function TappableRow({ icon, community, title, subtitle, selected, onPress }: TappableRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${title}: ${subtitle}`}
      accessibilityHint="Selects this option"
      accessibilityState={{ checked: selected }}
      className={`flex-row items-center p-7 rounded-2xl gap-4 border-2 active:opacity-80 ${
        selected
          ? 'bg-m3-surface-container-high border-m3-primary'
          : 'bg-m3-surface-container border-m3-outline-variant/30'
      }`}
    >
      {icon && (
        <View className="shrink-0">
          {community ? (
            <MaterialCommunityIcons
              name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
              size={22}
              color={selected ? M3.primary : M3.onSurfaceVariant}
            />
          ) : (
            <MaterialIcons
              name={icon as keyof typeof MaterialIcons.glyphMap}
              size={22}
              color={selected ? M3.primary : M3.onSurfaceVariant}
            />
          )}
        </View>
      )}
      <View className="flex-1">
        <Text
          className={`font-semibold text-base ${
            selected ? 'text-m3-primary' : 'text-m3-on-surface'
          }`}
        >
          {title}
        </Text>
        <Text className="text-sm text-m3-on-surface-variant mt-0.5">{subtitle}</Text>
      </View>
      {selected ? (
        <View className="w-5 h-5 rounded-full bg-m3-primary items-center justify-center shrink-0 ml-3">
          <View className="w-2.5 h-2.5 rounded-full bg-m3-on-primary" />
        </View>
      ) : (
        <View className="w-5 h-5 rounded-full border-2 border-m3-outline shrink-0 ml-3" />
      )}
    </Pressable>
  );
}
