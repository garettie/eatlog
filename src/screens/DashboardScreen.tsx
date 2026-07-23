import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';

import Card from '../components/Card';
import {
  getProfile,
  getLatestDailyTarget,
  getMostRecentFoodLog,
  getTodayMacros,
  getRecentWeightLogs,
  Profile,
  DailyTarget,
  FoodLog,
  WeightLog,
} from '../db/database';
import { todayISO } from '../utils/calculations';

// ── MacroTile Component ───────────────────────────────────────────────────

interface MacroTileProps {
  label: string;
  consumed: number;
  target: number;
  textColorClass: string;
  progressColorClass: string;
}

function MacroTile({ label, consumed, target, textColorClass, progressColorClass }: MacroTileProps) {
  const pct = target > 0 ? Math.min(1, consumed / target) : 0;
  return (
    <View className="flex-1 bg-m3-surface-container-high rounded-2xl p-3">
      <View className="flex-row justify-between items-baseline mb-2">
        <Text className={`${textColorClass} text-xs font-semibold`}>{label}</Text>
        <Text className="text-m3-on-surface-variant text-[10px] tabular-nums font-medium">
          {Math.round(consumed)}g
        </Text>
      </View>
      <View className="h-1 bg-m3-surface-container-highest rounded-full overflow-hidden">
        <View
          className={`h-full ${progressColorClass} rounded-full`}
          style={{ width: `${pct * 100}%` }}
        />
      </View>
    </View>
  );
}

// ── Relative Time Helper ─────────────────────────────────────────────────

