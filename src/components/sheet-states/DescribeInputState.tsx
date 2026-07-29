import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { describeMeal, DescribeResult } from '../../services/foodScan';
import { M3 } from '../../theme/tokens';
import PrimaryButton from '../PrimaryButton';

interface DescribeInputStateProps {
  onResult: (result: DescribeResult) => void;
  onCancel: () => void;
  onSearch: () => void;
  onManualEntry: () => void;
}

export default function DescribeInputState({ onResult, onCancel: _onCancel, onSearch, onManualEntry }: DescribeInputStateProps) {
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
        <Text className="text-m3-on-surface font-bold text-base">Describe your meal</Text>
        <Pressable
          onPress={() => { requestRef.current++; _onCancel(); }}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          className="w-12 h-12 items-center justify-center -mr-3 -my-3"
        >
          <MaterialIcons name="close" size={20} color="#c4c6d0" />
        </Pressable>
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
          <Text className="text-m3-on-error-container text-xs font-medium">{error}</Text>
          <Pressable onPress={handleEstimate} accessibilityRole="button" className="min-h-[48px] bg-m3-surface-container-high rounded-full px-4 self-start justify-center">
            <Text className="text-m3-on-surface text-xs font-semibold">Retry</Text>
          </Pressable>
          <View className="flex-row gap-2">
            <Pressable onPress={onSearch} accessibilityRole="button" className="min-h-[48px] justify-center px-2"><Text className="text-m3-on-error-container text-xs font-semibold">Search foods</Text></Pressable>
            <Pressable onPress={onManualEntry} accessibilityRole="button" className="min-h-[48px] justify-center px-2"><Text className="text-m3-on-error-container text-xs font-semibold">Enter manually</Text></Pressable>
          </View>
        </View>
      )}
    </BottomSheetScrollView>
  );
}
