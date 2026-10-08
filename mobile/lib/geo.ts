/**
 * High-precision WGS-84 Geodesic and Boundary Geometry for Mobile
 */

export const WGS84_A = 6378137.0; // semi-major axis in meters
export const WGS84_F = 1 / 298.257223563; // flattening
export const WGS84_B = 6356752.314245; // semi-minor axis in meters

/**
 * Carto Raster Map Basemap Configuration with Authenticated API Key
 */
export const CARTO_API_KEY =
  process.env.EXPO_PUBLIC_CARTO_API_KEY || "cb1_49bx_1_059a6bc15b7f8fdbb1fe7cb1";

export const CARTO_TILE_URL =
  `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`;


/**
 * Calculates high-precision geodesic distance on the WGS-84 ellipsoid
 * Using Vincenty's inverse formula. Sub-millimeter accuracy.
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

    if (sinSigma === 0) return 0;

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

  // Fallback to Haversine if Vincenty does not converge
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
 * Dynamic scale-aware hysteresis buffer: min(max(radius * 0.1, 2), 10) meters
 */
export function getAdaptiveHysteresisMeters(radiusMeters: number): number {
  const scaled = radiusMeters * 0.1;
  return Math.min(Math.max(scaled, 2), 10);
}

export interface BoundaryMetrics {
  centerDistM: number;
  boundaryDistM: number; // Signed: < 0 inside perimeter, > 0 outside perimeter
  isInside: boolean;
  adaptiveHysteresisM: number;
  proximityRatio: number; // 0 to 1, where 1 is at or inside boundary
}

/**
 * Calculates complete boundary metrics for a user position relative to a geofence
 */
export function calculateBoundaryMetrics(
  posLat: number,
  posLon: number,
  siteLat: number,
  siteLon: number,
  radiusMeters: number
): BoundaryMetrics {
  const centerDistM = calculateGeodesicDistanceWGS84(posLat, posLon, siteLat, siteLon);
  const boundaryDistM = centerDistM - radiusMeters;
  const isInside = boundaryDistM <= 0;
  const adaptiveHysteresisM = getAdaptiveHysteresisMeters(radiusMeters);

  // Proximity progress (approaching 100% as employee touches boundary)
  // Maps distance from 3x radius down to boundary
  const outerHorizon = radiusMeters * 3;
  const proximityRatio = Math.min(
    1,
    Math.max(0, (outerHorizon - Math.max(0, boundaryDistM)) / outerHorizon)
  );

  return {
    centerDistM,
    boundaryDistM,
    isInside,
    adaptiveHysteresisM,
    proximityRatio,
  };
}

/**
 * Formats distance with intuitive units
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Formats enclosed area
 */
export function formatArea(radiusMeters: number): string {
  const areaM2 = Math.PI * radiusMeters * radiusMeters;
  if (areaM2 >= 10000) {
    return `${(areaM2 / 10000).toFixed(1)} ha`;
  }
  if (areaM2 >= 1000) {
    return `${(areaM2 / 1000).toFixed(1)}k m²`;
  }
  return `${Math.round(areaM2)} m²`;
}
