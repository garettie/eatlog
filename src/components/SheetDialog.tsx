import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, useReducedMotion } from 'react-native-reanimated';

import { DURATION, EASING } from '../theme/motion';

export interface SheetDialogAction {
  label: string;
  onPress?: () => void;
  /** `cancel` also runs when the dialog is dismissed with Back or a scrim tap. */
  tone?: 'cancel' | 'primary' | 'destructive' | 'neutral';
}

export interface SheetDialogRequest {
  title: string;
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

/** Shows a dialog inside the enclosing sheet, or a native alert when rendered outside one. */
export function useSheetDialog(): ShowSheetDialog {
  return useContext(SheetDialogContext) ?? showNativeAlert;
}

const ACTION_CLASS: Record<NonNullable<SheetDialogAction['tone']>, { button: string; text: string }> = {
  cancel: { button: 'bg-m3-surface-container-highest', text: 'text-m3-on-surface' },
  neutral: { button: 'bg-m3-surface-container-highest', text: 'text-m3-on-surface' },
  primary: { button: 'bg-m3-primary', text: 'text-m3-on-primary' },
  destructive: { button: 'bg-m3-error-container', text: 'text-m3-on-error-container' },
};

export function SheetDialogOverlay({ host }: { host: SheetDialogHost }) {
  const reduced = useReducedMotion();
  const { request, close } = host;
  const requestRef = useRef(request);
  requestRef.current = request;

  const run = useCallback((action: SheetDialogAction | undefined) => {
    close();
    action?.onPress?.();
  }, [close]);

  const dismiss = useCallback(() => {
    run(requestRef.current?.actions.find((action) => action.tone === 'cancel'));
  }, [run]);

  useEffect(() => {
    if (!request) return;
    // Registered after the sheet's own Back listeners, so Android asks it first.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [dismiss, request]);

  const stacked = (request?.actions.length ?? 0) > 2;

  // The container stays mounted so the scrim and card can play their exit animations.
  return (
    <View pointerEvents="box-none" className="absolute inset-0 justify-end">
      {request ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(DURATION.enter)}
          exiting={reduced ? undefined : FadeOut.duration(DURATION.exit)}
          className="absolute inset-0 bg-black/50"
        >
          <Pressable
            className="flex-1"
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
        </Animated.View>
      ) : null}
      {request ? (
        <Animated.View
          entering={reduced ? undefined : FadeInDown.duration(DURATION.enter).easing(EASING.emphasizedDecelerate)}
          exiting={reduced ? undefined : FadeOutDown.duration(DURATION.exit).easing(EASING.emphasizedAccelerate)}
          accessibilityViewIsModal
          accessibilityRole={request.body ? undefined : 'alert'}
          className="mx-4 mb-4 gap-4 rounded-3xl border border-m3-outline-variant/40 bg-m3-surface-container-high px-5 pb-4 pt-5"
        >
          <View className="gap-1">
            {/* With a body, the title labels the content that follows rather than asking a question. */}
            <Text
              accessibilityRole="header"
              className={request.body
                ? 'text-sm font-semibold text-m3-on-surface-variant'
                : 'text-base font-semibold text-m3-on-surface'}
            >
              {request.title}
            </Text>
            {request.message ? (
              <Text className="text-sm text-m3-on-surface-variant">{request.message}</Text>
            ) : null}
          </View>
          {request.body?.(close)}
          {request.actions.length ? (
            <View className={stacked ? 'gap-2' : 'flex-row gap-2'}>
              {request.actions.map((action) => {
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
      ) : null}
    </View>
  );
}
