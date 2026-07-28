import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { M3 } from '../theme/tokens';

interface DateSelectorProps {
  visible: boolean;
  value: Date;
  minimumDate: Date;
  maximumDate: Date;
  onCancel: () => void;
  onConfirm: (date: Date) => void;
  title?: string;
}

interface WheelItem {
  value: number;
  label: string;
}

interface WheelColumnProps {
  label: string;
  items: WheelItem[];
  selectedValue: number;
  onSelect: (value: number) => void;
}

const ITEM_HEIGHT = 48;
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
];

function dateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function clampDate(date: Date, minimumDate: Date, maximumDate: Date): Date {
  const time = date.getTime();
  if (time < minimumDate.getTime()) return new Date(minimumDate);
  if (time > maximumDate.getTime()) return new Date(maximumDate);
  return date;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function WheelColumn({
  label,
  items,
  selectedValue,
  onSelect,
}: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousItemsRef = useRef(items);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === selectedValue)
  );
  const snapOffsets = useMemo(
    () => items.map((_, index) => index * ITEM_HEIGHT),
    [items]
  );

  useEffect(() => {
    if (previousItemsRef.current === items) return;
    previousItemsRef.current = items;
    scrollRef.current?.scrollTo({
      y: selectedIndex * ITEM_HEIGHT,
      animated: false,
    });
  }, [selectedIndex, items]);

  useEffect(
    () => () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    },
    []
  );

  function settleAtOffset(offset: number, animated: boolean) {
    const index = Math.max(
      0,
      Math.min(items.length - 1, Math.round(offset / ITEM_HEIGHT))
    );
    const exactOffset = index * ITEM_HEIGHT;
    if (Math.abs(offset - exactOffset) > 0.5) {
      scrollRef.current?.scrollTo({ y: exactOffset, animated });
    }
    if (items[index].value !== selectedValue) {
      onSelect(items[index].value);
    }
  }

  function clearSettleTimer() {
    if (!settleTimerRef.current) return;
    clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }

  function handleScrollEndDrag(
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) {
    const offset = event.nativeEvent.contentOffset.y;
    clearSettleTimer();
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      settleAtOffset(offset, true);
    }, 80);
  }

  function handleMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    clearSettleTimer();
    settleAtOffset(event.nativeEvent.contentOffset.y, true);
  }

  function selectItem(item: WheelItem, index: number) {
    clearSettleTimer();
    scrollRef.current?.scrollTo({
      y: index * ITEM_HEIGHT,
      animated: true,
    });
    if (item.value !== selectedValue) onSelect(item.value);
  }

  return (
    <View className="flex-1 gap-2">
      <Text className="text-center text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant">
        {label}
      </Text>
      <View className="h-36 overflow-hidden rounded-2xl bg-m3-surface-container-high">
        <View
          pointerEvents="none"
          className="absolute left-1 right-1 top-12 h-12 rounded-xl border border-m3-outline bg-m3-surface-container-highest"
        />
        <ScrollView
          ref={scrollRef}
          className="z-10"
          contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
          contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
          snapToOffsets={snapOffsets}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          overScrollMode="never"
          onScrollBeginDrag={clearSettleTimer}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollBegin={clearSettleTimer}
          onMomentumScrollEnd={handleMomentumEnd}
        >
          {items.map((item, index) => {
            const selected = item.value === selectedValue;
            return (
              <Pressable
                key={item.value}
                onPress={() => selectItem(item, index)}
                accessibilityRole="button"
                accessibilityLabel={`${label} ${item.label}`}
                accessibilityState={{ selected }}
                className="h-12 items-center justify-center"
              >
                <Text
                  className={
                    selected
                      ? 'text-base font-bold text-m3-on-surface'
                      : 'text-sm text-m3-on-surface-variant'
                  }
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
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
  title = 'Select date',
}: DateSelectorProps) {
  const minDate = dateOnly(minimumDate);
  const maxDate = dateOnly(maximumDate);
  const [draftDate, setDraftDate] = useState(() =>
    clampDate(dateOnly(value), minDate, maxDate)
  );

  const valueTime = value.getTime();
  const minimumTime = minDate.getTime();
  const maximumTime = maxDate.getTime();

  useEffect(() => {
    if (visible) {
      setDraftDate(clampDate(dateOnly(value), minDate, maxDate));
    }
  }, [visible, valueTime, minimumTime, maximumTime]);

  const yearItems = useMemo(() => {
    const items: WheelItem[] = [];
    for (let year = minDate.getFullYear(); year <= maxDate.getFullYear(); year += 1) {
      items.push({ value: year, label: String(year) });
    }
    return items;
  }, [minimumTime, maximumTime]);

  const monthItems = useMemo(() => {
    const firstMonth =
      draftDate.getFullYear() === minDate.getFullYear() ? minDate.getMonth() : 0;
    const lastMonth =
      draftDate.getFullYear() === maxDate.getFullYear() ? maxDate.getMonth() : 11;
    return MONTHS.slice(firstMonth, lastMonth + 1).map((month, index) => ({
      value: firstMonth + index,
      label: month.slice(0, 3),
    }));
  }, [draftDate.getFullYear(), minimumTime, maximumTime]);

  const dayItems = useMemo(() => {
    const year = draftDate.getFullYear();
    const month = draftDate.getMonth();
    const firstDay =
      year === minDate.getFullYear() && month === minDate.getMonth()
        ? minDate.getDate()
        : 1;
    const lastDay =
      year === maxDate.getFullYear() && month === maxDate.getMonth()
        ? maxDate.getDate()
        : daysInMonth(year, month);
    return Array.from({ length: lastDay - firstDay + 1 }, (_, index) => {
      const day = firstDay + index;
      return { value: day, label: String(day).padStart(2, '0') };
    });
  }, [draftDate.getFullYear(), draftDate.getMonth(), minimumTime, maximumTime]);

  function updateDraft(year: number, month: number, day: number) {
    const safeDay = Math.min(day, daysInMonth(year, month));
    setDraftDate(
      clampDate(new Date(year, month, safeDay), minDate, maxDate)
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View className="flex-1 items-center justify-center px-5">
        <Pressable
          onPress={onCancel}
          accessibilityLabel="Close date selector"
          className="absolute inset-0 bg-black/70"
        />

        <View className="w-full max-w-md gap-5 rounded-[28px] border border-m3-outline-variant bg-m3-surface-container p-5">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1 gap-1">
              <Text className="text-xl font-bold text-m3-on-surface">{title}</Text>
              <Text className="text-sm text-m3-on-surface-variant">
                {draftDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              className="h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container-high active:opacity-70"
            >
              <MaterialIcons name="close" size={20} color={M3.onSurfaceVariant} />
            </Pressable>
          </View>

          <View className="flex-row gap-2">
            <WheelColumn
              label="Month"
              items={monthItems}
              selectedValue={draftDate.getMonth()}
              onSelect={(month) =>
                updateDraft(draftDate.getFullYear(), month, draftDate.getDate())
              }
            />
            <WheelColumn
              label="Day"
              items={dayItems}
              selectedValue={draftDate.getDate()}
              onSelect={(day) =>
                updateDraft(
                  draftDate.getFullYear(),
                  draftDate.getMonth(),
                  day
                )
              }
            />
            <WheelColumn
              label="Year"
              items={yearItems}
              selectedValue={draftDate.getFullYear()}
              onSelect={(year) =>
                updateDraft(year, draftDate.getMonth(), draftDate.getDate())
              }
            />
          </View>

          <View className="flex-row gap-3">
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              className="min-h-[48px] flex-1 items-center justify-center rounded-full border border-m3-outline active:opacity-70"
            >
              <Text className="text-sm font-semibold text-m3-on-surface">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(draftDate)}
              accessibilityRole="button"
              className="min-h-[48px] flex-1 items-center justify-center rounded-full bg-white active:opacity-90"
            >
              <Text className="text-sm font-bold text-black">Set date</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
