import { describe, expect, test } from "bun:test";
import {
  calculateHaversineDistance,
  calculateGeodesicDistanceWGS84,
  getAdaptiveHysteresisMeters,
  evaluatePointInGeofence,
  isValidCoordinate,
} from "../src/services/geofence.service";
import { GeofenceStateMachine } from "../src/services/state-machine.service";
import {
  isTimeInShiftWindow,
  calculateOvertimeMinutes,
  calculateLiveWorkingMinutes,
} from "../src/services/attendance.service";
import { checkLocationAnomaly } from "../src/services/anomaly.service";
import { resolveEmployee } from "../src/services/location.service";

describe("1. Geofence & Haversine Distance Engine", () => {
  test("Calculates accurate distance between known coordinates", () => {
    // Distance between two points in Hyderabad approx 712 meters
    const dist = calculateHaversineDistance(17.4485, 78.3768, 17.4435, 78.3820);
    expect(dist).toBeGreaterThan(650);
    expect(dist).toBeLessThan(800);
  });

  test("Evaluates point correctly as INSIDE or OUTSIDE", () => {
    const gf = {
      id: "gf-1",
      name: "Nexus Site",
      type: "CUSTOMER_SITE",
      latitude: 17.4435,
      longitude: 78.3820,
      radiusMeters: 200,
    };

    // Point 10 meters away
    const inside = evaluatePointInGeofence(
      { latitude: 17.44355, longitude: 78.38205, accuracy: 10 },
      gf
    );
    expect(inside.result).toBe("INSIDE");

    // Point 500 meters away
    const outside = evaluatePointInGeofence(
      { latitude: 17.4485, longitude: 78.3768, accuracy: 10 },
      gf
    );
    expect(outside.result).toBe("OUTSIDE");
  });

  test("Filters out poor GPS accuracy (> 100m)", () => {
    const gf = {
      id: "gf-1",
      name: "Nexus Site",
      type: "CUSTOMER_SITE",
      latitude: 17.4435,
      longitude: 78.3820,
      radiusMeters: 200,
    };

    const poorAccuracy = evaluatePointInGeofence(
      { latitude: 17.44355, longitude: 78.38205, accuracy: 150 },
      gf
    );
    expect(poorAccuracy.result).toBe("UNKNOWN");
  });

  test("Rejects invalid and null-island coordinates", () => {
    expect(isValidCoordinate(0, 0)).toBe(false);
    expect(isValidCoordinate(95, 20)).toBe(false);
    expect(isValidCoordinate(17.44, 78.38)).toBe(true);
  });
});

describe("2. 4-State Transition Engine (GPS Noise Filter)", () => {
  test("Requires consecutive samples to confirm entry", () => {
    const sm = new GeofenceStateMachine({ requiredEntrySamples: 2, exitConfirmationMs: 60000 });
    const empId = "test-emp-1";

    // 1st sample inside -> ENTRY_PENDING
    const t1 = sm.processObservation(empId, "INSIDE", "gf-1", "Site A");
    expect(t1.newState).toBe("ENTRY_PENDING");
    expect(t1.hasConfirmedEntry).toBe(false);

    // 2nd sample inside -> INSIDE confirmed
    const t2 = sm.processObservation(empId, "INSIDE", "gf-1", "Site A");
    expect(t2.newState).toBe("INSIDE");
    expect(t2.hasConfirmedEntry).toBe(true);
  });

  test("Single outside sample does not immediately check out (moves to EXIT_PENDING)", () => {
    const sm = new GeofenceStateMachine({ requiredEntrySamples: 1, exitConfirmationMs: 60000 });
    const empId = "test-emp-2";

    sm.processObservation(empId, "INSIDE", "gf-1", "Site A");

    // Noise sample outside
    const tOut = sm.processObservation(empId, "OUTSIDE", "gf-1", "Site A");
    expect(tOut.newState).toBe("EXIT_PENDING");
    expect(tOut.hasConfirmedExit).toBe(false);

    // Returns inside before window expires -> reverts safely to INSIDE
    const tReturn = sm.processObservation(empId, "INSIDE", "gf-1", "Site A");
    expect(tReturn.newState).toBe("INSIDE");
    expect(tReturn.hasConfirmedExit).toBe(false);
  });
});

