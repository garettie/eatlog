import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import FlowTopBar from './FlowTopBar';
import PrimaryButton from '../PrimaryButton';
import ResponsiveContent from '../ResponsiveContent';
import { checkUserApiKey } from '../../services/foodEstimateDirect';
import { normalizeApiKeyInput, userApiKeyStore } from '../../services/userApiKey';
import { DURATION, EASING } from '../../theme/motion';
import { FORM_MAX_WIDTH, useResponsiveLayout } from '../../theme/layout';
import { M3 } from '../../theme/tokens';
import { haptics } from '../../utils/haptics';

export type KeySetupMode = 'add' | 'replace';

const AI_STUDIO_URL = 'https://aistudio.google.com/app/apikey';

/**
 * What saving a key agrees to, for both routes: saving also records the Eatlog AI consent. Shown
 * only when adding; replacing keeps the consent given.
 */
const DISCLOSURE: { icon: keyof typeof MaterialIcons.glyphMap; text: string }[] = [
  {
    icon: 'send-to-mobile',
    text: 'Eatlog sends the photo, meal title, or description you choose to Google Gemini. With your key it goes straight from this phone. With Eatlog AI it goes through Eatlog.',
  },
  {
    icon: 'payments',
    text: 'Eatlog charges nothing for your key. Google sets its limits, and may charge you if billing is enabled on your Google project.',
  },
  {
    icon: 'visibility',
    text: 'If your Google project has no billing, Google may use what you send with your key to improve its products, and people may review it.',
  },
];

interface KeySetupContentProps {
  mode: KeySetupMode;
  /** Whether Itik is active now. Saving then keeps Eatlog AI as the route. */
  itik: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

/** A step's marker: its number until the step is done, then a White Action check. */
function StepMarker({ index, done }: { index: number; done: boolean }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(done ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(done ? 1 : 0, {
      duration: reduced ? 0 : DURATION.short,
      easing: EASING.emphasizedDecelerate,
    });
  }, [done, progress, reduced]);

  const disc = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [M3.surfaceContainerHigh, M3.primary]),
  }));
  const number = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const check = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.6 + progress.value * 0.4 }],
  }));

  return (
    <Animated.View style={disc} className="h-8 w-8 items-center justify-center rounded-full">
      <Animated.Text style={number} className="absolute text-sm font-semibold text-m3-on-surface tabular-nums">
        {index}
      </Animated.Text>
      <Animated.View style={check} className="absolute">
        <MaterialIcons name="check" size={18} color={M3.onPrimary} />
      </Animated.View>
    </Animated.View>
  );
}

function Step({
  index,
  title,
  detail,
  done,
  last = false,
  children,
}: {
  index: number;
  title: string;
  detail?: string;
  done: boolean;
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View className="flex-row gap-4">
      <View className="items-center">
        <StepMarker index={index} done={done} />
        {last ? null : <View className="my-2 w-px flex-1 bg-m3-outline-variant" />}
      </View>
      <View className={`min-w-0 flex-1 gap-3 ${last ? '' : 'pb-7'}`}>
        <View
          accessible
          accessibilityLabel={`Step ${index}${done ? ', done' : ''}. ${title}.${detail ? ` ${detail}` : ''}`}
          className="gap-1 pt-1"
        >
          <Text className="text-base font-semibold text-m3-on-surface">{title}</Text>
          {detail ? <Text className="text-sm text-m3-on-surface-variant">{detail}</Text> : null}
        </View>
        {children}
      </View>
    </View>
  );
}

/**
 * Adding a key is the Manok consent, and the Eatlog AI consent with it: the disclosure sits above
 * the one button that both agrees and saves. Replacing a key keeps the consent already given, so
 * it drops the disclosure.
 */
