import { DEFAULTS, LABELS, VENUES } from './config.js';
import { loadContractUniverse, pollMarket } from './exchanges.js';
import { buildOpportunities, exitPnl } from './engine.js';
import { RealtimeFeeds } from './streams.js';
import { ResearchHistory, FundingStats, saveClosedTrade, paperSummary, clearClosedTrades } from './history.js';

const $=(s)=>document.querySelector(s);
const els={
  universeCount:$('#universeCount'),tripleCount:$('#tripleCount'),tradfiCount:$('#tradfiCount'),bestEdge:$('#bestEdge'),bestEdgeSymbol:$('#bestEdgeSymbol'),eligibleCount:$('#eligibleCount'),venueHealth:$('#venueHealth'),connectionPill:$('#connectionPill'),universeNote:$('#universeNote'),
  body:$('#opportunityBody'),lastUpdate:$('#lastUpdate'),visibleCount:$('#visibleCount'),search:$('#searchInput'),minEdge:$('#minEdgeInput'),minCapacity:$('#minCapacityInput'),riskBuffer:$('#riskBufferInput'),maxMarkDev:$('#maxMarkDevInput'),fundingHorizon:$('#fundingHorizonInput'),
  bnFee:$('#binanceFeeInput'),bgFee:$('#bitgetFeeInput'),gtFee:$('#gateFeeInput'),scope:$('#scopeSegment'),refresh:$('#refreshMarketsBtn'),paperNotional:$('#paperNotional'),paperPositions:$('#paperPositions'),clearPaper:$('#clearPaperBtn'),events:$('#systemEvents'),
  fundingLeaders:$('#fundingLeaders'),persistentRoutes:$('#persistentRoutes'),paperSummary:$('#paperSummary'),clearResearch:$('#clearResearchBtn'),historyWindow:$('#historyWindow')
};

const history=new ResearchHistory({maxSamples:DEFAULTS.historyMaxSamples,topN:DEFAULTS.historyTopN});
const fundingStats=new FundingStats();
const serverFunding=new Map();
const state={
  universe:[],tripleCommon:[],meta:null,market:null,opportunities:[],scope:'all',busy:false,streams:null,lastRender:0,renderTimer:null,
  venueStatus:Object.fromEntries(VENUES.map(v=>[v,{ok:false,last:0,error:'',mode:'REST'}])),
  paper:JSON.parse(localStorage.getItem('arb-oasis-paper')||'[]'),events:[],lastServerWrite:0,serverWindow:'7d'
};

function settings(){return {...DEFAULTS,minEdgeBps:num(els.minEdge.value),minCapacityUsdt:num(els.minCapacity.value),riskBufferBps:num(els.riskBuffer.value),maxMarkDevBps:num(els.maxMarkDev.value),fundingHorizonHours:Math.max(1,num(els.fundingHorizon.value)||8),feesBps:{binance:num(els.bnFee.value),bitget:num(els.bgFee.value),gate:num(els.gtFee.value)}}}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function f(v,d=2){return Number.isFinite(v)?v.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}):'—'}
function bp(v){return `${v>=0?'+':''}${f(v,2)}`}
function pct(v,d=1){return Number.isFinite(v)?`${v>=0?'+':''}${f(v,d)}%`:'—'}
function money(v){if(!Number.isFinite(v))return'—';if(v>=1e9)return`$${f(v/1e9,2)}b`;if(v>=1e6)return`$${f(v/1e6,2)}m`;if(v>=1e3)return`$${f(v/1e3,1)}k`;return`$${f(v,0)}`}
function price(v){if(!v)return'—';const d=v<1?6:v<100?4:2;return f(v,d)}

