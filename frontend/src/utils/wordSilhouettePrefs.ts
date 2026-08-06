import type { LetterFrame, WordSilhouetteFillMode } from "../api/client";
import { defaultLetterFrame } from "../components/LetterFrameEditor";

const STORAGE_KEY = "imageOrganizer.wordSilhouette.v1";

export type FilterType = "all" | "tag" | "person" | "event";
export type LocationFilter = "archive" | "all";

export type WordSilhouettePrefs = {
  text: string;
  designId: number | null;
  fillMode: WordSilhouetteFillMode;
  fillFileId: number | null;
  /** Index-aligned with visible glyphs; null = unset slot */
  letterIds: (number | null)[];
  letterFrames: LetterFrame[];
  selectedGlyph: number;
  filterType: FilterType;
  filterId: number | null;
  location: LocationFilter;
  columns: number;
  canvasWidth: number;
  background: string;
};

export const DEFAULT_WORD_SILHOUETTE_PREFS: WordSilhouettePrefs = {
  text: "elliott",
  designId: null,
  fillMode: "single",
  fillFileId: null,
  letterIds: [],
  letterFrames: [],
  selectedGlyph: 0,
  filterType: "all",
  filterId: null,
  location: "archive",
  columns: 40,
  canvasWidth: 1600,
  background: "#ffffff",
};

function isFillMode(v: unknown): v is WordSilhouetteFillMode {
  return v === "single" || v === "mosaic" || v === "per_letter";
}

function isFilterType(v: unknown): v is FilterType {
  return v === "all" || v === "tag" || v === "person" || v === "event";
}

function isLocation(v: unknown): v is LocationFilter {
  return v === "archive" || v === "all";
}

function asPositiveInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

function asFrame(v: unknown): LetterFrame {
  if (!v || typeof v !== "object") return defaultLetterFrame();
  const o = v as Record<string, unknown>;
  const pan_x = typeof o.pan_x === "number" ? o.pan_x : 0;
  const pan_y = typeof o.pan_y === "number" ? o.pan_y : 0;
  const zoom = typeof o.zoom === "number" ? o.zoom : 1;
  return {
    pan_x: Math.max(-1, Math.min(1, pan_x)),
    pan_y: Math.max(-1, Math.min(1, pan_y)),
    zoom: Math.max(1, Math.min(3, zoom)),
  };
}

export function loadWordSilhouettePrefs(): WordSilhouettePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WORD_SILHOUETTE_PREFS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const text =
      typeof parsed.text === "string" && parsed.text.length > 0
        ? parsed.text.slice(0, 80)
        : DEFAULT_WORD_SILHOUETTE_PREFS.text;
    const letterIds = Array.isArray(parsed.letterIds)
      ? parsed.letterIds.map((id) => {
          if (id === null || id === undefined) return null;
          return asPositiveInt(id);
        })
      : [];
    const letterFrames = Array.isArray(parsed.letterFrames)
      ? parsed.letterFrames.map(asFrame)
      : [];
    const background =
      typeof parsed.background === "string" && /^#[0-9A-Fa-f]{6}$/.test(parsed.background)
        ? parsed.background
        : DEFAULT_WORD_SILHOUETTE_PREFS.background;
    const columns =
      typeof parsed.columns === "number" && parsed.columns >= 10 && parsed.columns <= 120
        ? Math.round(parsed.columns)
        : DEFAULT_WORD_SILHOUETTE_PREFS.columns;
    const canvasWidth =
      typeof parsed.canvasWidth === "number" && parsed.canvasWidth >= 400 && parsed.canvasWidth <= 4000
        ? Math.round(parsed.canvasWidth)
        : DEFAULT_WORD_SILHOUETTE_PREFS.canvasWidth;
    const selectedGlyph =
      typeof parsed.selectedGlyph === "number" && parsed.selectedGlyph >= 0
        ? Math.floor(parsed.selectedGlyph)
        : 0;

    return {
      text,
      designId: asPositiveInt(parsed.designId),
      fillMode: isFillMode(parsed.fillMode) ? parsed.fillMode : DEFAULT_WORD_SILHOUETTE_PREFS.fillMode,
      fillFileId: asPositiveInt(parsed.fillFileId),
      letterIds,
      letterFrames,
      selectedGlyph,
      filterType: isFilterType(parsed.filterType) ? parsed.filterType : "all",
      filterId: asPositiveInt(parsed.filterId),
      location: isLocation(parsed.location) ? parsed.location : "archive",
      columns,
      canvasWidth,
      background,
    };
  } catch {
    return { ...DEFAULT_WORD_SILHOUETTE_PREFS };
  }
}

export function saveWordSilhouettePrefs(prefs: WordSilhouettePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}
