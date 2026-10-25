import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpRight, BookOpen, Check, ChevronDown, Clapperboard, Download, ExternalLink, FileDown, Image as ImageIcon, LoaderCircle, Music2, Pause, Play, Search, Sparkles, Video, X } from 'lucide-react';
import { AppleMotionVideo } from './components/AppleMotionVideo';
import { AppleVideoPreview } from './components/AppleVideoPreview';
import { DownloadExportPanel } from './components/DownloadExportPanel';
import { Button } from './components/ui/button';
import { Dialog } from './components/ui/dialog';
import { WallpaperEditor } from './components/WallpaperEditor';
import { APPLE_STOREFRONTS } from './lib/appleStorefronts';
import { getAppleMotionArtwork, searchArtwork, youtubeVideoId } from './lib/providers';
import { safeFileName } from './lib/utils';
import { CATEGORIES, type AppleStorefront, type Artwork, type Category, type MotionLookupState, type ProviderResult } from './lib/types';

type Surface = 'catalog' | 'direct';
type SearchTask = { category: Category; run: (signal: AbortSignal, partial: (value: ProviderResult) => void) => Promise<ProviderResult> };

const APPLE_CATEGORIES: Category[] = ['music', 'musicvideos', 'books', 'audiobooks', 'podcasts', 'podcastepisodes', 'apps', 'movies', 'tv'];
const CONNECTED_CATEGORIES: Category[] = [...APPLE_CATEGORIES, 'anime', 'manga', 'videos', 'appscreenshots'];
const CATEGORY_ALIASES: Record<string, Category> = {
  'music-video': 'musicvideos', 'musicvideo': 'musicvideos', 'book': 'books', 'ebook': 'books',
  'audiobook': 'audiobooks', 'podcast-episode': 'podcastepisodes', 'podcast': 'podcasts',
  'app': 'apps', 'movie': 'movies', 'film': 'movies', 'tv-show': 'tv', 'tv-episode': 'tv',
  'album': 'music', 'artist': 'music',
};
const MAX_DIRECT_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

function safeHttpsUrl(value: string): string | undefined {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined; }
  catch { return undefined; }
}

function appleCategoryFromUrl(value: string): Category | undefined {
  try {
    const url = new URL(value);
    if (!['music.apple.com', 'www.music.apple.com', 'itunes.apple.com'].includes(url.hostname.toLowerCase())) return undefined;
    const part = url.pathname.toLowerCase().split('/').find(value => value in CATEGORY_ALIASES);
    return part ? CATEGORY_ALIASES[part] : undefined;
  } catch { return undefined; }
}

function directAppleArtwork(value: string): Artwork | undefined {
  const url = safeHttpsUrl(value);
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)mzstatic\.com$/i.test(parsed.hostname) || !/\.(?:jpe?g|png|webp|avif)(?:$|\?)/i.test(parsed.pathname + parsed.search)) return undefined;
    const title = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || 'Apple artwork').replace(/\.[^.]+$/, '').replace(/[._-]+/g, ' ');
    return { id: `music:direct:${encodeURIComponent(url)}`, category: 'music', title: title || 'Apple artwork', subtitle: 'Apple artwork image', source: 'Apple Music artwork', provider: 'Apple Music', sourceUrl: url, imageUrl: url, previewUrl: url, downloadUrl: url, hdDownloadUrls: [url], kind: 'cover', rights: 'source-only' };
  } catch { return undefined; }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB']; let value = bytes / 1024; let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

