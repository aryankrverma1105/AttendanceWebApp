/**
 * Geofence evaluation and high-precision distance calculations
 * Uses WGS-84 ellipsoidal geodesics (Vincenty algorithm) and adaptive boundary hysteresis
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

export interface GeofenceTarget {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  boundaryType?: "CIRCLE" | "POLYGON";
  polygonCoordinates?: Array<[number, number]>;
}

/** WGS-84 Reference Ellipsoid Parameters */
export const WGS84_A = 6378137.0; // semi-major axis in meters
export const WGS84_F = 1 / 298.257223563; // flattening
export const WGS84_B = 6356752.314245; // semi-minor axis in meters

export const EARTH_RADIUS_METERS = 6371000; // Spherical fallback
export const MAX_ACCEPTED_ACCURACY_METERS = 100;

/**
 * Calculates high-precision geodesic distance between two points on the WGS-84 ellipsoid
 * Uses Vincenty's inverse formula. Accurate to within 0.5 millimeters on Earth.
 */
export function calculateGeodesicDistanceWGS84(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const L = toRad(lon2 - lon1);

  const U1 = Math.atan((1 - WGS84_F) * Math.tan(phi1));
  const U2 = Math.atan((1 - WGS84_F) * Math.tan(phi2));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let lambdaP = 2 * Math.PI;
  let iterLimit = 20;

  let sinLambda = 0;
  let cosLambda = 0;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let sinAlpha = 0;
  let cosSqAlpha = 0;
  let cos2SigmaM = 0;

  while (Math.abs(lambda - lambdaP) > 1e-12 && --iterLimit > 0) {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      cosU2 * sinLambda * (cosU2 * sinLambda) +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) *
          (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
    );

    if (sinSigma === 0) return 0; // Coincident points

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;

    const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda =
      L +
      (1 - C) *
        WGS84_F *
        sinAlpha *
        (sigma +
          C *
            sinSigma *
            (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  }

  // If failed to converge (e.g. near-antipodal), fallback to spherical Haversine
  if (iterLimit === 0) {
    return calculateHaversineDistance(lat1, lon1, lat2, lon2);
  }

  const uSq = (cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B)) / (WGS84_B * WGS84_B);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  return WGS84_B * A * (sigma - deltaSigma);
}

/**
 * Calculates spherical distance in meters using Haversine formula (legacy / fallback)
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (angle: number) => (angle * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Evaluates whether a point (lat, lon) is inside a closed polygon using Ray-Casting
 */
