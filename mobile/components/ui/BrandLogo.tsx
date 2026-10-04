import React from 'react';
import { View, Image, Text, ImageStyle, ViewStyle } from 'react-native';

interface BrandLogoProps {
  size?: number;
  showText?: boolean;
  style?: ViewStyle;
  variant?: 'mark' | 'full';
}

export function BrandLogo({ size = 48, showText = false, style, variant = 'full' }: BrandLogoProps) {
  const source = variant === 'mark' 
    ? require('../../assets/logo-mark.png')
    : require('../../assets/logo.png');

  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      <Image
        source={source}
        style={{
          width: variant === 'mark' ? size : size * 2,
          height: size,
          resizeMode: 'contain',
        } as ImageStyle}
      />
      {showText && (
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#1F2937', letterSpacing: -0.5 }}>
            Sologix Energy
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B7280', marginTop: 2 }}>
            Powering Attendance with the Sun
          </Text>
        </View>
      )}
    </View>
  );
}

export default BrandLogo;
