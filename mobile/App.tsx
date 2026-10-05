import "./global.css";
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator, StatusBar } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { loadSession, type UserRole } from "./lib/auth";
import { initSyncEngine } from "./lib/sync";

// Screens
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import AttendanceScreen from "./screens/AttendanceScreen";
import LeavesScreen from "./screens/LeavesScreen";
import NotificationsScreen from "./screens/NotificationsScreen";
import SitesScreen from "./screens/SitesScreen";
import ProfileScreen from "./screens/ProfileScreen";
import AdminDashboardScreen from "./screens/AdminDashboardScreen";

const Tab = createBottomTabNavigator();

// ─── Apple iOS Tab Icon Component ─────────────────────────────────────────────

interface TabIconProps {
  name: keyof typeof Ionicons.glyphMap;
  outlineName: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  badge?: number;
}

function TabIcon({ name, outlineName, focused, badge }: TabIconProps) {
  return (
    <View className="items-center justify-center relative">
      <Ionicons
        name={focused ? name : outlineName}
        size={23}
        color={focused ? "#F59E0B" : "#9CA3AF"}
      />
      {badge && badge > 0 ? (
        <View className="absolute -top-1 -right-2.5 bg-[#DC2626] rounded-full min-w-[16px] h-4 px-1 items-center justify-center">
          <Text className="text-white text-[9px] font-bold">
            {badge > 9 ? "9+" : badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Main Tab Navigator ───────────────────────────────────────────────────────

function MainApp({ onLogout }: { onLogout: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#F3E8C8",
          borderTopWidth: 1,
          height: 54 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 4,
          elevation: 8,
          shadowColor: "#F59E0B",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: -0.2,
          marginTop: 1,
        },
        tabBarActiveTintColor: "#F59E0B", // Solar Amber
        tabBarInactiveTintColor: "#9CA3AF",
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="home" outlineName="home-outline" focused={focused} />
          ),
          tabBarLabel: "Today",
        }}
      >
        {() => <HomeScreen />}
      </Tab.Screen>

      <Tab.Screen
        name="Attendance"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="calendar" outlineName="calendar-outline" focused={focused} />
          ),
          tabBarLabel: "Attendance",
        }}
        component={AttendanceScreen}
      />

      <Tab.Screen
        name="Leaves"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="document-text" outlineName="document-text-outline" focused={focused} />
          ),
          tabBarLabel: "Leaves",
        }}
        component={LeavesScreen}
      />

      <Tab.Screen
        name="Notifications"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="notifications" outlineName="notifications-outline" focused={focused} />
          ),
          tabBarLabel: "Alerts",
        }}
        component={NotificationsScreen}
      />

      <Tab.Screen
        name="Sites"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="location" outlineName="location-outline" focused={focused} />
          ),
          tabBarLabel: "Sites",
        }}
        component={SitesScreen}
      />

      <Tab.Screen
        name="Profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="person" outlineName="person-outline" focused={focused} />
          ),
          tabBarLabel: "Profile",
        }}
      >
        {() => <ProfileScreen onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<UserRole>("USER");
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const session = await loadSession();
      if (session) {
        setAuthed(true);
        setRole(session.user?.role === "ADMIN" ? "ADMIN" : "USER");
      } else {
        setAuthed(false);
      }
    } catch {
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (authed) {
      const cleanup = initSyncEngine();
      return cleanup;
    }
  }, [authed]);

  if (loading) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFBF0" />
        <View className="flex-1 items-center justify-center bg-[#FFFBF0]">
          <View className="w-20 h-20 rounded-3xl bg-[#FEF3C7] border border-[#F3E8C8] items-center justify-center mb-4 shadow-solar">
            <Ionicons name="sunny" size={36} color="#F59E0B" />
          </View>
          <ActivityIndicator color="#F59E0B" className="mt-4" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!authed) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFBF0" />
        <LoginScreen onLogin={checkAuth} />
      </SafeAreaProvider>
    );
  }

  // Requirement H.22: If role is ADMIN, show an admin interface and NO check-in or tracking.
  if (role === "ADMIN") {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFBF0" />
        <AdminDashboardScreen onLogout={() => setAuthed(false)} />
      </SafeAreaProvider>
    );
  }

  // If role is USER, show the user duty and attendance screens
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFBF0" />
      <NavigationContainer>
        <MainApp onLogout={() => setAuthed(false)} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