async function init(){bind();renderPaper();renderResearch();await loadServerHistory();await refreshUniverse();await restRefresh();setInterval(restRefresh,DEFAULTS.pollMs);setInterval(refreshUniverse,DEFAULTS.metaRefreshMs);setInterval(renderHealth,1000);setInterval(loadServerHistory,300000);}
function bind(){
  [els.search,els.minEdge,els.minCapacity,els.riskBuffer,els.maxMarkDev,els.fundingHorizon,els.bnFee,els.bgFee,els.gtFee].forEach(e=>e?.addEventListener('input',rebuild));
  els.scope?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.scope=b.dataset.scope;[...els.scope.children].forEach(x=>x.classList.toggle('active',x===b));renderTable();});
  els.historyWindow?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.serverWindow=b.dataset.window;[...els.historyWindow.children].forEach(x=>x.classList.toggle('active',x===b));serverFunding.clear();renderResearch();loadServerHistory();});
  els.refresh?.addEventListener('click',refreshUniverse);
  els.body?.addEventListener('click',e=>{const b=e.target.closest('[data-paper]');if(b)openPaper(b.dataset.paper);});
  els.paperPositions?.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b)closePaper(b.dataset.close);});
  els.clearPaper?.addEventListener('click',()=>{state.paper=[];savePaper();renderPaper();});
  els.clearResearch?.addEventListener('click',()=>{history.clear();fundingStats.clear();clearClosedTrades();renderResearch();pushEvent('本地研究统计已清空','warn');});
}

async function refreshUniverse(){
  try{
    els.universeNote.textContent='正在同步三所 USDT 永续合约状态…';
    const u=await loadContractUniverse();state.universe=u.universe;state.tripleCommon=u.tripleCommon;state.meta=u.meta;
    els.universeCount.textContent=u.universe.length.toLocaleString();els.tripleCount.textContent=u.tripleCommon.length.toLocaleString();els.tradfiCount.textContent=u.tradfiCount.toLocaleString();
    els.universeNote.textContent=`两所以上共同池 ${u.universe.length} · 三所共同 ${u.tripleCommon.length} · TradFi/RWA ${u.tradfiCount}`;
    pushEvent(`合约池刷新：${u.universe.length} 个标的至少在两所共同交易，其中 ${u.tradfiCount} 个识别为 TradFi/RWA`,'ok');
    if(state.market)startStreams();
  }catch(err){pushEvent(`合约池读取失败：${err.message}`,'bad');els.universeNote.textContent='合约池读取失败，可稍后刷新';}
}

async function restRefresh(){
  if(state.busy||!state.meta)return;state.busy=true;
  try{
    const m=await pollMarket(state.meta);state.market=m;
    for(const v of VENUES)state.venueStatus[v]={ok:m[v].size>0,last:Date.now(),error:'',mode:'REST'};
    rebuild();if(!state.streams)startStreams();els.lastUpdate.textContent=`REST 基线 ${new Date().toLocaleTimeString()} · ${m.latencyMs}ms`;
  }catch(err){pushEvent(`REST 行情刷新失败：${err.message}`,'bad');renderHealth();}
  finally{state.busy=false;}
}

function startStreams(){
  if(!state.market||!state.meta||!state.universe.length)return;
  state.streams?.stop();
  state.streams=new RealtimeFeeds({universe:state.universe,meta:state.meta,market:state.market,onUpdate:(venue)=>{state.venueStatus[venue]={ok:true,last:Date.now(),error:'',mode:'WS'};scheduleRebuild();},onStatus:(venue,status)=>{state.venueStatus[venue].ok=status==='live';state.venueStatus[venue].last=Date.now();state.venueStatus[venue].mode='WS';state.venueStatus[venue].error=status==='error'?'WebSocket error':'';renderHealth();}}).start();
}
function scheduleRebuild(){const now=Date.now();const wait=Math.max(0,DEFAULTS.renderThrottleMs-(now-state.lastRender));if(state.renderTimer)return;state.renderTimer=setTimeout(()=>{state.renderTimer=null;rebuild();},wait);}

