import { createHash } from 'node:crypto';

const ASSET_TYPE_MARKER = /\\"assetType\\":\{\\"id\\":\d+,\\"name\\":\\"([^"\\]+)\\"/g;
const FILE_RECORD = /\\"mimeType\\":\\"([^"\\]+)\\",\\"size\\":(\d+),\\"sourceFilename\\":\\"([^"\\]+)\\",\\"url\\":\\"([^"\\]+)\\"/g;
const THUMBNAIL_MARKER = '\\"defaultThumbnailUrl\\":\\"';
const NON_ENGLISH_LOCALES = new Set(['KR', 'KO', 'ZHS', 'ZHT', 'JP', 'PL', 'DE', 'FR', 'ES', 'IT', 'RU', 'PT', 'BR', 'TR', 'AR', 'TH', 'ID', 'VN']);
const LOCALE_TOKENS = new Set([...NON_ENGLISH_LOCALES, 'EN']);

function platformFromFilename(filename) {
  if (/(?:^|_)(?:NS2|SWITCH_2|NINTENDO_SWITCH_2)(?:_|$)/i.test(filename)) return 'Nintendo Switch 2';
  if (/(?:^|_)(?:SWITCH|NINTENDO)(?:_|$)/i.test(filename)) return 'Nintendo Switch';
  if (/(?:^|_)PS5(?:_PRO)?(?:_|$)/i.test(filename)) return 'PlayStation 5';
  if (/(?:^|_)PS4(?:_|$)/i.test(filename)) return 'PlayStation 4';
  if (/(?:^|_)(?:XSX|XSX_S|XSS|XBOX_SERIES)(?:_|$)/i.test(filename)) return 'Xbox Series X/S';
  if (/(?:^|_)(?:XONE|XB1|XBOX_ONE)(?:_|$)/i.test(filename)) return 'Xbox One';
  if (/(?:^|_)XBOX(?:_|$)/i.test(filename)) return 'Xbox';
  if (/(?:^|_)PC(?:_|$)/i.test(filename)) return 'PC';
  return 'All platforms';
}

function describeAsset(type, filename) {
  const stem = filename.replace(/\.[^.]+$/, '');
  const kind = type === 'Screenshots'
    ? 'screenshot'
    : /wallpaper/i.test(stem) ? 'wallpaper'
      : /\blogo\b/i.test(stem) ? 'logo'
        : /\bicon\b/i.test(stem) ? 'icon'
          : /title.?screen/i.test(stem) ? 'title-screen'
            : /(?:^|[_-])(?:KV|KEY.?VISUAL)(?:[_-]|$)/i.test(stem) ? 'key-art' : 'promo-art';
  const title = /^[a-f\d]{32,}$/i.test(stem) ? '' : stem
    .replace(/^Cyberpunk(?:2077|_2077)?[_-]?/i, '')
    .replace(/^CP_?2077[_-]?/i, '')
    .replace(/_(?:CLEAN|EN|KR|KO|ZHS|ZHT|JP|PL|DE|FR|ES|IT|RU|PT|BR|TR|AR|TH|ID|VN)(?=_|$)/gi, '')
    .replace(/_/g, ' ')
    .trim();
  const typeLabel = kind === 'screenshot' ? 'Gameplay screenshot' : kind === 'wallpaper' ? 'Wallpaper' : kind === 'promo-art' ? 'Publisher artwork' : kind === 'key-art' ? 'Key art' : kind;
  return { kind, label: title ? `${typeLabel} · ${title}` : typeLabel };
}

export function parseCdprPressCenterAssets(html, pageUrl = 'https://press.cdprojektred.com/en/224/808') {
  if (typeof html !== 'string' || !html.length) return [];
  const categoryMarkers = [...html.matchAll(ASSET_TYPE_MARKER)].map(match => ({ index: match.index, name: match[1] }));
  const grouped = new Map();

  for (const match of html.matchAll(FILE_RECORD)) {
    const [, mimeType, byteSize, filename, image] = match;
    if (!mimeType.startsWith('image/') || !/^https:\/\/press\.cdn\.cdpr\.app\/media\/assets\//i.test(image)) continue;
    let category;
    for (const marker of categoryMarkers) {
      if (marker.index > match.index) { category = marker.name; break; }
    }
    if (category !== 'Screenshots' && category !== 'Artworks') continue;

    const tokens = filename.replace(/\.[^.]+$/, '').split('_');
    const locales = tokens.filter(token => LOCALE_TOKENS.has(token.toUpperCase()) || NON_ENGLISH_LOCALES.has(token.toUpperCase()));
    if (locales.some(locale => NON_ENGLISH_LOCALES.has(locale.toUpperCase()))) continue;
    const priority = tokens.some(token => token.toUpperCase() === 'CLEAN') ? 0 : locales.some(locale => locale.toUpperCase() === 'EN') ? 1 : 2;
    const identity = `${category}:${tokens.filter(token => token.toUpperCase() !== 'CLEAN' && !LOCALE_TOKENS.has(token.toUpperCase())).join('_').toLowerCase()}`;
    const description = describeAsset(category, filename);
    const id = `cdpr:${createHash('sha1').update(image).digest('hex').slice(0, 14)}`;
    const thumbnailIndex = html.lastIndexOf(THUMBNAIL_MARKER, match.index);
    const thumbnailStart = thumbnailIndex + THUMBNAIL_MARKER.length;
    const thumbnailEnd = thumbnailIndex >= match.index - 1200 ? html.indexOf('\\"', thumbnailStart) : -1;
    const thumbnail = thumbnailEnd > thumbnailStart ? html.slice(thumbnailStart, thumbnailEnd) : '';
    const asset = {
      id,
      kind: description.kind,
      label: description.label,
      image,
      preview: /^https:\/\/press\.cdn\.cdpr\.app\//i.test(thumbnail) ? thumbnail : image,
      source: 'CD PROJEKT RED Press Center',
      provider: 'CD PROJEKT RED Press Center',
      sourceUrl: pageUrl,
      platform: platformFromFilename(filename),
      fileName: filename,
      byteSize: Number(byteSize),
    };
    const prior = grouped.get(identity);
    if (!prior || priority < prior.priority || priority === prior.priority && asset.byteSize > prior.asset.byteSize) grouped.set(identity, { priority, asset });
  }

  return [...grouped.values()]
    .map(entry => entry.asset)
    .sort((a, b) => (a.kind === 'screenshot' ? 0 : 1) - (b.kind === 'screenshot' ? 0 : 1) || a.label.localeCompare(b.label));
}

export async function fetchCdprPressCenterAssets(pageUrl, { fetchImpl = fetch, signal = AbortSignal.timeout(12_000) } = {}) {
  const response = await fetchImpl(pageUrl, { headers: { Accept: 'text/html' }, signal });
  if (!response.ok) throw new Error(`CD PROJEKT RED Press Center returned HTTP ${response.status}.`);
  const assets = parseCdprPressCenterAssets(await response.text(), pageUrl);
  if (!assets.length) throw new Error('No press images were found in the CD PROJEKT RED page data.');
  return assets;
}
