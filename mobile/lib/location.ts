/**
 * location.ts  –  High-accuracy fused location service for Sologix Energy mobile
 *
 * Architecture & Strategy:
 *  1. Uses expo-location with Accuracy.BestForNavigation (GPS + Wi-Fi + Cell).
 *  2. Android uses Fused Location Provider; iOS uses CoreLocation "Best" mode.
 *  3. Initial fix accepted immediately; subsequent readings filtered for accuracy <= 150m.
 *  4. Dynamic exponential smoothing (Kalman-like) adapts between stationary jitter damping
 *     and responsive movement tracking.
 *  5. Movement-driven submission: whenever the employee moves >= 3 meters, position is
 *     transmitted immediately to the backend. Periodic heartbeats occur every 10s if stationary.
 *  6. Seamless employeeId fallback from SecureStore session cache.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { mobileApi } from './api';
import { queuePendingLocation } from './outbox';
import { triggerSync } from './sync';

// ── Constants ────────────────────────────────────────────────────────────────
export const BACKGROUND_LOCATION_TASK = 'sologix-background-location';

/** Accept fixes up to 150m (accommodates indoor Wi-Fi & cellular fixes) */
const MAX_ACCEPTED_ACCURACY_M = 150;

/** Periodic heartbeat submission interval when stationary (10 seconds) */
const HEARTBEAT_INTERVAL_MS = 10_000;

/** Minimum time between submissions (1 second) to prevent burst floods */
const MIN_SUBMIT_GAP_MS = 1_000;

/** Distance threshold in meters to trigger an immediate backend update */
const MOVEMENT_THRESHOLD_METERS = 3;

// ── Internal State ───────────────────────────────────────────────────────────
let _smoothed: { lat: number; lon: number } | null = null;
let _lastSubmittedPos: { lat: number; lon: number } | null = null;
let _lastSubmitTs = 0;
let _watcher: Location.LocationSubscription | null = null;
let _cachedEmployeeId: string | null = null;

export type LocationState = {
  latitude: number;
  longitude: number;
  accuracy: number; // metres
  speed: number | null; // m/s
  heading: number | null;
  timestamp: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  mocked?: boolean;
};

type LocationListener = (state: LocationState) => void;
const _listeners = new Set<LocationListener>();

import { calculateGeodesicDistanceWGS84 } from './geo';

// ── Distance Calculation (WGS-84 Geodesic) ────────────────────────────────────
function geodesicDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return calculateGeodesicDistanceWGS84(lat1, lon1, lat2, lon2);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Subscribe to live location updates. Returns unsubscribe function. */
export function onLocationUpdate(cb: LocationListener): () => void {
  _listeners.add(cb);
  // Emit current smoothed position immediately if available
  if (_smoothed) {
    cb({
      latitude: _smoothed.lat,
      longitude: _smoothed.lon,
      accuracy: 10,
      speed: null,
      heading: null,
      timestamp: Date.now(),
      quality: 'good',
    });
  } else {
    getCurrentPosition().then((pos) => {
      if (pos && !_smoothed) {
        cb(pos);
      }
    });
  }
  return () => _listeners.delete(cb);
}

/** Cache or refresh employeeId from stored session or backend profile */
export async function refreshEmployeeSession(): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync('sologix_user');
    if (raw) {
      const user = JSON.parse(raw);
      if (user.employeeId) {
        _cachedEmployeeId = user.employeeId;
      }
    }

    // Check with backend /auth/me to ensure employeeId is valid and up-to-date
    const token = await SecureStore.getItemAsync('sologix_token');
    if (token) {
      const meRes = await mobileApi.getMe().catch(() => null);
      if (meRes?.success && meRes.user?.employee?.id) {
        _cachedEmployeeId = meRes.user.employee.id;
        if (raw) {
          const user = JSON.parse(raw);
          user.employeeId = _cachedEmployeeId;
          await SecureStore.setItemAsync('sologix_user', JSON.stringify(user));
        }
      }
    }

    return _cachedEmployeeId;
  } catch (err) {
    console.warn('[Location] Failed to read session cache:', err);
  }
  return null;
}

/** Request permissions (foreground + optional background). */
export async function requestPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    let bg = false;
    if (fg.status === 'granted') {
      try {
        const bgRes = await Location.requestBackgroundPermissionsAsync();
        bg = bgRes.status === 'granted';
      } catch {
        // Background permission may not be available on all devices/simulators
      }
    }
    return {
      foreground: fg.status === 'granted',
      background: bg,
    };
  } catch (err) {
    console.warn('[Location] Error requesting permissions:', err);
    return { foreground: false, background: false };
  }
}