function rebuild(){
  if(!state.market||!state.meta)return;state.lastRender=Date.now();const s=settings();
  state.opportunities=buildOpportunities(state.universe,state.meta,state.market,s);
  fundingStats.observe(state.opportunities,DEFAULTS.fundingStatsSampleMs);history.record(state.opportunities,DEFAULTS.historySampleMs);
  syncServerHistory(state.opportunities);
  for(const x of state.opportunities)x.fundingStat=serverFunding.get(x.id)||fundingStats.get(x.id);
  const eligible=state.opportunities.filter(x=>x.eligible);els.eligibleCount.textContent=eligible.length.toLocaleString();
  const best=eligible[0]||state.opportunities[0];els.bestEdge.textContent=best?`${bp(best.netEdgeBps)} bp`:'—';els.bestEdgeSymbol.textContent=best?`${best.symbol} · Long ${best.longLabel} / Short ${best.shortLabel}`:'等待有效机会';
  renderHealth();renderTable();renderPaper();renderResearch();
}

async function syncServerHistory(opportunities){
  const now=Date.now();if(now-state.lastServerWrite<60000)return;state.lastServerWrite=now;
  const observations=opportunities.slice(0,120).map(x=>({id:x.id,symbol:x.symbol,assetClass:x.assetClass,longVenue:x.longVenue,shortVenue:x.shortVenue,fundingHourlyBps:x.fundingHourlyBps,spreadBps:x.spreadBps,netEdgeBps:x.netEdgeBps,capacity:x.capacity,score:x.score,eligible:x.eligible,observedAt:now}));
  try{const res=await fetch('/api/history',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({observations})});if(!res.ok)throw new Error(`HTTP ${res.status}`);await loadServerHistory();}
  catch(err){state.lastServerWrite=now-45000;pushEvent(`服务端历史暂不可用，继续使用本机统计：${err.message}`,'warn');}
}

