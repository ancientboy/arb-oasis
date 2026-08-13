import { WS } from './config.js';
import { num, quote } from './exchanges.js';

const CHUNK = 45;

export class RealtimeFeeds {
  constructor({ universe, meta, market, onUpdate, onStatus }){
    this.universe = universe.map(x=>typeof x==='string'?x:x.symbol);
    this.meta = meta;
    this.market = market;
    this.onUpdate = onUpdate || (()=>{});
    this.onStatus = onStatus || (()=>{});
    this.sockets = [];
    this.closed = false;
    this.retries = { binance:0, bitget:0, gate:0 };
    this.status = { binance:'connecting', bitget:'connecting', gate:'connecting' };
  }

  start(){ this.stop(false); this.closed=false; this.connectBinance(); this.connectBitget(); this.connectGate(); return this; }
  stop(markClosed=true){ if(markClosed)this.closed=true; for(const s of this.sockets){try{s.close();}catch{}} this.sockets=[]; }
  setStatus(venue,value,detail=''){this.status[venue]=value;this.onStatus(venue,value,detail);}
  track(ws,venue,reconnect){
    this.sockets.push(ws);
    ws.addEventListener('open',()=>{this.retries[venue]=0;this.setStatus(venue,'live');});
    ws.addEventListener('error',()=>this.setStatus(venue,'error'));
    ws.addEventListener('close',()=>{const attempt=Math.min(6,(this.retries[venue]||0)+1);this.retries[venue]=attempt;const delay=Math.min(30000,1200*2**attempt)+Math.random()*600;this.setStatus(venue,'reconnecting','retry '+attempt+' · '+Math.round(delay/1000)+'s');if(!this.closed)setTimeout(reconnect,delay);});
  }

  connectBinance(){
    const openBook=()=>{ if(this.closed)return; const ws=new WebSocket(WS.binanceBook); this.track(ws,'binance',openBook); ws.onmessage=(ev)=>{try{const x=JSON.parse(ev.data);if(!this.meta.binance.has(x.s))return;this.merge('binance',x.s,{bid:x.b,ask:x.a,bidQty:x.B,askQty:x.A,ts:x.E||Date.now(),source:'WS'});}catch{}};};
    const openMark=()=>{ if(this.closed)return; const ws=new WebSocket(WS.binanceMark); this.track(ws,'binance',openMark); ws.onmessage=(ev)=>{try{const arr=JSON.parse(ev.data);for(const x of Array.isArray(arr)?arr:[arr]){if(!this.meta.binance.has(x.s))continue;this.merge('binance',x.s,{mark:x.p,index:x.i,funding:x.r,nextFundingTime:x.T,ts:x.E||Date.now(),source:'WS'});}}catch{}};};
    openBook(); openMark();
  }

  connectBitget(){
    const available=this.universe.filter(s=>this.meta.bitget.has(s));
    chunks(available,CHUNK).forEach((symbols)=>{
      const connect=()=>{ if(this.closed)return; const ws=new WebSocket(WS.bitget); this.track(ws,'bitget',connect);
        ws.onopen=()=>{this.retries.bitget=0;this.setStatus('bitget','live');ws.send(JSON.stringify({op:'subscribe',args:symbols.map(symbol=>({instType:'USDT-FUTURES',channel:'ticker',instId:symbol}))}));ws._ping=setInterval(()=>{if(ws.readyState===1)ws.send('ping');},25000);};
        ws.addEventListener('close',()=>clearInterval(ws._ping));
        ws.onmessage=(ev)=>{if(ev.data==='pong')return;try{const msg=JSON.parse(ev.data);const symbol=msg.arg?.instId;if(!symbol||!this.meta.bitget.has(symbol))return;for(const x of msg.data||[])this.merge('bitget',symbol,{bid:x.bidPr||x.bid1Price,ask:x.askPr||x.ask1Price,bidQty:x.bidSz||x.bid1Size,askQty:x.askSz||x.ask1Size,last:x.lastPr||x.lastPrice,mark:x.markPrice,index:x.indexPrice,funding:x.fundingRate,nextFundingTime:x.nextFundingTime,openInterest:x.holdingAmount||x.openInterest,volumeQuote:x.usdtVolume||x.turnover24h,ts:x.ts||Date.now(),source:'WS'});}catch{}};
      }; connect();
    });
  }

  connectGate(){
    const available=this.universe.filter(s=>this.meta.gate.has(s)).map(s=>this.meta.gate.get(s)?.gateSymbol).filter(Boolean);
    chunks(available,80).forEach((contracts)=>{
      const connect=()=>{ if(this.closed)return; const ws=new WebSocket(WS.gate); this.track(ws,'gate',connect);
        ws.onopen=()=>{this.setStatus('gate','live');const time=Math.floor(Date.now()/1000);ws.send(JSON.stringify({time,channel:'futures.book_ticker',event:'subscribe',payload:contracts}));ws.send(JSON.stringify({time,channel:'futures.tickers',event:'subscribe',payload:contracts}));};
        ws.onmessage=(ev)=>{try{const msg=JSON.parse(ev.data);if(msg.event!=='update')return;if(msg.channel==='futures.book_ticker'){const x=msg.result||{};const symbol=String(x.s||'').replace('_','');if(!this.meta.gate.has(symbol))return;const m=this.meta.gate.get(symbol);const mult=m?.multiplier||1;this.merge('gate',symbol,{bid:x.b,ask:x.a,bidQty:num(x.B)*mult,askQty:num(x.A)*mult,ts:x.t||msg.time_ms||Date.now(),source:'WS'});}if(msg.channel==='futures.tickers'){for(const x of Array.isArray(msg.result)?msg.result:[msg.result]){const symbol=String(x?.contract||'').replace('_','');if(!this.meta.gate.has(symbol))continue;const m=this.meta.gate.get(symbol);const mult=m?.multiplier||1;this.merge('gate',symbol,{last:x.last,mark:x.mark_price,index:x.index_price,funding:x.funding_rate,fundingIndicative:x.funding_rate_indicative,openInterest:num(x.total_size)*mult,volumeQuote:x.volume_24h_quote||x.volume_24h_usd,ts:msg.time_ms||Date.now(),source:'WS'});}}}catch{}};
      }; connect();
    });
  }

  merge(venue,symbol,patch){
    const map=this.market?.[venue]; if(!map)return; const prev=map.get(symbol)||quote({venue,symbol}); const next={...prev};
    for(const [k,v] of Object.entries(patch)){if(k==='source'){next[k]=v;continue;}const n=Number(v);if(Number.isFinite(n)&&(n!==0||!['bid','ask','bidQty','askQty'].includes(k)))next[k]=n;}
    next.missingFields=(next.missingFields||[]).filter(key=>!(key in patch&&patch[key]!==undefined&&patch[key]!==null&&patch[key]!==''));
    next.ts=Number(patch.ts)||Date.now();next.source='WS';map.set(symbol,next);this.onUpdate(venue,symbol,next);
  }
}

function chunks(arr,size){const out=[];for(let i=0;i<arr.length;i+=size)out.push(arr.slice(i,i+size));return out;}
