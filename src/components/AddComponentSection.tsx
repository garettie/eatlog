import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { searchFood, FoodResult, DataType } from '../services/foodSearch';
import { describeMeal } from '../services/foodScan';
import PrimaryButton from './PrimaryButton';

type AddMode = 'search' | 'describe' | 'manual' | null;

interface AddComponentSectionProps {
  onAdd: (foods: FoodResult[]) => void;
}

export default function AddComponentSection({ onAdd }: AddComponentSectionProps) {
  const [mode, setMode] = useState<AddMode>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  const [describeText, setDescribeText] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [describeError, setDescribeError] = useState<string | null>(null);

  const [manualName, setManualName] = useState('');
  const [manualCal, setManualCal] = useState('');
  const [manualPro, setManualPro] = useState('');
  const [manualCarb, setManualCarb] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualGrams, setManualGrams] = useState('150');

  const reset = useCallback(() => {
    setMode(null);
    setSearchQuery('');
    setSearchResults([]);
    setDescribeText('');
    setDescribeError(null);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!searchQuery.trim()) {
      searchSeq.current++;
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++searchSeq.current;
      const res = await searchFood(searchQuery);
      if (seq !== searchSeq.current) return;
      setSearchResults(res);
      setIsSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const handleSearchSelect = useCallback((food: FoodResult) => {
    onAdd([food]);
    reset();
  }, [onAdd, reset]);

  const handleDescribe = useCallback(async () => {
    const text = describeText.trim();
    if (!text) return;
    setDescribeError(null);
    setIsEstimating(true);
    try {
      const result = await describeMeal(text);
      if (result && result.components.length > 0) {
        onAdd(result.components);
        reset();
      } else {
        setDescribeError("Couldn't estimate this meal. Try a different description.");
      }
    } catch {
      setDescribeError('Estimate failed. Check your connection.');
    } finally {
      setIsEstimating(false);
    }
  }, [describeText, onAdd, reset]);

  const handleManualAdd = useCallback(() => {
    if (!manualName.trim()) return;
    const cal = parseFloat(manualCal) || 0;
    const pro = parseFloat(manualPro) || 0;
    const carb = parseFloat(manualCarb) || 0;
    const fat = parseFloat(manualFat) || 0;
    const grams = parseFloat(manualGrams) || 150;
    if (!cal && !pro && !carb && !fat) return;

    const name = manualName.trim();
    const food: FoodResult = {
      id: `manual-${Date.now()}`,
      name,
      source: 'manual',
      sourceFoodId: '',
      dataType: 'manual',
      brand: null,
      preparation: null,
      normalizedName: name.toLowerCase(),
      caloriesPer100g: cal > 0 ? cal : null,
      proteinPer100g: pro > 0 ? pro : null,
      carbsPer100g: carb > 0 ? carb : null,
      fatPer100g: fat > 0 ? fat : null,
      servingSizeGrams: grams,
      servingLabel: null,
      estimatedGrams: grams,
      alternateSourceIds: [],
    };
    onAdd([food]);
    setManualName('');
    setManualCal('');
    setManualPro('');
    setManualCarb('');
    setManualFat('');
    setManualGrams('150');
    reset();
  }, [manualName, manualCal, manualPro, manualCarb, manualFat, manualGrams, onAdd, reset]);

  if (mode === null) {
    return (
      <Pressable
        onPress={() => setMode('search')}
        className="flex-row items-center justify-center gap-2 py-3"
      >
        <MaterialIcons name="add-circle-outline" size={18} color="#c4c6d0" />
        <Text className="text-m3-on-surface-variant text-xs font-medium">Add Component</Text>
      </Pressable>
    );
  }

  return (
    <View className="bg-m3-surface-container-high rounded-xl px-3 py-3 gap-3">
      {/* ── Mode Chips ── */}
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setMode('search')}
            accessibilityRole="button"
            className={`flex-1 py-3 rounded-full items-center ${mode === 'search' ? 'bg-m3-surface-container' : 'bg-m3-surface-container-highest'}`}
        >
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="search" size={12} color={mode === 'search' ? '#e2e2e9' : '#c4c6d0'} />
            <Text className={`text-[10px] font-semibold ${mode === 'search' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>
              Search
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setMode('describe')}
          accessibilityRole="button"
          className={`flex-1 py-3 rounded-full items-center ${mode === 'describe' ? 'bg-m3-surface-container' : 'bg-m3-surface-container-highest'}`}
        >
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="auto-awesome" size={12} color={mode === 'describe' ? '#e2e2e9' : '#c4c6d0'} />
            <Text className={`text-[10px] font-semibold ${mode === 'describe' ? 'text-m3-on-surface' : 'text-m3-on-surface-variant'}`}>
              Describe
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setMode('manual')}
          accessibilityRole="button"
          accessibilityLabel="Manual entry"
          className={`py-3 px-4 rounded-full items-center ${mode === 'manual' ? 'bg-m3-surface-container' : 'bg-m3-surface-container-highest'}`}
        >
          <MaterialIcons name="edit" size={12} color={mode === 'manual' ? '#e2e2e9' : '#c4c6d0'} />
        </Pressable>
        <Pressable onPress={reset} accessibilityRole="button" accessibilityLabel="Cancel" className="p-2">
          <MaterialIcons name="close" size={16} color="#c4c6d0" />
        </Pressable>
      </View>

      {/* ── Search Mode ── */}
      {mode === 'search' && (
        <View className="gap-2">
          <View className="flex-row items-center bg-m3-surface-container rounded-lg px-3 py-1.5 border border-m3-outline-variant/50">
            <MaterialIcons name="search" size={14} color="#c4c6d0" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search foods..."
              placeholderTextColor="#c4c6d0"
              className="flex-1 text-m3-on-surface text-xs ml-2"
              autoFocus
              autoCorrect={false}
            />
            {isSearching && <ActivityIndicator size="small" color="#c4c6d0" style={{ marginLeft: 4 }} />}
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <MaterialIcons name="close" size={14} color="#c4c6d0" />
              </Pressable>
            )}
          </View>
          {searchResults.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => handleSearchSelect(item)}
              className="bg-m3-surface-container rounded-lg px-3 py-2 flex-row justify-between items-center active:opacity-60"
            >
              <View className="flex-1 mr-2">
                <Text className="text-m3-on-surface text-xs font-medium" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="text-m3-on-surface-variant text-[10px]" numberOfLines={1}>
                  {dataTypeShort(item.dataType)}
                  {item.brand ? ` · ${item.brand}` : ''}
                  {item.servingLabel ? ` · ${item.servingLabel}` : ''}
                </Text>
              </View>
              <Text className="text-[10px] text-m3-primary font-semibold num-tabular">
                {item.caloriesPer100g != null ? `${Math.round(item.caloriesPer100g)} kcal` : '---'}
              </Text>
            </Pressable>
          ))}
          {!isSearching && searchQuery.trim().length > 0 && searchResults.length === 0 && (
            <Text className="text-m3-on-surface-variant text-[10px] text-center py-2">No results</Text>
          )}
        </View>
      )}

      {/* ── Describe Mode ── */}
      {mode === 'describe' && (
        <View className="gap-2">
          <TextInput
            value={describeText}
            onChangeText={setDescribeText}
            placeholder="e.g. 2 eggs with toast"
            placeholderTextColor="#c4c6d0"
            multiline
            numberOfLines={2}
            className="bg-m3-surface-container text-m3-on-surface text-xs rounded-lg px-3 py-2 border border-m3-outline-variant/50"
            autoFocus
          />
          <PrimaryButton
            title="Estimate"
            onPress={handleDescribe}
            loading={isEstimating}
            disabled={!describeText.trim()}
          />
          {describeError && (
            <View className="bg-m3-error-container rounded-lg px-3 py-2 gap-1.5">
              <Text className="text-m3-on-surface text-[10px] font-medium">{describeError}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Manual Mode ── */}
      {mode === 'manual' && (
        <View className="gap-3">
          <TextInput
            value={manualName}
            onChangeText={setManualName}
            placeholder="e.g. Olive Oil"
            placeholderTextColor="#c4c6d0"
            className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-3 py-2 border border-m3-outline-variant/50"
            autoFocus
          />
          <View className="flex-row gap-2">
            <View className="flex-1 gap-1">
              <Text className="text-[10px] text-white/60 font-semibold tracking-wider">CAL</Text>
              <TextInput
                value={manualCal}
                onChangeText={setManualCal}
                placeholder="0"
                placeholderTextColor="#c4c6d0"
                keyboardType="numeric"
                className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-2 py-1.5 border border-m3-outline-variant/50 text-center"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-[10px] text-m3-protein font-semibold tracking-wider">PRO</Text>
              <TextInput
                value={manualPro}
                onChangeText={setManualPro}
                placeholder="0"
                placeholderTextColor="#c4c6d0"
                keyboardType="numeric"
                className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-2 py-1.5 border border-m3-outline-variant/50 text-center"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-[10px] text-m3-carbs font-semibold tracking-wider">CARB</Text>
              <TextInput
                value={manualCarb}
                onChangeText={setManualCarb}
                placeholder="0"
                placeholderTextColor="#c4c6d0"
                keyboardType="numeric"
                className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-2 py-1.5 border border-m3-outline-variant/50 text-center"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-[10px] text-m3-fat font-semibold tracking-wider">FAT</Text>
              <TextInput
                value={manualFat}
                onChangeText={setManualFat}
                placeholder="0"
                placeholderTextColor="#c4c6d0"
                keyboardType="numeric"
                className="bg-m3-surface-container text-m3-on-surface text-xs font-medium rounded-lg px-2 py-1.5 border border-m3-outline-variant/50 text-center"
              />
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <TextInput
              value={manualGrams}
              onChangeText={setManualGrams}
              placeholder="150"
              placeholderTextColor="#c4c6d0"
              keyboardType="numeric"
              className="w-20 text-center bg-m3-surface-container rounded-lg py-2.5 px-2 text-m3-on-surface text-xs font-semibold border border-m3-outline-variant/50"
            />
            <Text className="text-[10px] text-m3-on-surface-variant">grams</Text>
          </View>
          <PrimaryButton
            title="Add"
            onPress={handleManualAdd}
            disabled={!manualName.trim()}
          />
        </View>
      )}
    </View>
  );
}

function dataTypeShort(dt: DataType): string {
  switch (dt) {
    case 'Foundation':
    case 'SR Legacy':
    case 'Branded': return 'USDA';
    case 'off': return 'Open Food Facts';
    case 'describe': return 'Estimate';
    case 'scan': return 'Scan';
    case 'manual': return 'Manual';
    default: return '';
  }
}