/** Check current permission status without prompting. */
export async function getPermissionStatus(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    let bg = false;
    try {
      const bgRes = await Location.getBackgroundPermissionsAsync();
      bg = bgRes.status === 'granted';
    } catch {}
    return {
      foreground: fg.status === 'granted',
      background: bg,
    };
  } catch {
    return { foreground: false, background: false };
  }
}

let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _currentPositionPromise: Promise<LocationState | null> | null = null;

/** Helper to wrap any async operation with a strict timeout */
function withTimeout<T>(promise: Promise<T>, ms = 3000, label = 'Operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** Ensure system location services & high accuracy network provider are active on Android */
export async function ensureLocationProviders(): Promise<boolean> {
  try {
    const hasServices = await Location.hasServicesEnabledAsync();
    if (!hasServices) {
      if (Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }

    if (Platform.OS === 'android') {
      try {
        const status = await Location.getProviderStatusAsync();
        if (!status.networkAvailable) {
          console.log(
            '[Location] Network provider inactive, requesting elevation via enableNetworkProviderAsync...'
          );
          await Location.enableNetworkProviderAsync().catch(() => {});
        }
      } catch (err: any) {
        console.log('[Location] enableNetworkProviderAsync check:', err?.message || err);
      }
    }
    return true;
  } catch (err) {
    console.warn('[Location] check services error:', err);
    return true;
  }
}

/** Start foreground high-accuracy tracking. */
export async function startForegroundTracking(): Promise<void> {
  if (_watcher) return; // already running

  await refreshEmployeeSession();
  await ensureLocationProviders();

  // 1. Instantly fetch last-known cached position so UI immediately displays location
  try {
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown) {
      console.log(
        `[Location] Acquired cached position: lat=${lastKnown.coords.latitude.toFixed(5)}, lon=${lastKnown.coords.longitude.toFixed(5)}`
      );
      await _handleRawLocation(lastKnown);
    }
  } catch (err) {
    console.log('[Location] Last known position not available:', err);
  }

  // 2. Proactively request a fresh fix with multi-tiered cascading fallback
  getCurrentPosition()
    .then((fresh) => {
      if (fresh) {
        _handleRawLocation({
          coords: {
            latitude: fresh.latitude,
            longitude: fresh.longitude,
            altitude: null,
            accuracy: fresh.accuracy,
            altitudeAccuracy: null,
            heading: fresh.heading,
            speed: fresh.speed,
          },
          timestamp: fresh.timestamp,
          mocked: fresh.mocked,
        });
      }
    })
    .catch((err) => {
      console.log('[Location] Fresh getCurrentPosition fallback error:', err?.message || err);
    });

  // 3. Start continuous watch stream using fused Location.Accuracy.High, with fallback to Balanced
  try {
    _watcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 2_000, // Poll at least every 2 seconds
        distanceInterval: 1, // Or whenever moving 1 meter
        mayShowUserSettingsDialog: true,
      },
      (loc) => _handleRawLocation(loc)
    );
    console.log('[Location] Foreground tracking started with Accuracy.High');
  } catch (highErr: any) {
    console.warn(
      '[Location] High accuracy watchPositionAsync failed, falling back to Balanced:',
      highErr?.message || highErr
    );
    try {
      _watcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 2_000,
          distanceInterval: 1,
          mayShowUserSettingsDialog: true,
        },
        (loc) => _handleRawLocation(loc)
      );
      console.log('[Location] Foreground tracking started with Accuracy.Balanced');
    } catch (balErr: any) {
      console.error(
        '[Location] Failed to start watchPositionAsync with Balanced:',
        balErr?.message || balErr
      );
    }
  }

  // 4. Polling safety net: periodically poll getCurrentPosition() if indoor GPS or stationary
  if (!_heartbeatTimer) {
    _heartbeatTimer = setInterval(async () => {
      if (Date.now() - _lastSubmitTs > 12_000) {
        const fresh = await getCurrentPosition().catch(() => null);
        if (fresh) {
          _handleRawLocation({
            coords: {
              latitude: fresh.latitude,
              longitude: fresh.longitude,
              altitude: null,
              accuracy: fresh.accuracy,
              altitudeAccuracy: null,
              heading: fresh.heading,
              speed: fresh.speed,
            },
            timestamp: fresh.timestamp,
            mocked: fresh.mocked,
          });
        }
      }
    }, 10_000);
  }
}