async function readLimited(response: Response, limit: number): Promise<Blob> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) throw new Error(`File melebihi batas ${formatBytes(limit)}.`);
  const type = (response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  if (/^(text\/html|application\/json|text\/plain)$/.test(type)) throw new Error('Tautan itu membuka halaman web, bukan file media langsung.');
  if (!response.body) {
    const blob = await response.blob();
    if (!blob.size || blob.size > limit) throw new Error(blob.size ? `File melebihi batas ${formatBytes(limit)}.` : 'Sumber mengirim file kosong.');
    return blob;
  }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error(`File melebihi batas ${formatBytes(limit)}.`); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new Error('Sumber mengirim file kosong.');
  return new Blob(chunks, { type });
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function useVisibleMotion(item: Artwork, motion: MotionLookupState | undefined, onCheck: (item: Artwork) => void, mediaPreview = false) {
  const ref = useRef<HTMLElement | null>(null); const [visible, setVisible] = useState(false); const [paused, setPaused] = useState(false); const [manualPlay, setManualPlay] = useState(false);
  const checkRef = useRef(onCheck); useEffect(() => { checkRef.current = onCheck; }, [onCheck]);
  useEffect(() => {
    const node = ref.current; if (!node) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); if (item.category === 'music') checkRef.current(item); return; }
    const observer = new IntersectionObserver(entries => {
      const entry = entries[0]; const isVisible = Boolean(entry?.isIntersecting);
      setVisible(isVisible);
      if (isVisible && item.category === 'music') checkRef.current(item);
    }, { rootMargin: '80px', threshold: 0.18 });
    observer.observe(node); return () => observer.disconnect();
  }, [item.id, item.category]);
  useEffect(() => { setPaused(false); setManualPlay(false); }, [item.id]);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const active = visible && (manualPlay || (!reduced && !paused));
  return { ref, active, paused: !active, setPaused, setManualPlay, available: mediaPreview || motion?.status === 'available' };
}

function ArtworkCard({ item, motion, onCheckMotion, onOpen }: { item: Artwork; motion?: MotionLookupState; onCheckMotion: (item: Artwork) => void; onOpen: (item: Artwork) => void }) {
  const videoPreview = item.category === 'musicvideos' && Boolean(item.mediaPreviewUrl);
  const playback = useVisibleMotion(item, motion, onCheckMotion, videoPreview);
  const [failed, setFailed] = useState(false);
  const image = item.previewUrl || item.imageUrl || item.downloadUrl || '';
  const motionReady = motion?.status === 'available' && Boolean(motion.artwork);
  return <article className="rupa-art-card" ref={playback.ref}>
    <div className="rupa-art-visual" data-category={item.category} data-kind={item.kind || 'artwork'} role="button" tabIndex={0} onClick={() => onOpen(item)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(item); } }} aria-label={`Preview ${item.title}`}>
      {failed ? <span className="rupa-art-fallback"><ImageIcon size={22}/> Preview unavailable</span> : videoPreview && playback.active ? <video src={item.mediaPreviewUrl} poster={image} muted playsInline autoPlay loop preload="metadata" /> : <img src={image} alt={item.title} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
      {item.category === 'music' && motionReady && <AppleMotionVideo url={motion!.artwork!.url} title={item.title} active={playback.active} />}
      <span className="rupa-art-glint" aria-hidden="true" />
      {(motionReady || videoPreview) && <span className="rupa-motion-indicator" aria-hidden="true">{playback.active ? <Pause size={13} fill="currentColor"/> : <Play size={13} fill="currentColor"/>}</span>}
      {motionReady && <button className="rupa-motion-toggle" type="button" onClick={event => { event.stopPropagation(); if (playback.active) { playback.setPaused(true); playback.setManualPlay(false); } else { playback.setPaused(false); playback.setManualPlay(true); } }} aria-label={playback.active ? 'Pause animated artwork' : 'Play animated artwork'}>{playback.active ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}</button>}
    </div>
    <div className="rupa-art-meta">
      <span className="rupa-art-category">{CATEGORIES.find(category => category.id === item.category)?.label || item.category}</span>
      <button type="button" className="rupa-art-title" onClick={() => onOpen(item)} title={item.title}>{item.title}</button>
      <span className="rupa-art-subtitle">{item.artist || item.subtitle || item.source}</span>
    </div>
  </article>;
}

