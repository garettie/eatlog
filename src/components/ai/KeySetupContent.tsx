import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import PrimaryButton from '../PrimaryButton';
import ResponsiveContent from '../ResponsiveContent';
import { checkUserApiKey } from '../../services/foodEstimateDirect';
import { normalizeApiKeyInput, userApiKeyStore } from '../../services/userApiKey';
import { TIER_NAMES } from '../../services/tierNames';
import { FORM_MAX_WIDTH, useResponsiveLayout } from '../../theme/layout';
import { M3 } from '../../theme/tokens';

export type KeySetupMode = 'add' | 'replace';

const AI_STUDIO_URL = 'https://aistudio.google.com/app/apikey';

const STEPS = [
  'Open Google AI Studio and sign in.',
  'Tap Create API key, then copy it.',
  'Paste it here.',
];

interface KeySetupContentProps {
  mode: KeySetupMode;
  /** Whether Itik is active now. Saving then keeps Eatlog AI as the route. */
  itik: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * Adding a key is the Manok consent: the disclosure sits above the one button that both agrees
 * and saves. Replacing a key keeps the consent already given, so it drops the disclosure.
 */
export default function KeySetupContent({ mode, itik, onSaved, onCancel }: KeySetupContentProps) {
  const { horizontalPadding } = useResponsiveLayout();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const replacing = mode === 'replace';

  const paste = useCallback(async () => {
    setError(null);
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (!text.trim()) {
      setError('Nothing to paste. Copy your key in Google AI Studio first.');
      return;
    }
    setValue(text.trim());
  }, []);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    const key = normalizeApiKeyInput(value);
    if (!key) {
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
        setError("Google didn't accept this key. Check that you copied all of it.");
        return;
      }
      try {
        if (replacing) await userApiKeyStore.replace(key);
        else await userApiKeyStore.save(key, itik);
      } catch {
        setError("Couldn't save the key on this phone. Try again.");
        return;
      }
      setValue('');
      onSaved();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [itik, onSaved, replacing, value]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingTop: 24, paddingBottom: 24 }}
      >
        <ResponsiveContent maxWidth={FORM_MAX_WIDTH} className="gap-7">
          <View className="gap-1.5">
            <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">
              {replacing ? 'Replace your key' : 'Use your Google key'}
            </Text>
            <Text className="text-sm text-m3-on-surface-variant">
              {replacing
                ? 'The new key takes over once Google accepts it. Until then, your current key stays in use.'
                : 'Estimates go from this phone to Google with your own key. It takes about a minute.'}
            </Text>
          </View>

          <View className="gap-4">
            <View className="gap-3" accessibilityRole="list">
              {STEPS.map((step, index) => (
                <View key={step} className="flex-row items-center gap-3">
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-m3-surface-container-high">
                    <Text className="text-sm font-semibold text-m3-on-surface tabular-nums">{index + 1}</Text>
                  </View>
                  <Text className="flex-1 text-sm text-m3-on-surface">{step}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => { void Linking.openURL(AI_STUDIO_URL).catch(() => undefined); }}
              accessibilityRole="link"
              accessibilityHint="Opens Google AI Studio in your browser"
              className="min-h-[48px] flex-row items-center justify-center gap-2 self-start rounded-full border-[1.5px] border-m3-on-surface-variant/60 px-5 active:opacity-70"
            >
              <Text className="text-sm font-semibold text-m3-on-surface">Open Google AI Studio</Text>
              <MaterialIcons name="open-in-new" size={16} color={M3.onSurface} />
            </Pressable>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-semibold text-m3-on-surface-variant">API key</Text>
            <View className="flex-row items-center gap-2">
              <TextInput
                value={value}
                onChangeText={(next) => { setValue(next); setError(null); }}
                accessibilityLabel="API key"
                placeholder="Paste your key"
                placeholderTextColor={M3.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                spellCheck={false}
                importantForAutofill="no"
                secureTextEntry
                onSubmitEditing={() => { void save(); }}
                returnKeyType="done"
                className="min-h-[52px] flex-1 rounded-xl border border-m3-outline-variant/50 bg-m3-surface-container-high px-4 text-sm text-m3-on-surface"
              />
              <Pressable
                onPress={() => { void paste(); }}
                accessibilityRole="button"
                accessibilityLabel="Paste key"
                className="min-h-[52px] items-center justify-center rounded-full bg-m3-surface-container-high px-5 active:opacity-70"
              >
                <Text className="text-sm font-semibold text-m3-on-surface">Paste</Text>
              </Pressable>
            </View>
            {error ? (
              <Text
                accessibilityLiveRegion="assertive"
                className="rounded-xl bg-m3-error-container px-4 py-3 text-sm text-m3-on-error-container"
              >
                {error}
              </Text>
            ) : null}
          </View>

          {replacing ? null : (
            <View className="gap-3 rounded-2xl bg-m3-surface-container-low p-4">
              <Text className="text-sm leading-5 text-m3-on-surface">
                Eatlog sends the photo, meal title, or description you choose from this phone to Google Gemini with your key. Nothing goes through Eatlog.
              </Text>
              <Text className="text-sm leading-5 text-m3-on-surface-variant">
                {TIER_NAMES.manok} is free in Eatlog. Google sets your key's limits, and may charge you if billing is enabled on your Google project.
              </Text>
              <Text className="text-sm leading-5 text-m3-on-surface-variant">
                If your Google project has no billing, Google may use what you send to improve its products, and people may review it.
              </Text>
            </View>
          )}
        </ResponsiveContent>
      </ScrollView>

      <View className="shrink-0 border-t border-m3-outline-variant/40 bg-m3-surface-container-low">
        <ResponsiveContent maxWidth={FORM_MAX_WIDTH} className="gap-1 px-5 pb-3 pt-4">
          <PrimaryButton
            title={replacing ? 'Save key' : 'Agree and save key'}
            onPress={() => { void save(); }}
            loading={saving}
            disabled={!value.trim()}
          />
          <Pressable
            onPress={onCancel}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={replacing ? 'Cancel. Keep the current key.' : 'Not now. Save nothing.'}
            className={`min-h-[48px] items-center justify-center px-5 active:opacity-60 ${saving ? 'opacity-50' : ''}`}
          >
            <Text className="text-base font-semibold text-m3-on-surface-variant">{replacing ? 'Cancel' : 'Not now'}</Text>
          </Pressable>
        </ResponsiveContent>
      </View>
    </KeyboardAvoidingView>
  );
}
