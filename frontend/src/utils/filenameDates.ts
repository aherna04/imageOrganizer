const IMG_DATE = /IMG[_-]?(\d{4})(\d{2})(\d{2})/i;
const YYYYMMDD_TIME = /(?<![0-9])(\d{4})(\d{2})(\d{2})[_-]\d{6}/g;
const SCREENSHOT_DATE = /Screenshot[_-](\d{4})-(\d{2})-(\d{2})/i;
const ISO_DATE = /(?<![0-9])(\d{4})-(\d{2})-(\d{2})(?![0-9])/g;
const ORGANIZE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})_/;

function validDate(y: number, m: number, d: number): string | null {
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseGroups(m: RegExpMatchArray): string | null {
  return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function parseDateFromFilename(name: string): string | null {
  const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;

  let m = stem.match(IMG_DATE);
  if (m) {
    const parsed = parseGroups(m);
    if (parsed) return parsed;
  }

  m = stem.match(SCREENSHOT_DATE);
  if (m) {
    const parsed = parseGroups(m);
    if (parsed) return parsed;
  }

  for (m of stem.matchAll(YYYYMMDD_TIME)) {
    const parsed = parseGroups(m);
    if (parsed) return parsed;
  }

  const prefixMatch = stem.match(ORGANIZE_PREFIX);
  const prefixEnd = prefixMatch ? prefixMatch[0].length : 0;

  for (m of stem.matchAll(ISO_DATE)) {
    if (m.index != null && m.index < prefixEnd) continue;
    const parsed = parseGroups(m);
    if (parsed) return parsed;
  }

  return null;
}

export function filenameDateDiffers(captureDay: string | null, filename: string): string | null {
  const suggested = parseDateFromFilename(filename);
  if (!suggested) return null;
  if (captureDay === suggested) return null;
  return suggested;
}
