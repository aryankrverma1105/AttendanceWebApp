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
  getPendingLocations,
  removePendingLocations,
  setLastSyncTimestamp,
  getOutboxStatus,
} from './outbox';
import { mobileApi } from './api';

type SyncListener = (status: {
  pendingCount: number;
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
      lastSyncAt: status.lastSyncAt,
      isSyncing,
    });
  });
  return () => listeners.delete(cb);
}

function notifyListeners(pendingCount: number, lastSyncAt: number | null) {
  listeners.forEach((cb) => {
    try {
      cb({ pendingCount, lastSyncAt, isSyncing });
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
    notifyListeners(status.totalPending, status.lastSyncAt);
    return { success: false, syncedCount: 0 };
  }

  isSyncing = true;
  let syncedCount = 0;
  const initialStatus = await getOutboxStatus();
  notifyListeners(initialStatus.totalPending, initialStatus.lastSyncAt);

  try {
    // ─── Step 1: Drain pending events (FIFO) ──────────────────────────────────
    const events = await getPendingEvents();
    for (const ev of events) {
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
          throw new Error(res?.message || 'Server rejected event');
        }
      } catch (err: any) {
        console.warn(`[Sync] Event ${ev.id} (${ev.eventType}) upload error:`, err?.message || err);
        consecutiveFailures++;
        // If network error, stop processing events to maintain FIFO order
        throw err;
      }
    }

    // ─── Step 2: Drain pending location points in batches of up to 200 ────────
    let hasMoreLocations = true;
    while (hasMoreLocations) {
      const batch = await getPendingLocations(200);
      if (batch.length === 0) {
        hasMoreLocations = false;
        break;
      }

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

        if (res?.success && Array.isArray(res.acceptedClientPointIds)) {
          await removePendingLocations(res.acceptedClientPointIds);
          syncedCount += res.acceptedClientPointIds.length;
          consecutiveFailures = 0;
        } else if (res?.success) {
          // Fallback if acceptedClientPointIds was omitted
          await removePendingLocations(batch.map((p) => p.id));
          syncedCount += batch.length;
          consecutiveFailures = 0;
        } else {
          throw new Error(res?.message || 'Batch rejected');
        }
      } catch (err: any) {
        console.warn('[Sync] Location batch upload error:', err?.message || err);
        consecutiveFailures++;
        hasMoreLocations = false;
        throw err;
      }
    }

    const now = Date.now();
    await setLastSyncTimestamp(now);
    const finalStatus = await getOutboxStatus();
    notifyListeners(finalStatus.totalPending, now);

    return { success: true, syncedCount };
  } catch (err) {
    console.log('[Sync] Cycle stopped due to network or server condition');
    const status = await getOutboxStatus();
    notifyListeners(status.totalPending, status.lastSyncAt);
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
