/**
 * 4-State Geofence Transition State Machine
 * Prevents noisy GPS from causing check-in/check-out flip-flops
 * States: OUTSIDE <-> ENTRY_PENDING <-> INSIDE <-> EXIT_PENDING
 */

import type { GeofenceEvaluationResult } from "./geofence.service";

export type GeofenceState = "OUTSIDE" | "ENTRY_PENDING" | "INSIDE" | "EXIT_PENDING";

export interface EmployeeStateRecord {
  state: GeofenceState;
  geofenceId?: string;
  geofenceName?: string;
  pendingSince?: number; // timestamp ms
  consecutiveSamples: number;
  lastEvaluatedAt: number;
}

export interface TransitionConfig {
  requiredEntrySamples: number;
  exitConfirmationMs: number; // e.g. 120,000ms (2 mins)
}

export const DEFAULT_TRANSITION_CONFIG: TransitionConfig = {
  requiredEntrySamples: 1, // Fast single-sample entry confirmation for instant arrival flagging
  exitConfirmationMs: 15 * 1000, // 15 seconds confirmation window when outside
};

// In-memory state cache per employee (can be backed by Redis in clustered deployments)
const employeeStateStore = new Map<string, EmployeeStateRecord>();

export interface StateTransitionEvent {
  previousState: GeofenceState;
  newState: GeofenceState;
  hasConfirmedEntry: boolean;
  hasConfirmedExit: boolean;
  geofenceId?: string;
  geofenceName?: string;
}

export class GeofenceStateMachine {
  private config: TransitionConfig;

  constructor(config: TransitionConfig = DEFAULT_TRANSITION_CONFIG) {
    this.config = config;
  }

  public getState(employeeId: string): EmployeeStateRecord {
    const existing = employeeStateStore.get(employeeId);
    if (existing) return existing;

    const initial: EmployeeStateRecord = {
      state: "OUTSIDE",
      consecutiveSamples: 0,
      lastEvaluatedAt: Date.now(),
    };
    employeeStateStore.set(employeeId, initial);
    return initial;
  }

  public setState(employeeId: string, state: EmployeeStateRecord): void {
    employeeStateStore.set(employeeId, state);
  }

  /**
   * Evaluates the observation and drives state transitions
   */
  public processObservation(
    employeeId: string,
    observation: GeofenceEvaluationResult,
    geofenceId?: string,
    geofenceName?: string,
    timestampMs: number = Date.now(),
    distanceMeters?: number,
    radiusMeters?: number
  ): StateTransitionEvent {
    const current = this.getState(employeeId);
    const prevState = current.state;
    let newState = current.state;
    let confirmedEntry = false;
    let confirmedExit = false;

    if (observation === "UNKNOWN") {
      // Accuracy too low; preserve current stable state without updating pending timers
      return {
        previousState: prevState,
        newState: prevState,
        hasConfirmedEntry: false,
        hasConfirmedExit: false,
        geofenceId: current.geofenceId,
        geofenceName: current.geofenceName,
      };
    }

    switch (current.state) {
      case "OUTSIDE":
        if (observation === "INSIDE") {
          if (this.config.requiredEntrySamples <= 1) {
            newState = "INSIDE";
            current.state = "INSIDE";
            current.geofenceId = geofenceId;
            current.geofenceName = geofenceName;
            current.pendingSince = undefined;
            current.consecutiveSamples = 1;
            confirmedEntry = true;
          } else {
            newState = "ENTRY_PENDING";
            current.state = "ENTRY_PENDING";
            current.geofenceId = geofenceId;
            current.geofenceName = geofenceName;
            current.pendingSince = timestampMs;
            current.consecutiveSamples = 1;
          }
        }
        break;

      case "ENTRY_PENDING":
        if (observation === "INSIDE") {
          current.consecutiveSamples += 1;
          if (current.consecutiveSamples >= this.config.requiredEntrySamples) {
            newState = "INSIDE";
            current.state = "INSIDE";
            current.geofenceId = geofenceId;
            current.geofenceName = geofenceName;
            current.pendingSince = undefined;
            confirmedEntry = true;
          }
        } else {
          // Reverted outside before confirmation
          newState = "OUTSIDE";
          current.state = "OUTSIDE";
          current.consecutiveSamples = 0;
          current.pendingSince = undefined;
        }
        break;

      case "INSIDE":
        if (observation === "OUTSIDE") {
          // If distance is clearly outside (e.g. > 1.3x radius or > 30m past fence), confirm exit immediately
          const isClearlyOutside = Boolean(
            distanceMeters !== undefined &&
            radiusMeters !== undefined &&
            distanceMeters > radiusMeters * 1.35
          );

          if (isClearlyOutside) {
            newState = "OUTSIDE";
            current.state = "OUTSIDE";
            current.pendingSince = undefined;
            current.consecutiveSamples = 0;
            confirmedExit = true;
          } else {
            // Borderline exit -> move to EXIT_PENDING
            newState = "EXIT_PENDING";
            current.state = "EXIT_PENDING";
            current.pendingSince = timestampMs;
            current.consecutiveSamples = 1;
          }
        } else {
          // Still inside, update current geofence
          current.geofenceId = geofenceId;
          current.geofenceName = geofenceName;
        }
        break;

      case "EXIT_PENDING":
        if (observation === "INSIDE") {
          // Returned back inside within window -> cancel exit confirmation
          newState = "INSIDE";
          current.state = "INSIDE";
          current.pendingSince = undefined;
          current.consecutiveSamples = 0;
          current.geofenceId = geofenceId;
          current.geofenceName = geofenceName;
        } else {
          // Remains outside; check if elapsed or consecutive samples >= 2
          current.consecutiveSamples += 1;
          const elapsed = timestampMs - (current.pendingSince || timestampMs);
          if (elapsed >= this.config.exitConfirmationMs || current.consecutiveSamples >= 2) {
            newState = "OUTSIDE";
            current.state = "OUTSIDE";
            current.pendingSince = undefined;
            current.consecutiveSamples = 0;
            confirmedExit = true;
          }
        }
        break;
    }

    current.lastEvaluatedAt = timestampMs;
    this.setState(employeeId, current);

    return {
      previousState: prevState,
      newState: newState,
      hasConfirmedEntry: confirmedEntry,
      hasConfirmedExit: confirmedExit,
      geofenceId: current.geofenceId,
      geofenceName: current.geofenceName,
    };
  }
}

export const stateMachine = new GeofenceStateMachine();
