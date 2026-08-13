import { DEFAULTS, LABELS, VENUES } from './config.js';
import { loadContractUniverse, pollMarket } from './exchanges.js';
import { buildOpportunities, exitPnl } from './engine.js';

const $ = (s) => document.querySelector(s);
const els = {
  commonCount:$('#commonCount'), universeNote:$('#universeNote'), bestEdge:$('#bestEdge'), bestEdgeSymbol:$('#bestEdgeSymbol'), eligibleCount:$('#eligibleCount'), venueHealth:$('#venueHealth'), connectionPill:$('#connectionPill'),
  body:$('#opportunityBody'), lastUpdate:$('#lastUpdate'), visibleCount:$('#visibleCount'), search:$('#searchInput'), minEdge:$('#minEdgeInput'), minCapacity:$('#minCapacityInput'), riskBuffer:$('#riskBufferInput'), maxMarkDev:$('#maxMarkDevInput'),
  bnFee:$('#binanceFeeInput'), bgFee:$('#bitgetFeeInput'), gtFee:$('#gateFeeInput'), scope:$('#scopeSegment'), refresh:$('#refreshMarketsBtn'), paperNotional:$('#paperNotional'), paperPositions:$('#paperPositions'), clearPaper:$('#clearPaperBtn'), events:$('#systemEvents')
};

const state = {
  common:[], meta:null, market:null, opportunities:[], scope:'all', busy:false,
  venueStatus:Object.fromEntries(VENUES.map(v=>[v,{ok:false,last:0,error:''}])),
  paper:JSON.parse(localStorage.getItem('arb-oasis-paper') || '[]'), events:[]
};

function settings(){ return {
  ...DEFAULTS,
  minEdgeBps:num(els.minEdge.value), minCapacityUsdt:num(els.minCapacity.value), riskBufferBps:num(els.riskBuffer.value), maxMarkDevBps:num(els.maxMarkDev.value),
  feesBps:{binance:num(els.bnFee.value),bitget:num(els.bgFee.value),gate:num(els.gtFee.value)}
}; }
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function f(v,d=2){return Number.isFinite(v)?v.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}):'—'}
function bp(v){return `${v>=0?'+':''}${f(v,2)}`}
function money(v){if(!Number.isFinite(v))return '—'; if(v>=1e6)return `$${f(v/1e6,2)}m`; if(v>=1e3)return `$${f(v/1e3,1)}k`; return `$${f(v,0)}`}
function price(v){if(!v)return '—'; const d=v<1?6:v<100?4:2; return f(v,d)}

async function init(){
  bind(); renderPaper(); await refreshUniverse(); await tick(); setInterval(tick,DEFAULTS.pollMs); setInterval(refreshUniverse,DEFAULTS.metaRefreshMs);
}

function bind(){
  [els.search,els.minEdge,els.minCapacity,els.riskBuffer,els.maxMarkDev,els.bnFee,els.bgFee,els.gtFee].forEach(e=>e.addEventListener('input',rebuild));
  els.scope.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.scope=b.dataset.scope;[...els.scope.children].forEach(x=>x.classList.toggle('active',x===b));renderTable();});
  els.refresh.addEventListener('click',refreshUniverse);
  els.body.addEventListener('click',e=>{const b=e.target.closest('[data-paper]');if(b)openPaper(b.dataset.paper);});
  els.paperPositions.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b)closePaper(b.dataset.close);});
  els.clearPaper.addEventListener('click',()=>{state.paper=[];savePaper();renderPaper();});
}

async function refreshUniverse(){
  try{
    els.universeNote.textContent='正在同步三所合约状态…';
    const u=await loadContractUniverse(); state.common=u.common; state.meta=u.meta;
    els.commonCount.textContent=state.common.length.toLocaleString();
    els.universeNote.textContent=`Binance ${u.meta.binance.size} · Bitget ${u.meta.bitget.size} · Gate ${u.meta.gate.size} · 自动取交集`;
    pushEvent(`合约池刷新：${state.common.length} 个共同 USDT 永续`,'ok');
  }catch(err){pushEvent(`合约池读取失败：${err.message}`,'bad');els.universeNote.textContent='合约池读取失败，可稍后刷新';}
}

