import { MediaFile } from "../api/client";

export function togglePhotoSelection(
  files: MediaFile[],
  selectedIds: number[],
  clickedId: number,
  shiftKey: boolean,
  anchorIndex: number | null,
): { selectedIds: number[]; anchorIndex: number } {
  const clickedIndex = files.findIndex((f) => f.id === clickedId);
  if (clickedIndex < 0) {
    return { selectedIds, anchorIndex: anchorIndex ?? 0 };
  }

  if (shiftKey && anchorIndex !== null) {
    const start = Math.min(anchorIndex, clickedIndex);
    const end = Math.max(anchorIndex, clickedIndex);
    const rangeIds = files.slice(start, end + 1).map((f) => f.id);
    const merged = new Set([...selectedIds, ...rangeIds]);
    return { selectedIds: [...merged], anchorIndex: clickedIndex };
  }

  const next = selectedIds.includes(clickedId)
    ? selectedIds.filter((id) => id !== clickedId)
    : [...selectedIds, clickedId];
  return { selectedIds: next, anchorIndex: clickedIndex };
}
