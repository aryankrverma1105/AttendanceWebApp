/**
 * Anti-spoofing and location anomaly detection
 * Detects mock locations, sudden coordinate leaps, and impossible travel speeds
 */

import { calculateHaversineDistance, type Coordinate } from "./geofence.service";

export interface AnomalyCheckResult {
  isAnomaly: boolean;
  reason?: string;
  calculatedSpeedKmh?: number;
}

export const MAX_REASONABLE_SPEED_KMH = 200; // > 200 km/h flagged for field workers unless verified

export function checkLocationAnomaly(
  current: Coordinate & { recordedAt: Date; isMock?: boolean },
  previous?: Coordinate & { recordedAt: Date } | null
): AnomalyCheckResult {
  if (current.isMock) {
    return {
      isAnomaly: true,
      reason: "Mock location provider flag detected from device",
    };
  }

  if (!previous) {
    return { isAnomaly: false };
  }

  const distanceMeters = calculateHaversineDistance(
    previous.latitude,
    previous.longitude,
    current.latitude,
    current.longitude
  );

  const timeDiffSeconds = Math.abs(
    (current.recordedAt.getTime() - previous.recordedAt.getTime()) / 1000
  );

  if (timeDiffSeconds < 1) {
    // Under 1 second, if distance is huge, it's impossible
    if (distanceMeters > 100) {
      return {
        isAnomaly: true,
        reason: "Excessive jump in under 1 second",
      };
    }
    return { isAnomaly: false };
  }

  const speedKmh = (distanceMeters / 1000) / (timeDiffSeconds / 3600);

  if (speedKmh > MAX_REASONABLE_SPEED_KMH) {
    return {
      isAnomaly: true,
      reason: `Impossible speed: ${Math.round(speedKmh)} km/h`,
      calculatedSpeedKmh: Math.round(speedKmh),
    };
  }

  return {
    isAnomaly: false,
    calculatedSpeedKmh: Math.round(speedKmh),
  };
}
