import React from 'react';
import { Pressable, Text, ActivityIndicator } from 'react-native';
import { colors } from '../../theme/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  className,
}) => {
  const isDisabled = disabled || loading;

  const bg =
    variant === 'primary' ? 'bg-accent'
    : variant === 'danger' ? 'bg-danger'
    : 'bg-transparent border-2 border-surfaceDark';

  const textColor =
    variant === 'outline' ? 'text-textOnDark' : 'text-textOnSurface';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`${bg} rounded-2xl py-4 items-center justify-center ${isDisabled ? 'opacity-50' : ''} ${className ?? ''}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? colors.textOnDark : colors.textOnSurface} />
      ) : (
        <Text className={`${textColor} font-bold text-base`}>{title}</Text>
      )}
    </Pressable>
  );
};