async function tick(){
  if(state.busy || !state.meta)return; state.busy=true;
  try{
    const m=await pollMarket(state.meta); state.market=m;
    for(const v of VENUES){state.venueStatus[v]={ok:m[v].size>0,last:Date.now(),error:''};}
    rebuild(); els.lastUpdate.textContent=`更新于 ${new Date().toLocaleTimeString()} · ${m.latencyMs}ms`;
  }catch(err){
    pushEvent(`行情轮询失败：${err.message}`,'bad');
    for(const v of VENUES) if(!state.market?.[v]?.size) state.venueStatus[v].error=err.message;
    renderHealth();
  }finally{state.busy=false;}
}

function rebuild(){
  if(!state.market||!state.meta)return;
  state.opportunities=buildOpportunities(state.common,state.meta,state.market,settings());
  const eligible=state.opportunities.filter(x=>x.eligible); els.eligibleCount.textContent=eligible.length.toLocaleString();
  const best=eligible[0]||state.opportunities[0];
  els.bestEdge.textContent=best?`${bp(best.netEdgeBps)} bp`:'—';
  els.bestEdgeSymbol.textContent=best?`${best.symbol} · Long ${best.longLabel} / Short ${best.shortLabel}`:'等待有效机会';
  renderHealth();renderTable();renderPaper();
}

function filtered(){
  const s=settings(); const q=els.search.value.trim().toUpperCase();
  return state.opportunities.filter(x=>{
    if(q&&!x.symbol.includes(q))return false;
    if(x.netEdgeBps<s.minEdgeBps)return false;
    if(state.scope==='liquid'&&x.capacity<s.minCapacityUsdt)return false;
    if(state.scope==='positive'&&x.netEdgeBps<=0)return false;
    return true;
  });
}

function renderTable(){
  const rows=filtered().slice(0,800); els.visibleCount.textContent=`${rows.length.toLocaleString()} 个方向`;
  if(!rows.length){els.body.innerHTML='<tr><td colspan="11" class="empty-cell">当前过滤条件下没有机会</td></tr>';return;}
  els.body.innerHTML=rows.map((x,i)=>`<tr class="${i===0?'best-row':''}">
    <td class="symbol-cell">${x.symbol}</td>
    <td><div class="venue-route"><span class="long">Long ${x.longLabel}</span> → <span class="short">Short ${x.shortLabel}</span></div></td>
    <td class="cap">${price(x.longAsk)}</td><td class="cap">${price(x.shortBid)}</td>
    <td class="cap ${x.spreadBps>0?'positive':'negative'}">${bp(x.spreadBps)}</td>
    <td class="cap ${x.fundingBps>0?'positive':'negative'}">${bp(x.fundingBps)}</td>
    <td class="cap muted">-${f(x.totalCostBps,2)}</td>
    <td class="cap ${x.netEdgeBps>0?'positive':'negative'}">${bp(x.netEdgeBps)}</td>
    <td class="cap">${money(x.capacity)}</td>
    <td>${riskHtml(x)}</td>
    <td><button class="paper-btn" data-paper="${x.id}" ${x.eligible?'':'disabled'}>Paper</button></td>
  </tr>`).join('');
}

function riskHtml(x){
  if(x.eligible)return `<span class="risk-pill risk-ok">OK · ${x.score}</span>`;
  const bad=x.reasons.includes('数据过期')||x.reasons.includes('Mark偏离');
  return `<span class="risk-pill ${bad?'risk-bad':'risk-warn'}" title="${x.reasons.join(' / ')}">${x.reasons[0]} · ${x.score}</span>`;
}

