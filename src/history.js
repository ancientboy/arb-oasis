const KEY='arb-oasis-v1-history';
const FUNDING_KEY='arb-oasis-v1-funding-stats';
const TRADE_KEY='arb-oasis-paper-closed';

export class ResearchHistory {
  constructor({maxSamples=720,topN=40}={}){
    this.maxSamples=maxSamples; this.topN=topN;
    this.samples=safeParse(localStorage.getItem(KEY),[]);
    this.lastRecorded=0;
  }

  record(opportunities, minGapMs=5000){
    const now=Date.now(); if(now-this.lastRecorded<minGapMs) return false;
    this.lastRecorded=now;
    const top=opportunities.filter(x=>x.eligible).slice(0,this.topN).map(x=>({
      id:x.id,symbol:x.symbol,assetClass:x.assetClass,longVenue:x.longVenue,shortVenue:x.shortVenue,
      spreadBps:round(x.spreadBps),fundingBps:round(x.fundingHorizonBps),netEdgeBps:round(x.netEdgeBps),
      capacity:Math.round(x.capacity),score:x.score
    }));
    this.samples.push({t:now,top});
    if(this.samples.length>this.maxSamples)this.samples=this.samples.slice(-this.maxSamples);
    localStorage.setItem(KEY,JSON.stringify(this.samples)); return true;
  }

  clear(){this.samples=[];localStorage.removeItem(KEY);}

  stats(current=[]){
    const map=new Map();
    for(const sample of this.samples){
      for(const x of sample.top){
        const s=map.get(x.id)||{...x,count:0,sum:0,max:-Infinity,last:0};
        s.count++; s.sum+=x.netEdgeBps; s.max=Math.max(s.max,x.netEdgeBps); s.last=sample.t; map.set(x.id,s);
      }
    }
    const total=Math.max(1,this.samples.length);
    const currentMap=new Map(current.map(x=>[x.id,x]));
    return [...map.values()].map(s=>({
      ...s,avg:s.sum/s.count,persistence:s.count/total,current:currentMap.get(s.id)?.netEdgeBps ?? null
    })).sort((a,b)=>(b.persistence*100+b.avg)-(a.persistence*100+a.avg));
  }
}

export class FundingStats {
  constructor(){
    this.data=safeParse(localStorage.getItem(FUNDING_KEY),{});
    this.lastRecorded=0;
  }

  observe(opportunities,minGapMs=60000){
    const now=Date.now(); if(now-this.lastRecorded<minGapMs)return false;
    this.lastRecorded=now;
    for(const x of opportunities){
      if(!Number.isFinite(x.fundingHourlyBps))continue;
      const prev=this.data[x.id] || {count:0,mean:0,m2:0,min:null,max:null,positive:0,negative:0,reversals:0,lastSign:0,last:0,samples:[]};
      const value=round4(x.fundingHourlyBps); const count=prev.count+1;
      const delta=value-prev.mean; const mean=prev.mean+delta/count; const m2=prev.m2+delta*(value-mean);
      const sign=value>0?1:value<0?-1:0;
      if(sign>0)prev.positive++; if(sign<0)prev.negative++;
      if(prev.lastSign && sign && prev.lastSign!==sign)prev.reversals++;
      prev.count=count; prev.mean=mean; prev.m2=m2; prev.min=prev.min==null?value:Math.min(prev.min,value); prev.max=prev.max==null?value:Math.max(prev.max,value);
      prev.lastSign=sign||prev.lastSign; prev.last=value; prev.lastTs=now; prev.symbol=x.symbol; prev.assetClass=x.assetClass; prev.longVenue=x.longVenue; prev.shortVenue=x.shortVenue;
      prev.samples=[...(prev.samples||[]),value].slice(-48);
      this.data[x.id]=prev;
    }
    this.prune(now); localStorage.setItem(FUNDING_KEY,JSON.stringify(this.data)); return true;
  }

  get(id){
    const s=this.data[id]; if(!s)return null;
    const n=s.count||0; const variance=n>1?s.m2/(n-1):0; const samples=[...(s.samples||[])].sort((a,b)=>a-b);
    const p90=quantile(samples,.9); const p10=quantile(samples,.1);
    return {
      count:n,avgHourlyBps:s.mean||0,stdHourlyBps:Math.sqrt(Math.max(0,variance)),p90HourlyBps:p90,p10HourlyBps:p10,
      positiveRate:n?(s.positive||0)/n:0,negativeRate:n?(s.negative||0)/n:0,reversals:s.reversals||0,
      annualizedPct:(s.mean||0)*24*365/100,lastHourlyBps:s.last||0,minHourlyBps:s.min??0,maxHourlyBps:s.max??0,lastTs:s.lastTs||0
    };
  }

  leaders(opportunities,limit=12){
    const current=new Map(opportunities.map(x=>[x.id,x]));
    return Object.keys(this.data).map(id=>{
      const stat=this.get(id); const x=current.get(id); const raw=this.data[id];
      return {id,stat,current:x,symbol:x?.symbol||raw.symbol,assetClass:x?.assetClass||raw.assetClass,longVenue:x?.longVenue||raw.longVenue,shortVenue:x?.shortVenue||raw.shortVenue};
    }).filter(x=>x.stat?.count>=2).sort((a,b)=>Math.abs(b.stat.annualizedPct)-Math.abs(a.stat.annualizedPct)).slice(0,limit);
  }

  clear(){this.data={};localStorage.removeItem(FUNDING_KEY);}
  prune(){
    const entries=Object.entries(this.data); if(entries.length<=3500)return;
    entries.sort((a,b)=>(b[1].lastTs||0)-(a[1].lastTs||0)); this.data=Object.fromEntries(entries.slice(0,3000));
  }
}

export function loadClosedTrades(){return safeParse(localStorage.getItem(TRADE_KEY),[]);}
export function saveClosedTrade(t){const a=loadClosedTrades();a.unshift(t);localStorage.setItem(TRADE_KEY,JSON.stringify(a.slice(0,300)));}
export function clearClosedTrades(){localStorage.removeItem(TRADE_KEY);}
export function paperSummary(){
  const a=loadClosedTrades(); const pnl=a.reduce((s,x)=>s+(x.net||0),0); const wins=a.filter(x=>(x.net||0)>0).length;
  const hold=a.length?a.reduce((s,x)=>s+(x.closedAt-x.openedAt),0)/a.length/60000:0;
  return {count:a.length,pnl,winRate:a.length?wins/a.length:0,avgHoldMin:hold};
}

function safeParse(v,fallback){try{return v?JSON.parse(v):fallback}catch{return fallback}}
function round(v){return Math.round((Number(v)||0)*1000)/1000}
function round4(v){return Math.round((Number(v)||0)*10000)/10000}
function quantile(a,q){if(!a.length)return 0;const p=(a.length-1)*q;const b=Math.floor(p),r=p-b;return a[b+1]!==undefined?a[b]+r*(a[b+1]-a[b]):a[b];}
