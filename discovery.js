// This registry belongs to the same GitHub repository as the fixed web entry.
export const registryUrl='https://raw.githubusercontent.com/alen9966/codex-mobile-console/main/connection.json';
export function validEndpoint(value){
 try{const u=new URL(value);return u.protocol==='https:'&&/^[a-z0-9-]+\.trycloudflare\.com$/.test(u.hostname)&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'?u.origin:null;}catch{return null;}
}
export class Discovery {
 constructor({fetch:request=globalThis.fetch,endpoint='',updatedAt='',onChange=()=>{}}={}){this.fetch=request;this.endpoint=endpoint;this.updatedAt=updatedAt;this.onChange=onChange;this.lastCheck=0;this.pending=null;}
 async refresh(force=false){
  if(this.pending)return this.pending;
  if(!force&&Date.now()-this.lastCheck<30000)return false;
  this.lastCheck=Date.now();
  this.pending=this.resolve().finally(()=>{this.pending=null;});
  return this.pending;
 }
 async resolve(){
  let record;
  // Neither GitHub request carries the desktop bearer token or pairing code.
  for(const source of [registryUrl,'connection.json']){
   try{const r=await this.fetch(source+'?v='+Date.now(),{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(8000)});if(!r.ok)continue;record=await r.json();if(validEndpoint(record.endpoint))break;record=null;}catch{}
  }
  if(!record)return false;
  const next=validEndpoint(record.endpoint),date=Date.parse(record.updatedAt),previous=Date.parse(this.updatedAt);
  if(!next||(Number.isFinite(previous)&&(!Number.isFinite(date)||date<previous)))return false;
  if(next===this.endpoint){
   if(Number.isFinite(date)&&(!Number.isFinite(previous)||date>previous)){this.updatedAt=record.updatedAt;this.onChange(next,this.updatedAt);}
   return false;
  }
  // A cached or not-yet-ready address must not replace a working connection.
  try{const r=await this.fetch(next+'/health',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(6000)});if(!r.ok||(await r.json()).service!=='codex-mobile-connector')return false;}catch{return false;}
  this.endpoint=next;this.updatedAt=Number.isFinite(date)?record.updatedAt:'';
  this.onChange(next,this.updatedAt);return true;
 }
}