export function isPointInPolygon(
  latitude: number,
  longitude: number,
  polygon: Array<[number, number]>
): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect =
      yi > longitude !== yj > longitude &&
      latitude < ((xj - xi) * (longitude - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculates perpendicular shortest distance in meters from a coordinate to a segment [A, B]
 */
export function distanceToSegmentMeters(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const meanLat = toRad((aLat + bLat) / 2);
  const cosMeanLat = Math.cos(meanLat);

  // Local meter offsets
  const ax = (aLon - pLon) * (Math.PI / 180) * WGS84_A * cosMeanLat;
  const ay = (aLat - pLat) * (Math.PI / 180) * WGS84_A;
  const bx = (bLon - pLon) * (Math.PI / 180) * WGS84_A * cosMeanLat;
  const by = (bLat - pLat) * (Math.PI / 180) * WGS84_A;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return Math.sqrt(ax * ax + ay * ay);

  let t = -(ax * dx + ay * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;

  return Math.sqrt(projX * projX + projY * projY);
}

/**
 * Minimum geodesic distance in meters from a point to any edge of a polygon
 */
export function distanceToPolygonBoundaryMeters(
  lat: number,
  lon: number,
  polygon: Array<[number, number]>
): number {
  if (!polygon || polygon.length < 2) return Infinity;

  let minDist = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const dist = distanceToSegmentMeters(
      lat,
      lon,
      polygon[i][0],
      polygon[i][1],
      polygon[j][0],
      polygon[j][1]
    );
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/**
 * Dynamic adaptive boundary buffer:
 * 10% of radius, bounded between 2m (for tight 15m rooms) and 10m (for 200m+ campuses)
 */
export function getAdaptiveHysteresisMeters(radiusMeters: number): number {
  return Math.min(Math.max(radiusMeters * 0.1, 2), 10);
}

/**
 * Calculates probabilistic confidence percentage (0 - 100%) that the user is inside the geofence,
 * modeling GPS uncertainty as a Gaussian error distribution with standard deviation sigma = accuracy / 1.645
 */
export function calculateBoundaryConfidence(
  distanceToBoundaryMeters: number, // negative inside, positive outside
  accuracyMeters: number = 10
): number {
  const sigma = Math.max(accuracyMeters / 1.645, 1.5);
  const z = -distanceToBoundaryMeters / sigma;

  if (z < -5) return 0;
  if (z > 5) return 100;

  const b1 = 0.31938153;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;

  const t = 1.0 / (1.0 + p * Math.abs(z));
  const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
  const pdf = (1.0 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
  let cdf = 1.0 - pdf * poly;

  if (z < 0) cdf = 1.0 - cdf;
  return Math.round(cdf * 1000) / 10;
}

/**
 * Validates coordinate limits
 */
export function isValidCoordinate(latitude: number, longitude: number): boolean {
  if (typeof latitude !== "number" || typeof longitude !== "number") return false;
  if (isNaN(latitude) || isNaN(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  // Obvious 0,0 null-island rejection when unintentional
  if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) return false;
  return true;
}

export type GeofenceEvaluationResult = "INSIDE" | "OUTSIDE" | "UNKNOWN";

export interface EvaluationDetail {
  result: GeofenceEvaluationResult;
  geofenceId?: string;
  geofenceName?: string;
  distanceMeters?: number;
  radiusMeters?: number;
  accuracyMeters?: number;
  distanceToBoundaryMeters?: number; // negative = inside, positive = outside
  boundaryConfidencePercent?: number; // 0 - 100%
  adaptiveHysteresisMeters?: number;
}

/**
 * Evaluates whether a location is inside a given geofence with high-precision WGS-84 ellipsoidal geodesics
 */
export function evaluatePointInGeofence(
  coord: Coordinate,
  geofence: GeofenceTarget,
  isCurrentlyInside: boolean = false
): EvaluationDetail {
  if (!isValidCoordinate(coord.latitude, coord.longitude)) {
    return { result: "UNKNOWN" };
  }

  const accuracy = coord.accuracy ?? 10;
  if (accuracy > MAX_ACCEPTED_ACCURACY_METERS) {
    return {
      result: "UNKNOWN",
      geofenceId: geofence.id,
      geofenceName: geofence.name,
      accuracyMeters: accuracy,
    };
  }

  // 1. Polygon Boundary Support
  if (
    geofence.boundaryType === "POLYGON" &&
    geofence.polygonCoordinates &&
    geofence.polygonCoordinates.length >= 3
  ) {
    const isInsideRaw = isPointInPolygon(
      coord.latitude,
      coord.longitude,
      geofence.polygonCoordinates
    );
    const edgeDist = distanceToPolygonBoundaryMeters(
      coord.latitude,
      coord.longitude,
      geofence.polygonCoordinates
    );
    const signedDist = isInsideRaw ? -edgeDist : edgeDist;
    const hysteresis = getAdaptiveHysteresisMeters(geofence.radiusMeters || 50);

    const isInside = isCurrentlyInside ? signedDist <= hysteresis : isInsideRaw;
    const confidence = calculateBoundaryConfidence(signedDist, accuracy);

    return {
      result: isInside ? "INSIDE" : "OUTSIDE",
      geofenceId: geofence.id,
      geofenceName: geofence.name,
      distanceMeters: Math.round(edgeDist * 10) / 10,
      radiusMeters: geofence.radiusMeters,
      accuracyMeters: accuracy,
      distanceToBoundaryMeters: Math.round(signedDist * 10) / 10,
      boundaryConfidencePercent: confidence,
      adaptiveHysteresisMeters: hysteresis,
    };
  }

  // 2. High-Precision Circular Boundary using WGS-84 Ellipsoid
  const distance = calculateGeodesicDistanceWGS84(
    coord.latitude,
    coord.longitude,
    geofence.latitude,
    geofence.longitude
  );

  const signedBoundaryDist = distance - geofence.radiusMeters;
  const hysteresis = getAdaptiveHysteresisMeters(geofence.radiusMeters);
  const effectiveRadius = isCurrentlyInside
    ? geofence.radiusMeters + hysteresis
    : geofence.radiusMeters;

  const isInside = distance <= effectiveRadius;
  const confidence = calculateBoundaryConfidence(signedBoundaryDist, accuracy);

  return {
    result: isInside ? "INSIDE" : "OUTSIDE",
    geofenceId: geofence.id,
    geofenceName: geofence.name,
    distanceMeters: Math.round(distance * 10) / 10,
    radiusMeters: geofence.radiusMeters,
    accuracyMeters: accuracy,
    distanceToBoundaryMeters: Math.round(signedBoundaryDist * 10) / 10,
    boundaryConfidencePercent: confidence,
    adaptiveHysteresisMeters: hysteresis,
  };
}

/**
 * Evaluates location against an array of assigned geofences, returning the best matching inside geofence
 */
export function evaluateAssignedGeofences(
  coord: Coordinate,
  geofences: GeofenceTarget[],
  currentGeofenceId?: string
): EvaluationDetail {
  if (!geofences || geofences.length === 0) {
    return { result: "OUTSIDE" };
  }

  let nearestOutside: EvaluationDetail | null = null;
  let minDistance = Infinity;

  for (const gf of geofences) {
    const isCurrentlyInsideThisGf = Boolean(currentGeofenceId && currentGeofenceId === gf.id);
    const detail = evaluatePointInGeofence(coord, gf, isCurrentlyInsideThisGf);
    if (detail.result === "INSIDE") {
      return detail;
    }
    if (detail.result === "OUTSIDE" && detail.distanceMeters !== undefined) {
      if (detail.distanceMeters < minDistance) {
        minDistance = detail.distanceMeters;
        nearestOutside = detail;
      }
    }
  }

  return nearestOutside || { result: "OUTSIDE" };
}

