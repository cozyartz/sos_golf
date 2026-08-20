import type { HoleScore } from './golf';

export type PendingRound = { id: string; courseId: string; personId: string; scores: HoleScore[]; attempts: number; updatedAt: string };
const DB_NAME = 'sticklink-golf-offline';
const STORE = 'pending-rounds';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

export async function savePendingRound(round: PendingRound): Promise<void> { const db = await openDb(); await new Promise<void>((resolve, reject) => { const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(round); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); db.close(); }
export async function listPendingRounds(): Promise<PendingRound[]> { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction(STORE).objectStore(STORE).getAll(); request.onsuccess = () => { db.close(); resolve(request.result as PendingRound[]); }; request.onerror = () => { db.close(); reject(request.error); }; }); }
export async function removePendingRound(id: string): Promise<void> { const db = await openDb(); await new Promise<void>((resolve, reject) => { const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); db.close(); }
export async function syncPendingRounds(send: (round: PendingRound) => Promise<{ id: string }>): Promise<{ synced: string[]; failed: string[] }> { const synced: string[] = []; const failed: string[] = []; for (const round of await listPendingRounds()) { try { const response = await send(round); if (!response.id) throw new Error('Server did not return a round id'); await removePendingRound(round.id); synced.push(round.id); } catch { failed.push(round.id); } } return { synced, failed }; }