/** Stop foreground tracking. */
export function stopForegroundTracking(): void {
  if (_watcher) {
    _watcher.remove();
    _watcher = null;
    console.log('[Location] Foreground tracking stopped');
  }
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
}

/** One-shot with deduplication */
export async function getCurrentPosition(): Promise<LocationState | null> {
  if (_currentPositionPromise) return _currentPositionPromise;
  _currentPositionPromise = _doGetCurrentPosition().finally(() => {
    _currentPositionPromise = null;
  });
  return _currentPositionPromise;
}

/**
 * One-shot internal: get current best available fix with resilient cascading fallback:
 * 1. Return recent cached smoothed position if fresh (< 10s)
 * 2. High Accuracy (GPS + fused sensors, 3s timeout)
 * 3. Balanced Accuracy (Wi-Fi + Cell tower, 3s timeout)
 * 4. Lowest Accuracy (IP / Cell tower, 2s timeout)
 * 5. Last Known Cached Position
 * 6. Baseline Office Coordinates while satellite lock is sought
 */
async function _doGetCurrentPosition(): Promise<LocationState | null> {
  // If we already have a recent fix, return it immediately
  if (_smoothed && Date.now() - _lastSubmitTs < 10_000) {
    return {
      latitude: _smoothed.lat,
      longitude: _smoothed.lon,
      accuracy: 10,
      speed: null,
      heading: null,
      timestamp: Date.now(),
      quality: 'good',
    };
  }

  // Tier 0: Check fast cached fix
  try {
    const cached = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
    if (cached) {
      return _buildState(cached);
    }
  } catch {}

  // Ensure Android provider dialog is triggered if services are disabled
  if (Platform.OS === 'android') {
    try {
      const hasServices = await Location.hasServicesEnabledAsync();
      if (!hasServices) {
        await Location.enableNetworkProviderAsync();
      }
    } catch {}
  }

  // Tier 1: Try High Accuracy (GPS + Wi-Fi + Cell) with 3s timeout
  try {
    const loc = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      }),
      3000,
      'High accuracy'
    );
    return _buildState(loc);
  } catch (errHigh: any) {
    console.log(
      '[Location] High accuracy fix unavailable (' +
        (errHigh?.message || errHigh) +
        '), cascading to Balanced (Wi-Fi/Cell)...'
    );
  }

  // Tier 2: Try Balanced Accuracy (Wi-Fi + Cellular — fast, reliable indoors & emulators) with 3s timeout
  try {
    const loc = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: true,
      }),
      3000,
      'Balanced accuracy'
    );
    return _buildState(loc);
  } catch (errBalanced: any) {
    console.log(
      '[Location] Balanced accuracy unavailable (' +
        (errBalanced?.message || errBalanced) +
        '), cascading to Lowest...'
    );
  }

  // Tier 3: Lowest Accuracy with 2s timeout
  try {
    const loc = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Lowest,
      }),
      2000,
      'Lowest accuracy'
    );
    return _buildState(loc);
  } catch (errLowest: any) {
    console.log(
      '[Location] Lowest accuracy unavailable (' +
        (errLowest?.message || errLowest) +
        '), cascading to last known...'
    );
  }

  // Tier 4: Fallback to any last known position regardless of age
  try {
    const fallback = await Location.getLastKnownPositionAsync();
    if (fallback) {
      return _buildState(fallback);
    }
  } catch {}

  // Tier 5: If no GPS fix, send nothing (return null)
  console.log('[Location] No hardware GPS fix acquired; returning null');
  return null;
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

function _qualityLabel(accuracyM: number): LocationState['quality'] {
  if (accuracyM <= 10) return 'excellent';
  if (accuracyM <= 25) return 'good';
  if (accuracyM <= 50) return 'fair';
  return 'poor';
}

function _buildState(loc: Location.LocationObject): LocationState {
  const acc = Math.round(loc.coords.accuracy ?? 999);
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracy: acc,
    speed: loc.coords.speed ?? null,
    heading: loc.coords.heading ?? null,
    timestamp: loc.timestamp,
    quality: _qualityLabel(acc),
    mocked: loc.mocked ?? false,
  };
}

