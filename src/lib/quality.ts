// Resolution grading from measured pixels. Never upscale or relabel: callers pass the dimensions the file really has.
export type ResolutionGrade = 'hd' | 'standard' | 'low' | 'unknown';
export const HD_LONG_EDGE_PX = 1600;
export const POSTER_IDEAL_HEIGHT_PX = 2400;

export function resolutionGrade(width?: number, height?: number): ResolutionGrade {
  if (!width || !height || width < 1 || height < 1) return 'unknown';
  const longEdge = Math.max(width, height);
  if (longEdge >= HD_LONG_EDGE_PX) return 'hd';
  return longEdge >= 600 ? 'standard' : 'low';
}

export function resolutionLabel(width?: number, height?: number): string {
  const grade = resolutionGrade(width, height);
  if (grade === 'unknown') return 'Size not measured';
  const size = `${width!.toLocaleString('en-US')} × ${height!.toLocaleString('en-US')} px`;
  return grade === 'hd' ? `${size} · HD source` : grade === 'standard' ? `${size} · standard` : `${size} · low resolution`;
}