function CategoryFilters({ value, onChange, counts }: { value: Category; onChange: (category: Category) => void; counts: Map<string, number> }) {
  const list = CATEGORIES.filter(category => category.id !== 'all');
  return <div className="rupa-filter-rail" role="group" aria-label="Filter by category">
    <button type="button" className={`rupa-filter-chip${value === 'all' ? ' is-active' : ''}`} onClick={() => onChange('all')}>Semua <span>{counts.get('all') || 0}</span></button>
    {list.map(category => {
      const connected = CONNECTED_CATEGORIES.includes(category.id as Category);
      return <button key={category.id} type="button" className={`rupa-filter-chip${value === category.id ? ' is-active' : ''}${connected ? '' : ' is-unavailable'}`} onClick={() => onChange(category.id as Category)} title={connected ? `Filter ${category.label}` : `${category.label}: sumber pencarian belum tersambung di GitHub Pages`}>
        {category.label}{counts.has(category.id) && <span>{counts.get(category.id)}</span>}{!connected && <small>soon</small>}
      </button>;
    })}
  </div>;
}

export default function App() {
  const [surface, setSurface] = useState<Surface>('catalog');
  const [query, setQuery] = useState(''); const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const [storefront, setStorefront] = useState<AppleStorefront>('id');
  const [results, setResults] = useState<Artwork[]>([]); const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false); const [searched, setSearched] = useState(false); const [motion, setMotion] = useState<Record<string, MotionLookupState>>({});
  const [selected, setSelected] = useState<Artwork | null>(null); const [wallpaperItem, setWallpaperItem] = useState<Artwork | null>(null); const [wallpaperMode, setWallpaperMode] = useState<'artwork'|'wallpaper'>('artwork');
  const [notice, setNotice] = useState(''); const [directUrl, setDirectUrl] = useState(''); const [directBusy, setDirectBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [directError, setDirectError] = useState(''); const [videoError, setVideoError] = useState('');
  const requestRef = useRef<AbortController | null>(null); const queryRef = useRef<HTMLInputElement>(null); const noticeTimer = useRef<number | undefined>(undefined);

  const visibleResults = useMemo(() => selectedCategory === 'all' ? results : results.filter(item => item.category === selectedCategory), [results, selectedCategory]);
  const counts = useMemo(() => { const value = new Map<string, number>(); for (const item of results) value.set(item.category, (value.get(item.category) || 0) + 1); value.set('all', results.length); return value; }, [results]);

  useEffect(() => { document.title = 'Rupa — Media & artwork downloader'; }, []);
  useEffect(() => { if (!notice) return; window.clearTimeout(noticeTimer.current); noticeTimer.current = window.setTimeout(() => setNotice(''), 5200); return () => window.clearTimeout(noticeTimer.current); }, [notice]);
  useEffect(() => () => requestRef.current?.abort(), []);

  function notify(message: string) { setNotice(message); }

  async function checkMotion(item: Artwork, force = false) {
    if (item.category !== 'music' || item.kind === 'artist-image' || !['Apple Music', 'Apple Music API'].includes(item.provider || item.source)) return;
    if (!force && motion[item.id] && motion[item.id].status !== 'error') return;
    setMotion(current => ({ ...current, [item.id]: { status: 'checking' } }));
    try { const artwork = await getAppleMotionArtwork(item); setMotion(current => ({ ...current, [item.id]: artwork ? { status: 'available', artwork } : { status: 'none' } })); }
    catch { setMotion(current => ({ ...current, [item.id]: { status: 'error' } })); }
  }

  function makeTasks(q: string, scope: Category): SearchTask[] {
    const appleUrlCategory = appleCategoryFromUrl(q);
    const youtubeId = youtubeVideoId(q);
    const direct = directAppleArtwork(q);
    if (direct) return [{ category: 'music', run: async () => ({ results: [direct], warnings: [], unavailable: [] }) }];
    if (youtubeId) return [{ category: 'videos', run: (signal) => searchArtwork(q, 'videos', signal, undefined, storefront, 'all') }];
    const inferred: Category[] = appleUrlCategory ? [appleUrlCategory] : scope === 'all' ? [...APPLE_CATEGORIES, 'anime', 'manga'] : [scope];
    const categories = inferred.filter((category, index) => CONNECTED_CATEGORIES.includes(category) && inferred.indexOf(category) === index);
    const tasks: SearchTask[] = categories.map(category => ({ category, run: (signal, partial) => searchArtwork(q, category, signal, partial, storefront, 'all') }));
    return tasks;
  }

  async function runSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const q = query.trim().slice(0, 180);
    if (q.length < 2) { notify('Tulis minimal 2 karakter dulu ya.'); queryRef.current?.focus(); return; }
    if (selectedCategory !== 'all' && !CONNECTED_CATEGORIES.includes(selectedCategory) && selectedCategory !== 'appscreenshots') {
      setSearched(true); setResults([]); setWarnings([]); notify(`${CATEGORIES.find(item => item.id === selectedCategory)?.label || selectedCategory} masih menunggu sumber pencarian yang bisa berjalan tanpa server.`); return;
    }
    requestRef.current?.abort(); const controller = new AbortController(); requestRef.current = controller;
    setLoading(true); setSearched(true); setWarnings([]); setResults([]); setMotion({});
    const tasks = makeTasks(q, selectedCategory); const collected = new Map<string, Artwork>(); const issues = new Set<string>();
    const apply = (category: Category, result: ProviderResult) => {
      for (const item of result.results) collected.set(item.id, item);
      for (const warning of result.warnings) issues.add(`${category}: ${warning}`);
      for (const unavailable of result.unavailable) issues.add(`${unavailable}: sumber tidak tersedia`);
      if (!controller.signal.aborted) { setResults([...collected.values()]); setWarnings([...issues].slice(0, 4)); }
    };
    const queue = [...tasks]; const worker = async () => {
      while (queue.length && !controller.signal.aborted) {
        const task = queue.shift(); if (!task) return;
        try { apply(task.category, await task.run(controller.signal, partial => apply(task.category, partial))); }
        catch (error) { if (!controller.signal.aborted) issues.add(`${task.category}: ${error instanceof Error ? error.message : 'sumber tidak tersedia'}`); }
      }
    };
    const timeout = window.setTimeout(() => controller.abort(new DOMException('Search timed out.', 'TimeoutError')), 28_000);
    await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, () => worker()));
    window.clearTimeout(timeout);
    if (!controller.signal.aborted) { setResults([...collected.values()]); setWarnings([...issues].slice(0, 4)); }
    else if (controller.signal.reason?.name === 'TimeoutError') setWarnings(current => [...current, 'Sebagian sumber butuh waktu terlalu lama. Coba kategori tertentu.']);
    if (requestRef.current === controller) setLoading(false);
    window.history.replaceState(null, '', `${window.location.pathname}?q=${encodeURIComponent(q)}${selectedCategory !== 'all' ? `&category=${encodeURIComponent(selectedCategory)}` : ''}`);
  }

  async function downloadVideoPreview(item: Artwork) {
    const source = safeHttpsUrl(item.mediaPreviewUrl || '');
    if (!source) { setVideoError('Preview video tidak tersedia dari katalog.'); return; }
    setVideoBusy(true); setVideoError('');
    try {
      const response = await fetch(source, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Apple mengembalikan HTTP ${response.status}.`);
      const blob = await readLimited(response, MAX_VIDEO_BYTES);
      if (!blob.type.startsWith('video/')) throw new Error('Sumber tidak mengirim file video.');
      const ext = blob.type.includes('quicktime') ? 'mov' : 'mp4';
      saveBlob(blob, `${safeFileName(`${item.artist || item.subtitle} ${item.title} preview`)}.${ext}`);
      setVideoError('Preview video tersimpan. Klip Apple ini hanya preview pendek; video penuh tetap dibuka melalui Apple Music.');
    } catch (error) {
      setVideoError(error instanceof Error && /failed to fetch|network|cors/i.test(error.message) ? 'Browser tidak diizinkan mengambil file preview langsung dari host Apple. Coba putar atau buka halaman Apple Music.' : error instanceof Error ? error.message : 'Preview video gagal diunduh.');
    } finally { setVideoBusy(false); }
  }

  async function downloadDirect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setDirectError('');
    let url: URL;
    try { url = new URL(directUrl.trim()); } catch { setDirectError('Masukkan URL file lengkap yang diawali https://.'); return; }
    if (url.protocol !== 'https:' || url.username || url.password) { setDirectError('Gunakan tautan HTTPS tanpa username atau password di URL.'); return; }
    setDirectBusy(true);
    try {
      const response = await fetch(url, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(35_000) });
      if (!response.ok) throw new Error(`Sumber mengembalikan HTTP ${response.status}.`);
      const blob = await readLimited(response, MAX_DIRECT_BYTES);
      const fromPath = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || 'rupa-download').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim();
      const stem = safeFileName(fromPath.replace(/\.[^.]+$/, '') || 'rupa-download');
      const mimeExt: Record<string, string> = { 'image/jpeg': 'jpg', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a' };
      const extension = mimeExt[blob.type] || blob.type.split('/')[1]?.split(';')[0]?.replace(/^x-/, '').replace(/[^a-z0-9]/gi, '') || fromPath.split('.').pop() || 'bin';
      saveBlob(blob, `${stem}.${extension}`); notify(`File diunduh · ${formatBytes(blob.size)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'File tidak bisa diunduh.';
      setDirectError(/failed to fetch|network|cors/i.test(message) ? 'Host file tidak mengizinkan fetch dari browser (CORS). Pakai URL file dari host yang mengizinkan akses browser.' : message);
    } finally { setDirectBusy(false); }
  }

  const emptyFilterUnavailable = selectedCategory !== 'all' && !CONNECTED_CATEGORIES.includes(selectedCategory) && selectedCategory !== 'appscreenshots';
  const selectedSource = selected?.sourceUrl ? safeHttpsUrl(selected.sourceUrl) : undefined;

  return <div className="rupa-downloader-app">
    <header className="rupa-topbar">
      <a href="#top" className="rupa-brand" aria-label="Rupa home"><span className="rupa-brand-mark"><ArrowDownToLine size={18}/></span><span>RUPA</span><small>MEDIA TOOLS</small></a>
      <div className="rupa-header-actions"><span className="rupa-browser-tag"><span/> BROWSER-BASED</span><a href="https://github.com/bobbyfch/rupa" target="_blank" rel="noreferrer" className="rupa-source-link">Source <ArrowUpRight size={14}/></a></div>
    </header>

    <main id="top">
      <section className="rupa-hero">
        <div className="rupa-hero-copy"><span className="rupa-eyebrow"><Sparkles size={13}/> ONE SEARCH · MANY TOOLS</span><h1>Find it.<br/><em>Save it.</em></h1><p>Cari artwork dan media dalam satu tempat. Hasilnya bisa kamu filter menurut kategori.</p></div>
        <div className="rupa-orbit-art" aria-hidden="true"><span className="rupa-orbit orbit-a"/><span className="rupa-orbit orbit-b"/><span className="rupa-orbit-core"><ArrowDownToLine size={27}/></span><span className="rupa-orbit-dot"/></div>
        <div className="rupa-workspace-switch" role="tablist" aria-label="Download mode">
          <button type="button" role="tab" aria-selected={surface === 'catalog'} className={surface === 'catalog' ? 'is-active' : ''} onClick={() => setSurface('catalog')}><Search size={15}/> Catalog search</button>
          <button type="button" role="tab" aria-selected={surface === 'direct'} className={surface === 'direct' ? 'is-active' : ''} onClick={() => setSurface('direct')}><FileDown size={15}/> Direct file</button>
        </div>
      </section>

      {surface === 'catalog' ? <section className="rupa-search-workspace" aria-label="Search artwork and media">
        <form className="rupa-search-box" onSubmit={runSearch}>
          <Search size={20}/><input ref={queryRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Album, book, film, artist, or a media link…" aria-label="Search all catalogs" />
          {APPLE_STOREFRONTS.length > 0 && <label className="rupa-storefront"><span className="sr-only">Apple storefront</span><select aria-label="Apple storefront" value={storefront} onChange={event => setStorefront(event.target.value as AppleStorefront)}>{APPLE_STOREFRONTS.map(store => <option key={store.id} value={store.id}>{store.label}</option>)}</select><ChevronDown size={14}/></label>}
          <Button type="submit" disabled={loading}>{loading ? <><LoaderCircle size={16} className="rupa-spin"/> Searching</> : <>Search <ArrowDownToLine size={15}/></>}</Button>
        </form>
        <div className="rupa-search-hint"><span>{selectedCategory === 'all' ? 'Default: search all connected catalogs' : `Scope: ${CATEGORIES.find(item => item.id === selectedCategory)?.label || selectedCategory}`}</span><span>Apple · Anime · Manga · URL thumbnails</span></div>
        <CategoryFilters value={selectedCategory} onChange={category => setSelectedCategory(category)} counts={counts}/>
        <div className="rupa-source-note"><span className="rupa-note-check"><Check size={13}/></span><p>Kategori seperti Books, Music Videos, Apps, Film, TV, Anime, dan Manga aktif. Beberapa katalog lama seperti Games dan Art perlu sumber terpisah agar pencarian bisa berjalan di GitHub Pages.</p></div>

        {warnings.length > 0 && <div className="rupa-warning" role="status"><span>Info sumber</span><p>{warnings.join(' · ')}</p></div>}
        <div className="rupa-results-heading" aria-live="polite"><div><span className="rupa-eyebrow">{searched ? 'SEARCH RESULTS' : 'YOUR TOOLBOX'}</span><h2>{searched ? (visibleResults.length ? `${visibleResults.length} results` : 'No matches yet') : 'Start with one search.'}</h2></div><span className="rupa-results-count">{loading ? 'Searching catalogs…' : searched ? `${visibleResults.length} shown` : `${CONNECTED_CATEGORIES.length} connected catalog groups`}</span></div>

        {loading && !results.length ? <div className="rupa-loading-grid" aria-label="Searching"><span/><span/><span/><span/></div> : visibleResults.length ? <div className="rupa-art-grid">{visibleResults.map(item => <ArtworkCard key={item.id} item={item} motion={motion[item.id]} onCheckMotion={value => void checkMotion(value)} onOpen={setSelected}/>)}</div> : searched ? <div className="rupa-empty-state"><span className="rupa-empty-icon"><Search size={20}/></span><strong>{emptyFilterUnavailable ? 'Source needed for this category' : 'Belum ada hasil untuk pencarian ini'}</strong><p>{emptyFilterUnavailable ? 'Kategori ini tetap ada di toolbox, tapi katalog pencariannya belum tersambung pada versi static GitHub Pages.' : warnings.length ? 'Beberapa sumber tidak merespons. Coba kategori tertentu atau ulangi pencarian.' : 'Coba judul lain, pilih kategori, atau tempel tautan Apple Music / YouTube.'}</p></div> : <div className="rupa-welcome-grid">
          <button type="button" onClick={() => { setSelectedCategory('music'); queryRef.current?.focus(); }}><span className="rupa-welcome-icon"><Music2 size={17}/></span><strong>Music & motion</strong><small>Album art, artist images, animated covers</small></button>
          <button type="button" onClick={() => { setSelectedCategory('musicvideos'); queryRef.current?.focus(); }}><span className="rupa-welcome-icon"><Video size={17}/></span><strong>Music videos</strong><small>Apple-hosted video previews and stills</small></button>
          <button type="button" onClick={() => { setSelectedCategory('books'); queryRef.current?.focus(); }}><span className="rupa-welcome-icon"><BookOpen size={17}/></span><strong>Books</strong><small>Apple Books covers and source preview</small></button>
          <button type="button" onClick={() => { setSelectedCategory('movies'); queryRef.current?.focus(); }}><span className="rupa-welcome-icon"><Clapperboard size={17}/></span><strong>Film & TV</strong><small>Posters, catalog artwork, official pages</small></button>
        </div>}
        <p className="rupa-privacy-line">Pencarian langsung ke katalog publik masing-masing sumber. Rupa tidak mengunggah tautanmu ke server sendiri.</p>
      </section> : <section className="rupa-direct-workspace">
        <div className="rupa-direct-header"><span className="rupa-eyebrow">DIRECT FILE DOWNLOAD</span><h2>Have a file link?</h2><p>Masukkan URL file media langsung. Tautan halaman Instagram atau YouTube tidak bisa diekstrak dari GitHub Pages saja.</p></div>
        <form className="rupa-direct-form" onSubmit={downloadDirect}><label htmlFor="direct-url">Direct HTTPS file URL</label><div className="rupa-direct-input"><FileDown size={18}/><input id="direct-url" type="url" value={directUrl} onChange={event => setDirectUrl(event.target.value)} placeholder="https://example.com/file.jpg" required/><Button type="submit" disabled={directBusy}>{directBusy ? <><LoaderCircle size={15} className="rupa-spin"/> Downloading</> : <>Download file <Download size={15}/></>}</Button></div>{directError && <p className="rupa-inline-error" role="alert">{directError}</p>}<small>Max 100 MB · host harus mengizinkan CORS · HTTPS only.</small></form>
      </section>}
    </main>

    <footer className="rupa-footer"><a href="#top" className="rupa-brand"><span className="rupa-brand-mark"><ArrowDownToLine size={16}/></span><span>RUPA</span></a><span>File goes from source to your browser.</span><span>© 2026 RUPA</span></footer>

    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) { setSelected(null); setVideoError(''); } }} title={selected?.title || 'Media preview'} wide>
      {selected && <div className={`rupa-detail${selected.category === 'musicvideos' ? ' is-video-detail' : ''}`}>
        <div className="rupa-detail-visual">
          {selected.category === 'musicvideos' ? <AppleVideoPreview item={selected}/> : <div className={`rupa-detail-image${selected.category === 'music' ? ' is-album' : ''}`}>
            <img src={selected.imageUrl || selected.previewUrl} alt={selected.title}/>
            {selected.category === 'music' && motion[selected.id]?.status === 'available' && motion[selected.id].artwork && <AppleMotionVideo url={motion[selected.id].artwork!.url} title={selected.title} active controls loop={false}/>}
          </div>}
          <span className="rupa-detail-source">{selected.source} · {selected.kind || 'artwork'}</span>
        </div>
        <div className="rupa-detail-content">
          <span className="rupa-eyebrow">{CATEGORIES.find(category => category.id === selected.category)?.label || selected.category}</span>
          <h2>{selected.title}</h2><p className="rupa-detail-subtitle">{selected.artist || selected.subtitle}{selected.year ? ` · ${selected.year}` : ''}</p>
          {selected.category === 'books' && selectedSource && <a className="rupa-preview-link" href={selectedSource} target="_blank" rel="noreferrer"><BookOpen size={15}/> Preview on Apple Books <ExternalLink size={13}/></a>}
          {selected.category === 'musicvideos' && <div className="rupa-video-download"><Button onClick={() => void downloadVideoPreview(selected)} disabled={videoBusy || !selected.mediaPreviewUrl}>{videoBusy ? <><LoaderCircle size={15} className="rupa-spin"/> Downloading preview</> : <><Download size={15}/> Download video preview</>}</Button><p>Apple menyediakan klip preview pendek. Untuk video penuh, buka halaman Apple Music.</p>{videoError && <small role="status">{videoError}</small>}</div>}
          {selected.category === 'apps' && selected.screenshots?.length ? <div className="rupa-app-screenshots">{selected.screenshots.slice(0, 6).map((shot, index) => <a href={shot.url} target="_blank" rel="noreferrer" key={`${shot.device}-${shot.url}`} aria-label={`${shot.device} screenshot ${index + 1}`}><img src={shot.url} alt={`${selected.title} ${shot.device} screenshot`}/><span>{shot.device}</span></a>)}</div> : null}
          <DownloadExportPanel item={selected} motionState={motion[selected.id]} onCheckMotion={(item, force) => void checkMotion(item, force)} onPrepareImage={item => { setWallpaperMode('artwork'); setWallpaperItem(item); }} onWallpaper={item => { setWallpaperMode('wallpaper'); setWallpaperItem(item); }} notify={notify}/>
          {selectedSource && <a className="rupa-open-source" href={selectedSource} target="_blank" rel="noreferrer">Open source <ArrowUpRight size={14}/></a>}
        </div>
      </div>}
    </Dialog>
    <WallpaperEditor item={wallpaperItem} mode={wallpaperMode} onClose={() => setWallpaperItem(null)} notify={notify}/>
    {notice && <div className="rupa-toast" role="status"><Check size={15}/>{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={15}/></button></div>}
  </div>;
}
