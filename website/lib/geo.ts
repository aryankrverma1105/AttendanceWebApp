/**
 * High-precision WGS-84 Geodesic and Geofence Geometry Utilities
 */

export const WGS84_A = 6378137.0; // semi-major axis in meters
export const WGS84_F = 1 / 298.257223563; // flattening
export const WGS84_B = 6356752.314245; // semi-minor axis in meters

/**
 * Calculates geodesic distance on the WGS-84 ellipsoid using Vincenty's inverse formula
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
  let C = 0;

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

    C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda =
      L +
      (1 - C) *
        WGS84_F *
        sinAlpha *
        (sigma +
          C *
            sinSigma *
            (cos2SigmaM +
              C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  }

  // Fallback to spherical law if Vincenty fails to converge
  if (iterLimit === 0) {
    const dLat = phi2 - phi1;
    const dLon = L;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
 * Scale-aware adaptive hysteresis: min(max(radius * 0.1, 2), 10) meters
 */
export function getAdaptiveHysteresisMeters(radiusMeters: number): number {
  const scaled = radiusMeters * 0.1;
  return Math.min(Math.max(scaled, 2), 10);
}

/**
 * Calculates enclosed area of circular geofence
 */
export function calculateEnclosedAreaM2(radiusMeters: number): number {
  return Math.PI * radiusMeters * radiusMeters;
}

/**
 * Calculates boundary circumference
 */
export function calculateCircumferenceM(radiusMeters: number): number {
  return 2 * Math.PI * radiusMeters;
}

/**
 * Formats area nicely (e.g. "707 m²" or "1.25 ha")
 */
export function formatArea(areaM2: number): string {
  if (areaM2 >= 10000) {
    return `${(areaM2 / 10000).toFixed(2)} ha`;
  }
  if (areaM2 >= 1000) {
    return `${(areaM2 / 1000).toFixed(1)}k m²`;
  }
  return `${Math.round(areaM2)} m²`;
}

/**
 * Formats distance with unit
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Standard precision presets for geofence perimeters
 */
export const GEOFENCE_PRESETS = [
  { radius: 15, label: "15m", title: "Micro Site / Gate", icon: "🚪" },
  { radius: 30, label: "30m", title: "Small Office", icon: "🏬" },
  { radius: 50, label: "50m", title: "Commercial Building", icon: "🏢" },
  { radius: 100, label: "100m", title: "Facility / Depot", icon: "🏭" },
  { radius: 200, label: "200m", title: "Campus", icon: "🎓" },
  { radius: 500, label: "500m", title: "Industrial Zone", icon: "🌐" },
];
