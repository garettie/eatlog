import React from 'react';
import { type StyleProp, type ViewStyle, View } from 'react-native';

interface ResponsiveContentProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}

export default function ResponsiveContent({
  children,
  className = '',
  maxWidth,
  style,
}: ResponsiveContentProps) {
  return (
    <View
      className={className}
      style={[{ alignSelf: 'center', width: '100%', maxWidth }, style]}
    >
      {children}
    </View>
  );
}
