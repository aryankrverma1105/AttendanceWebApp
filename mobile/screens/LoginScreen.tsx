import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storeUser } from '../lib/auth';
import { mobileApi } from '../lib/api';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { BrandLogo } from '../components/ui/BrandLogo';

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your work email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await mobileApi.login(email.trim(), password.trim());
      if (!res.success || !res.token) {
        throw new Error((res as any).message || 'Invalid credentials. Please try again.');
      }
      await storeUser(res.token, res.user, res.refreshToken);
      onLogin();
    } catch (err: any) {
      setError(err.message ?? 'Login failed. Check your network connection.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#FFFBF0]"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerClassName="flex-grow justify-center p-5 pt-12 pb-12"
        keyboardShouldPersistTaps="handled">
        {/* Sologix Solar Logo & Title */}
        <View className="mb-8 items-center">
          <View className="w-20 h-20 mb-3 items-center justify-center rounded-3xl bg-[#FEF3C7] border border-[#F3E8C8]">
            <BrandLogo size={52} />
          </View>
          <Text className="text-[28px] font-extrabold tracking-tight text-[#1F2937]">Sologix Energy</Text>
          <Text className="mt-1 text-center text-[14px] font-semibold text-[#D97706]">
            Powering Attendance with the Sun
          </Text>
        </View>

        {/* Solar Card Form */}
        <Card className="gap-4 p-5 border-[#F3E8C8] bg-white">
          <View>
            <Text className="text-[17px] font-bold tracking-tight text-[#1F2937]">Sign In</Text>
            <Text className="mt-0.5 text-[13px] text-[#6B7280]">
              Access your field operations portal
            </Text>
          </View>

          {/* Email Input */}
          <View className="gap-1">
            <Text className="text-[13px] font-semibold text-[#1F2937]">Work Email</Text>
            <Input
              placeholder="name@company.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              editable={!loading}
            />
          </View>

          {/* Password Input */}
          <View className="gap-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-[13px] font-semibold text-[#1F2937]">Password</Text>
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text className="text-[13px] font-medium text-[#D97706]">
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
            <Input
              placeholder="Required"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!loading}
            />
          </View>

          {/* Error Banner */}
          {error && (
            <View className="flex-row items-center gap-2 rounded-xl border border-[#DC2626]/20 bg-[#FEE2E2] p-3">
              <Ionicons name="alert-circle" size={18} color="#DC2626" />
              <Text className="flex-1 text-[13px] font-medium text-[#DC2626]">{error}</Text>
            </View>
          )}

          {/* Primary Action Button */}
          <Button
            variant="default"
            size="default"
            onPress={handleLogin}
            loading={loading}
            className="mt-1 bg-[#F59E0B] border-transparent"
            textClassName="text-[#1F2937] font-bold">
            Sign In to Sologix
          </Button>
        </Card>

        {/* Bottom Credit */}
        <View className="mt-8 items-center">
          <Text className="text-[12px] font-medium text-[#6B7280]">
            &copy; 2026 Sologix Energy &bull; Made by Aryan Kumar Verma
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