async function _handleRawLocation(loc: Location.LocationObject): Promise<void> {
  const rawLat = loc.coords.latitude;
  const rawLon = loc.coords.longitude;
  const acc = loc.coords.accuracy ?? 999;
  const speed = loc.coords.speed ?? null;
  const heading = loc.coords.heading ?? null;
  const isMock = !!loc.mocked;

  // 1. Accuracy filter: Accept initial fix unconditionally, reject gross outliers (> 150m) later
  if (_smoothed && acc > MAX_ACCEPTED_ACCURACY_M) {
    console.log(`[Location] Rejected low-accuracy fix (±${Math.round(acc)}m)`);
    return;
  }

  // 2. Adaptive Exponential Smoothing
  // If moving (speed > 0.8 m/s or initial), respond quickly (alpha 0.75). If stationary, damp jitter (alpha 0.35).
  const isMoving = speed !== null && speed > 0.8;
  const alpha = !_smoothed ? 1.0 : isMoving ? 0.75 : 0.35;

  if (!_smoothed) {
    _smoothed = { lat: rawLat, lon: rawLon };
  } else {
    _smoothed.lat = alpha * rawLat + (1 - alpha) * _smoothed.lat;
    _smoothed.lon = alpha * rawLon + (1 - alpha) * _smoothed.lon;
  }

  const state: LocationState = {
    latitude: _smoothed.lat,
    longitude: _smoothed.lon,
    accuracy: Math.round(acc),
    speed,
    heading,
    timestamp: loc.timestamp,
    quality: _qualityLabel(acc),
  };

  // 3. Notify all subscribed UI listeners (HomeScreen, SitesScreen, LocationStatusWidget)
  _listeners.forEach((cb) => {
    try {
      cb(state);
    } catch (e) {
      console.error('[Location] Listener error:', e);
    }
  });

  // 4. Determine if submission to backend is needed:
  // - Significant movement: >= MOVEMENT_THRESHOLD_METERS (3m) moved since last submission
  // - Heartbeat: >= HEARTBEAT_INTERVAL_MS (10s) elapsed
  const now = Date.now();
  const timeSinceLastSubmit = now - _lastSubmitTs;

  let distanceMoved = 0;
  if (_lastSubmittedPos) {
    distanceMoved = geodesicDistanceM(
      _lastSubmittedPos.lat,
      _lastSubmittedPos.lon,
      _smoothed.lat,
      _smoothed.lon
    );
  } else {
    distanceMoved = 999; // First fix triggers immediate submit
  }

  const shouldSubmitMovement =
    distanceMoved >= MOVEMENT_THRESHOLD_METERS && timeSinceLastSubmit >= MIN_SUBMIT_GAP_MS;
  const shouldSubmitHeartbeat = timeSinceLastSubmit >= HEARTBEAT_INTERVAL_MS;

  if (shouldSubmitMovement || shouldSubmitHeartbeat) {
    _lastSubmitTs = now;
    _lastSubmittedPos = { lat: _smoothed.lat, lon: _smoothed.lon };

    // Queue point in local SQLite outbox first (offline-first requirement E.14)
    try {
      await queuePendingLocation({
        latitude: _smoothed.lat,
        longitude: _smoothed.lon,
        accuracy: Math.round(acc),
        speed,
        heading,
        isMock,
        recordedAt: new Date(loc.timestamp),
      });
      // Trigger background sync to send batch
      triggerSync().catch(() => {});
    } catch (err) {
      console.warn('[Location] Failed to queue point in outbox:', err);
    }
  }
}

// ── Background Task Definition ────────────────────────────────────────────────
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('[BG Location]', error.message);
    return;
  }
  const locations: Location.LocationObject[] = data?.locations ?? [];
  for (const loc of locations) {
    await _handleRawLocation(loc);
  }
});

/** Register background task with expo-location. */
export async function startBackgroundTracking(): Promise<void> {
  const isExpoGo =
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  // Background location is disabled by Expo Go sandbox on Android
  if (Platform.OS === 'android' && isExpoGo) {
    console.log(
      '[Location] Running in Expo Go on Android: background tasks are disabled in Expo Go client; foreground tracking is active.'
    );
    return;
  }

  try {
    const isRegistered = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK
    ).catch(() => false);

    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 30_000, // 30 seconds interval (Requirement 18)
        distanceInterval: 10, // 10 meters distance filter (Requirement 18)
        foregroundService: {
          notificationTitle: 'Sologix Energy - Attendance tracking active',
          notificationBody: 'Attendance and GPS duty tracking is active',
        },
      });
      console.log('[Location] Background tracking started (30s interval, 10m filter)');
    }
  } catch (err) {
    console.warn('[Location] Failed to start background tracking:', err);
  }
}


/** Stop background tracking. */
export async function stopBackgroundTracking(): Promise<void> {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(
      () => false
    );
    if (running) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('[Location] Background tracking stopped');
    }
  } catch (err) {
    console.warn('[Location] Failed to stop background tracking:', err);
  }
}
