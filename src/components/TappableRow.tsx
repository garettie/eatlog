import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface TappableRowProps {
  icon?: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}

export default function TappableRow({ icon, title, subtitle, selected, onPress }: TappableRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center p-7 rounded-2xl gap-4 ${
        selected
          ? 'bg-m3-surface-container-high border-2 border-white'
          : 'bg-m3-surface-container border border-m3-outline-variant/30'
      }`}
    >
      {icon && (
        <View className="shrink-0">
          <MaterialIcons
            name={icon}
            size={22}
            color={selected ? '#ffffff' : '#c4c6d0'}
          />
        </View>
      )}
      <View className="flex-1">
        <Text
          className={`font-semibold text-base ${
            selected ? 'text-white' : 'text-m3-on-surface'
          }`}
        >
          {title}
        </Text>
        <Text className="text-sm text-m3-on-surface-variant mt-0.5">{subtitle}</Text>
      </View>
      {selected ? (
        <View className="w-5 h-5 rounded-full bg-white items-center justify-center shrink-0 ml-3">
          <View className="w-2.5 h-2.5 rounded-full bg-black" />
        </View>
      ) : (
        <View className="w-5 h-5 rounded-full border-2 border-m3-outline shrink-0 ml-3" />
      )}
    </Pressable>
  );
}
