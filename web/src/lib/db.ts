/**
 * Persistence: IndexedDB for settings / key-value (schedule, textbooks).
 * Falls back to localStorage when IndexedDB is unavailable (private mode, old browsers)
 * so user data still survives a reload.
 */
import type { AppSettings } from './types';

const DB_NAME = 'm3-expressive-notes';
const DB_VERSION = 1;
const STORE_SETTINGS = 'settings';
const STORE_KV = 'kv';

const LS_PREFIX = 'm3-notes:';

let dbPromise: Promise<IDBDatabase> | null = null;
let idbFailed = false;

function hasIdb(): boolean {
  return typeof indexedDB !== 'undefined' && !idbFailed;
}

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS);
        }
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB blocked'));
    }).catch((error: unknown) => {
      idbFailed = true;
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      }),
  );
}

/* ----------------------------------------------------------------- settings */

export async function readSettings(): Promise<Partial<AppSettings>> {
  if (!hasIdb()) {
    const raw = localStorage.getItem(`${LS_PREFIX}settings`);
    return raw ? (JSON.parse(raw) as Partial<AppSettings>) : {};
  }
  try {
    const value = await tx<Partial<AppSettings> | undefined>(STORE_SETTINGS, 'readonly', (s) => s.get('settings'));
    return value ?? {};
  } catch {
    return {};
  }
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  if (!hasIdb()) {
    localStorage.setItem(`${LS_PREFIX}settings`, JSON.stringify(settings));
    return;
  }
  try {
    await tx(STORE_SETTINGS, 'readwrite', (s) => s.put(settings, 'settings'));
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------------- key/value */

export async function readKv<T>(key: string): Promise<T | undefined> {
  if (!hasIdb()) {
    const raw = localStorage.getItem(`${LS_PREFIX}kv:${key}`);
    return raw ? (JSON.parse(raw) as T) : undefined;
  }
  try {
    return await tx<T | undefined>(STORE_KV, 'readonly', (s) => s.get(key));
  } catch {
    return undefined;
  }
}

export async function writeKv<T>(key: string, value: T): Promise<void> {
  if (!hasIdb()) {
    localStorage.setItem(`${LS_PREFIX}kv:${key}`, JSON.stringify(value));
    return;
  }
  try {
    await tx(STORE_KV, 'readwrite', (s) => s.put(value, key));
  } catch {
    /* ignore */
  }
}

export async function removeKv(key: string): Promise<void> {
  if (!hasIdb()) {
    localStorage.removeItem(`${LS_PREFIX}kv:${key}`);
    return;
  }
  try {
    await tx(STORE_KV, 'readwrite', (s) => s.delete(key));
  } catch {
    /* ignore */
  }
}

export const SCHEDULE_KEY = 'schedule';
export const TEXTBOOK_KEY = 'textbooks';
