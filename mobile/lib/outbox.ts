/**
 * outbox.ts - Offline-first persistent storage using expo-sqlite
 *
 * Implements local tables:
 *  - pending_events: check-in, check-out, location status
 *  - pending_locations: queued location coordinates
 *  - sync_metadata: state tracking, last sync timestamp
 *
 * Strict Rule: Never delete a row because of a network error.
 * Delete only after the server confirms success.
 */

import * as SQLite from 'expo-sqlite';

export interface PendingEvent {
  id: string; // clientEventId (UUID)
  eventType: 'CHECK_IN' | 'CHECK_OUT' | 'LOCATION_STATUS';
  payload: string; // JSON
  createdAt: number;
  retryCount: number;
}

export interface PendingLocation {
  id: string; // clientPointId (UUID)
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  isMock: number; // 1 or 0
  recordedAt: string;
  createdAt: number;
}

let dbInstance: any = null;

export async function getOutboxDb(): Promise<any> {
  if (dbInstance) return dbInstance;

  try {
    dbInstance = await SQLite.openDatabaseAsync('sologix_outbox.db');
    await dbInstance.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS pending_events (
        id TEXT PRIMARY KEY,
        eventType TEXT NOT NULL,
        payload TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        retryCount INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS pending_locations (
        id TEXT PRIMARY KEY,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        speed REAL,
        heading REAL,
        isMock INTEGER NOT NULL DEFAULT 0,
        recordedAt TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    return dbInstance;
  } catch (err) {
    console.error('[Outbox] Failed to open SQLite database:', err);
    throw err;
  }
}

// ─── Pending Events ──────────────────────────────────────────────────────────

export async function queuePendingEvent(event: {
  id: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT' | 'LOCATION_STATUS';
  payload: any;
}): Promise<void> {
  const db = await getOutboxDb();
  const payloadStr = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
  const now = Date.now();

  await db.runAsync(
    `INSERT OR REPLACE INTO pending_events (id, eventType, payload, createdAt, retryCount)
     VALUES (?, ?, ?, ?, 0);`,
    [event.id, event.eventType, payloadStr, now]
  );
}

export async function getPendingEvents(): Promise<PendingEvent[]> {
  const db = await getOutboxDb();
  const rows = await db.getAllAsync(
    `SELECT id, eventType, payload, createdAt, retryCount FROM pending_events ORDER BY createdAt ASC;`
  );
  return rows as PendingEvent[];
}

export async function removePendingEvent(id: string): Promise<void> {
  const db = await getOutboxDb();
  await db.runAsync(`DELETE FROM pending_events WHERE id = ?;`, [id]);
}

export async function incrementEventRetry(id: string): Promise<void> {
  const db = await getOutboxDb();
  await db.runAsync(`UPDATE pending_events SET retryCount = retryCount + 1 WHERE id = ?;`, [id]);
}

// ─── Pending Locations ───────────────────────────────────────────────────────

export async function queuePendingLocation(point: {
  id?: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  isMock?: boolean;
  recordedAt: string | Date;
}): Promise<string> {
  const db = await getOutboxDb();
  const clientPointId = point.id || generateUUID();
  const recordedAtStr = typeof point.recordedAt === 'string' ? point.recordedAt : point.recordedAt.toISOString();
  const now = Date.now();

  await db.runAsync(
    `INSERT OR REPLACE INTO pending_locations 
     (id, latitude, longitude, accuracy, speed, heading, isMock, recordedAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      clientPointId,
      point.latitude,
      point.longitude,
      point.accuracy ?? null,
      point.speed ?? null,
      point.heading ?? null,
      point.isMock ? 1 : 0,
      recordedAtStr,
      now,
    ]
  );

  return clientPointId;
}

export async function getPendingLocations(limit = 200): Promise<PendingLocation[]> {
  const db = await getOutboxDb();
  const rows = await db.getAllAsync(
    `SELECT id, latitude, longitude, accuracy, speed, heading, isMock, recordedAt, createdAt 
     FROM pending_locations 
     ORDER BY createdAt ASC 
     LIMIT ?;`,
    [limit]
  );
  return rows as PendingLocation[];
}

export async function removePendingLocations(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getOutboxDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM pending_locations WHERE id IN (${placeholders});`, ids);
}

// ─── Outbox Status & Metadata ────────────────────────────────────────────────

export async function getOutboxStatus(): Promise<{
  pendingEvents: number;
  pendingLocations: number;
  totalPending: number;
  lastSyncAt: number | null;
  lastCheckInState: 'CHECKED_IN' | 'CHECKED_OUT' | null;
}> {
  try {
    const db = await getOutboxDb();

    const eventCountRow: any = await db.getFirstAsync(`SELECT COUNT(*) as count FROM pending_events;`);
    const locCountRow: any = await db.getFirstAsync(`SELECT COUNT(*) as count FROM pending_locations;`);

    const syncMetaRow: any = await db.getFirstAsync(
      `SELECT value FROM sync_metadata WHERE key = 'lastSyncAt';`
    );
    const stateMetaRow: any = await db.getFirstAsync(
      `SELECT value FROM sync_metadata WHERE key = 'lastCheckInState';`
    );

    const pendingEvents = Number(eventCountRow?.count || 0);
    const pendingLocations = Number(locCountRow?.count || 0);
    const lastSyncAt = syncMetaRow?.value ? Number(syncMetaRow.value) : null;
    const lastCheckInState = stateMetaRow?.value || null;

    return {
      pendingEvents,
      pendingLocations,
      totalPending: pendingEvents + pendingLocations,
      lastSyncAt,
      lastCheckInState,
    };
  } catch (err) {
    console.warn('[Outbox] Failed to query status:', err);
    return {
      pendingEvents: 0,
      pendingLocations: 0,
      totalPending: 0,
      lastSyncAt: null,
      lastCheckInState: null,
    };
  }
}

export async function setLastSyncTimestamp(timestamp: number): Promise<void> {
  try {
    const db = await getOutboxDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('lastSyncAt', ?);`,
      [String(timestamp)]
    );
  } catch (err) {
    console.warn('[Outbox] Failed to save lastSyncAt:', err);
  }
}

export async function setStoredAttendanceState(state: 'CHECKED_IN' | 'CHECKED_OUT'): Promise<void> {
  try {
    const db = await getOutboxDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('lastCheckInState', ?);`,
      [state]
    );
  } catch (err) {
    console.warn('[Outbox] Failed to save lastCheckInState:', err);
  }
}

export function generateUUID(): string {
  // RFC4122 v4 compliant UUID generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
