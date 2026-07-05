import { DuplicateGroup, MediaFile } from "../api/client";
import { filenameDateDiffers } from "./filenameDates";

export interface DateAlert {
  suggestedDate: string;
}

export interface DuplicateAlert {
  groupId: number;
  groupType: "exact" | "perceptual";
  memberCount: number;
  keeperId: number | null;
}

export type AlertFilter = "all" | "alerts";

export function getDateAlert(file: MediaFile): DateAlert | null {
  const suggested = filenameDateDiffers(file.capture_day, file.filename);
  if (!suggested) return null;
  return { suggestedDate: suggested };
}

export function buildDuplicateIndex(groups: DuplicateGroup[]): Map<number, DuplicateAlert> {
  const index = new Map<number, DuplicateAlert>();
  for (const group of groups) {
    const alert: DuplicateAlert = {
      groupId: group.id,
      groupType: group.group_type,
      memberCount: group.files.length,
      keeperId: group.keeper_id,
    };
    for (const file of group.files) {
      index.set(file.id, alert);
    }
  }
  return index;
}

export function buildDateAlertMap(files: MediaFile[]): Map<number, DateAlert> {
  const map = new Map<number, DateAlert>();
  for (const file of files) {
    const alert = getDateAlert(file);
    if (alert) map.set(file.id, alert);
  }
  return map;
}

export function fileHasAlert(
  fileId: number,
  dateAlerts: Map<number, DateAlert>,
  duplicateIndex: Map<number, DuplicateAlert>
): boolean {
  return dateAlerts.has(fileId) || duplicateIndex.has(fileId);
}

export function summarizeAlerts(
  files: MediaFile[],
  dateAlerts: Map<number, DateAlert>,
  duplicateIndex: Map<number, DuplicateAlert>
): { dateCount: number; duplicateCount: number; groupCount: number; hasAny: boolean } {
  let duplicateCount = 0;
  const groupIds = new Set<number>();
  for (const file of files) {
    const dup = duplicateIndex.get(file.id);
    if (dup) {
      duplicateCount += 1;
      groupIds.add(dup.groupId);
    }
  }
  const dateCount = dateAlerts.size;
  return {
    dateCount,
    duplicateCount,
    groupCount: groupIds.size,
    hasAny: dateCount > 0 || duplicateCount > 0,
  };
}

export function filterFilesByAlerts(
  files: MediaFile[],
  filter: AlertFilter,
  dateAlerts: Map<number, DateAlert>,
  duplicateIndex: Map<number, DuplicateAlert>
): MediaFile[] {
  if (filter !== "alerts") return files;
  return files.filter((f) => fileHasAlert(f.id, dateAlerts, duplicateIndex));
}

export function dateWarningFileIds(files: MediaFile[]): number[] {
  return files.filter((f) => getDateAlert(f) != null).map((f) => f.id);
}
