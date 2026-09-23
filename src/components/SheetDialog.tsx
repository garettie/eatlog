import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Modal, Pressable, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DURATION, EASING } from '../theme/motion';

export interface SheetDialogAction {
  label: string;
  onPress?: () => void;
  /** `cancel` also runs when the dialog is dismissed with Back or a scrim tap. */
  tone?: 'cancel' | 'primary' | 'destructive' | 'neutral';
}

export interface SheetDialogRequest {
  title: string;
  /** A large value under the title, such as the date a picker is set to. */
  headline?: string;
  /** A compact shortcut beside the heading, such as a picker's Today. */
  accessory?: SheetDialogAction;
  message?: string;
  /** Custom content between the heading and the actions, such as a picker. Sheets only. */
  body?: (close: () => void) => React.ReactNode;
  actions: SheetDialogAction[];
}

export type ShowSheetDialog = (request: SheetDialogRequest) => void;

export interface SheetDialogHost {
  request: SheetDialogRequest | null;
  show: ShowSheetDialog;
  close: () => void;
}

/** Owns the open dialog for one sheet. Create it where both the sheet and its close guard can reach it. */
export function useSheetDialogHost(): SheetDialogHost {
  const [request, setRequest] = useState<SheetDialogRequest | null>(null);
  const show = useCallback<ShowSheetDialog>((next) => {
    // A decision replaces typing; the card would otherwise sit behind the keyboard.
    Keyboard.dismiss();
    setRequest(next);
  }, []);
  const close = useCallback(() => setRequest(null), []);
  return useMemo(() => ({ request, show, close }), [request, show, close]);
}

export const SheetDialogContext = createContext<ShowSheetDialog | null>(null);

function showNativeAlert({ title, message, actions }: SheetDialogRequest) {
  const cancel = actions.find((action) => action.tone === 'cancel');
  Alert.alert(
    title,
    message,
    actions.map((action) => ({
      text: action.label,
      onPress: action.onPress,
      style: action.tone === 'destructive' ? 'destructive' : action.tone === 'cancel' ? 'cancel' : 'default',
    })),
    { cancelable: true, onDismiss: cancel?.onPress },
  );
}

/** Shows the enclosing sheet's modal dialog, or a native alert when rendered outside a sheet. */
export function useSheetDialog(): ShowSheetDialog {
  return useContext(SheetDialogContext) ?? showNativeAlert;
}

// Cancel and neutral actions are outlined: a tonal pill on this card measured 1.17:1, while the
// outline clears 4:1.
const OUTLINED = 'border-[1.5px] border-m3-on-surface-variant/60';
const ACTION_CLASS: Record<NonNullable<SheetDialogAction['tone']>, { button: string; text: string }> = {
  cancel: { button: OUTLINED, text: 'text-m3-on-surface' },
  neutral: { button: OUTLINED, text: 'text-m3-on-surface' },
  primary: { button: 'bg-m3-primary', text: 'text-m3-on-primary' },
  destructive: { button: 'bg-m3-error-container', text: 'text-m3-on-error-container' },
};

export function SheetDialogOverlay({ host }: { host: SheetDialogHost }) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { request, close } = host;
  const requestRef = useRef(request);
  requestRef.current = request;
  // The dialog on screen outlives `request` by its exit animation.
  const [shown, setShown] = useState<SheetDialogRequest | null>(request);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (request) {
      setShown(request);
      progress.value = withTiming(1, {
        duration: reduced ? 0 : DURATION.short,
        easing: EASING.emphasizedDecelerate,
      });
      return;
    }
    progress.value = withTiming(0, {
      duration: reduced ? 0 : DURATION.exit,
      easing: EASING.emphasizedAccelerate,
    }, (finished) => {
      if (finished) runOnJS(setShown)(null);
    });
  }, [progress, reduced, request]);

  const run = useCallback((action: SheetDialogAction | undefined) => {
    close();
    action?.onPress?.();
  }, [close]);

  const dismiss = useCallback(() => {
    if (!requestRef.current) return;
    run(requestRef.current.actions.find((action) => action.tone === 'cancel'));
  }, [run]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  // The card turns opaque in the first third of the scrim's travel, so the sheet's text never
  // shows through the dialog's text on the way in or out.
  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: 0.94 + progress.value * 0.06 }],
  }));

  const dialog = request ?? shown;
  const stacked = (dialog?.actions.length ?? 0) > 2;

  return (
    <Modal
      visible={dialog != null}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
    >
      {dialog ? (
        <View
          className="flex-1 items-center justify-center px-4"
          style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        >
          <Animated.View style={scrimStyle} className="absolute inset-0 bg-black/60">
            <Pressable
              className="flex-1"
              onPress={dismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            />
          </Animated.View>
          <Animated.View
            style={cardStyle}
            pointerEvents={request ? 'auto' : 'none'}
            accessibilityViewIsModal
            accessibilityRole={dialog.body ? undefined : 'alert'}
            className="w-full max-w-[420px] gap-5 rounded-3xl border border-m3-outline-variant/40 bg-m3-surface-container-high px-5 pb-5 pt-6"
          >
            <View className="flex-row items-start gap-3">
              <View className="flex-1 gap-1">
                {/* With a headline, the title labels the value below it rather than asking a question. */}
                <Text
                  accessibilityRole="header"
                  className={dialog.headline
                    ? 'text-sm font-semibold text-m3-on-surface-variant'
                    : 'text-base font-semibold text-m3-on-surface'}
                >
                  {dialog.title}
                </Text>
                {dialog.headline ? (
                  <Text className="text-2xl font-bold text-m3-on-surface">{dialog.headline}</Text>
                ) : null}
                {dialog.message ? (
                  <Text className="text-sm text-m3-on-surface-variant">{dialog.message}</Text>
                ) : null}
              </View>
              {dialog.accessory ? (
                <Pressable
                  onPress={() => run(dialog.accessory)}
                  hitSlop={6}
                  accessibilityRole="button"
                  className={`h-9 items-center justify-center rounded-full px-4 active:opacity-70 ${OUTLINED}`}
                >
                  <Text className="text-xs font-semibold text-m3-on-surface">{dialog.accessory.label}</Text>
                </Pressable>
              ) : null}
            </View>
            {dialog.body?.(close)}
            {dialog.actions.length ? (
              <View className={stacked ? 'gap-2' : 'flex-row gap-2'}>
                {dialog.actions.map((action) => {
                  const tone = ACTION_CLASS[action.tone ?? 'neutral'];
                  // In a stacked list of choices, Cancel reads as a quiet way out rather than a choice.
                  const buttonClass = stacked && action.tone === 'cancel' ? '' : tone.button;
                  return (
                    <Pressable
                      key={action.label}
                      onPress={() => run(action)}
                      accessibilityRole="button"
                      className={`min-h-[48px] items-center justify-center rounded-full px-4 active:opacity-70 ${stacked ? '' : 'flex-1'} ${buttonClass}`}
                    >
                      <Text numberOfLines={1} className={`text-sm font-semibold ${tone.text}`}>
                        {action.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}
