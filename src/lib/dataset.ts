import { type Client, dumpAll, loadAll, type Session } from './db';

/**
 * Dataset file: everything on this device in one JSON file, photos as data
 * URLs. This is the demo's stand-in for the portal, and the raw material for
 * calibration (consultation projections next to real follow-ups).
 */
export interface DatasetFile {
  app: 'linelogic-demo';
  version: 1;
  exportedAt: string;
  clients: Client[];
  sessions: Session[];
  photos: Record<string, string>;
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

async function dataUrlToBlob(url: string): Promise<Blob> {
  const [head, body] = url.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportDataset(): Promise<Blob> {
  const all = await dumpAll();
  const photos: Record<string, string> = {};
  for (const p of all.photos) photos[p.key] = await blobToDataUrl(p.blob);
  const file: DatasetFile = {
    app: 'linelogic-demo',
    version: 1,
    exportedAt: new Date().toISOString(),
    clients: all.clients,
    sessions: all.sessions,
    photos,
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export async function importDataset(file: File): Promise<{ clients: number; sessions: number; photos: number }> {
  const data = JSON.parse(await file.text()) as DatasetFile;
  if (data.app !== 'linelogic-demo' || data.version !== 1) throw new Error('This is not a LineLogic demo dataset file.');
  const photos: { key: string; blob: Blob }[] = [];
  for (const [key, url] of Object.entries(data.photos)) photos.push({ key, blob: await dataUrlToBlob(url) });
  await loadAll({ clients: data.clients, sessions: data.sessions, photos });
  return { clients: data.clients.length, sessions: data.sessions.length, photos: photos.length };
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
