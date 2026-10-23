import { jikanMangaSeriesGallery, mangaDexSeriesDetail, openLibraryMangaSeriesGallery } from './expanded-sources.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':status===200?'public, max-age=300':'no-store','access-control-allow-origin':'*','x-content-type-options':'nosniff'}});

export async function onRequestGet({request}){
  const url=new URL(request.url),id=(url.searchParams.get('id')||'').slice(0,80),title=(url.searchParams.get('title')||'').slice(0,180),malId=(url.searchParams.get('malId')||'').slice(0,12);
  if(!id&&!title.trim())return json({error:'A manga series ID or title is required.'},400);
  if(malId&&!/^\d{1,10}$/.test(malId))return json({error:'Invalid MyAnimeList ID.'},400);
  try{
    let primary=null,primaryError=null,openLibraryError=null,jikanError=null;
    try{
      primary=await mangaDexSeriesDetail({id,title,signal:request.signal});
      if(primary.volumes.length)return json(primary);
    }catch(error){primaryError=error;}
    try{
      const fallback=await openLibraryMangaSeriesGallery({title:primary?.title||title,signal:request.signal});
      if(fallback){
        return json({...fallback,id:primary?.id||fallback.id,title:primary?.title||fallback.title,description:primary?.description||fallback.description,year:primary?.year||fallback.year,status:primary?.status||fallback.status,lastVolume:primary?.lastVolume||fallback.lastVolume,authors:primary?.authors?.length?primary.authors:fallback.authors,sourceUrl:fallback.sourceUrl,source:fallback.source,detailNote:fallback.detailNote});
      }
    }catch(error){openLibraryError=error;}
    try{
      const fallback=await jikanMangaSeriesGallery({title:primary?.title||title,malId,signal:request.signal});
      if(fallback)return json({...fallback,id:primary?.id||fallback.id,description:primary?.description||fallback.description,year:primary?.year||fallback.year,status:primary?.status||fallback.status,lastVolume:primary?.lastVolume||fallback.lastVolume,authors:primary?.authors?.length?primary.authors:fallback.authors});
    }catch(error){jikanError=error;}
    if(primary){
      return json({...primary,detailNote:openLibraryError||jikanError?'No numbered cover records were found. Open Library or Jikan could not load related artwork; the selected series cover is still available.':'No numbered cover records were found on MangaDex or Open Library. The selected series cover is still available.'});
    }
    const reason=primaryError instanceof Error?primaryError.message:'MangaDex is unavailable.';
    const libraryReason=openLibraryError instanceof Error?openLibraryError.message:'No numbered cover records were returned.';
    const jikanReason=jikanError instanceof Error?jikanError.message:'No related cover images were returned.';
    throw new Error(`MangaDex failed: ${reason} Open Library fallback: ${libraryReason} Jikan fallback: ${jikanReason}`);
  }catch(error){
    if(request.signal.aborted)return json({error:'Request cancelled.'},499);
    const rawMessage=error instanceof Error?error.message:'Manga details are temporarily unavailable.';
    const networkFailure=error instanceof TypeError||/fetch failed|network|timed out|timeout|could not be reached|HTTP 5\d\d/i.test(rawMessage);
    const message=networkFailure?'MangaDex, Open Library, and Jikan could not load manga artwork. Check the connection and try again.':rawMessage;
    const status=/not found|matching series/i.test(message)?404:/invalid|enter a manga/i.test(message)?400:/HTTP 429/.test(message)?429:networkFailure?503:502;
    return json({error:message},status);
  }
}
