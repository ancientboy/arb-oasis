import { ENDPOINTS } from './config.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

async function getJson(url, timeoutMs = 9000){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

export async function loadContractUniverse(){
  const [bn, bg, gt] = await Promise.all([
    getJson(ENDPOINTS.binance.contracts),
    getJson(ENDPOINTS.bitget.contracts),
    getJson(ENDPOINTS.gate.contracts)
  ]);
  const meta = { binance:new Map(), bitget:new Map(), gate:new Map() };
  for(const s of bn.symbols || []){
    if(s.contractType !== 'PERPETUAL' || s.status !== 'TRADING' || s.quoteAsset !== 'USDT') continue;
    meta.binance.set(s.symbol, { symbol:s.symbol, base:s.baseAsset, quote:s.quoteAsset, takerFeeBps:null, multiplier:1 });
  }
  for(const s of bg.data || []){
    if(s.symbolType !== 'perpetual' || s.symbolStatus !== 'normal' || String(s.quoteCoin).toUpperCase() !== 'USDT') continue;
    meta.bitget.set(s.symbol, {
      symbol:s.symbol, base:s.baseCoin, quote:s.quoteCoin,
      takerFeeBps:num(s.takerFeeRate) * 10000 || null,
      makerFeeBps:num(s.makerFeeRate) * 10000 || null,
      fundingIntervalHours: parseFundingHours(s.fundInterval), multiplier:1
    });
  }
  for(const s of gt || []){
    if(s.status !== 'trading' || s.in_delisting || !String(s.name).endsWith('_USDT')) continue;
    const symbol = String(s.name).replace('_','');
    meta.gate.set(symbol, {
      symbol, gateSymbol:s.name, base:symbol.slice(0,-4), quote:'USDT',
      takerFeeBps:num(s.taker_fee_rate) * 10000 || null,
      makerFeeBps:num(s.maker_fee_rate) * 10000 || null,
      fundingIntervalHours:num(s.funding_interval) ? num(s.funding_interval)/3600 : null,
      multiplier:num(s.quanto_multiplier) || 1,
      contractType:s.contract_type || 'crypto'
    });
  }
  const common = [...meta.binance.keys()].filter(s => meta.bitget.has(s) && meta.gate.has(s)).sort();
  return { common, meta };
}

function parseFundingHours(v){
  if(v == null) return null;
  const n = Number(v); if(Number.isFinite(n) && n > 0) return n;
  const m = String(v).match(/(\d+)/); return m ? Number(m[1]) : null;
}

export async function pollMarket(meta){
  const started = Date.now();
  const [bnBbo, bnPrem, bg, gt] = await Promise.all([
    getJson(ENDPOINTS.binance.bbo),
    getJson(ENDPOINTS.binance.premium),
    getJson(ENDPOINTS.bitget.tickers),
    getJson(ENDPOINTS.gate.tickers)
  ]);
  const out = { binance:new Map(), bitget:new Map(), gate:new Map(), fetchedAt:Date.now(), latencyMs:Date.now()-started };
  const prem = new Map((bnPrem || []).map(x => [x.symbol,x]));
  for(const x of bnBbo || []){
    if(!meta.binance.has(x.symbol)) continue;
    const p = prem.get(x.symbol) || {};
    out.binance.set(x.symbol, quote({
      venue:'binance', symbol:x.symbol, bid:x.bidPrice, ask:x.askPrice, bidQty:x.bidQty, askQty:x.askQty,
      last:0, mark:p.markPrice, index:p.indexPrice, funding:p.lastFundingRate, openInterest:0,
      volumeQuote:0, ts:x.time || p.time || Date.now()
    }));
  }
  for(const x of bg.data || []){
    if(!meta.bitget.has(x.symbol)) continue;
    out.bitget.set(x.symbol, quote({
      venue:'bitget', symbol:x.symbol, bid:x.bidPr, ask:x.askPr, bidQty:x.bidSz, askQty:x.askSz,
      last:x.lastPr, mark:x.markPrice, index:x.indexPrice, funding:x.fundingRate,
      openInterest:x.holdingAmount, volumeQuote:x.usdtVolume || x.quoteVolume, ts:x.ts || Date.now()
    }));
  }
  for(const x of gt || []){
    const symbol = String(x.contract || '').replace('_','');
    const m = meta.gate.get(symbol); if(!m) continue;
    const mult = m.multiplier || 1;
    out.gate.set(symbol, quote({
      venue:'gate', symbol, bid:x.highest_bid, ask:x.lowest_ask,
      bidQty:num(x.highest_size) * mult, askQty:num(x.lowest_size) * mult,
      last:x.last, mark:x.mark_price, index:x.index_price, funding:x.funding_rate,
      openInterest:num(x.total_size) * mult, volumeQuote:x.volume_24h_quote || x.volume_24h_usd,
      ts:Date.now()
    }));
  }
  return out;
}

function quote(x){
  return {
    venue:x.venue, symbol:x.symbol,
    bid:num(x.bid), ask:num(x.ask), bidQty:num(x.bidQty), askQty:num(x.askQty),
    last:num(x.last), mark:num(x.mark), index:num(x.index), funding:num(x.funding),
    openInterest:num(x.openInterest), volumeQuote:num(x.volumeQuote), ts:num(x.ts) || Date.now()
  };
}
