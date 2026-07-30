import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { M3 } from '../theme/tokens';

const tabIcons = {
  Today: 'grid-view',
  Diary: 'menu-book',
  Analytics: 'show-chart',
  Profile: 'person',
} as const;

interface MarcoTabBarProps extends BottomTabBarProps {
  onAddEntry: () => void;
}

export default function MarcoTabBar({ state, descriptors, navigation, onAddEntry }: MarcoTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 12);

  const handleAddEntry = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAddEntry();
  }, [onAddEntry]);

  return (
    <View
      className="flex-row items-start border-t border-outline-variant bg-surface-container px-1 pt-2"
      style={{ paddingBottom: bottomPadding, minHeight: 56 + bottomPadding }}
    >
      {state.routes.slice(0, 2).map((route, index) => (
        <TabControl
          key={route.key}
          route={route}
          focused={state.index === index}
          descriptor={descriptors[route.key]}
          navigation={navigation}
        />
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add entry"
        className="min-h-12 flex-1 items-center"
        onPress={handleAddEntry}
      >
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary" style={{ marginTop: -20 }}>
          <MaterialIcons name="add" size={28} color={M3.onPrimary} />
        </View>
      </Pressable>

      {state.routes.slice(2).map((route, index) => (
        <TabControl
          key={route.key}
          route={route}
          focused={state.index === index + 2}
          descriptor={descriptors[route.key]}
          navigation={navigation}
        />
      ))}
    </View>
  );
}

type TabControlProps = Pick<MarcoTabBarProps, 'navigation'> & {
  route: MarcoTabBarProps['state']['routes'][number];
  focused: boolean;
  descriptor: MarcoTabBarProps['descriptors'][string];
};

function TabControl({ route, focused, descriptor, navigation }: TabControlProps) {
  const options = descriptor.options;
  const name = route.name as keyof typeof tabIcons;
  const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
  const color = focused ? M3.primary : M3.onSurfaceVariant;

  const onPress = () => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
      accessibilityState={{ selected: focused }}
      className="min-h-12 flex-1 items-center justify-center gap-0.5"
      onPress={onPress}
      onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
    >
      <MaterialIcons name={tabIcons[name]} size={24} color={color} />
      <Text className={focused ? 'font-inter-medium text-xs text-primary' : 'font-inter-medium text-xs text-on-surface-variant'}>{label}</Text>
    </Pressable>
  );
}
