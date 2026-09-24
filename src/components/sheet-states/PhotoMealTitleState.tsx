import { ActivityIndicator, Image, Keyboard, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';

import type { LoggedMeal } from '../../db/database';
import { parseLocalISO } from '../../utils/calendar';
import { M3 } from '../../theme/tokens';
import PrimaryButton from '../PrimaryButton';
import SheetBackButton from './SheetBackButton';
import ReplaceKeyAction from '../ai/ReplaceKeyAction';

interface PhotoMealTitleStateProps {
  photoUri: string;
  mealTitle: string;
  onMealTitleChange: (title: string) => void;
  suggestions: LoggedMeal[];
  suggestionsLoading: boolean;
  selectedMealId: number | null;
  busyMealId: number | null;
  reuseError: string | null;
  onReuse: (meal: LoggedMeal) => void;
  onRetrySuggestions: () => void;
  estimateAvailable: boolean;
  estimateBusy: boolean;
  estimateError: string | null;
  /** Present when Google turned the key down: replace it, then estimate again. */
  onReplaceKey?: () => void;
  onEstimate: () => void;
  onBack: () => void;
  onContentHeightChange: (height: number) => void;
}

function formatLastLogDate(dateISO: string): string {
  return parseLocalISO(dateISO).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function ReuseMealRow({
  meal,
  selected,
  busy,
  disabled,
  onPress,
}: {
  meal: LoggedMeal;
  selected: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const itemLabel = meal.component_count === 1 ? '1 item' : `${meal.component_count} items`;
  const detail = `${itemLabel} · ${Math.round(meal.total_calories).toLocaleString()} kcal · ${formatLastLogDate(meal.log_date)}`;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${meal.meal_name}, ${detail}`}
      accessibilityHint="Use this meal with the selected photo"
      accessibilityState={{ selected, busy, disabled }}
      className={`min-h-[64px] flex-row items-center gap-3 rounded-xl px-2 active:opacity-60 ${selected ? 'bg-m3-secondary-container' : ''} ${disabled && !busy ? 'opacity-50' : ''}`}
    >
      {meal.photo_uri ? (
        <Image
          source={{ uri: meal.photo_uri }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          className="h-12 w-12 rounded-xl bg-m3-surface-container-high"
        />
      ) : (
        <View className="h-12 w-12 items-center justify-center rounded-xl bg-m3-surface-container-high">
          <MaterialIcons name="restaurant" size={22} color={M3.onSurfaceVariant} />
        </View>
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-sm font-semibold text-m3-on-surface">
          {meal.meal_name}
        </Text>
        <Text numberOfLines={1} className="text-xs text-m3-on-surface-variant">
          {detail}
        </Text>
      </View>
      {busy ? (
        <View className="h-12 w-10 items-center justify-center">
          <ActivityIndicator size="small" color={M3.primary} />
        </View>
      ) : (
        <View className="h-12 w-10 items-center justify-center">
          <MaterialIcons name="chevron-right" size={22} color={M3.onSurfaceVariant} />
        </View>
      )}
    </Pressable>
  );
}

export default function PhotoMealTitleState({
  photoUri,
  mealTitle,
  onMealTitleChange,
  suggestions,
  suggestionsLoading,
  selectedMealId,
  busyMealId,
  reuseError,
  onReuse,
  onRetrySuggestions,
  estimateAvailable,
  estimateBusy,
  estimateError,
  onReplaceKey,
  onEstimate,
  onBack,
  onContentHeightChange,
}: PhotoMealTitleStateProps) {
  const handleEstimate = () => {
    Keyboard.dismiss();
    if (estimateAvailable) onEstimate();
  };

  const estimateUnavailableMessage = suggestionsLoading
    ? 'Checking past meals…'
    : reuseError
      ? 'Past meals didn’t load. Try again above.'
      : suggestions.length
        ? 'New estimates aren’t available. Pick a past meal instead.'
        : mealTitle.trim()
          ? 'No matching meals. Change or clear the title.'
          : 'No past meals are available to reuse.';

  return (
    <BottomSheetScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-5 pt-2 pb-6 gap-4"
      onContentSizeChange={(_width, height) => onContentHeightChange(height)}
    >
      <View className="flex-row items-center gap-1">
        <SheetBackButton onPress={onBack} />
        <Text accessibilityRole="header" className="text-base font-bold text-m3-on-surface">
          Identify meal
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

      <Text className="text-sm text-m3-on-surface-variant">
        Pick a past meal, or name this one for a new estimate.
      </Text>

      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs font-semibold text-m3-on-surface-variant">Meal title</Text>
          <Text className="text-xs text-m3-on-surface-variant">Optional</Text>
        </View>
        <BottomSheetTextInput
          value={mealTitle}
          onChangeText={onMealTitleChange}
          onSubmitEditing={handleEstimate}
          accessibilityLabel="Meal title"
          accessibilityHint="Searches past meals and helps estimate a new meal"
          placeholder="e.g. 2 cups chicken adobo"
          placeholderTextColor={M3.placeholder}
          maxLength={120}
          returnKeyType="done"
          className="min-h-[52px] rounded-xl border border-m3-outline-variant/50 bg-m3-surface-container-high px-4 text-sm font-semibold text-m3-on-surface"
        />
      </View>

      {estimateError ? (
        <Text accessibilityLiveRegion="polite" className="rounded-xl bg-m3-error-container px-3 py-2 text-sm text-m3-on-error-container">
          {estimateError}
        </Text>
      ) : null}
      {estimateError && onReplaceKey ? <ReplaceKeyAction onReplaced={onReplaceKey} /> : null}

      {estimateAvailable ? (
        <PrimaryButton
          title="Estimate as new"
          icon="auto-awesome"
          iconPosition="left"
          loading={estimateBusy}
          accessibilityHint={mealTitle.trim()
            ? 'Requests consent, then sends the meal title and photo for an estimate'
            : 'Requests consent, then sends the photo for an estimate'}
          onPress={handleEstimate}
        />
      ) : (
        <View accessible className="flex-row items-start gap-2 rounded-xl bg-m3-surface-container-high px-3 py-3">
          <MaterialIcons name="info-outline" size={18} color={M3.onSurfaceVariant} />
          <Text className="flex-1 text-sm text-m3-on-surface-variant">
            {estimateUnavailableMessage}
          </Text>
        </View>
      )}

      <View className="gap-1">
        <View className="min-h-[24px] flex-row items-center justify-between gap-3 px-1">
          <Text accessibilityRole="header" className="text-sm font-semibold text-m3-on-surface">
            Reuse a past meal
          </Text>
          {suggestionsLoading && suggestions.length ? (
            <ActivityIndicator accessibilityLabel="Updating past meals" size="small" color={M3.onSurfaceVariant} />
          ) : null}
        </View>
        {suggestionsLoading && !suggestions.length ? (
          <View accessible accessibilityLabel="Loading past meals" className="min-h-[64px] items-center justify-center">
            <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
          </View>
        ) : reuseError ? (
          <View className="gap-1 rounded-xl bg-m3-error-container px-3 py-2">
            <Text accessibilityLiveRegion="polite" className="text-sm text-m3-on-error-container">
              {reuseError}
            </Text>
            <Pressable
              onPress={onRetrySuggestions}
              accessibilityRole="button"
              accessibilityLabel="Retry past meal suggestions"
              className="min-h-[48px] self-start justify-center px-2 active:opacity-60"
            >
              <Text className="text-sm font-semibold text-m3-on-error-container">Retry</Text>
            </Pressable>
          </View>
        ) : suggestions.length ? (
          <View>
            {suggestions.slice(0, 3).map((meal, index) => (
              <View key={meal.meal_id}>
                <ReuseMealRow
                  meal={meal}
                  selected={selectedMealId === meal.meal_id}
                  busy={busyMealId === meal.meal_id}
                  disabled={busyMealId !== null}
                  onPress={() => onReuse(meal)}
                />
                {index < Math.min(suggestions.length, 3) - 1 ? (
                  <View className="ml-[68px] h-px bg-m3-outline-variant/50" />
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text className="min-h-[48px] px-2 py-3 text-sm text-m3-on-surface-variant">
            {mealTitle.trim() ? 'No matching past meals.' : 'No reusable meals yet.'}
          </Text>
        )}
      </View>

    </BottomSheetScrollView>
  );
}