describe("3. Midnight-Crossing Shift & Overtime Logic", () => {
  test("Correctly detects window for overnight shift 22:00 -> 06:00", () => {
    // Test 23:30 (before midnight)
    const nightNow = new Date("2026-09-11T23:30:00");
    const res = isTimeInShiftWindow(nightNow, "22:00", "06:00", 15);
    expect(res.isInShift).toBe(true);

    // Test 03:00 (after midnight)
    const earlyMorning = new Date("2026-09-12T03:00:00");
    const res2 = isTimeInShiftWindow(earlyMorning, "22:00", "06:00", 15);
    expect(res2.isInShift).toBe(true);

    // Test 14:00 (outside shift)
    const afternoon = new Date("2026-09-12T14:00:00");
    const res3 = isTimeInShiftWindow(afternoon, "22:00", "06:00", 15);
    expect(res3.isInShift).toBe(false);
  });

  test("Calculates overtime minutes accurately with minimum threshold", () => {
    const shiftEnd = new Date("2026-09-11T18:00:00");

    // Checkout at 18:10 (10 mins < 15 min threshold -> 0 overtime)
    const check10 = new Date("2026-09-11T18:10:00");
    expect(calculateOvertimeMinutes(check10, shiftEnd, 15)).toBe(0);

    // Checkout at 18:45 (45 mins >= 15 min threshold -> 45 overtime)
    const check45 = new Date("2026-09-11T18:45:00");
    expect(calculateOvertimeMinutes(check45, shiftEnd, 15)).toBe(45);
  });
});

describe("4. Anti-Spoofing & Anomaly Detection", () => {
  test("Detects mock location provider flag", () => {
    const res = checkLocationAnomaly({
      latitude: 17.44,
      longitude: 78.38,
      recordedAt: new Date(),
      isMock: true,
    });
    expect(res.isAnomaly).toBe(true);
  });

  test("Flags impossible speed jump (> 200 km/h)", () => {
    const prev = {
      latitude: 17.44,
      longitude: 78.38,
      recordedAt: new Date("2026-09-11T09:00:00"),
    };

    // Moved ~50 km in 60 seconds
    const curr = {
      latitude: 17.84,
      longitude: 78.38,
      recordedAt: new Date("2026-09-11T09:01:00"),
    };

    const res = checkLocationAnomaly(curr, prev);
    expect(res.isAnomaly).toBe(true);
    expect(res.calculatedSpeedKmh).toBeGreaterThan(200);
  });
});

