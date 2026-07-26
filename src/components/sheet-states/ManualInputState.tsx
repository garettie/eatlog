import React, { useCallback, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { MealType, insertFoodLog } from '../../db/database';
import { defaultMealForNow, todayISO } from '../../utils/calculations';
import MealSelector from '../MealSelector';
import PrimaryButton from '../PrimaryButton';

interface ManualInputStateProps {
  onLogComplete: (info: { logId: number; meal: MealType }) => void;
}

export default function ManualInputState({ onLogComplete }: ManualInputStateProps) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [meal, setMeal] = useState<MealType>(() => defaultMealForNow());
  const [logging, setLogging] = useState(false);

  const hasAnyMacro = [calories, protein, carbs, fat].some((v) => parseFloat(v) > 0);
  const canLog = name.trim().length > 0 && hasAnyMacro && !logging;

  const handleLog = useCallback(async () => {
    if (!name.trim()) return;
    const cal = parseFloat(calories) || 0;
    const pro = parseFloat(protein) || 0;
    const ca = parseFloat(carbs) || 0;
    const fa = parseFloat(fat) || 0;
    if (!cal && !pro && !ca && !fa) return;

    setLogging(true);
    try {
      const logId = await insertFoodLog({
        log_date: todayISO(), name: name.trim(), source: 'manual', meal,
        brand: null, data_type: 'manual', preparation: null, grams_logged: null,
        calories_per_100g: null, protein_g_per_100g: null, carbs_g_per_100g: null, fat_g_per_100g: null,
        calories: cal, protein_g: pro, carbs_g: ca, fat_g: fa,
      });
      setName(''); setCalories(''); setProtein(''); setCarbs(''); setFat('');
      onLogComplete({ logId, meal });
    } finally { setLogging(false); }
  }, [name, calories, protein, carbs, fat, meal, onLogComplete]);

  return (
    <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6 gap-4" keyboardShouldPersistTaps="handled">
      <Text className="text-m3-on-surface font-bold text-base">Manual Entry</Text>

      <View className="gap-1">
        <Text className="text-[10px] text-m3-on-surface-variant font-semibold uppercase tracking-wider">Food Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Homemade Chicken Soup" placeholderTextColor="#c4c6d0"
          className="bg-m3-surface-container-high text-m3-on-surface font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50" />
      </View>

      <View className="gap-1">
        <Text className="text-[10px] text-m3-on-surface-variant font-semibold uppercase tracking-wider">Calories (kcal)</Text>
        <TextInput value={calories} onChangeText={setCalories} placeholder="0" placeholderTextColor="#c4c6d0" keyboardType="numeric"
          className="bg-m3-surface-container-high text-m3-on-surface num-tabular font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50" />
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-[10px] text-m3-protein font-semibold uppercase tracking-wider">Protein (g)</Text>
          <TextInput value={protein} onChangeText={setProtein} placeholder="0" placeholderTextColor="#c4c6d0" keyboardType="numeric"
            className="bg-m3-surface-container-high text-m3-on-surface num-tabular font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50" />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-[10px] text-m3-carbs font-semibold uppercase tracking-wider">Carbs (g)</Text>
          <TextInput value={carbs} onChangeText={setCarbs} placeholder="0" placeholderTextColor="#c4c6d0" keyboardType="numeric"
            className="bg-m3-surface-container-high text-m3-on-surface num-tabular font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50" />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-[10px] text-m3-fat font-semibold uppercase tracking-wider">Fat (g)</Text>
          <TextInput value={fat} onChangeText={setFat} placeholder="0" placeholderTextColor="#c4c6d0" keyboardType="numeric"
            className="bg-m3-surface-container-high text-m3-on-surface num-tabular font-medium text-sm rounded-xl px-4 py-2.5 border border-m3-outline-variant/50" />
        </View>
      </View>

      <MealSelector value={meal} onChange={setMeal} />

      <View className="mt-2">
        <PrimaryButton title="Log Entry" onPress={handleLog} loading={logging} disabled={!canLog} />
      </View>
    </ScrollView>
  );
}