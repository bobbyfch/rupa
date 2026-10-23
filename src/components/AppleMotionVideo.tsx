import { useEffect, useRef, useState } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { attachAppleMotionPlayback } from '../lib/musicDownloads';

function timeLabel(seconds:number){if(!Number.isFinite(seconds)||seconds<0)return '0:00';const value=Math.floor(seconds);return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;}

export function AppleMotionVideo({url,title,active,loop=true,controls=false,onClose,onError}:{url:string;title:string;active:boolean;loop?:boolean;controls?:boolean;onClose?:()=>void;onError?:()=>void}){
  const ref=useRef<HTMLVideoElement>(null),[state,setState]=useState<'idle'|'loading'|'ready'|'playing'|'failed'>('idle'),[currentTime,setCurrentTime]=useState(0),[duration,setDuration]=useState(0);
  useEffect(()=>{
    const video=ref.current;if(!video||!active){setState('idle');return;}
    let cancelled=false,detach:(()=>void)|undefined;
    setState('loading');
    video.muted=true;video.loop=loop;video.controls=false;
    const updateTime=()=>setCurrentTime(video.currentTime||0),updateDuration=()=>setDuration(Number.isFinite(video.duration)?video.duration:0),onPlaying=()=>setState('playing'),onPaused=()=>{if(!video.ended)setState('ready');},onEnded=()=>setState('ready');
    video.addEventListener('timeupdate',updateTime);video.addEventListener('durationchange',updateDuration);video.addEventListener('playing',onPlaying);video.addEventListener('pause',onPaused);video.addEventListener('ended',onEnded);
    attachAppleMotionPlayback(video,url).then(async cleanup=>{
      detach=cleanup;if(cancelled){cleanup();return;}
      updateDuration();
      try{await video.play();if(!cancelled)setState('playing');}
      catch{if(!cancelled){if(controls)setState('ready');else{setState('failed');onError?.();}}}
    }).catch(()=>{if(!cancelled){setState('failed');onError?.();}});
    return()=>{cancelled=true;video.removeEventListener('timeupdate',updateTime);video.removeEventListener('durationchange',updateDuration);video.removeEventListener('playing',onPlaying);video.removeEventListener('pause',onPaused);video.removeEventListener('ended',onEnded);video.pause();detach?.();};
  },[active,controls,loop,onError,url]);
  async function togglePlayback(){const video=ref.current;if(!video)return;if(video.paused){try{await video.play();setState('playing');}catch{setState('ready');}}else{video.pause();setState('ready');}}
  function seek(value:string){const video=ref.current;if(!video||!Number.isFinite(video.duration))return;video.currentTime=Number(value);setCurrentTime(video.currentTime);}
  return <div className={`apple-motion-player${state==='failed'?' is-failed':''}`} data-motion-state={state}>
    <video ref={ref} className="apple-motion-video" aria-label={`${title} animated album cover`} playsInline muted loop={loop} preload={active?'auto':'none'}/>
    {controls&&<div className="apple-motion-controls" aria-label="Animated artwork controls">
      <button type="button" className="apple-motion-play" onClick={()=>void togglePlayback()} aria-label={state==='playing'?'Pause motion':'Play motion'} disabled={state==='loading'||state==='failed'}>{state==='playing'?<Pause size={16} fill="currentColor"/>:<Play size={16} fill="currentColor"/>}</button>
      <span className="apple-motion-time">{timeLabel(currentTime)}</span>
      <input type="range" min="0" max={duration||0} step="0.05" value={Math.min(currentTime,duration||currentTime)} onChange={event=>seek(event.target.value)} aria-label="Seek animated artwork" disabled={!duration||state==='loading'||state==='failed'}/>
      <span className="apple-motion-time">{duration?timeLabel(duration):'—:—'}</span>
      {onClose&&<button type="button" className="apple-motion-close" onClick={onClose} aria-label="Close motion preview"><X size={16}/></button>}
    </div>}
    {controls&&(state==='loading'||state==='failed')&&<span className="apple-motion-error" role="status">{state==='loading'?'Loading motion preview…':'Motion preview unavailable in this browser.'}</span>}
  </div>;
}
