const COPY_SUFFIX = /(?:[\s_]\(\d+\)|_\(\d+\))(?=\.[^.]+$)/;

export function isCopyFilename(filename: string): boolean {
  return COPY_SUFFIX.test(filename);
}
