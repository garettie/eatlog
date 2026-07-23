import React, { forwardRef, useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

import { MealType, insertFoodLog } from '../db/database';
import { todayISO } from '../utils/calculations';

interface ManualEntrySheetProps {
  onLogComplete: () => void;
}

const MEALS: { label: string; value: MealType }[] = [
  { label: 'Breakfast', value: 'breakfast' },
  { label: 'Lunch', value: 'lunch' },
  { label: 'Dinner', value: 'dinner' },
  { label: 'Snack', value: 'snack' },
];

const ManualEntrySheet = forwardRef<BottomSheetModal, ManualEntrySheetProps>(
  ({ onLogComplete }, ref) => {
    const [name, setName] = useState('');
    const [calories, setCalories] = useState('');
    const [protein, setProtein] = useState('');
    const [carbs, setCarbs] = useState('');
    const [fat, setFat] = useState('');
    const [meal, setMeal] = useState<MealType>('lunch');
    const [logging, setLogging] = useState(false);

    const handleLog = useCallback(async () => {
      if (!name.trim()) return;
      const cal = parseFloat(calories) || 0;
      const pro = parseFloat(protein) || 0;
      const ca = parseFloat(carbs) || 0;
      const fa = parseFloat(fat) || 0;

      if (!cal && !pro && !ca && !fa) return;

      setLogging(true);
      try {
        await insertFoodLog({
          log_date: todayISO(),
          name: name.trim(),
          source: 'manual',
          meal,
          grams_logged: null,
          calories_per_100g: null,
          protein_g_per_100g: null,
          carbs_g_per_100g: null,
          fat_g_per_100g: null,
          calories: cal,
          protein_g: pro,
          carbs_g: ca,
          fat_g: fa,
        });
        setName('');
        setCalories('');
        setProtein('');
        setCarbs('');
        setFat('');
        onLogComplete();
      } finally {
        setLogging(false);
      }
    }, [name, calories, protein, carbs, fat, meal, onLogComplete]);

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={['70%']}
        backgroundStyle={{ backgroundColor: '#1d2024' }}
        handleIndicatorStyle={{ backgroundColor: '#44474f', width: 40 }}
        animationConfigs={{ duration: 300 }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetScrollView
          className="flex-1 px-5"
          contentContainerClassName="pb-6 gap-4"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-m3-on-surface font-bold text-base">Manual Entry</Text>

          {/* Name */}
          <View className="gap-1">
            <Text className="text-[9px] text-m3-on-surface-variant font-semibold uppercase tracking-wider">
              Food Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Homemade Chicken Soup"
              placeholderTextColor="#44474f"
              className="bg-m3-surface-container-high text-m3-on-surface font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50"
            />
          </View>

          {/* Calories */}
          <View className="gap-1">
            <Text className="text-[9px] text-m3-on-surface-variant font-semibold uppercase tracking-wider">
              Calories (kcal)
            </Text>
            <TextInput
              value={calories}
              onChangeText={setCalories}
              placeholder="0"
              placeholderTextColor="#44474f"
              keyboardType="numeric"
              className="bg-m3-surface-container-high text-m3-on-surface num-tabular font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50"
            />
          </View>

          {/* Protein, Carbs, Fat */}
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Text className="text-[9px] text-m3-protein font-semibold uppercase tracking-wider">Protein (g)</Text>
              <TextInput
                value={protein}
                onChangeText={setProtein}
                placeholder="0"
                placeholderTextColor="#44474f"
                keyboardType="numeric"
                className="bg-m3-surface-container-high text-m3-on-surface num-tabular font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-[9px] text-m3-carbs font-semibold uppercase tracking-wider">Carbs (g)</Text>
              <TextInput
                value={carbs}
                onChangeText={setCarbs}
                placeholder="0"
                placeholderTextColor="#44474f"
                keyboardType="numeric"
                className="bg-m3-surface-container-high text-m3-on-surface num-tabular font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-[9px] text-m3-fat font-semibold uppercase tracking-wider">Fat (g)</Text>
              <TextInput
                value={fat}
                onChangeText={setFat}
                placeholder="0"
                placeholderTextColor="#44474f"
                keyboardType="numeric"
                className="bg-m3-surface-container-high text-m3-on-surface num-tabular font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50"
              />
            </View>
          </View>

          {/* Meal Selector */}
          <View className="flex-row bg-m3-surface-container-high rounded-full p-0.5 self-start">
            {MEALS.map((m) => (
              <Pressable
                key={m.value}
                onPress={() => setMeal(m.value)}
                className={`px-3.5 py-1.5 rounded-full ${meal === m.value ? 'bg-m3-surface-container' : ''}`}
              >
                <Text
                  className={`text-[10px] font-semibold ${meal === m.value ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}
                >
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Log Button */}
          <Pressable
            onPress={handleLog}
            disabled={logging || !name.trim()}
            className="bg-white py-3 rounded-full items-center justify-center active:scale-95 mt-2"
          >
            {logging ? (
              <Text className="text-black font-semibold text-sm">Logging...</Text>
            ) : (
              <Text className="text-black font-semibold text-sm">Log Entry</Text>
            )}
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

ManualEntrySheet.displayName = 'ManualEntrySheet';
export default ManualEntrySheet;
