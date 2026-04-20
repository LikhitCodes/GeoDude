/**
 * Offline Store — IndexedDB wrapper using idb
 * Manages routes, tiles, road graphs, and turn instructions
 */

import { openDB } from 'idb';

const DB_NAME = 'trailsync-nav';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Saved routes metadata
        if (!db.objectStoreNames.contains('routes')) {
          const routeStore = db.createObjectStore('routes', { keyPath: 'id' });
          routeStore.createIndex('createdAt', 'createdAt');
        }

        // Map tiles (key: "z/x/y")
        if (!db.objectStoreNames.contains('tiles')) {
          db.createObjectStore('tiles', { keyPath: 'key' });
        }

        // Road graphs (key: routeId)
        if (!db.objectStoreNames.contains('graphs')) {
          db.createObjectStore('graphs', { keyPath: 'routeId' });
        }

        // Turn instructions (key: routeId)
        if (!db.objectStoreNames.contains('instructions')) {
          db.createObjectStore('instructions', { keyPath: 'routeId' });
        }
      },
    });
  }
  return dbPromise;
}

// ================ Routes ================

export async function saveRoute(route) {
  const db = await getDB();
  await db.put('routes', {
    ...route,
    id: route.id || `route_${Date.now()}`,
    createdAt: route.createdAt || new Date().toISOString(),
  });
  return route.id;
}

export async function getRoute(id) {
  const db = await getDB();
  return db.get('routes', id);
}

export async function getAllRoutes() {
  const db = await getDB();
  const routes = await db.getAll('routes');
  return routes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function deleteRoute(id) {
  const db = await getDB();
  await db.delete('routes', id);
  // Also clean up associated data
  await deleteGraphForRoute(id);
  await deleteInstructionsForRoute(id);
  await deleteTilesForRoute(id);
}

// ================ Tiles ================

export async function saveTile(z, x, y, blob, routeId) {
  const db = await getDB();
  const key = `${z}/${x}/${y}`;
  await db.put('tiles', { key, z, x, y, blob, routeId, savedAt: Date.now() });
}

export async function saveTileBatch(tiles) {
  const db = await getDB();
  const tx = db.transaction('tiles', 'readwrite');
  for (const tile of tiles) {
    const key = `${tile.z}/${tile.x}/${tile.y}`;
    tx.store.put({ key, ...tile, savedAt: Date.now() });
  }
  await tx.done;
}

export async function getTile(z, x, y) {
  const db = await getDB();
  const key = `${z}/${x}/${y}`;
  return db.get('tiles', key);
}

export async function getTileBlob(z, x, y) {
  const tile = await getTile(z, x, y);
  return tile ? tile.blob : null;
}

export async function deleteTilesForRoute(routeId) {
  const db = await getDB();
  const tx = db.transaction('tiles', 'readwrite');
  const cursor = await tx.store.openCursor();
  let cur = cursor;
  while (cur) {
    if (cur.value.routeId === routeId) {
      await cur.delete();
    }
    cur = await cur.continue();
  }
  await tx.done;
}

export async function countTiles() {
  const db = await getDB();
  return db.count('tiles');
}

// ================ Road Graphs ================

export async function saveGraph(routeId, graph) {
  const db = await getDB();
  await db.put('graphs', { routeId, graph, savedAt: Date.now() });
}

export async function getGraph(routeId) {
  const db = await getDB();
  const record = await db.get('graphs', routeId);
  return record ? record.graph : null;
}

export async function deleteGraphForRoute(routeId) {
  const db = await getDB();
  await db.delete('graphs', routeId);
}

// ================ Turn Instructions ================

export async function saveInstructions(routeId, instructions) {
  const db = await getDB();
  await db.put('instructions', { routeId, instructions, savedAt: Date.now() });
}

export async function getInstructions(routeId) {
  const db = await getDB();
  const record = await db.get('instructions', routeId);
  return record ? record.instructions : null;
}

export async function deleteInstructionsForRoute(routeId) {
  const db = await getDB();
  await db.delete('instructions', routeId);
}

// ================ Storage Stats ================

export async function getStorageStats() {
  const db = await getDB();
  const routes = await db.count('routes');
  const tiles = await db.count('tiles');

  // Estimate storage size
  let tileSize = 0;
  const tx = db.transaction('tiles', 'readonly');
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if (cursor.value.blob) {
      tileSize += cursor.value.blob.size || 0;
    }
    cursor = await cursor.continue();
  }

  return {
    routeCount: routes,
    tileCount: tiles,
    estimatedSizeMB: (tileSize / (1024 * 1024)).toFixed(1),
  };
}

// ================ Clear All ================

export async function clearAllData() {
  const db = await getDB();
  await db.clear('routes');
  await db.clear('tiles');
  await db.clear('graphs');
  await db.clear('instructions');
}
