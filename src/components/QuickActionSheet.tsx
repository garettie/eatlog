import React, { forwardRef, useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';

interface ActionOptionProps {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  subtitle: string;
  onPress: () => void;
}

function ActionOption({ icon, label, subtitle, onPress }: ActionOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-4 px-4 py-4 active:opacity-60"
    >
      <View className="w-12 h-12 rounded-full bg-m3-surface-container-highest items-center justify-center">
        <MaterialIcons name={icon} size={22} color="#e2e2e9" />
      </View>
      <View className="flex-1">
        <Text className="text-m3-on-surface font-semibold text-sm">{label}</Text>
        <Text className="text-m3-on-surface-variant text-xs mt-0.5">{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#c4c6d0" />
    </Pressable>
  );
}

const QuickActionSheet = forwardRef<BottomSheetModal>((_, ref) => {
  const navigation = useNavigation<any>();

  const dismiss = useCallback(() => {
    (ref as React.RefObject<BottomSheetModal>).current?.dismiss();
  }, [ref]);

  const handleLogFood = useCallback(() => {
    dismiss();
    setTimeout(() => {
      navigation.navigate('FoodSearch');
    }, 350);
  }, [dismiss, navigation]);

  const handleLogWeight = useCallback(() => {
    dismiss();
  }, [dismiss]);

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['26%']}
      backgroundStyle={{ backgroundColor: '#1d2024' }}
      handleIndicatorStyle={{ backgroundColor: '#44474f', width: 40 }}
      animationConfigs={{ duration: 300 }}
    >
      <BottomSheetView className="flex-1 px-2 pb-4">
        <View className="px-4 py-3">
          <Text className="text-m3-on-surface-variant text-xs font-semibold uppercase tracking-wider">
            Quick Actions
          </Text>
        </View>

        <ActionOption
          icon="restaurant"
          label="Log Food"
          subtitle="Search database or enter manually"
          onPress={handleLogFood}
        />
        <View className="h-px bg-m3-outline-variant/30 mx-4" />
        <ActionOption
          icon="monitor-weight"
          label="Log Weight"
          subtitle="Record today's scale weight"
          onPress={handleLogWeight}
        />
      </BottomSheetView>
    </BottomSheetModal>
  );
});

QuickActionSheet.displayName = 'QuickActionSheet';
export default QuickActionSheet;
