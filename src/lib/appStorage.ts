import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

/**
 * Where the stores keep their copy on the device. On a phone that is AsyncStorage. On the web AsyncStorage is the browser's
 * localStorage, which holds only about 5 MB: with meal photos in the stored state it filled up, every later save failed without a word,
 * and a reload brought back an old copy of the diary. The web therefore uses IndexedDB (hundreds of MB); a value still in localStorage
 * from before is moved over the first time it is read.
 */

const DB_NAME = 'fitjourney';
const STORE = 'kv';
const OPEN_TIMEOUT_MS = 3000;

let dbPromise: Promise<IDBDatabase> | null = null;
/** IndexedDB failed to open once: localStorage is used from then on (no waiting again on every save). */
let unavailable = false;

function openDb(): Promise<IDBDatabase> {
  if (unavailable) return Promise.reject(new Error('IndexedDB unavailable'));
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
    // A browser that never answers must not keep the app from opening: give up and use localStorage.
    setTimeout(() => reject(new Error('IndexedDB did not open')), OPEN_TIMEOUT_MS);
  }).catch((error) => {
    unavailable = true;
    throw error;
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

function legacyRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function legacyRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // nothing to remove
  }
}

/** IndexedDB, or (a browser that will not open it, e.g. some private windows) localStorage as before, so the app always works. */
export const webStorage: StateStorage = {
  async getItem(key) {
    try {
      const value = await run<string | undefined>('readonly', (s) => s.get(key));
      if (value !== undefined) return value;
      const legacy = legacyRead(key);
      if (legacy !== null) {
        await run('readwrite', (s) => s.put(legacy, key));
        legacyRemove(key);
      }
      return legacy;
    } catch {
      return AsyncStorage.getItem(key);
    }
  },
  async setItem(key, value) {
    try {
      await run('readwrite', (s) => s.put(value, key));
      legacyRemove(key);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key) {
    try {
      await run('readwrite', (s) => s.delete(key));
    } catch {
      // only localStorage is left to clear
    }
    legacyRemove(key);
  },
};

const useIndexedDb = Platform.OS === 'web' && typeof indexedDB !== 'undefined';

export const appStorage: StateStorage = useIndexedDb ? webStorage : AsyncStorage;
