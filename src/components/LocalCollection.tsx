import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Trash2, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { addUserArtwork, db, exportUserCollection, importUserCollection, removeUserArtwork, USER_ART_MAX_BYTES, USER_ART_MIME } from '../lib/db';
import { resolutionLabel } from '../lib/quality';
import { formatBytes } from '../lib/musicDownloads';

const REGIONS = ['', 'JP', 'CN', 'TW', 'KR', 'US', 'GB', 'EU', 'ID', 'WORLD'];

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Artwork the user owns. Stored in this browser only: never committed, mirrored or sent to the sync Worker. */
export default function LocalCollection({ profileId, notify }: { profileId: string; notify: (text: string) => void }) {
  const items = useLiveQuery(() => db.userArtworks.where('profileId').equals(profileId).reverse().sortBy('createdAt'), [profileId]) || [];
  const [title, setTitle] = useState(''), [region, setRegion] = useState(''), [edition, setEdition] = useState(''), [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null), importRef = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => new Map(items.map(item => [item.id, URL.createObjectURL(item.blob)])), [items]);
  useEffect(() => () => urls.forEach(url => URL.revokeObjectURL(url)), [urls]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return notify('Choose an image file first.');
    setBusy(true);
    try {
      await addUserArtwork(profileId, file, { title, region, edition });
      setTitle(''); setEdition(''); if (fileRef.current) fileRef.current.value = '';
      notify('Saved on this device only.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not save this image.'); }
    finally { setBusy(false); }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try { notify(`${await importUserCollection(profileId, await file.text())} image(s) imported.`); }
    catch (error) { notify(error instanceof Error ? error.message : 'Import failed.'); }
    if (importRef.current) importRef.current.value = '';
  }
  return <details className="cat-local" open={items.length > 0}>
    <summary>My local artwork <span>{items.length}</span></summary>
    <p className="cat-status">Your own files for editions RUPA cannot show. They stay in this browser: not uploaded, not in backups, not in device sync.</p>
    <form className="cat-local-form" onSubmit={add}>
      <input ref={fileRef} type="file" accept={USER_ART_MIME.join(',')} aria-label="Image file" />
      <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Title, e.g. 千と千尋の神隠し" aria-label="Title" maxLength={160} />
      <input value={edition} onChange={event => setEdition(event.target.value)} placeholder="Edition, e.g. China 2019 poster" aria-label="Edition" maxLength={160} />
      <select value={region} onChange={event => setRegion(event.target.value)} aria-label="Region">{REGIONS.map(code => <option key={code} value={code}>{code || 'Region (optional)'}</option>)}</select>
      <Button type="submit" disabled={busy}><Upload size={15} /> Add</Button>
    </form>
    <small className="cat-res">JPEG, PNG or WebP, up to {USER_ART_MAX_BYTES / 1_000_000} MB each.</small>
    {items.length > 0 && <div className="cat-grid">{items.map(item => <div key={item.id} className="cat-art">
      <span className="cat-art-frame"><img src={urls.get(item.id)} alt={item.title} /></span>
      <strong>{item.title}</strong>
      <small>{[item.region, item.edition].filter(Boolean).join(' · ') || 'No edition noted'}</small>
      <small>{resolutionLabel(item.width, item.height)} · {formatBytes(item.bytes)}</small>
      <button className="cat-remove" onClick={() => void removeUserArtwork(item.id)} aria-label={`Remove ${item.title}`}><Trash2 size={14} /> Remove</button>
    </div>)}</div>}
    <div className="cat-work-actions">
      <Button variant="outline" size="sm" disabled={!items.length} onClick={() => void exportUserCollection(profileId).then(text => download(text, `rupa-local-artwork-${new Date().toISOString().slice(0, 10)}.json`))}><Download size={14} /> Export</Button>
      <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}><Upload size={14} /> Import</Button>
      <input ref={importRef} type="file" accept="application/json" hidden onChange={event => void importFile(event.target.files?.[0])} />
    </div>
  </details>;
}
