/**
 * sync.ts - Outbox Sync Engine
 *
 * Runs:
 *  - On app start
 *  - On network connectivity return (NetInfo)
 *  - Immediately after queuing a new item
 *  - Every 60s while there is a backlog
 *
 * Processing order:
 *  1. Events first in order of creation (CHECK_IN, CHECK_OUT, LOCATION_STATUS)
 *  2. Location points in batches of up to 200 via POST /api/location/batch
 *  3. Exponential backoff on persistent network failure
 *  4. Never deletes rows on network errors - only after server confirms
 */

import NetInfo from '@react-native-community/netinfo';
import {
  getPendingEvents,
  removePendingEvent,
  incrementEventRetry,
  moveToFailedEvents,
  getPendingLocations,
  removePendingLocations,
  moveToFailedLocations,
  setLastSyncTimestamp,
  getOutboxStatus,
  MAX_EVENT_RETRIES,
} from './outbox';
import { mobileApi } from './api';

type SyncListener = (status: {
  pendingCount: number;
  failedCount: number;
  lastSyncAt: number | null;
  isSyncing: boolean;
}) => void;

const listeners = new Set<SyncListener>();
let isSyncing = false;
let periodicInterval: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;

export function onSyncStatusChange(cb: SyncListener): () => void {
  listeners.add(cb);
  getOutboxStatus().then((status) => {
    cb({
      pendingCount: status.totalPending,
      failedCount: status.totalFailed,
      lastSyncAt: status.lastSyncAt,
      isSyncing,
    });
  });
  return () => listeners.delete(cb);
}

function notifyListeners(pendingCount: number, failedCount: number, lastSyncAt: number | null) {
  listeners.forEach((cb) => {
    try {
      cb({ pendingCount, failedCount, lastSyncAt, isSyncing });
    } catch (e) {
      console.error('[Sync] Listener error:', e);
    }
  });
}

