import { useCallback, useState } from "react";

const STORAGE_KEY = "imageOrganizer.recentTagIds";
const MAX_RECENT = 12;

export function getRecentTagIds(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => typeof id === "number" && Number.isInteger(id));
  } catch {
    return [];
  }
}

export function recordRecentTag(tagId: number): number[] {
  const next = [tagId, ...getRecentTagIds().filter((id) => id !== tagId)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
  return next;
}

export function useRecentTags() {
  const [recentIds, setRecentIds] = useState(() => getRecentTagIds());

  const record = useCallback((tagId: number) => {
    setRecentIds(recordRecentTag(tagId));
  }, []);

  return { recentIds, recordRecentTag: record };
}
