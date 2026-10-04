import React from "react";
import { TextInput, TextInputProps } from "react-native";
import { cn } from "../../lib/utils";

export interface InputProps extends TextInputProps {
  className?: string;
}

/**
 * Sologix Solar Theme Text Input
 */
export function Input({ className, style, ...props }: InputProps) {
  return (
    <TextInput
      placeholderTextColor="#9CA3AF"
      className={cn(
        "bg-white border border-[#E5DCC0] rounded-xl text-[#1F2937] px-3.5 py-3 text-[15px] min-h-[44px]",
        className
      )}
      style={style}
      {...props}
    />
  );
}
