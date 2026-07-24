import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

import SlideModal from './SlideModal';

interface QuickActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onCamera: () => void;
  onGallery: () => void;
  onDescribe: () => void;
}

function ActionOption({ icon, label, subtitle, onPress }: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  subtitle: string;
  onPress: () => void;
}) {
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

export default function QuickActionSheet({ visible, onClose, onCamera, onGallery, onDescribe }: QuickActionSheetProps) {
  const navigation = useNavigation<any>();

  const handleSearch = useCallback(() => {
    onClose();
    setTimeout(() => navigation.navigate('FoodSearch'), 200);
  }, [onClose, navigation]);

  const run = useCallback((fn: () => void) => {
    onClose();
    setTimeout(fn, 200);
  }, [onClose]);

  return (
    <SlideModal visible={visible} onClose={onClose}>
      <View className="px-2 pt-1 pb-6">
        <ActionOption icon="search" label="Search" subtitle="Look up food in USDA & Open Food Facts" onPress={handleSearch} />
        <View className="h-px bg-m3-outline-variant/30 mx-4" />
        <ActionOption icon="photo-camera" label="Camera" subtitle="Take a photo of food or a nutrition label" onPress={() => run(onCamera)} />
        <View className="h-px bg-m3-outline-variant/30 mx-4" />
        <ActionOption icon="photo-library" label="Gallery" subtitle="Use an existing photo" onPress={() => run(onGallery)} />
        <View className="h-px bg-m3-outline-variant/30 mx-4" />
        <ActionOption icon="edit-note" label="Describe" subtitle="Type your meal, AI estimates it" onPress={() => run(onDescribe)} />
        <View className="h-px bg-m3-outline-variant/30 mx-4" />
        <ActionOption icon="monitor-weight" label="Log Weight" subtitle="Record today's scale weight" onPress={onClose} />
      </View>
    </SlideModal>
  );
}
