import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
/** Wikimedia's image host answers with a tracking cookie (WMF-Uniq). A CORS-mode request carries no credentials, so the browser drops that cookie; the host sends Access-Control-Allow-Origin: *. */
export const imageCors = (src?: string): 'anonymous' | undefined => src && src.startsWith('https://upload.wikimedia.org/') ? 'anonymous' : undefined;
export function safeFileName(s: string) { return s.normalize('NFKD').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100) || 'artwork'; }
export function toPpi(w: number, h: number, paper: 'A4'|'A3'|'A2') {
  const dimensions = { A4: [210, 297], A3: [297, 420], A2: [420, 594] }[paper];
  if (w <= 0 || h <= 0) return 0;
  const [wide, high] = w > h ? [dimensions[1],dimensions[0]] : dimensions;
  return Math.floor(Math.min(w / (wide/25.4), h / (high/25.4)));
}
export function qualityLabel(ppi: number) { return ppi >= 300 ? 'High pixel density (not proof of native detail)' : ppi >= 200 ? 'Good print potential' : ppi >= 150 ? 'Viewing-distance print' : 'Low for this print size'; }
