import { useEffect, useMemo, useRef, useState } from 'react';
import { Gamepad2, LoaderCircle, RefreshCw } from 'lucide-react';

type ConsoleOption = { id: string; label: string };
type ConsoleInfo = { family: string; era: string; search: string };
type ConsolePhoto = { url: string; source: string; artist: string; license: string };
const INFO: Record<string, ConsoleInfo> = {
  '3ds': { family: 'Nintendo', era: '2011 · handheld', search: 'Nintendo 3DS console' },
  dreamcast: { family: 'Sega', era: '1998 · home console', search: 'Sega Dreamcast console' },
  gb: { family: 'Nintendo', era: '1989 · handheld', search: 'Nintendo Game Boy console' },
  gba: { family: 'Nintendo', era: '2001 · handheld', search: 'Nintendo Game Boy Advance' },
  gbc: { family: 'Nintendo', era: '1998 · handheld', search: 'Nintendo Game Boy Color' },
  gc: { family: 'Nintendo', era: '2001 · home console', search: 'Nintendo GameCube console' },
  genesis: { family: 'Sega', era: '1988 · home console', search: 'Sega Genesis console' },
  n64: { family: 'Nintendo', era: '1996 · home console', search: 'Nintendo 64 console' },
  nds: { family: 'Nintendo', era: '2004 · handheld', search: 'Nintendo DS console' },
  nes: { family: 'Nintendo', era: '1983 · home console', search: 'Nintendo Entertainment System console' },
  ps1: { family: 'PlayStation', era: '1994 · home console', search: 'Sony PlayStation console' },
  ps2: { family: 'PlayStation', era: '2000 · home console', search: 'Sony PlayStation 2 console' },
  psp: { family: 'PlayStation', era: '2004 · handheld', search: 'Sony PSP handheld console' },
  psvita: { family: 'PlayStation', era: '2011 · handheld', search: 'Sony PlayStation Vita console' },
  saturn: { family: 'Sega', era: '1994 · home console', search: 'Sega Saturn console' },
  snes: { family: 'Nintendo', era: '1990 · home console', search: 'Super Nintendo Entertainment System console' },
  wii: { family: 'Nintendo', era: '2006 · home console', search: 'Nintendo Wii console' },
  ps4: { family: 'PlayStation', era: '2013 · home console', search: 'Sony PlayStation 4 console' },
  ps5: { family: 'PlayStation', era: '2020 · home console', search: 'Sony PlayStation 5 console' },
  switch: { family: 'Nintendo', era: '2017 · hybrid console', search: 'Nintendo Switch console' },
  'xbox-one': { family: 'Xbox', era: '2013 · home console', search: 'Microsoft Xbox One console' },
  'xbox-series': { family: 'Xbox', era: '2020 · home console', search: 'Microsoft Xbox Series X console' },
  pc: { family: 'PC', era: 'multi-generation', search: 'desktop gaming computer' },
};
const photoCache = new Map<string, Promise<ConsolePhoto | null>>();
let activePhotoRequests = 0;
const photoRequestQueue: (() => void)[] = [];
async function withPhotoRequestLimit<T>(request: () => Promise<T>): Promise<T> {
  if (activePhotoRequests >= 3) await new Promise<void>(resolve => photoRequestQueue.push(resolve));
  activePhotoRequests++;
  try { return await request(); }
  finally { activePhotoRequests--; photoRequestQueue.shift()?.(); }
}
const knownLicensedPhotos: Record<string, ConsolePhoto> = {
  ps5: { url: 'https://commons.wikimedia.org/wiki/Special:FilePath/PlayStation_5_and_DualSense.jpg?width=720', source: 'https://commons.wikimedia.org/wiki/File:PlayStation_5_and_DualSense.jpg', artist: 'Osh33m', license: 'CC BY-SA 4.0' },
};
const plainText = (value?: { value?: string }) => (value?.value || '').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|#39);/g, ' ').replace(/\s+/g, ' ').trim();
function approvedLicense(value: string) {
  return /^(?:CC BY(?:-SA)?(?:\s|$)|CC0(?:\s|$)|Public domain|PD(?:\s|$))/i.test(value.trim());
}
async function consolePhoto(id: string): Promise<ConsolePhoto | null> {
  if (photoCache.has(id)) return photoCache.get(id)!;
  const meta = INFO[id];
  if (!meta) return null;
  const request = withPhotoRequestLimit(async () => {
    const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: meta.search, gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '720', format: 'json', origin: '*' });
    const response = await fetch('https://commons.wikimedia.org/w/api.php?' + params, { signal: AbortSignal.timeout(9_000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Wikimedia Commons search failed');
    const data = await response.json();
    const pages = Object.values(data.query?.pages || {}) as { title: string; imageinfo?: { thumburl?: string; url?: string; extmetadata?: Record<string, { value?: string }> }[] }[];
    const mustMatch = id === 'pc' ? ['computer'] : meta.search.toLocaleLowerCase().split(/\s+/).filter(word => !['console', 'handheld', 'desktop', 'gaming', 'computer', 'system', 'microsoft', 'sony', 'nintendo', 'sega'].includes(word));
    const blocked = /logo|wordmark|motherboard|pcb|circuit|diagram|schematic|teardown|packaging|box|game\s*pad|controller\s*only|other\s+consoles|all\s+consoles|playing|woman|man\s+with|person|oculus|rift|museum|exhibition/i;
    const candidates = pages.flatMap(page => {
      const image = page.imageinfo?.[0];
      const title = page.title.replace(/^File:/, '');
      const words = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/);
      const normalized = words.join(' ');
      if (!image || blocked.test(title) || !mustMatch.every(token => words.includes(token))) return [];
      const license = plainText(image.extmetadata?.LicenseShortName);
      if (!approvedLicense(license)) return [];
      const artist = plainText(image.extmetadata?.Artist) || plainText(image.extmetadata?.Credit) || 'Contributor not listed';
      const score = (normalized.includes('console') ? 4 : 0) + (normalized.includes('front') || normalized.includes('side') ? 1 : 0) - (normalized.includes('all playstations') ? 8 : 0) - (normalized.includes('comparison') ? 4 : 0);
      return [{ score, result: { url: image.thumburl || image.url || '', source: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(page.title.replaceAll(' ', '_')), artist, license } satisfies ConsolePhoto }];
    }).filter(entry => entry.result.url).sort((a, b) => b.score - a.score);
    return candidates[0]?.result || null;
  });
  photoCache.set(id, request);
  const result = await request.catch(() => null) || knownLicensedPhotos[id] || null;
  photoCache.set(id, Promise.resolve(result));
  return result;
}

