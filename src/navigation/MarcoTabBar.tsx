import React, { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { M3 } from '../theme/tokens';
import { NAVIGATION_RAIL_WIDTH, useResponsiveLayout } from '../theme/layout';

const tabIcons = {
  Today: 'grid-view',
  Diary: 'menu-book',
  Analytics: 'show-chart',
  Profile: 'person',
} as const;

interface MarcoTabBarProps extends BottomTabBarProps {
  onAddEntry: () => void;
}

function MarcoTabBar({ state, descriptors, navigation, onAddEntry }: MarcoTabBarProps) {
  const insets = useSafeAreaInsets();
  const { isMedium } = useResponsiveLayout();
  const bottomPadding = Math.max(insets.bottom, 12);

  const handleAddEntry = useCallback(() => {
    onAddEntry();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [onAddEntry]);

  const leadingRoutes = state.routes.slice(0, 2);
  const trailingRoutes = state.routes.slice(2);

  if (isMedium) {
    return (
      <View
        className="items-center border-r border-m3-outline-variant bg-m3-surface-container px-2"
        style={{
          width: NAVIGATION_RAIL_WIDTH,
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 12),
        }}
      >
        <ScrollView
          className="flex-1 w-full"
          contentContainerClassName="flex-grow justify-center gap-1"
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
        >
          {leadingRoutes.map((route, index) => (
            <TabControl
              key={route.key}
              route={route}
              focused={state.index === index}
              descriptor={descriptors[route.key]}
              navigation={navigation}
              rail
            />
          ))}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add entry"
            className="min-h-[68px] w-full items-center justify-center"
            onPress={handleAddEntry}
          >
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-m3-primary">
              <MaterialIcons name="add" size={28} color={M3.onPrimary} />
            </View>
          </Pressable>

          {trailingRoutes.map((route, index) => (
            <TabControl
              key={route.key}
              route={route}
              focused={state.index === index + 2}
              descriptor={descriptors[route.key]}
              navigation={navigation}
              rail
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      className="flex-row items-center border-t border-m3-outline-variant bg-m3-surface-container px-1"
      style={{ paddingBottom: bottomPadding, minHeight: 80 + bottomPadding }}
    >
      {leadingRoutes.map((route, index) => (
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
        className="min-h-16 flex-1 items-center justify-center"
        onPress={handleAddEntry}
      >
        <View
          className="items-center justify-center"
          style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: M3.primary }}
        >
          <MaterialIcons name="add" size={28} color={M3.onPrimary} />
        </View>
      </Pressable>

      {trailingRoutes.map((route, index) => (
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
  rail?: boolean;
};

const TabControl = React.memo(function TabControl({ route, focused, descriptor, navigation, rail = false }: TabControlProps) {
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
      className={rail ? 'min-h-[64px] w-full items-center justify-center' : 'min-h-12 flex-1 items-center justify-center'}
      onPress={onPress}
      onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
    >
      <View className={`items-center justify-center gap-0.5 ${rail ? 'min-w-[72px] rounded-2xl px-2 py-2' : ''} ${rail && focused ? 'bg-m3-surface-container-highest' : ''}`}>
        <MaterialIcons name={tabIcons[name]} size={24} color={color} />
        <Text
          className="font-medium text-xs"
          style={{ color }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
});

export default React.memo(MarcoTabBar);
