import { View, ViewProps } from 'react-native';

export const Card = ({ className, ...props }: ViewProps & { className?: string }) => {
    return (
        <View
            className={`bg-card rounded-2xl p-4 shadow-sm ${className}`}
            {...props}
        />
    );
};
