import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { describeMeal, DescribeResult } from '../services/foodScan';
import SlideModal from './SlideModal';
import PrimaryButton from './PrimaryButton';

interface DescribeSheetProps {
  visible: boolean;
  onClose: () => void;
  onResult: (result: DescribeResult) => void;
}

export default function DescribeSheet({ visible, onClose, onResult }: DescribeSheetProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText('');
      const t = setTimeout(() => inputRef.current?.focus(), 400);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const handleEstimate = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setLoading(true);
    try {
      const result = await describeMeal(trimmed);
      if (result) {
        setText('');
        onClose();
        setTimeout(() => onResult(result), 300);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SlideModal visible={visible} onClose={onClose}>
      <View className="px-5 pt-2 pb-8 gap-4">
        <Text className="text-m3-on-surface font-bold text-base">Describe your meal</Text>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder="e.g. chicken rice bowl with broccoli, about 500g"
          placeholderTextColor="#c4c6d0"
          multiline
          textAlignVertical="top"
          className="bg-m3-surface-container-high text-m3-on-surface text-sm rounded-xl px-4 py-3 border border-m3-outline-variant/50 min-h-[80px]"
        />
        <PrimaryButton title="Estimate" onPress={handleEstimate} loading={loading} />
      </View>
    </SlideModal>
  );
}
