import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { M3 } from '../theme/tokens';

interface DateSelectorProps {
  visible: boolean;
  value: Date;
  minimumDate: Date;
  maximumDate: Date;
  onCancel: () => void;
  onConfirm: (date: Date) => void;
}

interface WheelItem {
  value: number;
  label: string;
  accessibilityLabel: string;
}

interface DateWheelProps {
  label: string;
  items: WheelItem[];
  selectedValue: number;
  onChange: (value: number) => void;
  className?: string;
}

const WHEEL_ROW_HEIGHT = 48;
const WHEEL_PADDING = WHEEL_ROW_HEIGHT * 2;
const WHEEL_HEIGHT = WHEEL_ROW_HEIGHT * 5;
const WHEEL_SETTLE_DELAY = 100;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function dateOnly(date: Date): Date {
  const result = new Date(0);
  result.setHours(0, 0, 0, 0);
  result.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return result;
}

function dateFromParts(year: number, month: number, day: number): Date {
  const result = new Date(0);
  result.setHours(0, 0, 0, 0);
  result.setFullYear(year, month, day);
  return result;
}

function daysInMonth(year: number, month: number): number {
  return dateFromParts(year, month + 1, 0).getDate();
}

function clampDate(date: Date, minimumDate: Date, maximumDate: Date): Date {
  const time = date.getTime();
  if (time < minimumDate.getTime()) return new Date(minimumDate);
  if (time > maximumDate.getTime()) return new Date(maximumDate);
  return date;
}