export default function KeySetupContent({ mode, itik, onSaved, onCancel }: KeySetupContentProps) {
  const { horizontalPadding } = useResponsiveLayout();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [studioOpened, setStudioOpened] = useState(false);
  const savingRef = useRef(false);
  const replacing = mode === 'replace';
  const keyReady = normalizeApiKeyInput(value) !== null;

  const openStudio = useCallback(() => {
    setStudioOpened(true);
    void Linking.openURL(AI_STUDIO_URL).catch(() => undefined);
  }, []);

  const paste = useCallback(async () => {
    setError(null);
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (!text.trim()) {
      setError('Nothing to paste. Copy your key in Google AI Studio first.');
      return;
    }
    haptics.tap();
    setValue(text.trim());
  }, []);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    const key = normalizeApiKeyInput(value);
    if (!key) {
      haptics.warn();
      setError("That doesn't look like an API key. Copy the key itself, not the page link.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      // Only a definite no from Google stops the save. A check that could not finish is not a
      // verdict on the key; real use will say if something is wrong.
      if (await checkUserApiKey(key) === 'rejected') {
        haptics.warn();
        setError("Google didn't accept this key. Check that you copied all of it.");
        return;
      }
      try {
        if (replacing) await userApiKeyStore.replace(key);
        else await userApiKeyStore.save(key, itik);
      } catch {
        haptics.warn();
        setError("Couldn't save the key on this phone. Try again.");
        return;
      }
      haptics.confirm();
      setValue('');
      onSaved();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [itik, onSaved, replacing, value]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <FlowTopBar
        icon="close"
        label={replacing ? 'Close. Keep the current key.' : 'Close. Save nothing.'}
        onPress={onCancel}
        disabled={saving}
      />
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingTop: 8, paddingBottom: 32 }}
      >
        <ResponsiveContent maxWidth={FORM_MAX_WIDTH} className="gap-9">
          <View className="gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-full border border-m3-outline-variant/50 bg-m3-surface-container-high">
              <MaterialIcons name="key" size={26} color={M3.primary} />
            </View>
            <View className="gap-2">
              <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">
                {replacing ? 'Replace your key' : 'Use your Google key'}
              </Text>
              <Text className="text-base leading-6 text-m3-on-surface-variant">
                {replacing
                  ? 'The new key takes over once Google accepts it. Until then, your current key stays in use.'
                  : 'Estimates go from this phone to Google with your own key. It takes about a minute.'}
              </Text>
            </View>
          </View>

          <View>
            <Step
              index={1}
              title="Get a key from Google AI Studio"
              detail="Sign in, tap Create API key, then copy it."
              done={studioOpened || keyReady}
            >
              <Pressable
                onPress={openStudio}
                accessibilityRole="link"
                accessibilityHint="Opens Google AI Studio in your browser"
                className="min-h-[48px] flex-row items-center justify-center gap-2 self-start rounded-full border-[1.5px] border-m3-on-surface-variant/60 px-5 active:opacity-70"
              >
                <Text className="text-sm font-semibold text-m3-on-surface">Open Google AI Studio</Text>
                <MaterialIcons name="open-in-new" size={16} color={M3.onSurface} />
              </Pressable>
            </Step>
            <Step index={2} title="Paste it here" done={keyReady} last>
              <View className="min-h-[52px] flex-row items-center rounded-xl border border-m3-outline-variant/50 bg-m3-surface-container-high pl-4">
                <TextInput
                  value={value}
                  onChangeText={(next) => { setValue(next); setError(null); }}
                  accessibilityLabel="API key"
                  placeholder="Your API key"
                  placeholderTextColor={M3.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  importantForAutofill="no"
                  secureTextEntry
                  editable={!saving}
                  onSubmitEditing={() => { void save(); }}
                  returnKeyType="done"
                  className="min-h-[52px] min-w-0 flex-1 text-sm text-m3-on-surface"
                />
                <Pressable
                  onPress={() => { void paste(); }}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Paste key"
                  className="min-h-[52px] flex-row items-center gap-1.5 px-4 active:opacity-60"
                >
                  <MaterialIcons name="content-paste" size={18} color={M3.onSurface} />
                  <Text className="text-sm font-semibold text-m3-on-surface">Paste</Text>
                </Pressable>
              </View>
              {saving ? (
                <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
                  <Text className="text-sm text-m3-on-surface-variant">Checking your key with Google…</Text>
                </View>
              ) : error ? (
                <View accessibilityLiveRegion="assertive" className="flex-row items-start gap-2">
                  <MaterialIcons name="error-outline" size={18} color={M3.error} style={{ marginTop: 1 }} />
                  <Text className="min-w-0 flex-1 text-sm font-medium text-m3-error">{error}</Text>
                </View>
              ) : null}
            </Step>
          </View>

          {replacing ? null : (
            <View className="gap-4">
              <Text accessibilityRole="header" className="text-sm font-semibold text-m3-on-surface-variant">
                When you save
              </Text>
              {DISCLOSURE.map(({ icon, text }) => (
                <View key={icon} className="flex-row items-start gap-3">
                  <MaterialIcons name={icon} size={20} color={M3.onSurfaceVariant} style={{ marginTop: 1 }} />
                  <Text className="min-w-0 flex-1 text-sm leading-5 text-m3-on-surface">{text}</Text>
                </View>
              ))}
            </View>
          )}
        </ResponsiveContent>
      </ScrollView>

      <View className="shrink-0 border-t border-m3-outline-variant/40 bg-m3-surface-container-low">
        <ResponsiveContent maxWidth={FORM_MAX_WIDTH} className="px-5 pb-4 pt-4">
          <PrimaryButton
            title={replacing ? 'Save key' : 'Agree and save key'}
            onPress={() => { void save(); }}
            loading={saving}
            disabled={!value.trim()}
          />
        </ResponsiveContent>
      </View>
    </KeyboardAvoidingView>
  );
}
