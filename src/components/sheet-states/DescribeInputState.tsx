import React, { useRef, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { describeMeal, DescribeResult } from '../../services/foodScan';
import { M3 } from '../../theme/tokens';
import PrimaryButton from '../PrimaryButton';

interface DescribeInputStateProps {
  onResult: (result: DescribeResult) => void;
  onCancel: () => void;
}

export default function DescribeInputState({ onResult, onCancel: _onCancel }: DescribeInputStateProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<typeof BottomSheetTextInput>(null);

  const handleEstimate = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setError(null);
    setLoading(true);
    try {
      const result = await describeMeal(trimmed);
      if (result) {
        setText('');
        onResult(result);
      } else {
        setError("Couldn't estimate this meal. Try a more specific description or enter manually.");
      }
    } catch {
      setError('Something went wrong. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheetScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-5 pt-2 pb-6 gap-4"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-m3-on-surface font-bold text-base">Describe your meal</Text>
        <Pressable onPress={_onCancel} accessibilityRole="button" accessibilityLabel="Cancel" className="p-1">
          <MaterialIcons name="close" size={20} color="#c4c6d0" />
        </Pressable>
      </View>
      <BottomSheetTextInput
        ref={inputRef as any}
        value={text}
        onChangeText={setText}
        placeholder="e.g. chicken rice bowl with broccoli, about 500g"
        placeholderTextColor={M3.placeholder}
        multiline
        textAlignVertical="top"
        className="bg-m3-surface-container-high text-m3-on-surface text-sm rounded-xl px-4 py-3 border border-m3-outline-variant/50 min-h-[80px]"
      />
      <PrimaryButton title="Estimate" onPress={handleEstimate} loading={loading} disabled={!text.trim()} />
      {error && (
        <View className="bg-m3-error-container rounded-xl px-4 py-3 gap-2">
          <Text className="text-m3-on-surface text-xs font-medium">{error}</Text>
          <Pressable onPress={handleEstimate} className="bg-m3-surface-container-high rounded-full px-4 py-2 self-start">
            <Text className="text-m3-on-surface text-xs font-semibold">Try again</Text>
          </Pressable>
        </View>
      )}
    </BottomSheetScrollView>
  );
}