function DateWheel({
  label,
  items,
  selectedValue,
  onChange,
  className = 'flex-1',
}: DateWheelProps) {
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = Math.max(0, items.findIndex((item) => item.value === selectedValue));
  const latestOffsetRef = useRef(selectedIndex * WHEEL_ROW_HEIGHT);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactingRef = useRef(false);
  const waitingToSettleRef = useRef(false);
  const snapToOffsets = useMemo(
    () => items.map((_item, index) => index * WHEEL_ROW_HEIGHT),
    [items.length],
  );

  useEffect(() => {
    if (interactingRef.current) return;
    latestOffsetRef.current = selectedIndex * WHEEL_ROW_HEIGHT;
    scrollRef.current?.scrollTo({ y: selectedIndex * WHEEL_ROW_HEIGHT, animated: false });
  }, [selectedIndex]);

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
  }, []);

  const cancelWheelSettle = () => {
    if (!settleTimerRef.current) return;
    clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  };

  const settleAtOffset = (offset: number) => {
    cancelWheelSettle();
    waitingToSettleRef.current = false;
    interactingRef.current = false;
    const rawIndex = Math.round(offset / WHEEL_ROW_HEIGHT);
    const index = Math.max(0, Math.min(items.length - 1, rawIndex));
    const normalizedOffset = index * WHEEL_ROW_HEIGHT;
    latestOffsetRef.current = normalizedOffset;
    if (Math.abs(offset - normalizedOffset) > 0.5) {
      scrollRef.current?.scrollTo({ y: normalizedOffset, animated: false });
    }
    const item = items[index];
    if (item && item.value !== selectedValue) onChange(item.value);
  };

  const armWheelSettle = () => {
    cancelWheelSettle();
    settleTimerRef.current = setTimeout(() => {
      settleAtOffset(latestOffsetRef.current);
    }, WHEEL_SETTLE_DELAY);
  };

  const trackWheelOffset = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    latestOffsetRef.current = event.nativeEvent.contentOffset.y;
    if (waitingToSettleRef.current) armWheelSettle();
  };

  const scheduleWheelSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    latestOffsetRef.current = event.nativeEvent.contentOffset.y;
    waitingToSettleRef.current = true;
    armWheelSettle();
  };

  const settleWheel = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    settleAtOffset(event.nativeEvent.contentOffset.y);
  };

  return (
    <View className={className}>
      <Text className="pb-2 text-center text-xs font-semibold text-m3-on-surface-variant">
        {label}
      </Text>
      <View style={{ height: WHEEL_HEIGHT }}>
        <View
          pointerEvents="none"
          className="absolute left-1 right-1 top-[96px] h-12 rounded-xl border border-m3-outline-variant/60 bg-m3-surface-container-highest"
        />
        <ScrollView
          ref={scrollRef}
          accessibilityLabel={`${label} picker`}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          decelerationRate="fast"
          nestedScrollEnabled
          snapToOffsets={snapToOffsets}
          contentOffset={{ x: 0, y: selectedIndex * WHEEL_ROW_HEIGHT }}
          contentContainerStyle={{ paddingVertical: WHEEL_PADDING }}
          scrollEventThrottle={16}
          onScroll={trackWheelOffset}
          onScrollBeginDrag={() => {
            interactingRef.current = true;
            waitingToSettleRef.current = false;
            cancelWheelSettle();
          }}
          onScrollEndDrag={scheduleWheelSettle}
          onMomentumScrollBegin={cancelWheelSettle}
          onMomentumScrollEnd={settleWheel}
        >
          {items.map((item, index) => (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel}
              accessibilityState={{ selected: item.value === selectedValue }}
              onPress={() => {
                cancelWheelSettle();
                waitingToSettleRef.current = false;
                interactingRef.current = false;
                latestOffsetRef.current = index * WHEEL_ROW_HEIGHT;
                scrollRef.current?.scrollTo({ y: index * WHEEL_ROW_HEIGHT, animated: false });
                onChange(item.value);
              }}
              className="h-12 items-center justify-center"
            >
              <Text
                className={item.value === selectedValue
                  ? 'text-base font-semibold text-m3-on-surface'
                  : 'text-sm text-m3-on-surface-variant'}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

export default function DateSelector({
  visible,
  value,
  minimumDate,
  maximumDate,
  onCancel,
  onConfirm,
}: DateSelectorProps) {
  const insets = useSafeAreaInsets();
  const valueTime = value.getTime();
  const minimumTime = minimumDate.getTime();
  const maximumTime = maximumDate.getTime();
  const minDate = useMemo(() => dateOnly(new Date(minimumTime)), [minimumTime]);
  const maxDate = useMemo(() => dateOnly(new Date(maximumTime)), [maximumTime]);
  const [draftDate, setDraftDate] = useState(() => (
    clampDate(dateOnly(value), minDate, maxDate)
  ));

  useEffect(() => {
    if (!visible) return;
    setDraftDate(clampDate(dateOnly(new Date(valueTime)), minDate, maxDate));
  }, [maxDate, minDate, valueTime, visible]);

  const years = useMemo(() => Array.from(
    { length: maxDate.getFullYear() - minDate.getFullYear() + 1 },
    (_item, index) => {
      const year = minDate.getFullYear() + index;
      return { value: year, label: String(year), accessibilityLabel: String(year) };
    },
  ), [maxDate, minDate]);
  const months = useMemo(() => {
    const year = draftDate.getFullYear();
    const firstMonth = year === minDate.getFullYear() ? minDate.getMonth() : 0;
    const lastMonth = year === maxDate.getFullYear() ? maxDate.getMonth() : 11;
    return Array.from({ length: lastMonth - firstMonth + 1 }, (_item, index) => {
      const monthIndex = firstMonth + index;
      const month = MONTHS[monthIndex];
      return {
        value: monthIndex,
        label: month.slice(0, 3),
        accessibilityLabel: month,
      };
    });
  }, [draftDate, maxDate, minDate]);
  const days = useMemo(() => {
    const year = draftDate.getFullYear();
    const month = draftDate.getMonth();
    const firstDay = year === minDate.getFullYear() && month === minDate.getMonth()
      ? minDate.getDate()
      : 1;
    const lastDay = year === maxDate.getFullYear() && month === maxDate.getMonth()
      ? maxDate.getDate()
      : daysInMonth(year, month);
    return Array.from({ length: lastDay - firstDay + 1 }, (_item, index) => {
      const day = firstDay + index;
      return { value: day, label: String(day), accessibilityLabel: String(day) };
    });
  }, [draftDate, maxDate, minDate]);

  const changeDraftPart = (part: 'year' | 'month' | 'day', selected: number) => {
    setDraftDate((current) => {
      const year = part === 'year' ? selected : current.getFullYear();
      const month = part === 'month' ? selected : current.getMonth();
      const requestedDay = part === 'day' ? selected : current.getDate();
      const day = Math.min(requestedDay, daysInMonth(year, month));
      return clampDate(dateFromParts(year, month, day), minDate, maxDate);
    });
  };

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className="flex-1 justify-end bg-black/60" accessibilityViewIsModal>
        <Pressable
          className="absolute inset-0"
          accessibilityRole="button"
          accessibilityLabel="Cancel date selection"
          onPress={onCancel}
        />
        <View
          className="rounded-t-3xl bg-m3-surface-container-high px-5 pt-5 gap-4"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <Text className="text-lg font-bold text-m3-on-surface">Select date</Text>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={draftDate}
              mode="date"
              display="spinner"
              minimumDate={minDate}
              maximumDate={maxDate}
              themeVariant="dark"
              accentColor={M3.primary}
              onChange={(_event, date) => {
                if (date) setDraftDate(clampDate(dateOnly(date), minDate, maxDate));
              }}
            />
          ) : (
            <View className="flex-row gap-2">
              <DateWheel
                label="Month"
                className="flex-[1.35]"
                items={months}
                selectedValue={draftDate.getMonth()}
                onChange={(month) => changeDraftPart('month', month)}
              />
              <DateWheel
                label="Day"
                items={days}
                selectedValue={draftDate.getDate()}
                onChange={(day) => changeDraftPart('day', day)}
              />
              <DateWheel
                label="Year"
                className="flex-[1.2]"
                items={years}
                selectedValue={draftDate.getFullYear()}
                onChange={(year) => changeDraftPart('year', year)}
              />
            </View>
          )}
          <View className="flex-row justify-end gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onCancel}
              className="min-h-[48px] justify-center rounded-full px-5 active:opacity-70"
            >
              <Text className="text-sm font-semibold text-m3-on-surface-variant">Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set date"
              onPress={() => onConfirm(draftDate)}
              className="min-h-[48px] justify-center rounded-full bg-m3-primary px-6 active:opacity-80"
            >
              <Text className="text-sm font-semibold text-m3-on-primary">Set date</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
