import { MediaFile } from "../api/client";

export function adjacentFile(
  files: MediaFile[],
  currentId: number,
  delta: -1 | 1
): MediaFile | null {
  const index = files.findIndex((f) => f.id === currentId);
  if (index < 0) return null;
  const next = index + delta;
  if (next < 0 || next >= files.length) return null;
  return files[next];
}

export function nextFileAfterCurrent(files: MediaFile[], currentId: number): MediaFile | null {
  return adjacentFile(files, currentId, 1) ?? adjacentFile(files, currentId, -1);
}

export function nextFileAfterRemoval(
  prevItems: MediaFile[],
  removedId: number,
  newItems: MediaFile[],
): MediaFile | null {
  const newById = new Map(newItems.map((f) => [f.id, f]));
  const idx = prevItems.findIndex((f) => f.id === removedId);
  if (idx < 0) return newItems[0] ?? null;
  for (let i = idx + 1; i < prevItems.length; i++) {
    const candidate = newById.get(prevItems[i].id);
    if (candidate) return candidate;
  }
  for (let i = idx - 1; i >= 0; i--) {
    const candidate = newById.get(prevItems[i].id);
    if (candidate) return candidate;
  }
  return newItems[0] ?? null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function photoNavDelta(key: string): -1 | 1 | null {
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  return null;
}

export { isEditableTarget };
