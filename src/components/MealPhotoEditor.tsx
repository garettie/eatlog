import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';

import { M3 } from '../theme/tokens';
import { saveMealPhoto } from '../utils/mealPhotos';

interface MealPhotoEditorProps {
  value: string | null;
  onChange: (uri: string | null) => void;
  disabled?: boolean;
}

export default function MealPhotoEditor({
  value,
  onChange,
  disabled = false,
}: MealPhotoEditorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedPreviewUri, setFailedPreviewUri] = useState<string | null>(null);

  useEffect(() => {
    setFailedPreviewUri(null);
  }, [value]);

  const pickPhoto = useCallback(async (source: 'camera' | 'gallery') => {
    setError(null);
    setBusy(true);
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(
          source === 'camera' ? 'Camera access needed' : 'Photo access needed',
          `Allow ${source === 'camera' ? 'camera' : 'photo library'} access to add a meal photo.`,
        );
        return;
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            base64: true,
            quality: 0.7,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            base64: true,
            quality: 0.7,
          });
      if (result.canceled) return;

      const base64 = result.assets?.[0]?.base64;
      if (!base64) {
        setError("Couldn't read that photo. Try another image.");
        return;
      }
      const savedUri = await saveMealPhoto(base64);
      if (!savedUri) {
        setError("Couldn't save that photo. Try again.");
        return;
      }
      onChange(savedUri);
    } catch (photoError) {
      console.error('[MealPhotoEditor] photo selection failed', photoError);
      setError("Couldn't add that photo. Try again.");
    } finally {
      setBusy(false);
    }
  }, [onChange]);

  const chooseSource = useCallback(() => {
    if (busy || disabled) return;
    Alert.alert('Meal photo', 'Choose a photo source.', [
      { text: 'Camera', onPress: () => void pickPhoto('camera') },
      { text: 'Gallery', onPress: () => void pickPhoto('gallery') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [busy, disabled, pickPhoto]);

  return (
    <View className="px-5 pb-2 gap-2">
      {value ? (
        <View className="min-h-[88px] flex-row items-center gap-3 rounded-2xl bg-m3-surface-container-high px-3 py-2 border border-m3-outline-variant/30">
          {failedPreviewUri === value ? (
            <View className="h-16 w-20 items-center justify-center rounded-xl bg-m3-surface-container-highest">
              <MaterialIcons name="image-not-supported" size={22} color={M3.onSurfaceVariant} />
            </View>
          ) : (
            <Image
              source={{ uri: value }}
              className="h-16 w-20 rounded-xl bg-m3-surface-container-highest"
              resizeMode="cover"
              fadeDuration={0}
              onError={() => setFailedPreviewUri(value)}
            />
          )}
          <View className="flex-1 min-w-0">
            <Text className="text-m3-on-surface text-sm font-semibold">Meal photo</Text>
            <Text className="text-m3-on-surface-variant text-xs">Shown in your Diary</Text>
          </View>
          <Pressable
            onPress={chooseSource}
            disabled={busy || disabled}
            accessibilityRole="button"
            accessibilityLabel="Replace meal photo"
            className="min-h-[48px] justify-center px-2 active:opacity-60"
          >
            {busy ? (
              <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
            ) : (
              <Text className="text-m3-on-surface text-xs font-semibold">Change</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => onChange(null)}
            disabled={busy || disabled}
            accessibilityRole="button"
            accessibilityLabel="Remove meal photo"
            className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
          >
            <MaterialIcons name="delete-outline" size={19} color={M3.error} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={chooseSource}
          disabled={busy || disabled}
          accessibilityRole="button"
          accessibilityLabel="Add meal photo"
          className="min-h-[52px] flex-row items-center justify-center gap-2 rounded-2xl bg-m3-surface-container-high border border-m3-outline-variant/30 active:opacity-70"
        >
          {busy ? (
            <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
          ) : (
            <>
              <MaterialIcons name="add-a-photo" size={18} color={M3.onSurfaceVariant} />
              <Text className="text-m3-on-surface text-sm font-semibold">Add photo</Text>
            </>
          )}
        </Pressable>
      )}
      {error && (
        <Text className="text-m3-error text-xs font-medium" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      )}
    </View>
  );
}
