import { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, RefreshCw } from 'lucide-react';
import { searchArtwork } from '../lib/providers';
import type { Artwork } from '../lib/types';

export function AppleVideoPreview({ item }: { item: Artwork }) {
  const video = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState(item.mediaPreviewUrl || '');
  const [loading, setLoading] = useState(!item.mediaPreviewUrl);
  const [frame, setFrame] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSource(item.mediaPreviewUrl || '');
    setFrame('');
    setMessage('');
    if (item.mediaPreviewUrl) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    searchArtwork(item.sourceUrl, 'musicvideos', controller.signal, undefined, 'us', 'apple')
      .then(result => {
        if (!controller.signal.aborted) {
          const match = result.results.find(candidate => candidate.mediaPreviewUrl);
          setSource(match?.mediaPreviewUrl || '');
          setMessage(match ? '' : 'Apple does not provide a playable preview for this video.');
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Apple preview is unavailable.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [item.id, item.mediaPreviewUrl, item.sourceUrl]);

  function captureFrame() {
    const media = video.current;
    if (!media || media.readyState < 2 || !media.videoWidth || !media.videoHeight) {
      setMessage('Play or pause the Apple preview on a frame first.');
      return;
    }
    try {
      const scale = Math.min(1, 1920 / Math.max(media.videoWidth, media.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(media.videoWidth * scale);
      canvas.height = Math.round(media.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Frame preview is unavailable in this browser.');
      context.drawImage(media, 0, 0, canvas.width, canvas.height);
      setFrame(canvas.toDataURL('image/jpeg', 0.88));
      setMessage('');
    } catch {
      setMessage('Apple’s preview could not be captured in this browser. You can still scrub and watch it here.');
    }
  }

  return <section className="apple-video-preview" aria-label="Apple Music video preview">
    {source
      ? <video ref={video} src={source} crossOrigin="anonymous" controls playsInline preload="metadata" onError={() => setMessage('Apple’s hosted preview could not be played here. Open the source page to watch it.')} />
      : <div className="apple-video-state" role="status">{loading ? <><LoaderCircle size={18} className="rupa-spinner"/> Looking up Apple’s video preview…</> : message || 'Apple video preview unavailable.'}</div>}
    {source && <div className="apple-video-frame-tools">
      <button type="button" onClick={captureFrame} disabled={!source}><Camera size={14}/> Capture frame</button>
      {frame && <button type="button" onClick={() => setFrame('')}><RefreshCw size={13}/> Clear preview</button>}
    </div>}
    {message && source && <p className="apple-video-message" role="status">{message}</p>}
    {frame && <figure className="apple-video-frame-preview"><img src={frame} alt={`${item.title} captured preview frame`}/><figcaption>Temporary frame preview · cleared when this detail closes</figcaption></figure>}
    <p className="apple-video-attribution">Preview provided courtesy of iTunes. <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open in Apple Music</a></p>
  </section>;
}
