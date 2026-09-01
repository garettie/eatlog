import React from 'react';
import { View } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/** Tonal container for independently grouped content, not a default page wrapper. */
export default function Card({ children, className = '' }: CardProps) {
  return (
    <View
      className={`bg-m3-surface-container rounded-3xl border border-m3-outline-variant/30 ${className}`}
    >
      {children}
    </View>
  );
}
