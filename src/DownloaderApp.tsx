import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, ChevronDown, Download, Instagram, Link2, LoaderCircle, Music2, Youtube } from 'lucide-react';
import { appleArtworkFromDirectUrl, lookupAppleArtwork, type AppleArtwork, type AppleStorefront } from './lib/appleDownloader';
import './downloader.css';

type Tool = 'apple' | 'direct';
type ImageFormat = 'original' | 'png' | 'jpeg' | 'webp';
type DownloadReceipt = { name: string; size: number; mime: string };

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const MAX_APPLE_IMAGE_BYTES = 35 * 1024 * 1024;
const isAppleImageHost = (hostname: string) => /(^|\.)mzstatic\.com$/i.test(hostname);

function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function safeName(value: string): string {
  return value.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) || 'rupa-download';
}

function extensionForMime(mime: string): string {
  const subtype = mime.toLowerCase().split('/')[1]?.split(';')[0] || '';
  const known: Record<string, string> = { jpeg: 'jpg', 'svg+xml': 'svg', 'quicktime': 'mov', 'x-m4v': 'm4v', 'x-msvideo': 'avi', 'x-matroska': 'mkv', 'vnd.apple.mpegurl': 'm3u8', 'x-zip-compressed': 'zip' };
  return known[subtype] || subtype.replace(/^x-/, '').replace(/[^a-z0-9]/g, '') || 'bin';
}

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function validateHttpsUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Paste a complete file URL, including https://.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use a secure HTTPS file link without embedded credentials.');
  return url;
}

async function readBoundedResponse(response: Response, limit: number): Promise<Blob> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) throw new Error(`The file is larger than this browser downloader limit (${formatBytes(limit)}).`);
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
  if (/^(text\/html|application\/json|text\/plain)$/.test(mime)) throw new Error('That link returned a webpage or text, not a downloadable media file.');
  if (!response.body) {
    const blob = await response.blob();
    if (!blob.size || blob.size > limit) throw new Error(blob.size ? `The file is larger than ${formatBytes(limit)}.` : 'The source returned an empty file.');
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error(`The file is larger than ${formatBytes(limit)}.`);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new Error('The source returned an empty file.');
  return new Blob(chunks, { type: mime });
}

async function convertAppleImage(blob: Blob, format: ImageFormat, scale: 1 | 2): Promise<{ blob: Blob; extension: string }> {
  if (format === 'original' && scale === 1) {
    const ext = extensionForMime(blob.type || 'image/jpeg');
    return { blob, extension: ext };
  }
  const bitmap = await createImageBitmap(blob).catch(() => { throw new Error('Apple’s image could not be opened for conversion.'); });
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  if (!width || !height || width > 10_000 || height > 10_000 || width * height > 60_000_000) {
    bitmap.close();
    throw new Error('This image is too large for the selected export size.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('Image conversion is unavailable in this browser.'); }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const mime = format === 'original' ? 'image/png' : `image/${format}`;
  const converted = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, format === 'jpeg' ? 0.94 : undefined));
  if (!converted) throw new Error('The selected image format could not be exported.');
  return { blob: converted, extension: format === 'original' ? 'png' : extensionForMime(mime) };
}

async function downloadAppleArtwork(item: AppleArtwork, format: ImageFormat, scale: 1 | 2): Promise<DownloadReceipt> {
  let lastError: unknown;
  for (const candidate of item.downloadUrls) {
    try {
      const url = validateHttpsUrl(candidate);
      if (!isAppleImageHost(url.hostname)) throw new Error('This is not an Apple artwork file.');
      const response = await fetch(url, { signal: AbortSignal.timeout(35_000), mode: 'cors' });
      if (!response.ok) throw new Error(`Apple’s image server returned HTTP ${response.status}.`);
      const resolved = validateHttpsUrl(response.url || url.href);
      if (!isAppleImageHost(resolved.hostname)) throw new Error('Apple’s image link redirected to an unexpected host.');
      const original = await readBoundedResponse(response, MAX_APPLE_IMAGE_BYTES);
      if (!original.type.startsWith('image/')) throw new Error('Apple returned a file that is not an image.');
      const output = await convertAppleImage(original, format, scale);
      const filename = `${safeName(`${item.artist} - ${item.title}`)}${scale === 2 ? '-2x' : ''}.${output.extension}`;
      saveBlob(output.blob, filename);
      return { name: filename, size: output.blob.size, mime: output.blob.type || 'image/jpeg' };
    } catch (error) { lastError = error; }
  }
  if (lastError instanceof TypeError) throw new Error('The browser could not fetch Apple’s image. Try another result or open the original Apple Music page.');
  throw lastError instanceof Error ? lastError : new Error('Apple’s artwork could not be downloaded.');
}