async function loadServerHistory(){
  try{const res=await fetch(`/api/history?window=${state.serverWindow}`,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();serverFunding.clear();for(const stat of data.routes||[])serverFunding.set(stat.id,stat);if(data.routes?.length)renderResearch();}
  catch{serverFunding.clear();}
}

function filtered(){
  const s=settings();const q=els.search.value.trim().toUpperCase();
  return state.opportunities.filter(x=>{
    if(q&&!x.symbol.includes(q))return false;if(x.netEdgeBps<s.minEdgeBps)return false;
    if(state.scope==='triple'&&x.venueCount!==3)return false;if(state.scope==='tradfi'&&x.assetClass!=='tradfi')return false;if(state.scope==='crypto'&&x.assetClass!=='crypto')return false;
    if(state.scope==='positive'&&x.netEdgeBps<=0)return false;if(state.scope==='liquid'&&x.capacity<s.minCapacityUsdt)return false;return true;
  });
}

function renderTable(){
  const rows=filtered().slice(0,1000);els.visibleCount.textContent=`${rows.length.toLocaleString()} 个方向`;
  if(!rows.length){els.body.innerHTML='<tr><td colspan="14" class="empty-cell">当前过滤条件下没有机会</td></tr>';return;}
  els.body.innerHTML=rows.map((x,i)=>{const fs=x.fundingStat;return`<tr class="${i===0?'best-row':''}">
    <td><span class="asset-pill ${x.assetClass}">${x.assetClass==='tradfi'?'TradFi':'Crypto'}</span></td><td class="symbol-cell">${x.symbol}<span class="venue-count">${x.venueCount}所</span></td>
    <td><div class="venue-route"><span class="long">Long ${x.longLabel}</span> → <span class="short">Short ${x.shortLabel}</span></div></td>
    <td class="cap">${price(x.longAsk)}</td><td class="cap">${price(x.shortBid)}</td>
    <td class="cap ${x.spreadBps>0?'positive':'negative'}">${bp(x.spreadBps)}</td>
    <td class="cap ${x.fundingHourlyBps>0?'positive':'negative'}">${bp(x.fundingHourlyBps)}</td>
    <td class="cap ${x.fundingAprPct>0?'positive':'negative'}">${pct(x.fundingAprPct)}</td>
    <td class="cap ${fs?.annualizedPct>0?'positive':'negative'}">${fs?pct(fs.annualizedPct):'采集中'}</td>
    <td class="cap">${fs?`${f(fs.positiveRate*100,0)}% · n${fs.count}`:'—'}</td>
    <td class="cap ${x.netEdgeBps>0?'positive':'negative'}">${bp(x.netEdgeBps)}</td><td class="cap">${money(x.capacity)}</td><td>${riskHtml(x)}</td>
    <td><button class="paper-btn" data-paper="${x.id}" ${x.eligible?'':'disabled'}>Paper</button></td></tr>`}).join('');
}
function riskHtml(x){if(x.eligible)return`<span class="risk-pill risk-ok">OK · ${x.score}</span>`;const bad=x.reasons.includes('数据过期')||x.reasons.includes('Mark偏离');return`<span class="risk-pill ${bad?'risk-bad':'risk-warn'}" title="${x.reasons.join(' / ')}">${x.reasons[0]} · ${x.score}</span>`;}

function renderHealth(){
  els.venueHealth.innerHTML=VENUES.map(v=>{const st=state.venueStatus[v];const age=st.last?Math.max(0,Date.now()-st.last):Infinity;const ok=st.ok&&age<DEFAULTS.staleMs*2;return`<span class="venue-chip ${ok?'status-ok':'status-bad'}"><span class="status-dot"></span>${LABELS[v]} <small>${st.mode||''}</small></span>`}).join('');
  const healthy=VENUES.filter(v=>state.venueStatus[v].ok&&Date.now()-state.venueStatus[v].last<DEFAULTS.staleMs*2).length;els.connectionPill.className=`status-pill ${healthy===3?'status-ok':healthy?'status-warn':'status-bad'}`;els.connectionPill.innerHTML=`<span class="status-dot"></span><span>${healthy}/3 Live</span>`;
}

function openPaper(id){
  const x=state.opportunities.find(o=>o.id===id);if(!x||!x.eligible)return;const notional=Math.max(100,num(els.paperNotional.value)||10000);const s=settings();
  const entryFees=notional*2*((s.feesBps[x.longVenue]+s.feesBps[x.shortVenue])/10000);
  state.paper.unshift({id:`p-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,openedAt:Date.now(),symbol:x.symbol,assetClass:x.assetClass,longVenue:x.longVenue,shortVenue:x.shortVenue,longAsk:x.longAsk,shortBid:x.shortBid,notional,entryFees,entrySpreadBps:x.spreadBps,entryFundingHourlyBps:x.fundingHourlyBps,entryFundingBps:x.fundingHorizonBps});
  savePaper();renderPaper();pushEvent(`Paper 开仓 ${x.symbol}: Long ${x.longLabel} / Short ${x.shortLabel}`,'ok');
}
function closePaper(id){
  const p=state.paper.find(x=>x.id===id);if(!p)return;const pnl=state.market?exitPnl(p,state.market,settings().feesBps):null;
  if(pnl)saveClosedTrade({...p,...pnl,closedAt:Date.now()});pushEvent(`Paper 平仓 ${p.symbol}${pnl?`，净 PnL ${pnl.net>=0?'+':''}$${f(pnl.net,2)}`:''}`,pnl?.net>=0?'ok':'warn');state.paper=state.paper.filter(x=>x.id!==id);savePaper();renderPaper();renderResearch();
}
function savePaper(){localStorage.setItem('arb-oasis-paper',JSON.stringify(state.paper));}
function renderPaper(){
  if(!state.paper.length){els.paperPositions.innerHTML='<div class="empty-state">还没有模拟仓位</div>';return;}
  els.paperPositions.innerHTML=state.paper.map(p=>{const pnl=state.market?exitPnl(p,state.market,settings().feesBps):null;return`<div class="paper-item"><div class="paper-head"><div><div class="paper-route"><span class="asset-pill ${p.assetClass||'crypto'}">${p.assetClass==='tradfi'?'TradFi':'Crypto'}</span> ${p.symbol} · <span class="long">Long ${LABELS[p.longVenue]}</span> / <span class="short">Short ${LABELS[p.shortVenue]}</span></div><div class="paper-meta">${money(p.notional)} · 入场价差 ${bp(p.entrySpreadBps)} bp · Funding/h ${bp(p.entryFundingHourlyBps||0)} bp · ${new Date(p.openedAt).toLocaleTimeString()}</div></div><div class="paper-actions"><span class="paper-pnl ${pnl?.net>=0?'positive':'negative'}">${pnl?`${pnl.net>=0?'+':''}$${f(pnl.net,2)}`:'—'}</span><button class="small-btn" data-close="${p.id}">Close</button></div></div></div>`}).join('');
}

function renderResearch(){
  const remote=[...serverFunding.values()].filter(x=>x.count>=2).slice(0,10).map(x=>({symbol:x.symbol,longVenue:x.longVenue,shortVenue:x.shortVenue,stat:x}));
  const leaders=remote.length?remote:fundingStats.leaders(state.opportunities,10);els.fundingLeaders.innerHTML=leaders.length?leaders.map(x=>`<div class="research-row"><div><b>${x.symbol}</b><span>${LABELS[x.longVenue]} L / ${LABELS[x.shortVenue]} S</span></div><div><strong class="${x.stat.annualizedPct>=0?'positive':'negative'}">${pct(x.stat.annualizedPct)}</strong><small>${remote.length?state.serverWindow+' 服务端':'本机'}均值 · P10/P90 ${bp(x.stat.p10HourlyBps)} / ${bp(x.stat.p90HourlyBps)} bp/h · 正向 ${f(x.stat.positiveRate*100,0)}% · 反转 ${x.stat.reversals||0} · n${x.stat.count}</small></div></div>`).join(''):'<div class="empty-state">Funding 历史正在积累，至少需要 2 个统计样本</div>';
  const persistent=history.stats(state.opportunities).slice(0,10);els.persistentRoutes.innerHTML=persistent.length?persistent.map(x=>`<div class="research-row"><div><b>${x.symbol}</b><span>${LABELS[x.longVenue]} L / ${LABELS[x.shortVenue]} S</span></div><div><strong>${f(x.persistence*100,0)}%</strong><small>出现率 · 平均 Edge ${bp(x.avg)} bp · 最大 ${bp(x.max)} bp</small></div></div>`).join(''):'<div class="empty-state">Edge 持续性数据正在积累</div>';
  const ps=paperSummary();els.paperSummary.innerHTML=`<div><b>${ps.count}</b><span>已平仓</span></div><div><b class="${ps.pnl>=0?'positive':'negative'}">${ps.pnl>=0?'+':''}$${f(ps.pnl,2)}</b><span>累计净 PnL</span></div><div><b>${f(ps.winRate*100,0)}%</b><span>胜率</span></div><div><b>${f(ps.avgHoldMin,1)}m</b><span>平均持仓</span></div>`;
}

function pushEvent(text,level='info'){state.events.unshift({text,level,time:Date.now()});state.events=state.events.slice(0,10);renderEvents();}
function renderEvents(){if(!state.events.length){els.events.innerHTML='<div class="empty-state">系统事件会显示在这里</div>';return;}els.events.innerHTML=state.events.map(e=>`<div class="event-item"><span class="event-title">${e.level==='bad'?'⚠ ':e.level==='ok'?'● ':''}${escapeHtml(e.text)}</span><span class="event-time">${new Date(e.time).toLocaleTimeString()}</span></div>`).join('');}
function escapeHtml(s){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));}

init();
