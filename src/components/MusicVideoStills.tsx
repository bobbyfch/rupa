import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Download, Image, Trash2, Upload } from 'lucide-react';
import { db, removeUserArtwork, addUserArtwork } from '../lib/db';
import type { Artwork, UserArtwork } from '../lib/types';

function StillThumb({ item, onDelete }: { item: UserArtwork; onDelete: () => void }) {
  const [src, setSrc] = useState('');
  useEffect(() => { const url = URL.createObjectURL(item.blob); setSrc(url); return () => URL.revokeObjectURL(url); }, [item.blob]);
  return <article className="music-video-still-card"><img src={src} alt={item.title} loading="lazy"/><div><span>{item.width} × {item.height}px</span><a href={src} download={`${item.title.replace(/[^\p{L}\p{N}-]+/gu,'-')}.jpg`}><Download size={13}/> Save</a><button type="button" onClick={onDelete} aria-label={`Delete ${item.title}`}><Trash2 size={13}/></button></div></article>;
}

export function MusicVideoStills({ item, profileId, notify }: { item: Artwork; profileId: string; notify: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [fileUrl, setFileUrl] = useState(''), [fileName, setFileName] = useState(''), [capturing, setCapturing] = useState(false);
  const framePrefix = `music-video-frame:${item.id}`;
  const frames = useLiveQuery(() => db.userArtworks.where('profileId').equals(profileId).filter(row => row.notes === framePrefix).toArray().then(rows => rows.sort((a,b)=>b.createdAt-a.createdAt)), [profileId, framePrefix]) || [];
  useEffect(() => { return () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }; }, [fileUrl]);
  useEffect(() => { setFileUrl(''); setFileName(''); }, [item.id]);
  function chooseFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('video/')) { notify('Choose a video file to capture from.'); return; }
    if (file.size > 500 * 1024 * 1024) { notify('That video exceeds the 500 MB local capture limit.'); return; }
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileName(file.name); setFileUrl(URL.createObjectURL(file));
  }
  async function capture() {
    const source = video.current;
    if (!source || source.readyState < 2 || !source.videoWidth || !source.videoHeight || capturing) { notify('Play or pause the local video on a frame first.'); return; }
    if (frames.length >= 100) { notify('This video already has 100 saved frames. Remove one before capturing more.'); return; }
    setCapturing(true);
    try {
      const scale = Math.min(1, 1920 / Math.max(source.videoWidth, source.videoHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
      const context = canvas.getContext('2d'); if (!context) throw new Error('Frame capture is unavailable in this browser.');
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not encode this video frame.')), 'image/jpeg', .9));
      if (blob.size > 8 * 1024 * 1024) throw new Error('This still exceeds the 8 MB local storage limit.');
      const title = `${item.title} · Still ${frames.length + 1}`;
      await addUserArtwork(profileId, blob, { title, notes: framePrefix, edition: fileName });
      notify(`Saved still ${frames.length + 1} from your local video.`);
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not save the video still.'); }
    finally { setCapturing(false); }
  }
  return <section className="music-video-stills" aria-labelledby="music-video-stills-title">
    <div className="music-video-stills-heading"><div><span className="tiny-kicker">LOCAL / YOUR DEVICE</span><h3 id="music-video-stills-title">Still frames</h3></div><span>{frames.length} saved</span></div>
    <p>Apple’s embedded stream can play here, but browser rules and Apple’s preview terms prevent extracting frames from it. Choose a video file you own to make and keep stills in this browser.</p>
    <label className="music-video-file"><Upload size={15}/><span>{fileName || 'Choose a local video file'}</span><input type="file" accept="video/*" onChange={event=>void chooseFile(event.currentTarget.files?.[0])}/></label>
    {fileUrl&&<div className="music-video-capture"><video ref={video} src={fileUrl} controls playsInline preload="metadata" aria-label={`Local video preview: ${fileName}`}/><button type="button" onClick={()=>void capture()} disabled={capturing}><Camera size={15}/>{capturing?'Saving frame…':'Capture this frame'}</button></div>}
    {frames.length>0?<div className="music-video-still-gallery">{frames.map(frame=><StillThumb key={frame.id} item={frame} onDelete={()=>void removeUserArtwork(frame.id)}/>)}</div>:<div className="music-video-stills-empty"><Image size={17}/>Captured frames will appear here.</div>}
  </section>;
}
