import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Crop, Download, Image as ImageIcon, Share2, Upload } from 'lucide-react';
import type { Artwork } from '../lib/types';
import { downloadLink } from '../lib/providers';
import { safeFileName } from '../lib/utils';
import { formatBytes } from '../lib/musicDownloads';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';

type Preset = 'original' | 'phone' | 'phone-16-9' | 'tablet' | 'tablet-landscape' | 'desktop' | 'ultrawide' | 'square' | 'portrait-4-5' | 'portrait-3-4' | 'photo-3-2' | 'classic-4-3' | 'wide-16-9' | 'cinema-21-9' | 'custom';
type Dimensions = { width:number; height:number };
type LoadedImage = { bitmap:ImageBitmap; width:number; height:number; name:string };
type Prepared = { file:File; dimensions:Dimensions; mime:string };
const PRESETS:{id:Preset;label:string;dimensions:Dimensions|null}[]=[
  {id:'original',label:'Original image',dimensions:null},
  {id:'phone',label:'Phone · tall',dimensions:{width:1440,height:3120}},
  {id:'phone-16-9',label:'Phone · 16:9',dimensions:{width:1440,height:2560}},
  {id:'tablet',label:'Tablet · portrait',dimensions:{width:2048,height:2732}},
  {id:'tablet-landscape',label:'Tablet · landscape',dimensions:{width:2732,height:2048}},
  {id:'desktop',label:'Desktop · 16:9',dimensions:{width:3840,height:2160}},
  {id:'ultrawide',label:'Ultrawide · 21:9',dimensions:{width:5120,height:2160}},
  {id:'square',label:'Square',dimensions:{width:2400,height:2400}},
  {id:'portrait-4-5',label:'Portrait · 4:5',dimensions:{width:2400,height:3000}},
  {id:'portrait-3-4',label:'Portrait · 3:4',dimensions:{width:2400,height:3200}},
  {id:'photo-3-2',label:'Photo · 3:2',dimensions:{width:3600,height:2400}},
  {id:'classic-4-3',label:'Classic · 4:3',dimensions:{width:3200,height:2400}},
  {id:'wide-16-9',label:'Wide · 16:9',dimensions:{width:3840,height:2160}},
  {id:'cinema-21-9',label:'Cinema · 21:9',dimensions:{width:5120,height:2160}},
  {id:'custom',label:'Custom size',dimensions:null},
];
const MAX_REMOTE_BYTES=24*1024*1024;
const MAX_CUSTOM_PIXELS=24_000_000;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

function outputMime(format:string){return format==='jpeg'?'image/jpeg':format==='webp'?'image/webp':'image/png';}
function extensionFor(mime:string){return mime==='image/jpeg'?'.jpg':mime==='image/webp'?'.webp':'.png';}
function defaultWallpaperPreset():Preset{return window.matchMedia('(min-width: 900px) and (pointer: fine)').matches?'desktop':'phone';}
function loadBitmap(blob:Blob){return createImageBitmap(blob);}
function getCrop(imageWidth:number,imageHeight:number,aspect:number,zoom:number,panX:number,panY:number){
  const baseWidth=Math.min(imageWidth,imageHeight*aspect),baseHeight=baseWidth/aspect;
  const width=baseWidth/zoom,height=baseHeight/zoom;
  const centerX=imageWidth/2+(imageWidth-width)/2*(panX/100);
  const centerY=imageHeight/2+(imageHeight-height)/2*(panY/100);
  return {x:clamp(centerX-width/2,0,imageWidth-width),y:clamp(centerY-height/2,0,imageHeight-height),width,height};
}
function drawCrop(canvas:HTMLCanvasElement,image:LoadedImage,dimensions:Dimensions,zoom:number,panX:number,panY:number,background?:string){
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('This browser could not prepare the wallpaper image.');
  const crop=getCrop(image.width,image.height,dimensions.width/dimensions.height,zoom,panX,panY);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(background){ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);}
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(image.bitmap,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
  return crop;
}
function sourceCandidates(item:Artwork){
  return [...new Set([...(item.hdDownloadUrls||[]),item.downloadUrl,item.imageUrl,item.previewUrl].filter((value):value is string=>Boolean(value)))];
}
async function readImage(item:Artwork,signal:AbortSignal):Promise<LoadedImage>{
  const candidates=sourceCandidates(item);let lastError:unknown;
  for(const candidate of candidates){
    try{
      const parsed=new URL(candidate,window.location.href);
      if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Invalid artwork source.');
      const proxy=parsed.origin===window.location.origin?parsed.href:downloadLink({...item,downloadUrl:parsed.href,imageUrl:parsed.href});
      const response=await fetch(proxy,{signal,mode:'cors'});
      if(!response.ok)throw new Error(`Image source returned HTTP ${response.status}.`);
      const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
      if(!type.startsWith('image/'))throw new Error('The source did not return an image file.');
      const blob=await response.blob();
      if(!blob.size||blob.size>MAX_REMOTE_BYTES)throw new Error(blob.size?'Image is larger than 24 MB.':'The image source returned an empty file.');
      const bitmap=await loadBitmap(blob);
      if(!bitmap.width||!bitmap.height||bitmap.width>12000||bitmap.height>12000){bitmap.close();throw new Error('Image dimensions are outside the supported range.');}
      return {bitmap,width:bitmap.width,height:bitmap.height,name:item.title};
    }catch(error){if(signal.aborted)throw error;lastError=error;}
  }
  const message=lastError instanceof Error?lastError.message:'Could not read an image from this source.';throw new Error(/failed to fetch|network|cors/i.test(message)?'This image host blocks browser image processing. Open the original image, save it, then use “Use another image”.':message+' You can open the original image, save it, then use “Use another image”.');
}
function canvasBlob(canvas:HTMLCanvasElement,mime:string):Promise<Blob>{
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('The browser could not export this image format.')),mime,(mime==='image/jpeg'||mime==='image/webp')?0.94:undefined));
}

