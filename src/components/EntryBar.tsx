import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { M3 } from '../theme/tokens';

interface EntryBarProps {
  onCamera: () => void;
  onGallery: () => void;
  onDescribe: () => void;
  onSearch: () => void;
}

export default function EntryBar({ onCamera, onGallery, onDescribe, onSearch }: EntryBarProps) {
  return (
    <View className="flex-row items-center justify-evenly bg-m3-surface-container border-t border-m3-outline-variant/30 px-4 py-3">
      <Pressable
        onPress={onCamera}
        className="items-center gap-1 px-3 active:opacity-60"
        accessibilityRole="button"
        accessibilityLabel="Log with camera"
      >
        <View className="w-10 h-10 rounded-full bg-white items-center justify-center">
          <MaterialIcons name="photo-camera" size={20} color={M3.onPrimary} />
        </View>
        <Text className="text-white text-[10px] font-semibold">Camera</Text>
      </Pressable>

      <Pressable
        onPress={onGallery}
        className="items-center gap-1 px-3 active:opacity-60"
        accessibilityRole="button"
        accessibilityLabel="Log from gallery"
      >
        <View className="w-10 h-10 rounded-full bg-m3-surface-container-high items-center justify-center">
          <MaterialIcons name="photo-library" size={20} color={M3.onSurface} />
        </View>
        <Text className="text-m3-on-surface-variant text-[10px] font-semibold">Gallery</Text>
      </Pressable>

      <Pressable
        onPress={onDescribe}
        className="items-center gap-1 px-3 active:opacity-60"
        accessibilityRole="button"
        accessibilityLabel="Describe a meal"
      >
        <View className="w-10 h-10 rounded-full bg-m3-surface-container-high items-center justify-center">
          <MaterialIcons name="edit-note" size={20} color={M3.onSurface} />
        </View>
        <Text className="text-m3-on-surface-variant text-[10px] font-semibold">Describe</Text>
      </Pressable>

      <Pressable
        onPress={onSearch}
        className="items-center gap-1 px-3 active:opacity-60"
        accessibilityRole="button"
        accessibilityLabel="Search food"
      >
        <View className="w-10 h-10 rounded-full bg-m3-surface-container-high items-center justify-center">
          <MaterialIcons name="search" size={20} color={M3.onSurface} />
        </View>
        <Text className="text-m3-on-surface-variant text-[10px] font-semibold">Search</Text>
      </Pressable>
    </View>
  );
}
