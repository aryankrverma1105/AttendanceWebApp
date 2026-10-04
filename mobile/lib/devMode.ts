/**
 * Mock-location / "developer mode" guard.
 *
 * Android only reports whether a GPS fix came from a mock-location provider
 * (expo-location's `mocked` flag) when Developer Options + "Select mock
 * location app" are both turned on. That's the only developer-mode signal
 * available in Expo's managed workflow without a custom native module, so it
 * doubles as this app's anti-spoofing gate — it's also the flag the backend's
 * anomaly detection (`isMock`) expects on every location submission.
 *
 * Set EXPO_PUBLIC_ALLOW_DEV_MODE=true in .env to bypass the gate on
 * development devices/emulators that rely on mock locations for testing.
 */
import * as Location from "expo-location";
import { Platform } from "react-native";

export const ALLOW_DEV_MODE = process.env.EXPO_PUBLIC_ALLOW_DEV_MODE === "true";

type MockChangeListener = (mocked: boolean) => void;
const _listeners = new Set<MockChangeListener>();
let _lastKnownMocked = false;

/** Subscribe to mock-location detections observed during live tracking. */
export function onMockLocationChange(cb: MockChangeListener): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

/** Called by lib/location.ts for every raw fix received during tracking. */
export function reportLocationSample(mocked: boolean): void {
  if (mocked === _lastKnownMocked) return;
  _lastKnownMocked = mocked;
  _listeners.forEach((cb) => cb(mocked));
}

/**
 * Actively fetches a fix and reports whether it is mock. Used as a one-shot
 * gate check (e.g. right after login) before continuous tracking begins.
 * Returns false when permission isn't granted yet or on iOS/web, where
 * expo-location cannot report mock status.
 */
export async function checkMockLocationNow(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const perms = await Location.getForegroundPermissionsAsync();
    if (perms.status !== "granted") return false;

    const cached = await Location.getLastKnownPositionAsync().catch(() => null);
    if (cached) return !!cached.mocked;

    const fresh = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Lowest,
    }).catch(() => null);
    return !!fresh?.mocked;
  } catch {
    return false;
  }
}
