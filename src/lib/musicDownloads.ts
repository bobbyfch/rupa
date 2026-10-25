import type { MotionArtwork } from './types';

export interface DownloadDetails { width:number; height:number; bytes:number; mime:string; extension:string; }
export type MotionExportFormat='mp4'|'webm'|'gif';
export type ImageExportFormat='original'|'png'|'jpeg'|'webp';
export type MotionExportStage='Opening stream'|'Recording'|'Encoding GIF'|'Finalizing file'|'Checking file'|'Saved';
export type MotionExportProgress=(progress:number,stage:MotionExportStage)=>void;
const IMAGE_TYPES:Record<string,string>={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/avif':'.avif','image/tiff':'.tif'};
const imageHost=(value:string)=>{try{const url=new URL(value);const host=url.hostname.toLowerCase();return url.protocol==='https:'&&(host==='mzstatic.com'||host.endsWith('.mzstatic.com'))&&(!url.port||url.port==='443');}catch{return false;}};
function formatBytes(bytes:number){if(bytes<1024)return `${bytes} B`;if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KiB`;return `${(bytes/(1024*1024)).toFixed(2)} MiB`;}
function saveBlob(blob:Blob,name:string){const objectUrl=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(objectUrl),30_000);}
async function readBoundedBlob(response:Response,limit:number):Promise<Blob>{
  const declared=Number(response.headers.get('content-length')||0);if(declared>limit)throw new Error('The source file is larger than the download limit.');
  if(!response.body){const blob=await response.blob();if(blob.size>limit)throw new Error('The source file is larger than the download limit.');return blob;}
  const reader=response.body.getReader(),parts:Uint8Array[]=[],header=response.headers.get('content-type')||'';let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){await reader.cancel();throw new Error('The source file is larger than the download limit.');}parts.push(value);}}
  finally{reader.releaseLock();}
  return new Blob(parts,{type:header});
}
export const readImageResponse=(response:Response,limit=20*1024*1024)=>readBoundedBlob(response,limit);
function mediaEvent(target:HTMLMediaElement,event:string,timeoutMs:number):Promise<void>{
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{window.clearTimeout(timer);target.removeEventListener(event,done);target.removeEventListener('error',fail);};
    const done=()=>{cleanup();resolve();};
    const fail=()=>{cleanup();reject(new Error('The recorded motion could not be decoded.'));};
    const timer=window.setTimeout(()=>{cleanup();reject(new Error('The recorded motion could not be verified before timeout.'));},timeoutMs);
    target.addEventListener(event,done,{once:true});target.addEventListener('error',fail,{once:true});
  });
}
async function verifyMotionBlob(blob:Blob,expectedWidth:number,expectedHeight:number):Promise<void>{
  const mime=blob.type.split(';')[0].toLowerCase(),bytes=new Uint8Array(await blob.slice(0,12).arrayBuffer());
  const validContainer=mime==='video/mp4'?String.fromCharCode(...bytes.slice(4,8))==='ftyp':mime==='video/webm'?bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3:false;
  if(!validContainer)throw new Error('The browser produced an invalid video container.');
  const source=URL.createObjectURL(blob),probe=document.createElement('video');
  probe.muted=true;probe.playsInline=true;probe.preload='metadata';
  try{
    const metadata=mediaEvent(probe,'loadedmetadata',10_000);probe.src=source;await metadata;
    if(!Number.isFinite(probe.duration)||probe.duration<=0||probe.duration>45||!probe.videoWidth||!probe.videoHeight)throw new Error('The recorded motion has invalid video metadata.');
    if(probe.videoWidth!==expectedWidth||probe.videoHeight!==expectedHeight)throw new Error('The recorded motion dimensions changed during export.');
  }finally{probe.pause();probe.removeAttribute('src');probe.load();URL.revokeObjectURL(source);}
}
async function tiffDimensions(blob:Blob):Promise<{width:number;height:number}>{
  const data=new DataView(await blob.slice(0,1024*1024).arrayBuffer());
  if(data.byteLength<8)throw new Error('TIFF header is incomplete.');
  const little=data.getUint8(0)===0x49&&data.getUint8(1)===0x49,big=data.getUint8(0)===0x4d&&data.getUint8(1)===0x4d;
  if(!little&&!big)throw new Error('TIFF byte order is invalid.');
  const u16=(offset:number)=>data.getUint16(offset,little),u32=(offset:number)=>data.getUint32(offset,little);
  if(u16(2)!==42)throw new Error('Unsupported TIFF variant.');
  const ifd=u32(4);if(ifd+2>data.byteLength)throw new Error('TIFF dimensions are outside the header.');
  const count=u16(ifd);let width=0,height=0;
  for(let i=0;i<count;i++){
    const entry=ifd+2+i*12;if(entry+12>data.byteLength)break;
    const tag=u16(entry);if(tag!==256&&tag!==257)continue;
    const type=u16(entry+2),items=u32(entry+4);if(!items)continue;
    const value=items===1?(type===3?u16(entry+8):type===4?u32(entry+8):0):0;
    if(tag===256)width=value;if(tag===257)height=value;
  }
  if(!width||!height)throw new Error('TIFF pixel dimensions could not be read.');
  return {width,height};
}

export function imageMimeForExport(format:ImageExportFormat,originalMime='image/jpeg'):string{return format==='original'?originalMime:format==='jpeg'?'image/jpeg':`image/${format}`;}
async function exportImage(blob:Blob,mime:string,format:ImageExportFormat,width:number,height:number,scale:1|2=1):Promise<{blob:Blob;mime:string;extension:string;width:number;height:number}>{
  const outputWidth=Math.round(width*scale),outputHeight=Math.round(height*scale);
  if(outputWidth>10_000||outputHeight>10_000||outputWidth*outputHeight>24_000_000)throw new Error('The selected 2× output would exceed this browser’s safe image limit.');
  const preserved=['image/jpeg','image/png','image/webp'].includes(mime);
  const outputMime=format==='original'?(preserved?mime:'image/png'):imageMimeForExport(format,mime);
  const extension=IMAGE_TYPES[outputMime];
  if(!extension)throw new Error('This browser cannot export the selected image format.');
  if(format==='original'&&scale===1)return {blob,mime:outputMime,extension,width:outputWidth,height:outputHeight};
  let bitmap:ImageBitmap;
  try{bitmap=await createImageBitmap(blob);}catch{throw new Error('This source cannot be converted in the browser. Choose another image format.');}
  try{
    const canvas=document.createElement('canvas');canvas.width=outputWidth;canvas.height=outputHeight;
    const context=canvas.getContext('2d');if(!context)throw new Error('Image conversion is unavailable in this browser.');
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    if(outputMime==='image/jpeg'){context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);}
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const converted=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('The browser could not export this image format.')),outputMime,.92));
    if(converted.type!==outputMime)throw new Error('This browser could not export the selected image format.');
    return {blob:converted,mime:outputMime,extension,width:outputWidth,height:outputHeight};
  }finally{bitmap.close();}
}export async function convertImageBlob(blob:Blob,format:ImageExportFormat):Promise<{blob:Blob;mime:string;extension:string;width:number;height:number}>{
  const mime=(blob.type||'').split(';')[0].toLowerCase();
  if(!IMAGE_TYPES[mime])throw new Error(`Unsupported image format${mime?` (${mime})`:''}.`);
  let bitmap:ImageBitmap;
  try{bitmap=await createImageBitmap(blob);}catch{throw new Error('The downloaded file could not be decoded as an image.');}
  try{
    const width=bitmap.width,height=bitmap.height;
    if(!width||!height||width>10_000||height>10_000)throw new Error('Source returned invalid image dimensions.');
    const exported=await exportImage(blob,mime,format,width,height);
    return {...exported,width,height};
  }finally{bitmap.close();}
}

export async function downloadAppleStill(url:string,baseName:string,variant:'sd'|'hd'|'image',fallbackUrls?:string|string[],format:ImageExportFormat='original',scale:1|2=1):Promise<DownloadDetails>{
  const fallbacks=Array.isArray(fallbackUrls)?fallbackUrls:[fallbackUrls];
  const candidates=Array.from(new Set([url,...fallbacks].filter((value):value is string=>Boolean(value))));
  let lastError:unknown;
  for(let index=0;index<candidates.length;index++){
    const candidate=candidates[index];
    try{
      if(!imageHost(candidate))throw new Error('This is not an Apple Music image URL.');
      const response=await fetch(candidate,{signal:AbortSignal.timeout(15_000)});
      if(!response.ok)throw new Error(`Apple artwork download failed (HTTP ${response.status}).`);
      if(!imageHost(response.url||candidate))throw new Error('Apple artwork redirected to an unapproved host.');
      const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase(),extension=IMAGE_TYPES[mime];
      if(!extension)throw new Error(`Apple returned an unsupported image format${mime?` (${mime})`:''}.`);
      const blob=await readBoundedBlob(response,20*1024*1024);
      if(!blob.size||blob.size>20*1024*1024)throw new Error(blob.size?'Apple artwork exceeds the 20 MB download limit.':'Apple returned an empty image.');
      let bitmap:ImageBitmap;
      try{bitmap=await createImageBitmap(blob);}catch{throw new Error('The downloaded file could not be decoded as an image.');}
      const width=bitmap.width,height=bitmap.height;bitmap.close();
      if(!width||!height||width>10_000||height>10_000)throw new Error('Apple returned invalid image dimensions.');
      const exported=await exportImage(blob,mime,format,width,height,scale);
      saveBlob(exported.blob,baseName+(variant==='image'?'':'-'+variant)+(scale===2?'-2x':'')+exported.extension);
      return {width:exported.width,height:exported.height,bytes:exported.blob.size,mime:exported.mime,extension:exported.extension};
    }catch(error){lastError=error;if(index===candidates.length-1)throw error;}
  }
  throw lastError instanceof Error?lastError:new Error('Apple artwork could not be downloaded.');
}

export async function downloadArtworkStill(url:string,baseName:string,variant:'sd'|'hd'|'image',fallbackUrls:string[]=[],format:ImageExportFormat='original',scale:1|2=1):Promise<DownloadDetails>{
  const candidates=Array.from(new Set([url,...fallbackUrls].filter(Boolean)));
  let lastError:unknown;
  for(let index=0;index<candidates.length;index++){
    const candidate=candidates[index];
    try{
      const parsed=new URL(candidate,window.location.href);
      if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Invalid artwork URL.');
      const response=await fetch(parsed.toString(),{signal:AbortSignal.timeout(20_000)});
      if(!response.ok)throw new Error(`Artwork download failed (HTTP ${response.status}).`);
      const finalUrl=new URL(response.url||parsed.href);
      if(!['https:','http:'].includes(finalUrl.protocol)||finalUrl.username||finalUrl.password)throw new Error('Artwork redirected to an unsafe URL.');
      const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase(),extension=IMAGE_TYPES[mime];
      if(!extension)throw new Error(`Source returned an unsupported image format${mime?` (${mime})`:''}.`);
      const blob=await readBoundedBlob(response,20*1024*1024);
      if(!blob.size||blob.size>20*1024*1024)throw new Error(blob.size?'Artwork exceeds the 20 MB limit.':'Source returned an empty image.');
      let width:number,height:number;
      if(mime==='image/tiff'){({width,height}=await tiffDimensions(blob));}
      else{let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(blob);}catch{throw new Error('Downloaded content could not be decoded as an image.');}width=bitmap.width;height=bitmap.height;bitmap.close();}
      if(!width||!height||width>10_000||height>10_000)throw new Error('Source returned invalid image dimensions.');
      const exported=await exportImage(blob,mime,format,width,height,scale);
      saveBlob(exported.blob,baseName+'-'+variant+(scale===2?'-2x':'')+exported.extension);
      return {width:exported.width,height:exported.height,bytes:exported.blob.size,mime:exported.mime,extension:exported.extension};
    }catch(error){lastError=error;if(index===candidates.length-1)throw error;}
  }
  throw lastError instanceof Error?lastError:new Error('Artwork could not be downloaded.');
}

export async function attachAppleMotionPlayback(video:HTMLVideoElement,url:string,quality:'adaptive'|'best'='adaptive'):Promise<()=>void>{
  video.crossOrigin='anonymous';video.playsInline=true;video.preload='auto';
  const userAgent=navigator.userAgent,isSafari=/Safari/i.test(userAgent)&&!/Chrome|Chromium|Edg|OPR|Firefox/i.test(userAgent),isIos=/iPhone|iPad|iPod/i.test(userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if((isSafari||isIos)&&video.canPlayType('application/vnd.apple.mpegurl')){
    video.src=url;video.load();
    return ()=>{video.pause();video.removeAttribute('src');video.load();};
  }
  const {default:Hls}=await import('hls.js');
  if(!Hls.isSupported())throw new Error('This browser cannot play Apple Music HLS artwork.');
  const hls=new Hls({enableWorker:true,lowLatencyMode:false,maxBufferLength:8,capLevelToPlayerSize:quality==='adaptive'});
  await new Promise<void>((resolve,reject)=>{
    const fail=()=>{hls.destroy();reject(new Error('Apple Music motion stream could not be opened.'));};
    hls.once(Hls.Events.MEDIA_ATTACHED,()=>hls.loadSource(url));
    hls.once(Hls.Events.MANIFEST_PARSED,()=>{if(quality==='best'&&hls.levels.length>0){const highest=hls.levels.length-1;hls.currentLevel=highest;hls.nextLevel=highest;}resolve();});
    hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal)fail();});
    hls.attachMedia(video);
  });
  return ()=>{video.pause();hls.destroy();video.removeAttribute('src');};
}

function videoMime(format:'mp4'|'webm'){
  if(typeof MediaRecorder==='undefined')return undefined;
  const candidates=format==='mp4'?['video/mp4','video/mp4;codecs="avc1.42E01E"']:['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  return candidates.find(type=>MediaRecorder.isTypeSupported(type));
}
export function getSupportedMotionFormats():MotionExportFormat[]{
  if(typeof document==='undefined'||typeof HTMLVideoElement==='undefined')return [];
  const formats:MotionExportFormat[]=[],capture=typeof MediaRecorder!=='undefined'&&('captureStream' in HTMLVideoElement.prototype||'mozCaptureStream' in HTMLVideoElement.prototype);
  if(capture&&videoMime('mp4'))formats.push('mp4');
  if(capture&&videoMime('webm'))formats.push('webm');
  if(document.createElement('canvas').getContext('2d'))formats.push('gif');
  return formats;
}
export function canExportMotion(format?:MotionExportFormat):boolean{return format?getSupportedMotionFormats().includes(format):getSupportedMotionFormats().length>0;}
function createMotionVideo(){
  const video=document.createElement('video');video.muted=true;video.loop=false;video.playsInline=true;video.crossOrigin='anonymous';video.preload='auto';video.setAttribute('aria-hidden','true');
  Object.assign(video.style,{position:'fixed',left:'-10000px',top:'0',width:'1280px',height:'1280px',opacity:'0',pointerEvents:'none'});document.body.append(video);
  return video;
}
function waitForVideoData(video:HTMLVideoElement,timeoutMs=20_000){
  return new Promise<void>((resolve,reject)=>{
    if(video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0){resolve();return;}
    const finish=(error?:Error)=>{window.clearTimeout(timeout);video.removeEventListener('loadeddata',ready);video.removeEventListener('error',failed);error?reject(error):resolve();};
    const ready=()=>finish(),failed=()=>finish(new Error('Apple Music motion stream could not be decoded.'));
    const timeout=window.setTimeout(()=>finish(new Error('Apple Music motion stream timed out.')),timeoutMs);
    video.addEventListener('loadeddata',ready,{once:true});video.addEventListener('error',failed,{once:true});
  });
}
async function downloadMotionGif(url:string,baseName:string,onProgress?:MotionExportProgress):Promise<DownloadDetails>{
  const video=createMotionVideo();let detach:(()=>void)|undefined;
  try{
    onProgress?.(.03,'Opening stream');detach=await attachAppleMotionPlayback(video,url,'best');await waitForVideoData(video);
    if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>45)throw new Error('This motion has an unsupported duration.');
    const {GIFEncoder,quantize,applyPalette}=await import('gifenc');
    const maxSide=480,scale=Math.min(1,maxSide/Math.max(video.videoWidth,video.videoHeight)),width=Math.max(1,Math.round(video.videoWidth*scale)),height=Math.max(1,Math.round(video.videoHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('This browser could not prepare GIF frames.');
    const gif=GIFEncoder(),duration=Math.min(video.duration,12),started=Date.now();let palette:number[][]|undefined,frames=0,lastFrameTime=-1;
    onProgress?.(.1,'Encoding GIF');
    await new Promise<void>((resolve,reject)=>{
      let finished=false;
      const finish=(error?:Error)=>{if(finished)return;finished=true;window.clearInterval(interval);video.removeEventListener('ended',onEnded);error?reject(error):resolve();};
      const onEnded=()=>finish();
      const interval=window.setInterval(()=>{
        try{
          if(video.readyState>=2&&video.currentTime-lastFrameTime>=.11){
            context.drawImage(video,0,0,width,height);
            const frame=context.getImageData(0,0,width,height);
            palette||=quantize(frame.data,256);
            const indexed=applyPalette(frame.data,palette);
            const delay=lastFrameTime<0?110:Math.min(500,Math.max(110,Math.round((video.currentTime-lastFrameTime)*1000)));
            gif.writeFrame(indexed,width,height,{palette,delay,repeat:frames===0?0:undefined});frames++;lastFrameTime=video.currentTime;
            onProgress?.(.1+.8*Math.min(1,video.currentTime/duration),'Encoding GIF');
          }
          if(video.currentTime>=duration-.04||video.ended){finish();return;}
          if(Date.now()-started>30_000)finish(new Error('GIF encoding timed out. Try exporting MP4 or WebM instead.'));
        }catch(error){finish(error instanceof Error?error:new Error('Could not convert this motion to GIF.'));}
      },60);
      video.addEventListener('ended',onEnded,{once:true});
      video.play().catch(()=>finish(new Error('Apple Music motion could not start for GIF export.')));
    });
    if(frames<2)throw new Error('Not enough frames were available to make a GIF.');
    gif.finish();const bytes=gif.bytes();
    if(bytes.length<14||String.fromCharCode(...bytes.slice(0,6))!=='GIF89a'||bytes[bytes.length-1]!==0x3b)throw new Error('The browser produced an invalid GIF file.');
    if(bytes.length>30*1024*1024)throw new Error('This GIF is larger than 30 MB. Choose a shorter or smaller motion.');
    onProgress?.(.96,'Checking file');const blob=new Blob([bytes],{type:'image/gif'});
    const details={width,height,bytes:blob.size,mime:'image/gif',extension:'.gif'};saveBlob(blob,`${baseName}-motion${details.extension}`);onProgress?.(1,'Saved');return details;
  }finally{video.pause();detach?.();video.remove();}
}

export async function downloadMotionRecording(motion:MotionArtwork,baseName:string,format:MotionExportFormat='mp4',onProgress?:MotionExportProgress):Promise<DownloadDetails>{
  const url=motion.url;
  let parsed:URL;try{parsed=new URL(url);}catch{throw new Error('Invalid Apple Music motion URL.');}
  if(parsed.protocol!=='https:'||parsed.hostname!=='mvod.itunes.apple.com'||!parsed.pathname.endsWith('.m3u8'))throw new Error('This is not an Apple Music motion stream.');
  if(!canExportMotion(format))throw new Error(`${format.toUpperCase()} export is not supported by this browser.`);
  if(format==='gif')return downloadMotionGif(url,baseName,onProgress);
  const video=createMotionVideo();
  let detach:(()=>void)|undefined,recorder:MediaRecorder|undefined,timer=0;
  try{
    onProgress?.(.03,'Opening stream');detach=await attachAppleMotionPlayback(video,url,'best');await waitForVideoData(video);
    const recorderVideo=video as HTMLVideoElement&{captureStream?:()=>MediaStream;mozCaptureStream?:()=>MediaStream};
    const capture=recorderVideo.captureStream?.()||recorderVideo.mozCaptureStream?.();
    if(!capture)throw new Error('This browser cannot export motion from its video player.');
    const mime=videoMime(format);if(!mime)throw new Error(`This browser does not offer a supported ${format.toUpperCase()} video encoder.`);
    const chunks:BlobPart[]=[],output=new Promise<Blob>((resolve,reject)=>{
      try{recorder=new MediaRecorder(capture,{mimeType:mime,videoBitsPerSecond:8_000_000});}catch{reject(new Error('The browser could not start its motion encoder.'));return;}
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onerror=()=>reject(new Error('The browser motion recording failed.'));
      recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder?.mimeType||mime}));
    });
    let stopping=false,timedOut=false;
    const stop=()=>{if(stopping)return;stopping=true;if(recorder?.state==='recording')recorder.stop();};
    video.addEventListener('timeupdate',()=>{if(Number.isFinite(video.duration)&&video.duration>0)onProgress?.(.1+.82*Math.min(1,video.currentTime/video.duration),'Recording');});
    video.addEventListener('ended',stop,{once:true});
    // Keep one finalized recording so MP4 metadata and seek tables remain intact.
    recorder!.start();onProgress?.(.1,'Recording');await video.play();
    timer=window.setTimeout(()=>{timedOut=true;stop();},45_000);
    const blob=await output;
    if(timedOut&&!video.ended)throw new Error('The Apple Music motion stream exceeded the 45-second export limit; no partial video was saved.');
    if(!blob.size||blob.size>50*1024*1024)throw new Error(blob.size?'Motion export exceeds the 50 MB limit.':'The motion export was empty.');
    const actualMime=(recorder!.mimeType||mime).split(';')[0].toLowerCase();
    const extension=actualMime==='video/mp4'?'.mp4':actualMime==='video/webm'?'.webm':'';
    if(!extension||actualMime!==`video/${format}`)throw new Error(`Unsupported motion export format (${actualMime}).`);
    const details={width:video.videoWidth,height:video.videoHeight,bytes:blob.size,mime:actualMime,extension};
    if(!details.width||!details.height)throw new Error('The motion export has no measurable video dimensions.');
    onProgress?.(.94,'Finalizing file');onProgress?.(.97,'Checking file');
    await verifyMotionBlob(blob,details.width,details.height);
    saveBlob(blob,`${baseName}-motion${extension}`);onProgress?.(1,'Saved');return details;
  }finally{
    window.clearTimeout(timer);if(recorder?.state==='recording')recorder.stop();video.pause();detach?.();video.remove();
  }
}

export { formatBytes };
