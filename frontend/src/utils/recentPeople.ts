import { useCallback, useState } from "react";

const STORAGE_KEY = "imageOrganizer.recentPeopleIds";
const MAX_RECENT = 12;

export function getRecentPeopleIds(): number[] {
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

export function recordRecentPerson(personId: number): number[] {
  const next = [personId, ...getRecentPeopleIds().filter((id) => id !== personId)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
  return next;
}

export function useRecentPeople() {
  const [recentIds, setRecentIds] = useState(() => getRecentPeopleIds());

  const record = useCallback((personId: number) => {
    setRecentIds(recordRecentPerson(personId));
  }, []);

  return { recentIds, recordRecentPerson: record };
}