/** Trigger sync cycle. Safe to call multiple times (concurrency locked). */
export async function triggerSync(): Promise<{ success: boolean; syncedCount: number }> {
  if (isSyncing) {
    return { success: false, syncedCount: 0 };
  }

  const net = await NetInfo.fetch().catch(() => ({ isConnected: false }));
  if (!net.isConnected) {
    console.log('[Sync] Offline: sync deferred until network returns');
    const status = await getOutboxStatus();
    notifyListeners(status.totalPending, status.totalFailed, status.lastSyncAt);
    return { success: false, syncedCount: 0 };
  }

  isSyncing = true;
  let syncedCount = 0;
  const initialStatus = await getOutboxStatus();
  notifyListeners(initialStatus.totalPending, initialStatus.totalFailed, initialStatus.lastSyncAt);

  try {
    // ─── Step 1: Drain pending events (FIFO) ──────────────────────────────────
    let stopEventsDueToTransientError = false;
    const events = await getPendingEvents();

    for (const ev of events) {
      if (stopEventsDueToTransientError) break;

      let payload: any = {};
      try {
        payload = JSON.parse(ev.payload);
      } catch {
        payload = ev.payload;
      }

      // Ensure clientEventId is passed
      payload.clientEventId = ev.id;

      try {
        let res: any = null;
        if (ev.eventType === 'CHECK_IN') {
          res = await mobileApi.checkIn(payload);
        } else if (ev.eventType === 'CHECK_OUT') {
          res = await mobileApi.checkOut(payload);
        } else if (ev.eventType === 'LOCATION_STATUS') {
          res = await mobileApi.reportLocationStatus(payload);
        }

        if (res?.success || res?.duplicate || res?.alreadyCheckedIn || res?.alreadyCheckedOut) {
          await removePendingEvent(ev.id);
          syncedCount++;
          consecutiveFailures = 0;
        } else {
          await incrementEventRetry(ev.id);
          if (ev.retryCount + 1 >= MAX_EVENT_RETRIES) {
            console.warn(`[Sync] Event ${ev.id} exceeded MAX_EVENT_RETRIES (${MAX_EVENT_RETRIES}). Moving to failed_events.`);
            await moveToFailedEvents(ev.id, res?.message || 'Exceeded max retries');
          } else {
            stopEventsDueToTransientError = true;
          }
        }
      } catch (err: any) {
        const httpStatus = err?.status;
        const isPermanent4xx =
          typeof httpStatus === 'number' &&
          httpStatus >= 400 &&
          httpStatus < 500 &&
          httpStatus !== 408 &&
          httpStatus !== 429;

        if (isPermanent4xx) {
          // Requirement 2: Poison-pill HTTP 4xx permanently rejected -> move to failed_events and continue
          console.warn(`[Sync] Event ${ev.id} permanently rejected by server (HTTP ${httpStatus}): ${err.message}. Moving to failed_events.`);
          await moveToFailedEvents(ev.id, err.message || `HTTP ${httpStatus}`);
        } else {
          // Network error, HTTP 5xx, or 408/429 -> keep row, increment retry, stop events cycle
          console.warn(`[Sync] Event ${ev.id} transient upload error:`, err?.message || err);
          await incrementEventRetry(ev.id);
          if (ev.retryCount + 1 >= MAX_EVENT_RETRIES) {
            console.warn(`[Sync] Event ${ev.id} reached MAX_EVENT_RETRIES (${MAX_EVENT_RETRIES}). Moving to failed_events.`);
            await moveToFailedEvents(ev.id, err.message || 'Exceeded max retries');
          } else {
            consecutiveFailures++;
            stopEventsDueToTransientError = true;
          }
        }
      }
    }

    // ─── Step 2: Drain pending location points in batches of up to 200 ────────
    // Always runs even if an event had permanent failures
    let hasMoreLocations = true;
    const attemptedBatchSignatures = new Set<string>();

    while (hasMoreLocations) {
      const batch = await getPendingLocations(200);
      if (batch.length === 0) {
        hasMoreLocations = false;
        break;
      }

      // Requirement 3: Never loop on the same batch twice in one cycle
      const batchSignature = batch.map((p) => p.id).sort().join(',');
      if (attemptedBatchSignatures.has(batchSignature)) {
        console.warn('[Sync] Detected repeated batch signature in current cycle. Breaking location loop.');
        break;
      }
      attemptedBatchSignatures.add(batchSignature);

      const locationsPayload = batch.map((p) => ({
        clientPointId: p.id,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: p.accuracy,
        speed: p.speed,
        heading: p.heading,
        isMock: Boolean(p.isMock),
        recordedAt: p.recordedAt,
      }));

      try {
        const res: any = await mobileApi.submitBatchLocations({
          locations: locationsPayload,
        });

        let rowsRemoved = 0;

        // Accepted points
        if (res?.success && Array.isArray(res.acceptedClientPointIds) && res.acceptedClientPointIds.length > 0) {
          await removePendingLocations(res.acceptedClientPointIds);
          rowsRemoved += res.acceptedClientPointIds.length;
          syncedCount += res.acceptedClientPointIds.length;
          consecutiveFailures = 0;
        } else if (res?.success && !res.rejectedClientPointIds) {
          await removePendingLocations(batch.map((p) => p.id));
          rowsRemoved += batch.length;
          syncedCount += batch.length;
          consecutiveFailures = 0;
        }

        // Requirement 3: Move rejected points to failed_locations table (do not delete silently)
        if (Array.isArray(res?.rejectedClientPointIds) && res.rejectedClientPointIds.length > 0) {
          const rejectedPoints = batch.filter((p) => res.rejectedClientPointIds.includes(p.id));
          await moveToFailedLocations(rejectedPoints, 'Rejected by server (invalid coordinates/date)');
          rowsRemoved += res.rejectedClientPointIds.length;
        }

        // Requirement 3: Break while loop if a batch removes zero rows
        if (rowsRemoved === 0) {
          console.warn('[Sync] Location batch removed 0 rows. Breaking loop to prevent infinite cycle.');
          break;
        }
      } catch (err: any) {
        console.warn('[Sync] Location batch upload error:', err?.message || err);
        consecutiveFailures++;
        hasMoreLocations = false;
        break;
      }
    }

    const now = Date.now();
    await setLastSyncTimestamp(now);
    const finalStatus = await getOutboxStatus();
    notifyListeners(finalStatus.totalPending, finalStatus.totalFailed, now);

    return { success: true, syncedCount };
  } catch (err) {
    console.log('[Sync] Cycle stopped due to network or server condition');
    const status = await getOutboxStatus();
    notifyListeners(status.totalPending, status.totalFailed, status.lastSyncAt);
    return { success: false, syncedCount };
  } finally {
    isSyncing = false;
  }
}


/** Initialize sync engine listeners and periodic interval */
export function initSyncEngine(): () => void {
  // 1. Run sync on start
  triggerSync().catch(() => {});

  // 2. Run sync when connectivity returns
  const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      console.log('[Sync] Network regained, triggering sync...');
      triggerSync().catch(() => {});
    }
  });

  // 3. Periodic check every 60s while there is a backlog
  if (!periodicInterval) {
    periodicInterval = setInterval(async () => {
      const status = await getOutboxStatus();
      if (status.totalPending > 0) {
        // Exponential backoff check: if high consecutive failures, skip some intervals
        if (consecutiveFailures > 5 && Math.random() < 0.5) {
          return;
        }
        triggerSync().catch(() => {});
      }
    }, 60_000);
  }

  return () => {
    unsubscribeNetInfo();
    if (periodicInterval) {
      clearInterval(periodicInterval);
      periodicInterval = null;
    }
  };
}
