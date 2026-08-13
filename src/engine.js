import { PAIRS, LABELS } from './config.js';

export function buildOpportunities(common, meta, market, settings){
  const rows = [];
  const now = Date.now();
  for(const symbol of common){
    for(const [a,b] of PAIRS){
      addDirection(rows, symbol, a, b, meta, market, settings, now);
      addDirection(rows, symbol, b, a, meta, market, settings, now);
    }
  }
  return rows.sort((x,y) => y.netEdgeBps - x.netEdgeBps);
}

function addDirection(rows, symbol, longVenue, shortVenue, meta, market, settings, now){
  const l = market[longVenue]?.get(symbol); const s = market[shortVenue]?.get(symbol);
  if(!l || !s || l.ask <= 0 || s.bid <= 0) return;
  const mid = (l.ask + s.bid) / 2;
  const spreadBps = ((s.bid - l.ask) / mid) * 10000;
  const fundingBps = (s.funding - l.funding) * 10000;
  const lFee = feeBps(meta[longVenue].get(symbol), settings.feesBps[longVenue]);
  const sFee = feeBps(meta[shortVenue].get(symbol), settings.feesBps[shortVenue]);
  const roundTripFeesBps = 2 * (lFee + sFee);
  const totalCostBps = roundTripFeesBps + settings.riskBufferBps;
  const netEdgeBps = spreadBps + fundingBps - totalCostBps;
  const capacity = Math.min(l.ask * l.askQty, s.bid * s.bidQty);
  const markDev = Math.max(markDeviation(l), markDeviation(s));
  const age = Math.max(now - l.ts, now - s.ts);
  const reasons = [];
  if(age > settings.staleMs) reasons.push('数据过期');
  if(capacity < settings.minCapacityUsdt) reasons.push('BBO容量低');
  if(markDev > settings.maxMarkDevBps) reasons.push('Mark偏离');
  const eligible = reasons.length === 0;
  rows.push({
    id:`${symbol}:${longVenue}:${shortVenue}`, symbol, longVenue, shortVenue,
    longLabel:LABELS[longVenue], shortLabel:LABELS[shortVenue],
    longAsk:l.ask, shortBid:s.bid, longFunding:l.funding, shortFunding:s.funding,
    spreadBps, fundingBps, roundTripFeesBps, riskBufferBps:settings.riskBufferBps,
    totalCostBps, netEdgeBps, capacity, markDevBps:markDev, ageMs:age, eligible, reasons,
    score:score({netEdgeBps,capacity,markDev,age,eligible},settings)
  });
}

function feeBps(meta, fallback){ return Number.isFinite(meta?.takerFeeBps) && meta.takerFeeBps > 0 ? meta.takerFeeBps : fallback; }
function markDeviation(q){ if(!q.mark || !q.index) return 0; return Math.abs(q.mark-q.index)/q.index*10000; }
function score(x,s){
  let v=50 + Math.max(-30,Math.min(35,x.netEdgeBps*2));
  v += Math.min(10,Math.log10(Math.max(1,x.capacity))*2);
  v -= Math.min(20,x.markDev/2); if(x.age>s.staleMs) v-=25; if(!x.eligible) v-=15;
  return Math.max(0,Math.min(100,Math.round(v)));
}

export function exitPnl(position, market, feesBps){
  const l = market[position.longVenue]?.get(position.symbol);
  const s = market[position.shortVenue]?.get(position.symbol);
  if(!l || !s || !l.bid || !s.ask) return null;
  const longPct = (l.bid - position.longAsk) / position.longAsk;
  const shortPct = (position.shortBid - s.ask) / position.shortBid;
  const gross = position.notional * (longPct + shortPct);
  const exitFees = position.notional * 2 * ((feesBps[position.longVenue]+feesBps[position.shortVenue]) / 10000);
  return { gross, exitFees, net:gross - position.entryFees - exitFees, longExit:l.bid, shortExit:s.ask };
}