export function WallpaperEditor({item,mode='wallpaper',onClose,notify}:{item:Artwork|null;mode?:'artwork'|'wallpaper';onClose:()=>void;notify:(message:string)=>void}){
  const [image,setImage]=useState<LoadedImage|null>(null),[loading,setLoading]=useState(false),[sourceError,setSourceError]=useState('');
  const [preset,setPreset]=useState<Preset>(defaultWallpaperPreset),[customWidth,setCustomWidth]=useState('1440'),[customHeight,setCustomHeight]=useState('3120');
  const [zoom,setZoom]=useState(1),[panX,setPanX]=useState(0),[panY,setPanY]=useState(0),[format,setFormat]=useState('png'),[upscaleFactor,setUpscaleFactor]=useState<1|2>(1);
  const [prepared,setPrepared]=useState<Prepared|null>(null),[sharing,setSharing]=useState(false);
  const previewRef=useRef<HTMLCanvasElement>(null),fileInputRef=useRef<HTMLInputElement>(null);
  const dragRef=useRef<{pointerId:number;clientX:number;clientY:number;panX:number;panY:number}|null>(null);
  const currentPreset=PRESETS.find(choice=>choice.id===preset);
  const baseDimensions=useMemo<Dimensions>(()=>{
    if(preset==='original'&&image)return {width:image.width,height:image.height};
    if(preset==='custom')return {width:clamp(Number(customWidth)||320,320,12000),height:clamp(Number(customHeight)||320,320,12000)};
    return currentPreset?.dimensions||{width:1440,height:3120};
  },[preset,image?.width,image?.height,customWidth,customHeight,currentPreset]);
  const dimensions=useMemo<Dimensions>(()=>({width:baseDimensions.width*upscaleFactor,height:baseDimensions.height*upscaleFactor}),[baseDimensions.width,baseDimensions.height,upscaleFactor]);
  const canSharePrepared=Boolean(prepared&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[prepared.file]}));
  const tooLarge=dimensions.width*dimensions.height>MAX_CUSTOM_PIXELS||dimensions.width>12000||dimensions.height>12000;
  const needsUpscale=Boolean(image&&(()=>{const crop=getCrop(image.width,image.height,dimensions.width/dimensions.height,zoom,panX,panY);return crop.width<dimensions.width||crop.height<dimensions.height;})());

  useEffect(()=>{
    if(!item){setImage(current=>{current?.bitmap.close();return null;});setPrepared(null);return;}
    const controller=new AbortController();let active=true;
    setLoading(true);setSourceError('');setPrepared(null);setZoom(1);setPanX(0);setPanY(0);setPreset(mode==='wallpaper'?defaultWallpaperPreset():'original');setUpscaleFactor(1);
    setImage(current=>{current?.bitmap.close();return null;});
    readImage(item,controller.signal).then(value=>{if(active)setImage(value);else value.bitmap.close();})
      .catch(error=>{if(active)setSourceError(error instanceof Error?error.message:'Could not load this image.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[item?.id,mode]);

  useEffect(()=>{
    if(!image||!previewRef.current||tooLarge)return;
    const canvas=previewRef.current,aspect=dimensions.width/dimensions.height,limit=760;
    canvas.width=Math.max(1,Math.round(aspect>=1?limit:limit*aspect));
    canvas.height=Math.max(1,Math.round(aspect>=1?limit/aspect:limit));
    drawCrop(canvas,image,{width:canvas.width,height:canvas.height},zoom,panX,panY);
    setPrepared(null);
  },[image,dimensions.width,dimensions.height,zoom,panX,panY,tooLarge]);

  useEffect(()=>()=>{image?.bitmap.close();},[image]);

  async function useLocalFile(event:ChangeEvent<HTMLInputElement>){
    const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;
    if(!file.type.startsWith('image/')||file.size>40*1024*1024){setSourceError('Choose an image file under 40 MB.');return;}
    try{const bitmap=await loadBitmap(file);if(!bitmap.width||!bitmap.height||bitmap.width>12000||bitmap.height>12000){bitmap.close();throw new Error('Image dimensions are outside the supported range.');}setImage(current=>{current?.bitmap.close();return {bitmap,width:bitmap.width,height:bitmap.height,name:file.name.replace(/\.[^.]+$/,'')||item?.title||'wallpaper'};});setSourceError('');setPrepared(null);}
    catch(error){setSourceError(error instanceof Error?error.message:'Could not open this image file.');}
  }
  async function prepare():Promise<Prepared|null>{
    if(!image||tooLarge)return null;
    try{
      const canvas=document.createElement('canvas');canvas.width=dimensions.width;canvas.height=dimensions.height;
      if(!canvas.getContext('2d'))throw new Error('This browser could not prepare the wallpaper image.');
      drawCrop(canvas,image,dimensions,zoom,panX,panY,format==='jpeg'?'#fff':undefined);
      const mime=outputMime(format),blob=await canvasBlob(canvas,mime),extension=extensionFor(blob.type||mime);
      const name=safeFileName(image.name||item?.title||'artwork');
      const file=new File([blob],`${name}-${mode==='wallpaper'?'wallpaper':'artwork'}${extension}`,{type:blob.type||mime,lastModified:Date.now()});
      const output={file,dimensions:{...dimensions},mime:blob.type||mime};setPrepared(output);return output;
    }catch(error){notify(error instanceof Error?error.message:'Wallpaper export failed.');return null;}
  }
  function startCropDrag(event:ReactPointerEvent<HTMLCanvasElement>){
    if(!image)return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current={pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,panX,panY};
  }
  function moveCropDrag(event:ReactPointerEvent<HTMLCanvasElement>){
    const drag=dragRef.current,canvas=previewRef.current;
    if(!drag||!image||!canvas)return;
    const rect=canvas.getBoundingClientRect(),crop=getCrop(image.width,image.height,dimensions.width/dimensions.height,zoom,drag.panX,drag.panY);
    const maxX=(image.width-crop.width)/2,maxY=(image.height-crop.height)/2;
    if(maxX>0)setPanX(clamp(drag.panX-(event.clientX-drag.clientX)*crop.width/rect.width*100/maxX,-100,100));
    if(maxY>0)setPanY(clamp(drag.panY-(event.clientY-drag.clientY)*crop.height/rect.height*100/maxY,-100,100));
  }
  function endCropDrag(){dragRef.current=null;}
  function download(file=prepared?.file){if(!file)return;const url=URL.createObjectURL(file),anchor=document.createElement('a');anchor.href=url;anchor.download=file.name;document.body.append(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30_000);}
  async function save(){const output=prepared||await prepare();if(output)download(output.file);}
  async function share(){
    if(!prepared||!navigator.share)return;
    try{setSharing(true);const shareData={files:[prepared.file],title:item?.title||'Wallpaper',text:'Wallpaper image prepared with Rupa.'};if(!navigator.canShare?.({files:shareData.files}))throw new Error('File sharing is not supported here. Download the image instead.');await navigator.share(shareData);}
    catch(error){if(error instanceof Error&&error.name!=='AbortError')notify(error.message||'Could not open the device share sheet.');}
    finally{setSharing(false);}
  }
  return <Dialog open={!!item} onOpenChange={open=>{if(!open)onClose();}} title={mode==='wallpaper'?'Set as wallpaper':'Prepare artwork'} wide>
    {item&&<div className="wallpaper-editor">
      <div className="wallpaper-preview-column"><div className="wallpaper-preview-top"><span className="tiny-kicker">LIVE PREVIEW</span><span>{image?`${image.width.toLocaleString()} × ${image.height.toLocaleString()} px source`:loading?'Loading original image…':'Choose an image to start'}</span></div>
        <div className="wallpaper-preview-stage">{loading?<div className="wallpaper-empty"><ImageIcon size={25}/> Loading source image…</div>:image&&!tooLarge?<canvas ref={previewRef} aria-label={`Cropped wallpaper preview, ${dimensions.width} by ${dimensions.height} pixels`} onPointerDown={startCropDrag} onPointerMove={moveCropDrag} onPointerUp={endCropDrag} onPointerCancel={endCropDrag}/>:<div className="wallpaper-empty"><ImageIcon size={25}/>{tooLarge?'Choose a smaller custom output size.':sourceError||'Load an image file to continue.'}</div>}</div>
        <div className="wallpaper-preview-note"><Crop size={14}/><span>Drag the image or adjust zoom and position to choose the crop.</span></div>
      </div>
        <div className="wallpaper-controls">
        <label className="wallpaper-field"><span>{mode==='wallpaper'?'Device & ratio':'Crop ratio & size'}</span><select value={preset} onChange={event=>{setPreset(event.target.value as Preset);setPrepared(null);}}>{PRESETS.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>
        {preset==='custom'&&<div className="wallpaper-custom-size"><label><span>Width px</span><input type="number" min={320} max={12000} step={1} value={customWidth} onChange={event=>{setCustomWidth(event.target.value);setPrepared(null);}} onBlur={()=>setCustomWidth(String(clamp(Number(customWidth)||320,320,12000)))}/></label><span>×</span><label><span>Height px</span><input type="number" min={320} max={12000} step={1} value={customHeight} onChange={event=>{setCustomHeight(event.target.value);setPrepared(null);}} onBlur={()=>setCustomHeight(String(clamp(Number(customHeight)||320,320,12000)))}/></label></div>}
        <label className="wallpaper-range"><span>Zoom <strong>{zoom.toFixed(1)}×</strong></span><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={event=>{setZoom(Number(event.target.value));setPrepared(null);}}/></label>
        <label className="wallpaper-range"><span>Horizontal position</span><input type="range" min="-100" max="100" value={panX} onChange={event=>{setPanX(Number(event.target.value));setPrepared(null);}}/></label>
        <label className="wallpaper-range"><span>Vertical position</span><input type="range" min="-100" max="100" value={panY} onChange={event=>{setPanY(Number(event.target.value));setPrepared(null);}}/></label>
        <label className="wallpaper-field"><span>Upscale</span><select value={upscaleFactor} onChange={event=>{setUpscaleFactor(Number(event.target.value) as 1|2);setPrepared(null);}}><option value="1">1× · standard size</option><option value="2">2× · high-quality interpolation</option></select></label>
        <label className="wallpaper-field"><span>File format</span><select value={format} onChange={event=>{setFormat(event.target.value);setPrepared(null);}}><option value="png">PNG · best compatibility</option><option value="jpeg">JPEG · smaller file</option><option value="webp">WebP · smaller file</option></select></label>
        <div className="wallpaper-output-meta"><span>Output dimensions</span><strong>{dimensions.width.toLocaleString()} × {dimensions.height.toLocaleString()} px</strong>{needsUpscale&&<small>The crop is enlarged using browser interpolation. Upscaling increases pixel size but cannot restore detail absent from the source.</small>}{tooLarge&&<small>Reduce the size or upscale setting to stay below 24 megapixels and 12,000 px per side.</small>}</div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={event=>void useLocalFile(event)}/>
        <Button variant="outline" onClick={()=>fileInputRef.current?.click()}><Upload size={16}/> Use another image</Button>
        {sourceError&&!loading&&<p className="wallpaper-source-error" role="status">{sourceError} <a href={item.downloadUrl||item.imageUrl||item.sourceUrl} target="_blank" rel="noreferrer">Open original image</a></p>}
        <Button onClick={()=>void save()} disabled={!image||loading||tooLarge}><Download size={16}/> {mode==='wallpaper'?'Save wallpaper':'Save artwork'}</Button>
        {prepared&&<div className="wallpaper-ready" role="status"><div><strong>{mode==='wallpaper'?'Wallpaper saved':'Artwork saved'}</strong><small>{prepared.dimensions.width.toLocaleString()} × {prepared.dimensions.height.toLocaleString()} px · {prepared.mime.split('/')[1].replace('jpeg','JPEG').toUpperCase()} · {formatBytes(prepared.file.size)}</small></div>{canSharePrepared&&<Button variant="outline" onClick={()=>void share()} disabled={sharing}><Share2 size={15}/>{sharing?'Opening…':'Share to device'}</Button>}</div>}
        <p className="wallpaper-device-note">{mode==='wallpaper'?'Choose the device ratio, crop, upscale, and format first. Save the wallpaper image, then select it in your desktop wallpaper settings.':'Choose a crop, output size, and format before saving. The 2× option interpolates pixels; it is not AI detail reconstruction.'}</p>
      </div>
    </div>}
  </Dialog>;
}