function ConsoleCard({ option, value, onChange }: { option: ConsoleOption; value: string; onChange: (id: string) => void }) {
  const card = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [photo, setPhoto] = useState<ConsolePhoto | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const info = INFO[option.id] || { family: 'Other', era: 'console', search: option.label };
  useEffect(() => {
    if (visible || !card.current) return;
    const root = card.current.closest('.console-rail');
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { root, rootMargin: '120px' });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    void consolePhoto(option.id).then(result => { if (active) setPhoto(result); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [option.id, visible, attempt]);
  function retry() {
    photoCache.delete(option.id);
    setPhoto(null); setFailed(false); setAttempt(value => value + 1);
  }
  return <article ref={card} className={'console-option' + (value === option.id ? ' active' : '')}>
    <button type="button" className="console-select" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
      <span className="console-device" aria-hidden="true">{loading ? <span className="console-photo-loading"><LoaderCircle size={17}/></span> : photo && !failed ? <img src={photo.url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}/> : <span className="console-photo-missing"><Gamepad2 size={19}/>{failed ? 'Photo unavailable' : visible ? 'No licensed photo found' : 'Product photo'}</span>}</span>
      <strong>{option.label}</strong><small>{info.family} · {info.era}</small>
    </button>
    <div className="console-card-actions">{photo && !failed ? <><a href={photo.source} target="_blank" rel="noreferrer">Photo source</a><span>{photo.license}</span></> : visible && !loading ? <button type="button" onClick={retry}><RefreshCw size={11}/> Retry photo</button> : <span>Source and license checked</span>}</div>
    {photo && !failed && <small className="console-photo-credit" title={`${photo.artist} · ${photo.license}`}>{photo.artist} · {photo.license}</small>}
  </article>;
}

export function GameConsoleSelector({ options, value, onChange }: { options: ConsoleOption[]; value: string; onChange: (id: string) => void }) {
  const [family, setFamily] = useState('All families');
  const families = useMemo(() => ['All families', ...Array.from(new Set(options.map(option => INFO[option.id]?.family || 'Other')))], [options]);
  const visible = family === 'All families' ? options : options.filter(option => (INFO[option.id]?.family || 'Other') === family);
  return <div className="console-selector">
    <div className="console-family-tabs" role="group" aria-label="Console family">{families.map(name => <button type="button" key={name} className={family === name ? 'active' : ''} aria-pressed={family === name} onClick={() => setFamily(name)}>{name}</button>)}</div>
    <div className="console-rail" role="group" aria-label="Choose a console">
      <button type="button" className={'console-option console-option-all' + (value === 'all' ? ' active' : '')} aria-pressed={value === 'all'} onClick={() => onChange('all')}><span className="console-device console-device-all"><span>ALL</span></span><strong>All systems</strong><small>Every indexed console</small></button>
      {visible.map(option => <ConsoleCard key={option.id} option={option} value={value} onChange={onChange}/>)}
    </div>
  </div>;
}
