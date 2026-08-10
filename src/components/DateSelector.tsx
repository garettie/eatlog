import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import { M3 } from '../theme/tokens';

interface DateSelectorProps {
  visible: boolean;
  value: Date;
  minimumDate: Date;
  maximumDate: Date;
  onCancel: () => void;
  onConfirm: (date: Date) => void;
}

function dateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function clampDate(date: Date, minimumDate: Date, maximumDate: Date): Date {
  const time = date.getTime();
  if (time < minimumDate.getTime()) return new Date(minimumDate);
  if (time > maximumDate.getTime()) return new Date(maximumDate);
  return date;
}

export default function DateSelector({
  visible,
  value,
  minimumDate,
  maximumDate,
  onCancel,
  onConfirm,
}: DateSelectorProps) {
  const openRef = useRef(false);
  const [draftDate, setDraftDate] = useState(() => dateOnly(value));
  const cancelRef = useRef(onCancel);
  const confirmRef = useRef(onConfirm);
  cancelRef.current = onCancel;
  confirmRef.current = onConfirm;

  const valueTime = value.getTime();
  const minimumTime = minimumDate.getTime();
  const maximumTime = maximumDate.getTime();

  useEffect(() => {
    if (Platform.OS !== 'android' || !visible || openRef.current) return;
    openRef.current = true;

    const minDate = dateOnly(new Date(minimumTime));
    const maxDate = dateOnly(new Date(maximumTime));
    const selectedDate = clampDate(dateOnly(new Date(valueTime)), minDate, maxDate);

    const handleChange = (event: DateTimePickerEvent, date?: Date) => {
      openRef.current = false;
      if (event.type === 'set' && date) {
        confirmRef.current(dateOnly(date));
      } else {
        cancelRef.current();
      }
    };

    DateTimePickerAndroid.open({
      value: selectedDate,
      mode: 'date',
      display: 'calendar',
      minimumDate: minDate,
      maximumDate: maxDate,
      positiveButton: { label: 'Set date', textColor: M3.primary },
      negativeButton: { label: 'Cancel', textColor: M3.onSurfaceVariant },
      onChange: handleChange,
    });
  }, [maximumTime, minimumTime, valueTime, visible]);

  useEffect(() => {
    if (Platform.OS !== 'android' || visible) return;
    openRef.current = false;
    void DateTimePickerAndroid.dismiss('date');
  }, [visible]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !visible) return;
    setDraftDate(clampDate(
      dateOnly(new Date(valueTime)),
      dateOnly(new Date(minimumTime)),
      dateOnly(new Date(maximumTime)),
    ));
  }, [maximumTime, minimumTime, valueTime, visible]);

  if (Platform.OS === 'ios' && visible) {
    const minDate = dateOnly(new Date(minimumTime));
    const maxDate = dateOnly(new Date(maximumTime));
    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={onCancel}
        statusBarTranslucent
      >
        <View className="flex-1 justify-end bg-black/60" accessibilityViewIsModal>
          <Pressable
            className="absolute inset-0"
            accessibilityRole="button"
            accessibilityLabel="Cancel date selection"
            onPress={onCancel}
          />
          <View className="rounded-t-3xl bg-m3-surface-container-high px-5 pb-8 pt-5 gap-4">
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
            <View className="flex-row justify-end gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={onCancel}
                className="min-h-[48px] justify-center rounded-full px-5 active:opacity-70"
              >
                <Text className="text-sm font-semibold text-m3-on-surface-variant">Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
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

  return null;
}
