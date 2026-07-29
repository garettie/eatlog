import React from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';

import { M3 } from '../theme/tokens';

interface MealPhotoViewerProps {
  uri: string | null;
  mealName: string;
  onClose: () => void;
}

export default function MealPhotoViewer({ uri, mealName, onClose }: MealPhotoViewerProps) {
  const reducedMotion = useReducedMotion();

  return (
    <Modal
      visible={uri != null}
      animationType={reducedMotion ? 'none' : 'fade'}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-black" edges={['top', 'bottom', 'left', 'right']}>
        <View className="min-h-[64px] flex-row items-center px-2">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
          >
            <MaterialIcons name="close" size={24} color={M3.onSurface} />
          </Pressable>
          <Text className="flex-1 mr-12 text-center text-m3-on-surface text-sm font-semibold" numberOfLines={1}>
            {mealName}
          </Text>
        </View>
        {uri && (
          <Image
            source={{ uri }}
            className="flex-1 w-full"
            resizeMode="contain"
            fadeDuration={0}
            accessibilityLabel={`${mealName} photo`}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}
