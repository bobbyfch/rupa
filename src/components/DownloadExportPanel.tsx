import { useEffect, useRef, useState } from 'react';
import { Crop, Download, Play, Smartphone } from 'lucide-react';
import type { Artwork, MotionLookupState } from '../lib/types';
import { downloadLink } from '../lib/providers';
import { safeFileName } from '../lib/utils';
import { canExportMotion, downloadAppleStill, downloadArtworkStill, downloadMotionRecording, formatBytes, getSupportedMotionFormats, type DownloadDetails, type ImageExportFormat, type MotionExportFormat, type MotionExportStage } from '../lib/musicDownloads';
import { Button } from './ui/button';

function summary(file: DownloadDetails) {
  const type = file.mime.split('/')[1].replace('jpeg','JPEG').toUpperCase();
  return `${file.width.toLocaleString()} × ${file.height.toLocaleString()} px · ${type} · ${formatBytes(file.bytes)}`;
}
function isAppleImage(url: string) { try { const host=new URL(url).hostname.toLowerCase();return host==='mzstatic.com'||host.endsWith('.mzstatic.com'); } catch { return false; } }

export function DownloadExportPanel({ item, motionState, onCheckMotion, onPrepareImage, notify }: {
  item: Artwork; motionState?: MotionLookupState; onCheckMotion?: (item: Artwork, force?: boolean) => void; onPrepareImage?: (item: Artwork) => void; notify: (text: string) => void;
}) {
  const preview = item.sdDownloadUrl || item.previewUrl, best = item.downloadUrl || item.imageUrl || preview;
  const [size,setSize]=useState<'preview'|'best'>('best'),[format,setFormat]=useState<ImageExportFormat>('original'),[upscale,setUpscale]=useState<1|2>(1);
  const [busy,setBusy]=useState<'image'|'motion'|null>(null),[last,setLast]=useState<DownloadDetails|null>(null),[motionFile,setMotionFile]=useState<DownloadDetails|null>(null);
  const [progress,setProgress]=useState({value:0,stage:'Opening stream' as MotionExportStage}),[motionFormat,setMotionFormat]=useState<MotionExportFormat>(()=>getSupportedMotionFormats()[0]||'gif');
  const [wallpaperPlatform,setWallpaperPlatform]=useState<'ios'|'android'|'desktop'>('android');
  const formats=getSupportedMotionFormats(),formatKey=formats.join(','),motionReady=motionState?.status==='available'&&Boolean(motionState.artwork);
  const checkRef=useRef(onCheckMotion);useEffect(()=>{checkRef.current=onCheckMotion;},[onCheckMotion]);
  useEffect(()=>{if(item.category==='music'&&item.kind!=='artist-image'&&!motionState)checkRef.current?.(item);},[item.id,item.category,item.kind,motionState]);
  useEffect(()=>{if(!formats.includes(motionFormat)&&formats[0])setMotionFormat(formats[0]);},[formatKey,motionFormat]);
  useEffect(()=>{setLast(null);setMotionFile(null);setFormat('original');setSize('best');setUpscale(1);},[item.id]);
  async function downloadImage() {
    const target=size==='preview'?preview:best;if(!target||busy)return;setBusy('image');
    const fallbacks=[preview,best,...(item.hdDownloadUrls||[])].filter((url):url is string=>Boolean(url)&&url!==target);
    try {
      const apple=isAppleImage(target),linked=(url:string)=>{const safe=new URL(url,window.location.href);return safe.origin===window.location.origin?safe.href:downloadLink({...item,downloadUrl:safe.href,imageUrl:safe.href});};
      const result=apple?await downloadAppleStill(target,safeFileName(`${item.artist||item.subtitle} - ${item.title}`),size==='preview'?'sd':'hd',fallbacks,format,upscale):await downloadArtworkStill(linked(target),safeFileName(`${item.artist||item.subtitle} - ${item.title}`),size==='preview'?'sd':'hd',fallbacks.map(linked),format,upscale);
      setLast(result);notify(`Downloaded · ${summary(result)}`);
    } catch(error) { notify(error instanceof Error?error.message:'Could not download or export this artwork.'); }
    finally { setBusy(null); }
  }
  async function exportMotion() {
    if(!motionReady||!motionState?.artwork||busy)return;
    setBusy('motion');setProgress({value:0,stage:'Opening stream'});
    try {const result=await downloadMotionRecording(motionState.artwork,safeFileName(`${item.artist||item.subtitle} - ${item.title}`),motionFormat,(value,stage)=>setProgress({value,stage}));setMotionFile(result);notify(`Motion exported · ${summary(result)}`);}
    catch(error){notify(error instanceof Error?error.message:'Motion export failed.');}
    finally{setBusy(null);}
  }
  return <section className="music-downloads download-export-panel" aria-label="Download and export">
    <div className="music-download-heading"><div><span className="tiny-kicker">DOWNLOAD &amp; EXPORT</span><p>Choose the size and file format, then save.</p></div><small>{item.source}</small></div>
    <div className="download-export-controls"><label><span>Image size</span><select value={size} onChange={event=>setSize(event.target.value as 'preview'|'best')} disabled={Boolean(busy)}><option value="best">Best available</option>{preview&&preview!==best&&<option value="preview">Smaller preview</option>}</select></label><label><span>Format</span><select value={format} onChange={event=>setFormat(event.target.value as ImageExportFormat)} disabled={Boolean(busy)}><option value="original">Original</option><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label><label><span>Upscale</span><select value={upscale} onChange={event=>setUpscale(Number(event.target.value) as 1|2)} disabled={Boolean(busy)}><option value="1">1× · original pixels</option><option value="2">2× · high-quality interpolation</option></select></label><Button onClick={()=>void downloadImage()} disabled={!best||Boolean(busy)}><Download size={15}/>{busy==='image'?'Preparing…':'Download image'}</Button></div>{upscale===2&&<p className="download-export-result">2× interpolation enlarges pixels; it does not restore missing image detail.</p>}
    {last&&<p className="download-export-result" role="status">Last file · {summary(last)}</p>}
    {onPrepareImage&&<button type="button" className="download-edit-link" onClick={()=>onPrepareImage(item)}><Crop size={14}/> Crop or prepare before export</button>}
    {item.category==='music'&&item.kind!=='artist-image'&&<div className="motion-export-panel"><div className="motion-export-heading"><div><span className="tiny-kicker">ANIMATED COVER</span><strong>Export motion</strong><small>Keep the full animation as video, or create a compact GIF.</small></div><span className="motion-export-mark"><Play size={15} fill="currentColor"/> MOTION</span></div>
      {motionReady?<><div className="motion-export-actions"><label className="motion-format-control"><span>Video format</span><select value={motionFormat} onChange={event=>setMotionFormat(event.target.value as MotionExportFormat)} disabled={Boolean(busy)}>{formats.map(value=><option key={value} value={value}>{value==='mp4'?'MP4 video':value==='webm'?'WebM video':'GIF · 480 px / 12 sec'}</option>)}</select></label><button type="button" className="motion-export-button" onClick={()=>void exportMotion()} disabled={Boolean(busy)||!canExportMotion(motionFormat)}><Download size={16}/>{busy==='motion'?`${Math.round(progress.value*100)}%`:motionFile?'Export again':'Export motion'}</button></div>
        {busy==='motion'&&<div className="motion-export-progress" role="status"><div><span>{progress.stage}</span><strong>{Math.round(progress.value*100)}%</strong></div><progress max="1" value={progress.value} aria-label="Motion export progress"/></div>}{motionFile&&<p className="motion-export-result">Last file · {summary(motionFile)}</p>}{motionFormat==='gif'&&<p className="motion-export-note">GIF is silent, capped at 480 px and limited to the first 12 seconds.</p>}
        <details className="motion-wallpaper-guide"><summary><Smartphone size={15}/> Use the motion file as wallpaper</summary><div className="motion-guide-tabs" role="tablist" aria-label="Live wallpaper platform">{(['ios','android','desktop'] as const).map(value=><button type="button" role="tab" aria-selected={wallpaperPlatform===value} className={wallpaperPlatform===value?'active':''} onClick={()=>setWallpaperPlatform(value)} key={value}>{value==='ios'?'iPhone':value==='android'?'Android':'Desktop'}</button>)}</div><p role="tabpanel">{wallpaperPlatform==='ios'?'An MP4 or GIF is not an iPhone Live Photo by itself. Save the file and convert it with a Live Photo app before choosing it in Wallpaper settings.':wallpaperPlatform==='android'?'Save the MP4, then choose it in an Android live-wallpaper app that supports video. Rupa cannot install a wallpaper service from the browser.':'Save the video and open it in a desktop live-wallpaper app. Standard desktop wallpaper settings use still images.'}</p></details>
        <p className="music-motion-source">Motion source via <a href="https://github.com/m8tec/apple-music-animated-artworks" target="_blank" rel="noreferrer">m8tec</a>. The file is recorded locally in your browser session.</p></>:<p className="music-motion-status" role="status">{motionState?.status==='checking'?'Checking for an animated version…':motionState?.status==='error'?'Motion lookup failed.':motionState?.status==='none'?'No animated version found for this album.':'Animated artwork is not available in this browser.'} {motionState?.status==='error'&&<button className="music-motion-retry" onClick={()=>onCheckMotion?.(item,true)}>Try again</button>}</p>}
    </div>}
    <p className="music-motion-status">Source terms apply. The grid uses a thumbnail; this panel fetches a larger file only after you choose to download or export.</p>
  </section>;
}