async function downloadDirectFile(value: string): Promise<DownloadReceipt> {
  const url = validateHttpsUrl(value);
  let response: Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(60_000), mode: 'cors' }); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error('The download took too long. Try a smaller file or a faster source.');
    throw new Error('The source blocked browser access. Use a direct file link from a host that allows cross-origin downloads.');
  }
  if (!response.ok) throw new Error(`The source returned HTTP ${response.status}.`);
  const resolved = validateHttpsUrl(response.url || url.href);
  const host = resolved.hostname.toLowerCase();
  if (host === 'music.apple.com' || host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com') || host === 'instagram.com' || host === 'instagr.am' || host.endsWith('.instagram.com')) {
    throw new Error('That is a platform page, not a direct media file URL.');
  }
  const blob = await readBoundedResponse(response, MAX_DOWNLOAD_BYTES);
  const mime = blob.type || 'application/octet-stream';
  const pathName = safeDecode(resolved.pathname.split('/').at(-1) || '').replace(/[\\/:*?"<>|]/g, ' ').trim();
  const stem = pathName.replace(/\.[^.]+$/, '') || 'rupa-download';
  const ext = pathName.match(/\.([a-z0-9]{1,8})$/i)?.[1] || extensionForMime(mime);
  const filename = `${safeName(stem)}.${ext}`;
  saveBlob(blob, filename);
  return { name: filename, size: blob.size, mime };
}

function DownloadNotice({ receipt, error }: { receipt: DownloadReceipt | null; error: string }) {
  if (error) return <p className="download-notice is-error" role="alert">{error}</p>;
  if (!receipt) return null;
  return <p className="download-notice is-success" role="status"><Check size={16}/><span>Saved <strong>{receipt.name}</strong><small>{formatBytes(receipt.size)} · {receipt.mime}</small></span></p>;
}

function AppleTool({ storefront, onStorefrontChange }: { storefront: AppleStorefront; onStorefrontChange: (value: AppleStorefront) => void }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AppleArtwork[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloading, setDownloading] = useState('');
  const [format, setFormat] = useState<ImageFormat>('original');
  const [scale, setScale] = useState<1 | 2>(1);
  const [receipt, setReceipt] = useState<DownloadReceipt | null>(null);
  const [error, setError] = useState('');
  const currentRequest = useRef<AbortController | null>(null);

  useEffect(() => () => currentRequest.current?.abort(), []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const direct = appleArtworkFromDirectUrl(query.trim());
    currentRequest.current?.abort();
    setError(''); setReceipt(null); setItems([]); setSearching(false);
    if (direct) { setItems([direct]); return; }
    const controller = new AbortController();
    currentRequest.current = controller;
    setSearching(true);
    try {
      const result = await lookupAppleArtwork(query, storefront, controller.signal);
      setItems(result);
      if (!result.length) setError('No album artwork found. Try an album title, artist name, or Apple Music album link.');
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Apple search could not be completed.');
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  async function save(item: AppleArtwork) {
    if (downloading) return;
    setDownloading(item.id); setError(''); setReceipt(null);
    try { setReceipt(await downloadAppleArtwork(item, format, scale)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The artwork could not be downloaded.'); }
    finally { setDownloading(''); }
  }

  return <section className="tool-view" aria-labelledby="apple-title">
    <div className="tool-heading"><span className="tool-icon apple-icon"><Music2 size={20}/></span><div><h2 id="apple-title">Apple Music artwork</h2><p>Find an album cover, then save the image at the best available size.</p></div></div>
    <form className="download-form apple-form" onSubmit={event => void search(event)}>
      <label className="field-label" htmlFor="apple-query">Album, artist, or Apple Music link</label>
      <div className="form-row"><div className="input-wrap"><Music2 size={18}/><input id="apple-query" value={query} onChange={event => setQuery(event.target.value)} placeholder="Paste an album or artist link" autoComplete="off" required maxLength={180}/></div><label className="select-wrap storefront-select"><span className="visually-hidden">Apple storefront</span><select value={storefront} onChange={event => onStorefrontChange(event.target.value as AppleStorefront)} aria-label="Apple storefront"><option value="id">Indonesia</option><option value="us">United States</option><option value="gb">United Kingdom</option><option value="jp">Japan</option><option value="au">Australia</option><option value="ca">Canada</option><option value="de">Germany</option><option value="fr">France</option></select><ChevronDown size={15}/></label><button className="primary-button" type="submit" disabled={searching}><span>{searching ? 'Searching…' : 'Find artwork'}</span>{searching ? <LoaderCircle size={16} className="spin"/> : <ArrowDownToLine size={17}/>}</button></div>
      <p className="form-footnote">Apple’s public catalog search runs in your browser. Rupa does not proxy or upload your link.</p>
    </form>

    {items.length > 0 && <div className="results-area">
      <div className="results-toolbar"><div><h3>Artwork results</h3><span>{items.length} {items.length === 1 ? 'cover' : 'covers'}</span></div><div className="export-options"><label><span>Format</span><select value={format} onChange={event => setFormat(event.target.value as ImageFormat)} disabled={Boolean(downloading)}><option value="original">Original</option><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label><label><span>Size</span><select value={scale} onChange={event => setScale(Number(event.target.value) as 1 | 2)} disabled={Boolean(downloading)}><option value={1}>1×</option><option value={2}>2×</option></select></label></div></div>
      <div className="apple-results">{items.map(item => <article className="apple-result" key={item.id}><img className="apple-cover" src={item.thumbnailUrl} alt={`${item.title} album cover`} loading="lazy" decoding="async"/><div className="apple-result-info"><strong>{item.title}</strong><span>{item.artist}</span>{item.sourceUrl && <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">Open in Apple Music <ArrowUpRight size={13}/></a>}</div><button className="save-button" type="button" onClick={() => void save(item)} disabled={Boolean(downloading)} aria-label={`Download artwork for ${item.title}`}><Download size={16}/><span>{downloading === item.id ? 'Saving…' : 'Download'}</span></button></article>)}</div>
      <DownloadNotice receipt={receipt} error={error}/>
    </div>}
    {!items.length && !searching && <div className="tool-hint"><span className="hint-mark"><Link2 size={17}/></span><p>Paste a music.apple.com album or artist link, search by name, or paste an Apple artwork image URL.</p></div>}
  </section>;
}

function DirectTool() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<DownloadReceipt | null>(null);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setReceipt(null);
    try { setReceipt(await downloadDirectFile(url)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The file could not be downloaded.'); }
    finally { setBusy(false); }
  }

  return <section className="tool-view" aria-labelledby="direct-title">
    <div className="tool-heading"><span className="tool-icon direct-icon"><Link2 size={20}/></span><div><h2 id="direct-title">Direct media URL</h2><p>Save a media file when you already have its direct file link.</p></div></div>
    <form className="download-form" onSubmit={event => void submit(event)}>
      <label className="field-label" htmlFor="direct-url">Direct file URL</label>
      <div className="form-row"><div className="input-wrap"><Link2 size={18}/><input id="direct-url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/media/file.mp4" autoComplete="url" required/></div><button className="primary-button" type="submit" disabled={busy}><span>{busy ? 'Downloading…' : 'Download file'}</span>{busy ? <LoaderCircle size={16} className="spin"/> : <Download size={17}/>}</button></div>
      <p className="form-footnote">The file is fetched and saved in this browser. The source must allow cross-origin access (CORS); page links are not direct media files.</p>
    </form>
    <DownloadNotice receipt={receipt} error={error}/>
    <div className="direct-limits"><span>Browser limits</span><p>HTTPS links only · up to 100 MB · direct image, audio, video, or file URL</p></div>
  </section>;
}

function ComingSoonTools() {
  return <section className="platforms-section" id="platform-tools" aria-labelledby="platforms-title">
    <div className="platforms-intro"><div><h2 id="platforms-title">More platforms</h2><p>These need a secure media service before they can download from a page link.</p></div><span>ON THE ROADMAP</span></div>
    <div className="platform-list">
      <div className="platform-row"><span className="platform-symbol instagram-symbol"><Instagram size={19}/></span><div><strong>Instagram</strong><small>Reels · posts · stories</small></div><span className="platform-status">Server required</span></div>
      <div className="platform-row"><span className="platform-symbol youtube-symbol"><Youtube size={20}/></span><div><strong>YouTube</strong><small>Videos · Shorts</small></div><span className="platform-status">Server required</span></div>
    </div>
  </section>;
}

export default function DownloaderApp() {
  const [tool, setTool] = useState<Tool>('apple');
  const [storefront, setStorefront] = useState<AppleStorefront>('id');

  function selectTool(next: Tool) {
    setTool(next);
    document.getElementById('downloader')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }

  return <div className="rupa-downloader">
    <header className="site-header"><a className="wordmark" href="#top" aria-label="Rupa home"><span className="wordmark-mark"><ArrowDownToLine size={18}/></span><span>RUPA</span></a><nav className="desktop-nav" aria-label="Main navigation"><a href="#downloader">Downloaders</a><a href="#platform-tools">Platforms</a></nav><a className="header-action" href="#downloader">Open downloader <ArrowUpRight size={15}/></a></header>

    <main id="top">
      <section className="hero-section"><div className="hero-copy"><h1>Download what<br/><em>you need.</em></h1><p>One clean place for artwork and direct media files. Choose a tool and save to your device.</p><div className="hero-actions"><button type="button" className={`hero-link${tool === 'apple' ? ' is-active' : ''}`} onClick={() => selectTool('apple')} aria-pressed={tool === 'apple'}><Music2 size={15}/>Apple artwork</button><button type="button" className={`hero-link${tool === 'direct' ? ' is-active' : ''}`} onClick={() => selectTool('direct')} aria-pressed={tool === 'direct'}><Link2 size={15}/>Direct file</button></div></div><div className="hero-art" aria-hidden="true"><div className="hero-art-disc"><span className="disc-center"><ArrowDownToLine size={25}/></span></div><span className="hero-orbit orbit-one"/><span className="hero-orbit orbit-two"/><span className="hero-art-note">R / 01</span></div></section>

      <section className="downloader-layout" id="downloader" aria-label="Downloader">
        <aside className="tool-nav" aria-label="Downloader tools"><span className="tool-nav-label">TOOLS</span><button type="button" className={tool === 'apple' ? 'selected' : ''} onClick={() => setTool('apple')} aria-pressed={tool === 'apple'}><Music2 size={17}/><span>Apple Music</span>{tool === 'apple' && <span className="tool-nav-dot"/>}</button><button type="button" className={tool === 'direct' ? 'selected' : ''} onClick={() => setTool('direct')} aria-pressed={tool === 'direct'}><Link2 size={17}/><span>Direct URL</span>{tool === 'direct' && <span className="tool-nav-dot"/>}</button><span className="tool-nav-foot"><Check size={13}/> Browser-based</span></aside>
        <div className="tool-panel">{tool === 'apple' ? <AppleTool storefront={storefront} onStorefrontChange={setStorefront}/> : <DirectTool/>}</div>
      </section>

      <ComingSoonTools/>

      <footer className="site-footer"><a className="wordmark footer-wordmark" href="#top"><span className="wordmark-mark"><ArrowDownToLine size={16}/></span><span>RUPA</span></a><span>Files go from source to your browser. Rupa does not host media.</span><a href="https://github.com/bobbyfch/rupa" target="_blank" rel="noreferrer">Source code <ArrowUpRight size={13}/></a></footer>
    </main>
  </div>;
}
