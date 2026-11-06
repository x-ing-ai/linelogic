import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { Findings, Pose, Scenario } from './types';

export interface Client {
  id: string;
  name: string;
  createdAt: string;
  notes?: string;
}

export interface Consent {
  photos: boolean;
  faceGeometry: boolean;
  calibrationUse: boolean;
  at: string;
}

/** Numbers saved when a follow-up is compared with its consultation projection. */
export interface FollowUpMetrics {
  computedAt: string;
  scenarioId: string;
  scenario: Scenario;
  /** Rest brow height change in mm vs. the consultation, [medial, mid, lateral]. */
  browPredictedMm: { r: number[]; l: number[] } | null;
  browActualMm: { r: number[]; l: number[] } | null;
  /** Dynamic crease index per view: consult baseline, projection, actual follow-up. */
  crease: Record<string, { baseline: number | null; projected: number | null; actual: number | null }>;
}

export interface Session {
  id: string;
  clientId: string;
  kind: 'consult' | 'followup';
  /** For follow-ups: the consultation they follow. */
  parentId?: string;
  createdAt: string;
  consent: Consent;
  poses: Pose[];
  findings?: Findings;
  scenarios?: Scenario[];
  chosenScenarioId?: string;
  metrics?: FollowUpMetrics;
  notes?: string;
}

interface Schema extends DBSchema {
  clients: { key: string; value: Client };
  sessions: { key: string; value: Session; indexes: { byClient: string } };
  photos: { key: string; value: Blob };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
function db() {
  if (!dbp) {
    dbp = openDB<Schema>('linelogic-demo', 1, {
      upgrade(d) {
        d.createObjectStore('clients', { keyPath: 'id' });
        const s = d.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('byClient', 'clientId');
        d.createObjectStore('photos');
      },
    });
  }
  return dbp;
}

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).slice(0, 12);

const photoKey = (sessionId: string, pose: Pose) => `${sessionId}:${pose}`;

export async function listClients(): Promise<Client[]> {
  const all = await (await db()).getAll('clients');
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export const getClient = async (id: string) => (await db()).get('clients', id);
export const putClient = async (c: Client) => { await (await db()).put('clients', c); };

export async function listSessions(clientId: string): Promise<Session[]> {
  const all = await (await db()).getAllFromIndex('sessions', 'byClient', clientId);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export const getSession = async (id: string) => (await db()).get('sessions', id);
export const putSession = async (s: Session) => { await (await db()).put('sessions', s); };

export const putPhoto = async (sessionId: string, pose: Pose, blob: Blob) => {
  await (await db()).put('photos', blob, photoKey(sessionId, pose));
};
export const getPhoto = async (sessionId: string, pose: Pose) => (await db()).get('photos', photoKey(sessionId, pose));
export const deletePhoto = async (sessionId: string, pose: Pose) => {
  await (await db()).delete('photos', photoKey(sessionId, pose));
};

export async function deleteSession(id: string): Promise<void> {
  const d = await db();
  const s = await d.get('sessions', id);
  if (!s) return;
  const all = await d.getAllFromIndex('sessions', 'byClient', s.clientId);
  for (const child of all.filter((x) => x.parentId === id)) await deleteSession(child.id);
  const keys = (await d.getAllKeys('photos')).filter((k) => k.startsWith(`${id}:`));
  const tx = d.transaction(['sessions', 'photos'], 'readwrite');
  for (const k of keys) await tx.objectStore('photos').delete(k);
  await tx.objectStore('sessions').delete(id);
  await tx.done;
}

export async function deleteClient(id: string): Promise<void> {
  for (const s of await listSessions(id)) await deleteSession(s.id);
  await (await db()).delete('clients', id);
}

export async function wipeAll(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['clients', 'sessions', 'photos'], 'readwrite');
  await Promise.all([tx.objectStore('clients').clear(), tx.objectStore('sessions').clear(), tx.objectStore('photos').clear()]);
  await tx.done;
}

export async function dumpAll() {
  const d = await db();
  const photos: { key: string; blob: Blob }[] = [];
  for (const key of await d.getAllKeys('photos')) {
    const blob = await d.get('photos', key);
    if (blob) photos.push({ key, blob });
  }
  return { clients: await d.getAll('clients'), sessions: await d.getAll('sessions'), photos };
}

export async function loadAll(data: { clients: Client[]; sessions: Session[]; photos: { key: string; blob: Blob }[] }) {
  const d = await db();
  const tx = d.transaction(['clients', 'sessions', 'photos'], 'readwrite');
  for (const c of data.clients) await tx.objectStore('clients').put(c);
  for (const s of data.sessions) await tx.objectStore('sessions').put(s);
  for (const p of data.photos) await tx.objectStore('photos').put(p.blob, p.key);
  await tx.done;
}
