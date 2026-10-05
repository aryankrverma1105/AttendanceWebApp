/**
 * locationWatchdog.ts - Location-off and permission status monitor
 *
 * Requirements:
 *  - While checked in, detect: location services off (every 15s + app resume), permission revoked.
 *  - Show local notification "Your location is OFF. Please turn it on." (repeat every 5m until fixed).
 *  - Display full-width red banner in the app.
 *  - Post /api/location/status { state: LOCATION_OFF | PERMISSION_REVOKED | LOCATION_ON, at, clientEventId }
 *    queued in SQLite outbox first so it works offline too.
 */

import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { queuePendingEvent, generateUUID } from './outbox';
import { triggerSync } from './sync';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

export type LocationWatchdogState = {
  isLocationOff: boolean;
  reason: 'LOCATION_OFF' | 'PERMISSION_REVOKED' | 'OK';
};

type WatchdogListener = (state: LocationWatchdogState) => void;

const listeners = new Set<WatchdogListener>();
let currentState: LocationWatchdogState = { isLocationOff: false, reason: 'OK' };
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let lastNotificationTs = 0;
let lastReportedState: 'LOCATION_OFF' | 'PERMISSION_REVOKED' | 'LOCATION_ON' = 'LOCATION_ON';
let isCheckedInActive = false;

const NOTIFICATION_REPEAT_MS = 5 * 60 * 1000; // 5 minutes

export function onWatchdogStatusChange(cb: WatchdogListener): () => void {
  listeners.add(cb);
  cb(currentState);
  return () => listeners.delete(cb);
}

function updateState(newState: LocationWatchdogState) {
  currentState = newState;
  listeners.forEach((cb) => {
    try {
      cb(currentState);
    } catch (e) {
      console.error('[Watchdog] listener error:', e);
    }
  });
}

async function showLocalAlertNotification(message: string) {
  const now = Date.now();
  if (now - lastNotificationTs < NOTIFICATION_REPEAT_MS) {
    return;
  }
  lastNotificationTs = now;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Action Required: Location is OFF',
        body: message,
        data: { type: 'LOCATION_OFF_ALERT' },
        sound: true,
      },
      trigger: null, // deliver immediately
    });
  } catch (err) {
    console.warn('[Watchdog] Failed to show local notification:', err);
  }
}

export async function evaluateLocationStatus(isUserCheckedIn: boolean): Promise<LocationWatchdogState> {
  isCheckedInActive = isUserCheckedIn;

  if (!isUserCheckedIn) {
    if (lastReportedState !== 'LOCATION_ON') {
      lastReportedState = 'LOCATION_ON';
    }
    updateState({ isLocationOff: false, reason: 'OK' });
    return currentState;
  }

  let determinedState: 'LOCATION_OFF' | 'PERMISSION_REVOKED' | 'LOCATION_ON' = 'LOCATION_ON';
  let isOff = false;
  let reason: 'LOCATION_OFF' | 'PERMISSION_REVOKED' | 'OK' = 'OK';

  try {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      isOff = true;
      reason = 'LOCATION_OFF';
      determinedState = 'LOCATION_OFF';
    } else {
      const fgPerm = await Location.getForegroundPermissionsAsync();
      if (fgPerm.status !== 'granted') {
        isOff = true;
        reason = 'PERMISSION_REVOKED';
        determinedState = 'PERMISSION_REVOKED';
      }
    }
  } catch (err) {
    console.warn('[Watchdog] Error evaluating services:', err);
  }

  updateState({ isLocationOff: isOff, reason });

  if (isOff) {
    showLocalAlertNotification('Your location is OFF. Please turn it on to ensure duty verification.');
  }

  // If status changed, queue status event in SQLite outbox
  if (determinedState !== lastReportedState) {
    lastReportedState = determinedState;
    const clientEventId = generateUUID();
    const eventTime = new Date().toISOString();

    try {
      await queuePendingEvent({
        id: clientEventId,
        eventType: 'LOCATION_STATUS',
        payload: {
          state: determinedState,
          at: eventTime,
        },
      });
      triggerSync().catch(() => {});
    } catch (e) {
      console.warn('[Watchdog] Failed to queue status event:', e);
    }
  }

  return currentState;
}

export function startLocationWatchdog(getCheckedInState: () => boolean): () => void {
  // Run immediately
  evaluateLocationStatus(getCheckedInState()).catch(() => {});

  // Run every 15 seconds
  if (intervalTimer) clearInterval(intervalTimer);
  intervalTimer = setInterval(() => {
    evaluateLocationStatus(getCheckedInState()).catch(() => {});
  }, 15_000);

  // Run on app resume
  const subscription = AppState.addEventListener('change', (nextAppState) => {
    if (nextAppState === 'active') {
      evaluateLocationStatus(getCheckedInState()).catch(() => {});
    }
  });

  return () => {
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }
    subscription.remove();
  };
}
