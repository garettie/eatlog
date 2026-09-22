import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';

import { M3 } from '../theme/tokens';
import { saveMealPhoto } from '../utils/mealPhotos';
import { useSheetDialog } from './SheetDialog';

interface MealPhotoEditorProps {
  value: string | null;
  onChange: (uri: string | null) => void;
  disabled?: boolean;
  /** "card" = compact thumb row; "band" = full-width scan media with a Change/Remove row. */
  layout?: 'card' | 'band';
}

export default function MealPhotoEditor({
  value,
  onChange,
  disabled = false,
  layout = 'card',
}: MealPhotoEditorProps) {
  const showDialog = useSheetDialog();
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
        showDialog({
          title: source === 'camera' ? 'Camera access needed' : 'Photo access needed',
          message: `Allow ${source === 'camera' ? 'camera' : 'photo library'} access to add a meal photo.`,
          actions: [{ label: 'OK', tone: 'cancel' }],
        });
        return;
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.7,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.7,
          });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setError("Couldn't read that photo. Try another image.");
        return;
      }
      const savedUri = await saveMealPhoto(asset.uri, asset.width, asset.height);
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
    showDialog({
      title: 'Meal photo',
      actions: [
        { label: 'Take photo', tone: 'neutral', onPress: () => void pickPhoto('camera') },
        { label: 'Choose from gallery', tone: 'neutral', onPress: () => void pickPhoto('gallery') },
        { label: 'Cancel', tone: 'cancel' },
      ],
    });
  }, [busy, disabled, pickPhoto, showDialog]);

  if (layout === 'band') {
    return (
      <View className="gap-2">
        {value ? (
          <View className="gap-2">
            {failedPreviewUri === value ? (
              <View className="h-44 w-full items-center justify-center rounded-2xl bg-m3-surface-container-highest">
                <MaterialIcons name="image-not-supported" size={28} color={M3.onSurfaceVariant} />
              </View>
            ) : (
              <Image
                source={{ uri: value }}
                className="h-44 w-full rounded-2xl bg-m3-surface-container-highest"
                resizeMode="cover"
                fadeDuration={0}
                onError={() => setFailedPreviewUri(value)}
              />
            )}
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={chooseSource}
                disabled={busy || disabled}
                accessibilityRole="button"
                accessibilityLabel="Replace meal photo"
                accessibilityState={{ disabled: busy || disabled, busy }}
                className="min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-high active:opacity-60"
              >
                {busy ? (
                  <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
                ) : (
                  <>
                    <MaterialIcons name="photo-camera" size={16} color={M3.onSurfaceVariant} />
                    <Text className="text-m3-on-surface text-xs font-semibold">Change</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={() => onChange(null)}
                disabled={busy || disabled}
                accessibilityRole="button"
                accessibilityLabel="Remove meal photo"
                accessibilityState={{ disabled: busy || disabled, busy }}
                className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-m3-surface-container-high px-4 active:opacity-60"
              >
                <MaterialIcons name="delete-outline" size={16} color={M3.error} />
                <Text className="text-m3-error text-xs font-semibold">Remove</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={chooseSource}
            disabled={busy || disabled}
            accessibilityRole="button"
            accessibilityLabel="Add meal photo"
            accessibilityState={{ disabled: busy || disabled, busy }}
            className="h-44 w-full items-center justify-center gap-2 rounded-2xl bg-m3-surface-container-high border border-m3-outline-variant/30 active:opacity-70"
          >
            {busy ? (
              <ActivityIndicator size="small" color={M3.onSurfaceVariant} />
            ) : (
              <>
                <MaterialIcons name="add-a-photo" size={24} color={M3.onSurfaceVariant} />
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

  return (
    <View className="gap-2">
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
            accessibilityState={{ disabled: busy || disabled, busy }}
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
            accessibilityState={{ disabled: busy || disabled, busy }}
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
          accessibilityState={{ disabled: busy || disabled, busy }}
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