describe("5. High-Precision WGS-84 Geodesics & Boundary Geometry", () => {
  test("Calculates high-precision WGS-84 ellipsoidal distance", () => {
    const p1 = { lat: 17.4485, lon: 78.3768 };
    const p2 = { lat: 17.4435, lon: 78.3820 };
    const wgsDist = calculateGeodesicDistanceWGS84(p1.lat, p1.lon, p2.lat, p2.lon);
    expect(wgsDist).toBeGreaterThan(750);
    expect(wgsDist).toBeLessThan(800);
    expect(wgsDist).toBeCloseTo(781.9, 0);
  });

  test("Calculates scale-aware adaptive hysteresis correctly", () => {
    // 15m micro-site -> 2m (clamped min)
    expect(getAdaptiveHysteresisMeters(15)).toBe(2);
    // 50m site -> 5m (10%)
    expect(getAdaptiveHysteresisMeters(50)).toBe(5);
    // 200m site -> 10m (clamped max)
    expect(getAdaptiveHysteresisMeters(200)).toBe(10);
  });

  test("Evaluates signed boundary distance for circular geofences", () => {
    const site = {
      id: "site-circle",
      name: "Circular Site",
      type: "OFFICE",
      latitude: 17.4435,
      longitude: 78.3820,
      radiusMeters: 100,
    };

    // Inside point (center): signed distance should be negative
    const evalInside = evaluatePointInGeofence(
      { latitude: 17.4435, longitude: 78.3820, accuracy: 5 },
      site
    );
    expect(evalInside.result).toBe("INSIDE");
    expect(evalInside.distanceToBoundaryMeters).toBeLessThan(0);
    expect(evalInside.distanceToBoundaryMeters).toBeCloseTo(-100, 0);

    // Outside point: signed distance should be positive
    const evalOutside = evaluatePointInGeofence(
      { latitude: 17.4455, longitude: 78.3820, accuracy: 5 },
      site
    );
    expect(evalOutside.result).toBe("OUTSIDE");
    expect(evalOutside.distanceToBoundaryMeters).toBeGreaterThan(0);
  });

  test("Evaluates arbitrary polygon geofence containment & boundary distance", () => {
    // Polygon around a square in Hyderabad
    const squarePolygon: Array<[number, number]> = [
      [17.4400, 78.3800],
      [17.4400, 78.3900],
      [17.4500, 78.3900],
      [17.4500, 78.3800],
      [17.4400, 78.3800],
    ];

    const polySite = {
      id: "site-poly",
      name: "Campus Polygon",
      type: "CAMPUS",
      latitude: 17.4450,
      longitude: 78.3850,
      radiusMeters: 500,
      boundaryType: "POLYGON" as const,
      polygonCoordinates: squarePolygon,
    };

    // Point in center of polygon
    const insidePoly = evaluatePointInGeofence(
      { latitude: 17.4450, longitude: 78.3850, accuracy: 5 },
      polySite
    );
    expect(insidePoly.result).toBe("INSIDE");
    expect(insidePoly.distanceToBoundaryMeters).toBeLessThan(0);

    // Point outside polygon
    const outsidePoly = evaluatePointInGeofence(
      { latitude: 17.4300, longitude: 78.3850, accuracy: 5 },
      polySite
    );
    expect(outsidePoly.result).toBe("OUTSIDE");
    expect(outsidePoly.distanceToBoundaryMeters).toBeGreaterThan(0);
  });
});