function renderHealth(){
  els.venueHealth.innerHTML=VENUES.map(v=>{const st=state.venueStatus[v];const age=st.last?Math.max(0,Date.now()-st.last):Infinity;const ok=st.ok&&age<DEFAULTS.staleMs;return `<span class="venue-chip ${ok?'status-ok':'status-bad'}"><span class="status-dot"></span>${LABELS[v]}</span>`}).join('');
  const healthy=VENUES.filter(v=>state.venueStatus[v].ok && Date.now()-state.venueStatus[v].last<DEFAULTS.staleMs).length;
  els.connectionPill.className=`status-pill ${healthy===3?'status-ok':healthy?'status-warn':'status-bad'}`;
  els.connectionPill.innerHTML=`<span class="status-dot"></span><span>${healthy}/3 Live</span>`;
}

function openPaper(id){
  const x=state.opportunities.find(o=>o.id===id);if(!x||!x.eligible)return;
  const notional=Math.max(100,num(els.paperNotional.value)||10000);const s=settings();
  const entryFees=notional*2*((s.feesBps[x.longVenue]+s.feesBps[x.shortVenue])/10000);
  state.paper.unshift({id:`p-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,openedAt:Date.now(),symbol:x.symbol,longVenue:x.longVenue,shortVenue:x.shortVenue,longAsk:x.longAsk,shortBid:x.shortBid,notional,entryFees,entrySpreadBps:x.spreadBps,entryFundingBps:x.fundingBps});
  savePaper();renderPaper();pushEvent(`Paper 开仓 ${x.symbol}: Long ${x.longLabel} / Short ${x.shortLabel}`,'ok');
}
function closePaper(id){
  const p=state.paper.find(x=>x.id===id);if(!p)return;const pnl=state.market?exitPnl(p,state.market,settings().feesBps):null;
  pushEvent(`Paper 平仓 ${p.symbol}${pnl?`，净 PnL ${pnl.net>=0?'+':''}$${f(pnl.net,2)}`:''}`,pnl?.net>=0?'ok':'warn');
  state.paper=state.paper.filter(x=>x.id!==id);savePaper();renderPaper();
}
function savePaper(){localStorage.setItem('arb-oasis-paper',JSON.stringify(state.paper));}
function renderPaper(){
  if(!state.paper.length){els.paperPositions.innerHTML='<div class="empty-state">还没有模拟仓位</div>';return;}
  els.paperPositions.innerHTML=state.paper.map(p=>{const pnl=state.market?exitPnl(p,state.market,settings().feesBps):null;return `<div class="paper-item"><div class="paper-head"><div><div class="paper-route">${p.symbol} · <span class="long">Long ${LABELS[p.longVenue]}</span> / <span class="short">Short ${LABELS[p.shortVenue]}</span></div><div class="paper-meta">${money(p.notional)} · 入场价差 ${bp(p.entrySpreadBps)} bp · Funding Δ ${bp(p.entryFundingBps)} bp · ${new Date(p.openedAt).toLocaleTimeString()}</div></div><div class="paper-actions"><span class="paper-pnl ${pnl?.net>=0?'positive':'negative'}">${pnl?`${pnl.net>=0?'+':''}$${f(pnl.net,2)}`:'—'}</span><button class="small-btn" data-close="${p.id}">Close</button></div></div></div>`}).join('');
}
function pushEvent(text,level='info'){
  state.events.unshift({text,level,time:Date.now()});state.events=state.events.slice(0,8);renderEvents();
}
function renderEvents(){
  if(!state.events.length){els.events.innerHTML='<div class="empty-state">系统事件会显示在这里</div>';return;}
  els.events.innerHTML=state.events.map(e=>`<div class="event-item"><span class="event-title">${e.level==='bad'?'⚠ ':e.level==='ok'?'● ':''}${escapeHtml(e.text)}</span><span class="event-time">${new Date(e.time).toLocaleTimeString()}</span></div>`).join('');
}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

init();
