/** Converts a canonical Apple Music video URL into Apple's hosted player URL. */
export function appleMusicVideoEmbedUrl(source: string): string | null {
  try {
    const url = new URL(source);
    if (!['music.apple.com', 'www.music.apple.com', 'itunes.apple.com'].includes(url.hostname.toLowerCase()) || url.protocol !== 'https:') return null;
    if (!/^\/[a-z]{2}\/music-video\/.+\/(?:id)?\d+\/?$/i.test(url.pathname)) return null;
    return `https://embed.music.apple.com${url.pathname.replace(/\/$/, '')}${url.search}`;
  } catch { return null; }
}
