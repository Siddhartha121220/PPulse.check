import React from 'react';
import { View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  /** Nested dark inset panel instead of the default cream surface (see REQUIREMENTS.md §4.1). */
  dark?: boolean;
  children: React.ReactNode;
}

/**
 * Base rounded card — cream surface by default, or a dark inset panel meant to sit
 * inside a cream Card (matches the reference design's nested-panel language).
 */
export const Card: React.FC<CardProps> = ({ dark, className, children, ...rest }) => {
  const base = dark ? 'bg-surfaceDark' : 'bg-surface';
  return (
    <View className={`${base} rounded-3xl p-5 ${className ?? ''}`} {...rest}>
      {children}
    </View>
  );
};
