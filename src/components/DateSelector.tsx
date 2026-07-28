import { useEffect, useRef } from 'react';
import {
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
  const cancelRef = useRef(onCancel);
  const confirmRef = useRef(onConfirm);
  cancelRef.current = onCancel;
  confirmRef.current = onConfirm;

  const valueTime = value.getTime();
  const minimumTime = minimumDate.getTime();
  const maximumTime = maximumDate.getTime();

  useEffect(() => {
    if (!visible || openRef.current) return;
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
    if (visible) return;
    openRef.current = false;
    void DateTimePickerAndroid.dismiss('date');
  }, [visible]);

  return null;
}
