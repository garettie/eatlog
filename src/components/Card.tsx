import React from 'react';
import { View } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Reusable M3 Card — bg-m3-surface-container, rounded-3xl, hairline border.
 * Never add drop shadows. Use className to extend (e.g. add padding).
 * All screens use this component so it stays visually consistent.
 */
export default function Card({ children, className = '' }: CardProps) {
  return (
    <View
      className={`bg-m3-surface-container rounded-3xl border border-m3-outline-variant/30 ${className}`}
    >
      {children}
    </View>
  );
}
