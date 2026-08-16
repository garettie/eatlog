import { useState } from 'react';
import { Image, Keyboard, Text, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';

import { M3 } from '../../theme/tokens';
import PrimaryButton from '../PrimaryButton';
import SheetBackButton from './SheetBackButton';

interface PhotoMealTitleStateProps {
  photoUri: string;
  onEstimate: (mealTitle: string) => void;
  onBack: () => void;
}

export default function PhotoMealTitleState({
  photoUri,
  onEstimate,
  onBack,
}: PhotoMealTitleStateProps) {
  const [mealTitle, setMealTitle] = useState('');

  const handleEstimate = () => {
    Keyboard.dismiss();
    onEstimate(mealTitle.trim());
  };

  return (
    <BottomSheetScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-5 pt-2 pb-6 gap-4"
    >
      <View className="flex-row items-center gap-1">
        <SheetBackButton onPress={onBack} />
        <Text accessibilityRole="header" className="text-base font-bold text-m3-on-surface">
          Add meal title
        </Text>
      </View>

      <Image
        source={{ uri: photoUri }}
        resizeMode="cover"
        accessible
        accessibilityLabel="Selected meal photo"
        accessibilityIgnoresInvertColors
        className="h-40 w-full rounded-2xl bg-m3-surface-container-high"
      />

      <View className="gap-1">
        <Text className="text-sm font-semibold text-m3-on-surface">Help identify the dish</Text>
        <Text className="text-sm text-m3-on-surface-variant">
          A title gives the estimate context before the photo is sent.
        </Text>
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs font-semibold text-m3-on-surface-variant">Meal title</Text>
          <Text className="text-xs text-m3-on-surface-variant">Optional</Text>
        </View>
        <BottomSheetTextInput
          value={mealTitle}
          onChangeText={setMealTitle}
          onSubmitEditing={handleEstimate}
          accessibilityLabel="Meal title"
          accessibilityHint="Used with the photo to improve the first estimate"
          placeholder="e.g. Chicken adobo with rice"
          placeholderTextColor={M3.placeholder}
          maxLength={120}
          returnKeyType="done"
          className="min-h-[52px] rounded-xl border border-m3-outline-variant/50 bg-m3-surface-container-high px-4 text-sm font-semibold text-m3-on-surface"
        />
      </View>

      <PrimaryButton
        title="Estimate meal"
        icon="auto-awesome"
        iconPosition="left"
        accessibilityHint={mealTitle.trim()
          ? 'Sends the meal title and photo for an estimate'
          : 'Sends the photo for an estimate'}
        onPress={handleEstimate}
      />
    </BottomSheetScrollView>
  );
}
