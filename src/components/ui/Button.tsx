import { TouchableOpacity, Text, TouchableOpacityProps } from 'react-native';

interface ButtonProps extends TouchableOpacityProps {
    title: string;
    variant?: 'primary' | 'secondary';
    className?: string;
}

export const Button = ({ title, variant = 'primary', className, ...props }: ButtonProps) => {
    const bgClass = variant === 'primary' ? 'bg-primary' : 'bg-gray-700';

    return (
        <TouchableOpacity
            className={`${bgClass} py-3 px-6 rounded-full items-center active:opacity-80 ${className}`}
            {...props}
        >
            <Text className="text-white font-semibold text-lg">{title}</Text>
        </TouchableOpacity>
    );
};