describe("6. Multi-Session Attendance & Cumulative Working Minutes", () => {
  test("Computes zero minutes for null checkIn or future dates", () => {
    expect(calculateLiveWorkingMinutes(null)).toBe(0);
    const future = new Date(Date.now() + 60000);
    expect(calculateLiveWorkingMinutes(future)).toBe(0);
  });

  test("Accurately accumulates working time across repeated exits and re-entries", () => {
    // 1. Initial Morning Check-in at 09:00
    const morningCheckIn = new Date("2026-09-11T09:00:00Z");
    let breakMinutes = 0;

    // 2. First exit at 10:30 (1.5 hours = 90 mins on-site)
    const exit1 = new Date("2026-09-11T10:30:00Z");
    const workingSession1 = calculateLiveWorkingMinutes(morningCheckIn, breakMinutes, exit1);
    expect(workingSession1).toBe(90);

    // 3. Employee goes away / takes break for 45 mins, re-enters at 11:15
    const reEntry1 = new Date("2026-09-11T11:15:00Z");
    const awayMs1 = reEntry1.getTime() - exit1.getTime();
    const break1Mins = Math.floor(awayMs1 / (60 * 1000));
    expect(break1Mins).toBe(45);

    breakMinutes += break1Mins;
    // At instant of re-entry, total on-site working minutes must still be 90
    const workingAtReEntry = calculateLiveWorkingMinutes(morningCheckIn, breakMinutes, reEntry1);
    expect(workingAtReEntry).toBe(90);

    // 4. Employee works on-site for another 1 hour 45 mins until 13:00
    const activeWorking = new Date("2026-09-11T13:00:00Z");
    // Total elapsed: 4 hours (240 mins). Total break: 45 mins. On-site working: 195 mins.
    const workingLive = calculateLiveWorkingMinutes(morningCheckIn, breakMinutes, activeWorking);
    expect(workingLive).toBe(195); // 90 mins from session 1 + 105 mins from session 2

    // 5. Second exit for lunch from 13:00 to 14:00 (60 mins lunch break)
    const exit2 = new Date("2026-09-11T13:00:00Z");
    const reEntry2 = new Date("2026-09-11T14:00:00Z");
    const break2Mins = Math.floor((reEntry2.getTime() - exit2.getTime()) / (60 * 1000));
    expect(break2Mins).toBe(60);

    breakMinutes += break2Mins; // Total breaks = 45 + 60 = 105 mins
    expect(breakMinutes).toBe(105);

    // 6. Final checkout at 17:30
    const finalCheckOut = new Date("2026-09-11T17:30:00Z");
    // Total elapsed from 09:00 to 17:30: 8.5 hours = 510 mins
    // Deduct total breaks: 510 - 105 = 405 mins (6 hours 45 mins of pure on-site work)
    const finalWorking = calculateLiveWorkingMinutes(morningCheckIn, breakMinutes, finalCheckOut);
    expect(finalWorking).toBe(405);
  });

  test("Accurately handles specific user scenario: enters 9:00, exits 9:30, re-enters 10:00", () => {
    // 1. Employee enters at 09:00
    const tEntry1 = new Date("2026-09-11T09:00:00Z");
    let breakMinutes = 0;
    let checkOutAt: Date | null = null;
    let status = "WORKING";

    // 2. Employee exits at 09:30 (Worked 30m on-site)
    const tExit1 = new Date("2026-09-11T09:30:00Z");
    const workingAtExit1 = calculateLiveWorkingMinutes(tEntry1, breakMinutes, tExit1);
    expect(workingAtExit1).toBe(30);

    // Save departure state
    status = "AWAY";
    checkOutAt = tExit1;

    // 3. Employee is outside from 09:30 to 10:00 (30 mins break)
    // At 10:00, employee re-enters site
    const tEntry2 = new Date("2026-09-11T10:00:00Z");
    expect(checkOutAt).not.toBeNull();

    const awayDurationMs = tEntry2.getTime() - checkOutAt!.getTime();
    const awayMinutes = Math.round(awayDurationMs / (60 * 1000));
    expect(awayMinutes).toBe(30);

    // Accumulate break
    breakMinutes += awayMinutes;
    expect(breakMinutes).toBe(30);

    // Active session restored: checkOutAt cleared to null, status back to WORKING
    status = "WORKING";
    checkOutAt = null;

    // Live working minutes right at 10:00 re-entry is still 30m
    const workingAtReEntry = calculateLiveWorkingMinutes(tEntry1, breakMinutes, tEntry2);
    expect(workingAtReEntry).toBe(30);

    // 4. Employee works on-site for 45 minutes until 10:45
    const tMidWork = new Date("2026-09-11T10:45:00Z");
    // Elapsed since 9:00: 105 mins. Break: 30 mins. Active on-site: 75 mins (30m first session + 45m second session).
    const workingMid = calculateLiveWorkingMinutes(tEntry1, breakMinutes, tMidWork);
    expect(workingMid).toBe(75);

    // 5. Employee exits at 10:45
    const tExit2 = tMidWork;
    const workingFinal = calculateLiveWorkingMinutes(tEntry1, breakMinutes, tExit2);
    expect(workingFinal).toBe(75);
    checkOutAt = tExit2;
    status = "AWAY";
  });
});

describe("7. Flexible Employee Identifier Resolver", () => {
  test("Resolves employee by employeeCode or userId without throwing", async () => {
    // Lookup by employeeCode
    const empByCode = await resolveEmployee("EMP1001");
    if (empByCode) {
      expect(empByCode.employeeCode).toBe("EMP1001");
    }

    // Lookup with null employeeId but valid authenticated userId
    const empByAuth = await resolveEmployee(undefined, 1);
    if (empByAuth) {
      expect(empByAuth.userId).toBe(1);
    }
  });
});