function getRelativeTime(loggedAtStr: string): string {
  try {
    const loggedAt = new Date(loggedAtStr);
    const now = new Date();
    const diffMs = now.getTime() - loggedAt.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    
    // Check if yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (loggedAt.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return loggedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
}

// ── DashboardScreen Component ─────────────────────────────────────────────

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [target, setTarget] = useState<DailyTarget | null>(null);
  const [recentFood, setRecentFood] = useState<FoodLog | null>(null);
  const [todayMacros, setTodayMacros] = useState<{
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);

  useFocusEffect(
    useCallback(() => {
      async function loadData() {
        const today = todayISO();
        const prof = await getProfile();
        const targ = await getLatestDailyTarget();
        const rFood = await getMostRecentFoodLog();
        const tMacros = await getTodayMacros(today);
        const wLogs = await getRecentWeightLogs(30);

        setProfile(prof);
        setTarget(targ);
        setRecentFood(rFood);
        setTodayMacros(tMacros);
        // We want chronological order for the chart (oldest to newest)
        setWeightLogs([...wLogs].reverse());
      }
      loadData();
    }, [])
  );

  if (!profile || !target) {
    return <View style={{ flex: 1, backgroundColor: '#111318' }} />;
  }

  // Initials
  const initials = profile.display_name
    ? profile.display_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'JD';

  // Subtitle
  const goalLabels = {
    cut: 'Weight Loss',
    bulk: 'Weight Gain',
    maintain: 'Maintenance',
  };
  const goalLabel = goalLabels[profile.goal_type] || 'Maintenance';
  const goalSubtitle = profile.goal_type === 'maintain'
    ? `Goal: ${goalLabel}`
    : `Goal: ${goalLabel} (${profile.goal_rate_kg_per_week >= 0 ? '+' : ''}${profile.goal_rate_kg_per_week.toFixed(2)} kg/wk)`;

  // Check-in calculation
  let checkInText = 'Due today';
  if (profile.created_at) {
    const created = new Date(profile.created_at);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - created.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const rem = 7 - (diffDays % 7);
    if (rem > 0 && rem < 7) {
      checkInText = `Check-in in ${rem} days`;
    } else {
      checkInText = 'Due today';
    }
  }

  // Energy remaining
  const consumedCals = Math.round(todayMacros.calories);
  const targetCals = Math.round(target.target_calories);
  const calsRemaining = targetCals - consumedCals;
  const calsProgress = targetCals > 0 ? Math.min(1, consumedCals / targetCals) : 0;

  // Header date format: Thursday, Oct 24
  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  // Chart series data map
  const chartData = weightLogs.map((log) => ({
    value: log.trend_weight_kg,
  }));
  const rawDotsData = weightLogs.map((log) => ({
    value: log.scale_weight_kg,
  }));

  // Get most recent weight stats
  const latestWeightLog = weightLogs[weightLogs.length - 1];
  const trendWeightDisplay = latestWeightLog
    ? latestWeightLog.trend_weight_kg.toFixed(1)
    : profile.height_cm ? '78.8' : '--'; // Fallback / default
  const scaleWeightDisplay = latestWeightLog
    ? latestWeightLog.scale_weight_kg.toFixed(1)
    : profile.height_cm ? '78.8' : '--';

  return (
    <SafeAreaView className="flex-1 bg-m3-surface">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-6 pb-10 gap-4"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View className="flex-row justify-between items-center mb-2">
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-white items-center justify-center">
              <Text className="text-m3-on-primary font-bold text-sm">{initials}</Text>
            </View>
            <View>
              <Text className="text-m3-on-surface font-bold text-base">{formattedDate}</Text>
              <Text className="text-m3-on-surface-variant text-xs">{goalSubtitle}</Text>
            </View>
          </View>
          <View className="bg-m3-surface-container rounded-full px-3 py-1.5 border border-m3-outline-variant/30">
            <Text className="text-m3-on-surface-variant text-[11px] font-semibold">{checkInText}</Text>
          </View>
        </View>

        {/* ── Energy Budget Card ── */}
        <Card className="p-5 gap-4">
          <View className="flex-row justify-between items-baseline">
            <Text className="text-m3-on-surface font-bold text-sm">Energy Budget</Text>
            <Text className="text-m3-on-surface text-sm font-semibold tabular-nums">
              <Text className="font-bold text-base">{consumedCals.toLocaleString()}</Text>
              <Text className="text-m3-on-surface-variant"> / {targetCals.toLocaleString()} kcal</Text>
            </Text>
          </View>

          <View className="h-2.5 bg-m3-surface-container-highest rounded-full overflow-hidden">
            <View className="h-full bg-white rounded-full" style={{ width: `${calsProgress * 100}%` }} />
          </View>

          <View className="flex-row justify-end">
            <Text className="text-m3-on-surface-variant text-xs font-medium">
              {calsRemaining >= 0
                ? `${calsRemaining.toLocaleString()} kcal remaining`
                : `${Math.abs(calsRemaining).toLocaleString()} kcal over target`}
            </Text>
          </View>

          <View className="flex-row gap-2 mt-1">
            <MacroTile
              label="Protein"
              consumed={todayMacros.protein_g}
              target={target.target_protein_g}
              textColorClass="text-m3-protein"
              progressColorClass="bg-m3-protein"
            />
            <MacroTile
              label="Carbs"
              consumed={todayMacros.carbs_g}
              target={target.target_carbs_g}
              textColorClass="text-m3-carbs"
              progressColorClass="bg-m3-carbs"
            />
            <MacroTile
              label="Fat"
              consumed={todayMacros.fat_g}
              target={target.target_fat_g}
              textColorClass="text-m3-fat"
              progressColorClass="bg-m3-fat"
            />
          </View>
        </Card>

        {/* ── Last Logged Card ── */}
        <Pressable onPress={() => navigation.navigate('AddEntry')} className="active:opacity-80">
          <Card className="p-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3 flex-1">
              <View className="w-10 h-10 rounded-full bg-m3-surface-container-high items-center justify-center">
                <MaterialIcons name="restaurant" size={18} color="#c4c6d0" />
              </View>
              {recentFood ? (
                <View className="flex-1">
                  <Text className="text-m3-on-surface font-bold text-sm" numberOfLines={1}>
                    {recentFood.name}
                  </Text>
                  <Text className="text-m3-on-surface-variant text-xs mt-0.5">
                    {Math.round(recentFood.calories)} kcal · {getRelativeTime(recentFood.logged_at)}
                  </Text>
                </View>
              ) : (
                <View className="flex-1">
                  <Text className="text-m3-on-surface-variant text-sm font-medium">
                    Log your first entry to see it here
                  </Text>
                </View>
              )}
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#c4c6d0" />
          </Card>
        </Pressable>

        {/* ── Weight Trend Card ── */}
        <Card className="p-5 gap-4">
          <View className="flex-row justify-between items-baseline">
            <Text className="text-m3-on-surface font-bold text-sm">Weight Trend</Text>
            <Text className="text-emerald-400 text-xs font-bold">
              {profile.goal_rate_kg_per_week >= 0 ? '+' : ''}
              {profile.goal_rate_kg_per_week.toFixed(2)} kg / week
            </Text>
          </View>

          {/* Sparse/Empty state validation */}
          {weightLogs.length < 2 ? (
            <View className="h-32 justify-center items-center">
              <Text className="text-m3-on-surface-variant text-sm font-medium text-center">
                Log a few more check-ins to see your trend
              </Text>
            </View>
          ) : (
            <View className="h-32 justify-end py-2">
              <LineChart
                data={chartData}
                data2={rawDotsData}
                height={90}
                thickness={2}
                color="#34d399"
                hideRules
                hideYAxisText
                hideAxesAndRules
                xAxisThickness={0}
                yAxisThickness={0}
                // First dataset configuration (trend weight line)
                curved
                initialSpacing={15}
                endSpacing={15}
                // Second dataset configuration (scale weight dots)
                // Gifted charts line chart handles dual datasets natively
                hideDataPoints={false}
                dataPointsColor="rgba(196,198,208,0.8)"
                dataPointsRadius={3}
                // For dataset 1 (smooth line), don't render dots
                hideDataPoints1
                // For dataset 2 (scale weight dots), render dots but no line
                thickness2={0}
                color2="transparent"
                hideDataPoints2={false}
                dataPointsColor2="rgba(196,198,208,0.8)"
                dataPointsRadius2={3.5}
              />
            </View>
          )}

          <View className="flex-row gap-3">
            <View className="flex-1 bg-m3-surface-container-high rounded-2xl p-4 gap-1">
              <Text className="text-m3-on-surface-variant text-xs font-semibold">Trend Weight</Text>
              <Text className="text-emerald-400 font-bold text-xl tabular-nums">
                {trendWeightDisplay} kg
              </Text>
            </View>
            <View className="flex-1 bg-m3-surface-container-high rounded-2xl p-4 gap-1">
              <Text className="text-m3-on-surface-variant text-xs font-semibold">Scale Weight</Text>
              <Text className="text-m3-on-surface font-bold text-xl tabular-nums">
                {scaleWeightDisplay} kg
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
