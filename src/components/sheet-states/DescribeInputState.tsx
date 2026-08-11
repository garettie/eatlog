import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';

import { describeMeal, DescribeResult } from '../../services/foodScan';
import { M3 } from '../../theme/tokens';
import PrimaryButton from '../PrimaryButton';
import SheetBackButton from './SheetBackButton';

interface DescribeInputStateProps {
  onResult: (result: DescribeResult) => void;
  onBack: () => void;
  onSearch: () => void;
  onManualEntry: () => void;
}

export default function DescribeInputState({ onResult, onBack, onSearch, onManualEntry }: DescribeInputStateProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<typeof BottomSheetTextInput>(null);
  const requestRef = useRef(0);

  useEffect(() => () => { requestRef.current++; }, []);

  const handleEstimate = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    const requestId = ++requestRef.current;
    setError(null);
    setLoading(true);
    try {
      const result = await describeMeal(trimmed);
      if (requestId !== requestRef.current) return;
      if (result.ok) {
        setText('');
        onResult(result.result);
      } else {
        setError(result.message);
      }
    } catch {
      if (requestId !== requestRef.current) return;
      setError('Something went wrong. Check your connection and try again.');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  return (
    <BottomSheetScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-5 pt-2 pb-6 gap-4"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1">
          <SheetBackButton onPress={() => { requestRef.current++; onBack(); }} />
          <Text className="text-m3-on-surface font-bold text-base">Describe your meal</Text>
        </View>
      </View>
      <BottomSheetTextInput
        ref={inputRef as any}
        value={text}
        onChangeText={setText}
        accessibilityLabel="Meal description"
        placeholder="e.g. chicken rice bowl with broccoli, about 500g"
        placeholderTextColor={M3.placeholder}
        multiline
        textAlignVertical="top"
        className="bg-m3-surface-container-high text-m3-on-surface text-sm rounded-xl px-4 py-3 border border-m3-outline-variant/50 min-h-[80px]"
      />
      <PrimaryButton title="Estimate" onPress={handleEstimate} loading={loading} disabled={!text.trim()} />
      {error && (
        <View className="bg-m3-error-container rounded-xl px-4 py-3 gap-2" accessibilityLiveRegion="assertive">
          <Text className="text-m3-on-error-container text-sm">{error}</Text>
          <Pressable onPress={handleEstimate} accessibilityRole="button" accessibilityLabel="Retry estimate" accessibilityHint="Tries the meal estimate again" className="min-h-[48px] bg-m3-surface-container-high rounded-full px-4 self-start justify-center">
            <Text className="text-m3-on-surface text-xs font-semibold">Retry</Text>
          </Pressable>
          <View className="flex-row gap-2">
            <Pressable onPress={onSearch} accessibilityRole="button" accessibilityLabel="Search foods" className="min-h-[48px] justify-center px-2"><Text className="text-m3-on-error-container text-xs font-semibold">Search foods</Text></Pressable>
            <Pressable onPress={onManualEntry} accessibilityRole="button" accessibilityLabel="Enter food manually" className="min-h-[48px] justify-center px-2"><Text className="text-m3-on-error-container text-xs font-semibold">Enter manually</Text></Pressable>
          </View>
        </View>
      )}
    </BottomSheetScrollView>
  );
}
