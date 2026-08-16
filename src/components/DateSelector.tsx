import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { M3 } from '../theme/tokens';

interface DateSelectorProps {
  visible: boolean;
  value: Date;
  minimumDate: Date;
  maximumDate?: Date;
  showTodayAction?: boolean;
  onCancel: () => void;
  onConfirm: (date: Date) => void;
}

function dateOnly(date: Date): Date {
  const result = new Date(0);
  result.setHours(0, 0, 0, 0);
  result.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return result;
}

function clampDate(date: Date, minimumDate: Date, maximumDate?: Date): Date {
  const time = date.getTime();
  if (time < minimumDate.getTime()) return new Date(minimumDate);
  if (maximumDate && time > maximumDate.getTime()) return new Date(maximumDate);
  return date;
}

export default function DateSelector({
  visible,
  value,
  minimumDate,
  maximumDate,
  showTodayAction = false,
  onCancel,
  onConfirm,
}: DateSelectorProps) {
  const insets = useSafeAreaInsets();
  const valueTime = value.getTime();
  const minimumTime = minimumDate.getTime();
  const maximumTime = maximumDate?.getTime();
  const todayTime = dateOnly(new Date()).getTime();
  const minDate = useMemo(() => dateOnly(new Date(minimumTime)), [minimumTime]);
  const maxDate = useMemo(
    () => maximumTime == null ? undefined : dateOnly(new Date(maximumTime)),
    [maximumTime],
  );
  const todayDate = useMemo(() => new Date(todayTime), [todayTime]);
  const [draftDate, setDraftDate] = useState(() => (
    clampDate(dateOnly(value), minDate, maxDate)
  ));
  const onCancelRef = useRef(onCancel);
  const onConfirmRef = useRef(onConfirm);

  onCancelRef.current = onCancel;
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    if (!visible) return;
    setDraftDate(clampDate(dateOnly(new Date(valueTime)), minDate, maxDate));
  }, [maxDate, minDate, valueTime, visible]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;

    DateTimePickerAndroid.open({
      value: clampDate(dateOnly(new Date(valueTime)), minDate, maxDate),
      mode: 'date',
      // Android OEM spinners can flicker when linked wheels reach a hard bound.
      // Keep the wheel for unbounded meal dates and use the native bounded dialog
      // for birth dates and weight dates.
      display: maxDate ? 'default' : 'spinner',
      minimumDate: minDate,
      maximumDate: maxDate,
      positiveButton: { label: 'Set date' },
      negativeButton: { label: 'Cancel' },
      neutralButton: showTodayAction ? { label: 'Today' } : undefined,
      onChange: (event, date) => {
        if (event.type === 'set' && date) {
          onConfirmRef.current(clampDate(dateOnly(date), minDate, maxDate));
          return;
        }
        if (event.type === 'neutralButtonPressed' && showTodayAction) {
          onConfirmRef.current(clampDate(todayDate, minDate, maxDate));
          return;
        }
        if (event.type === 'dismissed') onCancelRef.current();
      },
    });

    return () => {
      DateTimePickerAndroid.dismiss('date');
    };
  }, [maxDate, minDate, showTodayAction, todayDate, valueTime, visible]);

  if (!visible || Platform.OS === 'android') return null;

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
          <View className="flex-row items-center justify-end gap-3">
            {showTodayAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Today"
                onPress={() => onConfirm(clampDate(todayDate, minDate, maxDate))}
                className="mr-auto min-h-[48px] justify-center rounded-full px-2 active:opacity-70"
              >
                <Text className="text-xs font-semibold text-m3-on-surface-variant">
                  Today
                </Text>
              </Pressable>
            ) : null}
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
