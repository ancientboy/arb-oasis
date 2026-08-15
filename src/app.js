import { DEFAULTS, LABELS, VENUES } from './config.js';
import { fallbackContractUniverse, loadContractUniverse, pollMarket } from './exchanges.js';
import { buildOpportunities, exitPnl } from './engine.js';
import { capacityCurve, loadDepth } from './depth.js';
import { RealtimeFeeds } from './streams.js';
import { ResearchHistory, FundingStats, saveClosedTrade, paperSummary, clearClosedTrades, loadClosedTrades } from './history.js';
import { PAPER_POLICY, evaluatePaperStrategy, performanceSnapshot } from './paper-strategy.js';

const $=(s)=>document.querySelector(s);
const els={
  universeCount:$('#universeCount'),tripleCount:$('#tripleCount'),tradfiCount:$('#tradfiCount'),bestEdge:$('#bestEdge'),bestEdgeSymbol:$('#bestEdgeSymbol'),eligibleCount:$('#eligibleCount'),venueHealth:$('#venueHealth'),connectionPill:$('#connectionPill'),universeNote:$('#universeNote'),
  body:$('#opportunityBody'),lastUpdate:$('#lastUpdate'),visibleCount:$('#visibleCount'),search:$('#searchInput'),minEdge:$('#minEdgeInput'),minCapacity:$('#minCapacityInput'),riskBuffer:$('#riskBufferInput'),maxMarkDev:$('#maxMarkDevInput'),fundingHorizon:$('#fundingHorizonInput'),
  bnFee:$('#binanceFeeInput'),bgFee:$('#bitgetFeeInput'),gtFee:$('#gateFeeInput'),scope:$('#scopeSegment'),refresh:$('#refreshMarketsBtn'),paperNotional:$('#paperNotional'),paperPositions:$('#paperPositions'),clearPaper:$('#clearPaperBtn'),events:$('#systemEvents'),
  fundingLeaders:$('#fundingLeaders'),persistentRoutes:$('#persistentRoutes'),paperSummary:$('#paperSummary'),clearResearch:$('#clearResearchBtn'),historyWindow:$('#historyWindow'),reversalRisk:$('#reversalRisk'),tradfiCarry:$('#tradfiCarry'),settlementCalendar:$('#settlementCalendar'),researchCoverage:$('#researchCoverage'),sessionCarry:$('#sessionCarry'),venueReliability:$('#venueReliability'),depthCurve:$('#depthCurve'),
  strategyToggle:$('#strategyToggle'),strategyState:$('#strategyState'),strategyUptime:$('#strategyUptime'),lastDecision:$('#lastDecision'),strategyRiskState:$('#strategyRiskState'),nextSignals:$('#nextSignals'),signalCount:$('#signalCount'),accountEquity:$('#accountEquity'),sidebarEquity:$('#sidebarEquity'),todayPnl:$('#todayPnl'),todayReturn:$('#todayReturn'),totalPnl:$('#totalPnl'),totalReturn:$('#totalReturn'),maxDrawdown:$('#maxDrawdown'),spreadPnl:$('#spreadPnl'),fundingPnl:$('#fundingPnl'),feePnl:$('#feePnl'),equityChart:$('#equityChart'),openCount:$('#openCount'),riskOpenPositions:$('#riskOpenPositions'),riskUsage:$('#riskUsage'),riskUsageText:$('#riskUsageText'),topClock:$('#topClock'),pageTitle:$('#pageTitle'),dashboardView:$('#dashboardView'),researchView:$('#researchView')
};

const history=new ResearchHistory({maxSamples:DEFAULTS.historyMaxSamples,topN:DEFAULTS.historyTopN});
const fundingStats=new FundingStats();
const serverFunding=new Map();
const serverOpportunities=new Map();
let serverHealth=[];
const state={
  universe:[],tripleCommon:[],meta:null,market:null,opportunities:[],scope:'all',busy:false,streams:null,lastRender:0,renderTimer:null,
  venueStatus:Object.fromEntries(VENUES.map(v=>[v,{ok:false,last:0,error:'',mode:'REST'}])),
  paper:JSON.parse(localStorage.getItem('arb-oasis-paper')||'[]'),events:[],lastServerWrite:0,lastMetadataWrite:0,serverWindow:'7d',fundingSchedules:parseStored('arb-oasis-funding-schedules',{}),
  strategy:parseStored('arb-oasis-auto-paper',{enabled:true,startedAt:Date.now(),lastEvaluation:0,lastAction:0,lastDecision:'等待有效行情',lastSkip:'',lastSkipAt:0}),equitySeries:parseStored('arb-oasis-equity-series',[])
};

function settings(){return {...DEFAULTS,minEdgeBps:num(els.minEdge.value),minCapacityUsdt:num(els.minCapacity.value),riskBufferBps:num(els.riskBuffer.value),maxMarkDevBps:num(els.maxMarkDev.value),fundingHorizonHours:Math.max(1,num(els.fundingHorizon.value)||8),feesBps:{binance:num(els.bnFee.value),bitget:num(els.bgFee.value),gate:num(els.gtFee.value)}}}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function f(v,d=2){return Number.isFinite(v)?v.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}):'—'}
function bp(v){return `${v>=0?'+':''}${f(v,2)}`}
function pct(v,d=1){return Number.isFinite(v)?`${v>=0?'+':''}${f(v,d)}%`:'—'}
function money(v){if(!Number.isFinite(v))return'—';if(v>=1e9)return`$${f(v/1e9,2)}b`;if(v>=1e6)return`$${f(v/1e6,2)}m`;if(v>=1e3)return`$${f(v/1e3,1)}k`;return`$${f(v,0)}`}
function price(v){if(!v)return'—';const d=v<1?6:v<100?4:2;return f(v,d)}

async function init(){bind();renderPaper();renderResearch();renderStrategy();tickClock();await loadServerHistory();await refreshUniverse();await restRefresh();setInterval(restRefresh,DEFAULTS.pollMs);setInterval(refreshUniverse,DEFAULTS.metaRefreshMs);setInterval(()=>{renderHealth();renderStrategy();tickClock();},1000);setInterval(loadServerHistory,300000);}
function bind(){
  [els.search,els.minEdge,els.minCapacity,els.riskBuffer,els.maxMarkDev,els.fundingHorizon,els.bnFee,els.bgFee,els.gtFee].forEach(e=>e?.addEventListener('input',rebuild));
  els.scope?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.scope=b.dataset.scope;[...els.scope.children].forEach(x=>x.classList.toggle('active',x===b));renderTable();});
  els.historyWindow?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.serverWindow=b.dataset.window;[...els.historyWindow.children].forEach(x=>x.classList.toggle('active',x===b));serverFunding.clear();renderResearch();loadServerHistory();});
  els.refresh?.addEventListener('click',refreshUniverse);
  els.body?.addEventListener('click',e=>{const paper=e.target.closest('[data-paper]');if(paper)openPaper(paper.dataset.paper);const depth=e.target.closest('[data-depth]');if(depth)inspectDepth(depth.dataset.depth);});
  els.paperPositions?.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b)closePaper(b.dataset.close);});
  els.clearPaper?.addEventListener('click',()=>{for(const position of [...state.paper])closePaper(position.id,'手动全部平仓');});
  els.clearResearch?.addEventListener('click',()=>{history.clear();fundingStats.clear();clearClosedTrades();renderResearch();pushEvent('本地研究统计已清空','warn');});
  els.strategyToggle?.addEventListener('click',()=>{state.strategy.enabled=!state.strategy.enabled;if(state.strategy.enabled)state.strategy.startedAt=Date.now();saveStrategy();renderStrategy();pushEvent(state.strategy.enabled?'自动 Paper 策略已启动':'自动 Paper 策略已暂停',state.strategy.enabled?'ok':'warn');});
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>switchView(button.dataset.view,button.dataset.focus)));
}

async function refreshUniverse(){
  if(!state.meta){
    const seed=fallbackContractUniverse({});state.universe=seed.universe;state.tripleCommon=seed.tripleCommon;state.meta=seed.meta;
    state.market={binance:new Map(),bitget:new Map(),gate:new Map(),fetchedAt:Date.now(),latencyMs:0,source:'WS',errors:{}};
    els.universeCount.textContent=seed.universe.length.toLocaleString();els.tripleCount.textContent=seed.tripleCommon.length.toLocaleString();els.tradfiCount.textContent=seed.tradfiCount.toLocaleString();
    els.universeNote.textContent=`正在动态同步 · 已用 ${seed.universe.length} 个共同合约启动实时流`;
    pushEvent('已用内置共同合约池启动 WebSocket，正在后台刷新完整交易所清单','warn');startStreams();
  }
  try{
    els.universeNote.textContent='正在同步三所 USDT 永续合约状态…';
    const u=await loadContractUniverse();state.universe=u.universe;state.tripleCommon=u.tripleCommon;state.meta=u.meta;
    if(!state.market)state.market={binance:new Map(),bitget:new Map(),gate:new Map(),fetchedAt:Date.now(),latencyMs:0,source:'WS',errors:{}};
    els.universeCount.textContent=u.universe.length.toLocaleString();els.tripleCount.textContent=u.tripleCommon.length.toLocaleString();els.tradfiCount.textContent=u.tradfiCount.toLocaleString();
    els.universeNote.textContent=u.degraded?`动态清单受限 · 使用 ${u.universe.length} 个内置共同合约启动实时流`:`两所以上共同池 ${u.universe.length} · 三所共同 ${u.tripleCommon.length} · TradFi/RWA ${u.tradfiCount}`;
    pushEvent(u.degraded?`合约 API 受限，已启用内置共同合约池并启动 WebSocket 实时行情`:`合约池刷新：${u.universe.length} 个标的至少在两所共同交易，其中 ${u.tradfiCount} 个识别为 TradFi/RWA`,u.degraded?'warn':'ok');
    for(const [venue,error] of Object.entries(u.errors||{}))if(error)pushEvent(`${LABELS[venue]} 合约源降级：${error}`,'warn');
    startStreams();
  }catch(err){pushEvent(`合约池读取失败：${err.message}`,'bad');els.universeNote.textContent='合约池读取失败，可稍后刷新';}
}

async function restRefresh(){
  if(state.busy||!state.meta)return;state.busy=true;
  try{
    const m=await pollMarket(state.meta);state.market=m;
    for(const v of VENUES)state.venueStatus[v]={ok:m[v].size>0,last:Date.now(),error:m.errors?.[v]||'',mode:'REST'};
    rebuild();if(!state.streams)startStreams();els.lastUpdate.textContent=`REST 基线 ${new Date().toLocaleTimeString()} · ${m.latencyMs}ms`;
  }catch(err){pushEvent(`REST 行情刷新失败：${err.message}`,'bad');renderHealth();}
  finally{state.busy=false;}
}

function startStreams(){
  if(!state.market||!state.meta||!state.universe.length)return;
  state.streams?.stop();
  state.streams=new RealtimeFeeds({universe:state.universe,meta:state.meta,market:state.market,onUpdate:(venue)=>{state.venueStatus[venue]={ok:true,last:Date.now(),error:'',mode:'WS'};scheduleRebuild();},onStatus:(venue,status,detail)=>{state.venueStatus[venue].ok=status==='live';state.venueStatus[venue].last=Date.now();state.venueStatus[venue].mode='WS';state.venueStatus[venue].error=detail||(status==='error'?'WebSocket error':'');renderHealth();}}).start();
}
function scheduleRebuild(){const now=Date.now();const wait=Math.max(0,DEFAULTS.renderThrottleMs-(now-state.lastRender));if(state.renderTimer)return;state.renderTimer=setTimeout(()=>{state.renderTimer=null;rebuild();},wait);}

function rebuild(){
  if(!state.market||!state.meta)return;state.lastRender=Date.now();const s=settings();
  state.opportunities=buildOpportunities(state.universe,state.meta,state.market,s);
  fundingStats.observe(state.opportunities,DEFAULTS.fundingStatsSampleMs);history.record(state.opportunities,DEFAULTS.historySampleMs);
  syncServerHistory(state.opportunities);
  for(const x of state.opportunities)x.fundingStat=serverFunding.get(x.id)||fundingStats.get(x.id);
  const eligible=state.opportunities.filter(x=>x.eligible);els.eligibleCount.textContent=eligible.length.toLocaleString();
  const best=eligible[0]||state.opportunities[0];if(els.bestEdge)els.bestEdge.textContent=best?`${bp(best.netEdgeBps)} bp`:'—';if(els.bestEdgeSymbol)els.bestEdgeSymbol.textContent=best?`${best.symbol} · Long ${best.longLabel} / Short ${best.shortLabel}`:'等待有效机会';
  runAutoStrategy();renderHealth();renderTable();renderPaper();renderResearch();renderSignals();renderStrategy();
}

async function syncServerHistory(opportunities){
  const now=Date.now();if(now-state.lastServerWrite<120000)return;state.lastServerWrite=now;
  const observations=opportunities.slice(0,80).map(x=>({id:x.id,symbol:x.symbol,assetClass:x.assetClass,longVenue:x.longVenue,shortVenue:x.shortVenue,fundingHourlyBps:x.fundingHourlyBps,spreadBps:x.spreadBps,netEdgeBps:x.netEdgeBps,capacity:x.capacity,score:x.score,eligible:x.eligible,observedAt:now}));
  const symbols=[...new Set(opportunities.slice(0,20).map(x=>x.symbol))];
  const markets=[];for(const venue of VENUES)for(const symbol of symbols){const q=state.market?.[venue]?.get(symbol);if(q)markets.push({...q,venue,symbol,qualityOk:!(q.missingFields||[]).length&&now-q.ts<DEFAULTS.staleMs*2,observedAt:now});}
  const venueHealth=VENUES.map(venue=>{const status=state.venueStatus[venue];return {venue,ok:status.ok&&now-status.last<DEFAULTS.staleMs*2,mode:status.mode,quoteCount:state.market?.[venue]?.size||0,latencyMs:state.market?.latencyMs||0,error:status.error,observedAt:now};});
  const settlements=collectSettlements(now);let contracts=[];
  if(now-state.lastMetadataWrite>=600000){state.lastMetadataWrite=now;const classes=new Map(state.universe.map(item=>[item.symbol,item.assetClass]));for(const venue of VENUES)for(const [symbol,m] of state.meta[venue])contracts.push({venue,symbol,venueSymbol:m.gateSymbol||m.symbol||symbol,base:m.base||symbol.slice(0,-4),quote:m.quote||'USDT',assetClass:classes.get(symbol)||'crypto',fundingIntervalHours:m.fundingIntervalHours,takerFeeBps:m.takerFeeBps,makerFeeBps:m.makerFeeBps,multiplier:m.multiplier,source:m.fallbackMetadata?'fallback':'exchange',observedAt:now});}
  try{const res=await fetch('/api/history',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({observations,markets,venueHealth,settlements,contracts})});if(!res.ok)throw new Error(`HTTP ${res.status}`);await loadServerHistory();}
  catch(err){state.lastServerWrite=now-45000;pushEvent(`服务端历史暂不可用，继续使用本机统计：${err.message}`,'warn');}
}

async function loadServerHistory(){
  try{const [fundingRes,opportunityRes,healthRes]=await Promise.all([fetch(`/api/history?metric=funding&window=${state.serverWindow}`,{cache:'no-store'}),fetch(`/api/history?metric=opportunity&window=${state.serverWindow}`,{cache:'no-store'}),fetch(`/api/history?metric=health&window=${state.serverWindow}`,{cache:'no-store'})]);if(!fundingRes.ok||!opportunityRes.ok||!healthRes.ok)throw new Error('history unavailable');const [fundingData,opportunityData,healthData]=await Promise.all([fundingRes.json(),opportunityRes.json(),healthRes.json()]);serverFunding.clear();serverOpportunities.clear();for(const stat of fundingData.routes||[])serverFunding.set(stat.id,stat);for(const stat of opportunityData.routes||[])serverOpportunities.set(stat.id,stat);serverHealth=healthData.venues||[];renderResearch();}
  catch{serverFunding.clear();serverOpportunities.clear();serverHealth=[];}
}

function collectSettlements(now){
  const settled=[];for(const venue of VENUES)for(const [symbol,q] of state.market?.[venue]||[]){if(!q.nextFundingTime)continue;const key=`${venue}:${symbol}`,previous=state.fundingSchedules[key];if(previous?.time&&q.nextFundingTime>previous.time&&previous.time<=now+300000)settled.push({venue,symbol,fundingRate:previous.rate,settledAt:previous.time,observedAt:now});state.fundingSchedules[key]={time:q.nextFundingTime,rate:q.funding};}
  localStorage.setItem('arb-oasis-funding-schedules',JSON.stringify(state.fundingSchedules));return settled;
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
    <td><div class="row-actions"><button class="small-btn" data-depth="${x.id}">Depth</button><button class="paper-btn" data-paper="${x.id}" ${x.eligible?'':'disabled'}>Paper</button></div></td></tr>`}).join('');
}
async function inspectDepth(id){const opportunity=state.opportunities.find(x=>x.id===id);if(!opportunity)return;els.depthCurve.innerHTML='<div class="empty-state">正在读取 '+opportunity.symbol+' 多档订单簿…</div>';try{const depth=await loadDepth(opportunity.symbol,state.meta);const curve=capacityCurve(opportunity,depth);if(!curve.length){const details=[opportunity.longVenue,opportunity.shortVenue].map(venue=>depth.errors[venue]||depth.books[venue]?.integrityError).filter(Boolean).join(' / ');throw new Error(details?`双腿深度不可用（${details}）`:'双腿深度不可用');}els.depthCurve.innerHTML=curve.map(x=>`<div class="research-row"><div><b>${money(x.notional)}</b><span>${opportunity.symbol} · ${opportunity.longLabel} 买 / ${opportunity.shortLabel} 卖</span></div><div><strong class="${x.executable&&x.netEdgeBps>0?'positive':x.executable?'':'negative'}">${x.executable?bp(x.netEdgeBps)+' bp':'容量不足'}</strong><small>VWAP ${price(x.buyVwap)} → ${price(x.sellVwap)} · Spread ${bp(x.spreadBps)} bp · 填充 ${f(x.fillRate*100,0)}%</small></div></div>`).join('');pushEvent(`已计算 ${opportunity.symbol} 深度容量曲线`,'ok');}catch(error){els.depthCurve.innerHTML=`<div class="empty-state">深度读取失败：${escapeHtml(error.message)}</div>`;pushEvent(`深度读取失败：${error.message}`,'warn');}}
function riskHtml(x){if(x.eligible)return`<span class="risk-pill risk-ok">OK · ${x.score}</span>`;const bad=x.reasons.includes('数据过期')||x.reasons.includes('Mark偏离');return`<span class="risk-pill ${bad?'risk-bad':'risk-warn'}" title="${x.reasons.join(' / ')}">${x.reasons[0]} · ${x.score}</span>`;}

function renderHealth(){
  els.venueHealth.innerHTML=VENUES.map(v=>{const st=state.venueStatus[v];const age=st.last?Math.max(0,Date.now()-st.last):Infinity;const ok=st.ok&&age<DEFAULTS.staleMs*2;return`<span class="venue-chip ${ok?'status-ok':'status-bad'}"><span class="status-dot"></span>${LABELS[v]} <small>${st.mode||''}</small></span>`}).join('');
  const healthy=VENUES.filter(v=>state.venueStatus[v].ok&&Date.now()-state.venueStatus[v].last<DEFAULTS.staleMs*2).length;els.connectionPill.className=`status-pill ${healthy===3?'status-ok':healthy?'status-warn':'status-bad'}`;els.connectionPill.innerHTML=`<span class="status-dot"></span><span>${healthy}/3 Live</span>`;
}

function openPaper(id,auto=false,decisionReason='手动模拟开仓'){
  const x=state.opportunities.find(o=>o.id===id);if(!x||!x.eligible)return;const notional=Math.max(100,num(els.paperNotional.value)||10000);const s=settings();
  const entryFees=notional*2*((s.feesBps[x.longVenue]+s.feesBps[x.shortVenue])/10000);
  const position={id:`p-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,routeId:x.id,openedAt:Date.now(),symbol:x.symbol,assetClass:x.assetClass,longVenue:x.longVenue,shortVenue:x.shortVenue,longAsk:x.longAsk,shortBid:x.shortBid,notional,entryFees,entrySpreadBps:x.spreadBps,entryNetEdgeBps:x.netEdgeBps,entryFundingHourlyBps:x.fundingHourlyBps,entryFundingBps:x.fundingHorizonBps,auto,decisionReason};state.paper.unshift(position);syncPaperEvent('open',position);
  state.strategy.lastDecision=`开仓 ${x.symbol} · ${decisionReason}`;state.strategy.lastAction=Date.now();saveStrategy();savePaper();renderPaper();pushEvent(`${auto?'自动':'手动'} Paper 开仓 ${x.symbol}: Long ${x.longLabel} / Short ${x.shortLabel}`,'ok');
}
function closePaper(id,exitReason='手动平仓',auto=false){
  const p=state.paper.find(x=>x.id===id);if(!p)return;const pnl=state.market?exitPnl(p,state.market,settings().feesBps):null;
  if(pnl){const closed={...p,...pnl,closedAt:Date.now(),exitReason,autoClose:auto};saveClosedTrade(closed);syncPaperEvent('close',closed);}state.strategy.lastDecision=`平仓 ${p.symbol} · ${exitReason}`;state.strategy.lastAction=Date.now();saveStrategy();pushEvent(`${auto?'自动':'手动'} Paper 平仓 ${p.symbol}：${exitReason}${pnl?` · ${pnl.net>=0?'+':''}$${f(pnl.net,2)}`:''}`,pnl?.net>=0?'ok':'warn');state.paper=state.paper.filter(x=>x.id!==id);savePaper();renderPaper();renderResearch();
}
async function syncPaperEvent(event,p){try{await fetch('/api/history',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({paperEvents:[{tradeId:p.id,event,symbol:p.symbol,longVenue:p.longVenue,shortVenue:p.shortVenue,notional:p.notional,netPnl:p.net,details:{routeId:p.routeId,auto:p.auto,decisionReason:p.decisionReason,exitReason:p.exitReason,entrySpreadBps:p.entrySpreadBps,entryNetEdgeBps:p.entryNetEdgeBps,entryFundingHourlyBps:p.entryFundingHourlyBps,longAsk:p.longAsk,shortBid:p.shortBid,longExit:p.longExit,shortExit:p.shortExit,gross:p.gross,carryEstimate:p.carryEstimate,entryFees:p.entryFees,exitFees:p.exitFees},observedAt:event==='close'?p.closedAt:p.openedAt}]})});}catch{}}
function savePaper(){localStorage.setItem('arb-oasis-paper',JSON.stringify(state.paper));}
function renderPaper(){
  if(!state.paper.length)els.paperPositions.innerHTML='<div class="empty-state">策略尚未建立模拟仓位</div>';
  else els.paperPositions.innerHTML=state.paper.map(p=>{const pnl=state.market?exitPnl(p,state.market,settings().feesBps):null,route=state.opportunities.find(x=>x.id===p.routeId||x.id===`${p.symbol}:${p.longVenue}:${p.shortVenue}`),held=(Date.now()-p.openedAt)/60000;return`<div class="paper-item"><div><div class="paper-route"><span class="asset-pill ${p.assetClass||'crypto'}">${p.assetClass==='tradfi'?'TradFi':'Crypto'}</span> ${p.symbol}</div><div class="paper-meta"><span class="long">Long ${LABELS[p.longVenue]}</span> / <span class="short">Short ${LABELS[p.shortVenue]}</span> · ${p.auto?'自动':'手动'}</div></div><div class="paper-data"><span>名义本金</span><b>${money(p.notional)}</b></div><div class="paper-data"><span>Entry / 当前 Spread</span><b>${bp(p.entrySpreadBps)} / ${route?bp(route.spreadBps):'—'} bp</b></div><div class="paper-data"><span>Funding 累计</span><b class="${pnl?.carryEstimate>=0?'positive':'negative'}">${pnl?`${pnl.carryEstimate>=0?'+':''}$${f(pnl.carryEstimate,2)}`:'—'}</b></div><div class="paper-data"><span>未实现 PnL</span><b class="paper-pnl ${pnl?.net>=0?'positive':'negative'}">${pnl?`${pnl.net>=0?'+':''}$${f(pnl.net,2)}`:'—'}</b></div><div class="paper-data"><span>持仓时间</span><b>${held<60?f(held,0)+'m':f(held/60,1)+'h'}</b></div><div class="paper-actions"><button class="small-btn" data-close="${p.id}">平仓</button></div></div>`}).join('');
  renderPerformance();
}

function runAutoStrategy(){
  const now=Date.now();if(!state.strategy.enabled||!state.market||now-state.strategy.lastEvaluation<PAPER_POLICY.evaluationMs)return;state.strategy.lastEvaluation=now;
  const healthy=VENUES.filter(v=>state.venueStatus[v].ok&&now-state.venueStatus[v].last<DEFAULTS.staleMs*2).length;
  if(healthy<2){state.strategy.lastDecision='等待至少两所行情恢复';saveStrategy();return;}
  const pnlById=new Map(state.paper.map(p=>[p.id,exitPnl(p,state.market,settings().feesBps)]));
  const notional=Math.max(100,num(els.paperNotional.value)||10000),decision=evaluatePaperStrategy({enabled:true,opportunities:state.opportunities,positions:state.paper,pnlById,notional,now});
  for(const item of decision.closes)closePaper(item.position.id,item.reason,true);
  if(decision.open&&now-state.strategy.lastAction>=PAPER_POLICY.actionCooldownMs)openPaper(decision.open.id,true,`Edge ${bp(decision.open.netEdgeBps)} bp · Score ${decision.open.score}`);
  else{const skip=decision.decisions.find(x=>x.level==='skip');if(skip&&(!state.strategy.lastSkipAt||now-state.strategy.lastSkipAt>60000||skip.text!==state.strategy.lastSkip)){state.strategy.lastSkip=skip.text;state.strategy.lastSkipAt=now;state.strategy.lastDecision=skip.text;pushEvent(skip.text,'info');saveStrategy();}}
}

function renderSignals(){
  const opened=new Set(state.paper.map(p=>p.symbol)),notional=Math.max(100,num(els.paperNotional.value)||10000),rows=state.opportunities.slice(0,6).map(x=>{let reason='',ready=x.eligible&&!opened.has(x.symbol)&&x.netEdgeBps>=PAPER_POLICY.minNetEdgeBps&&x.score>=PAPER_POLICY.minScore&&x.capacity>=notional*PAPER_POLICY.capacityMultiple;if(opened.has(x.symbol))reason='已有同标的持仓';else if(!x.eligible)reason=x.reasons[0]||'风险过滤';else if(x.netEdgeBps<PAPER_POLICY.minNetEdgeBps)reason='净 Edge 未达 3 bp';else if(x.score<PAPER_POLICY.minScore)reason='综合评分不足';else if(x.capacity<notional*PAPER_POLICY.capacityMultiple)reason='容量不足';return {x,ready,reason};}).sort((a,b)=>Number(b.ready)-Number(a.ready)||b.x.netEdgeBps-a.x.netEdgeBps).slice(0,3);
  els.signalCount.textContent=rows.filter(x=>x.ready).length;els.nextSignals.innerHTML=rows.length?rows.map(({x,ready,reason},index)=>`<div class="signal-item"><div class="signal-head"><span class="signal-tag ${ready?'ready':'blocked'}">${ready?'可执行':'受限'}</span><small>#${index+1}</small></div><div class="signal-route"><b>${x.symbol}</b><span><span class="long">多 ${x.longLabel}</span> / <span class="short">空 ${x.shortLabel}</span></span></div><div class="signal-stats"><span>净 Edge <b class="${x.netEdgeBps>=0?'positive':'negative'}">${bp(x.netEdgeBps)} bp</b></span><span>容量 <b>${money(x.capacity)}</b></span></div><div class="signal-foot"><span>Score ${x.score} · Funding ${bp(x.fundingHourlyBps)} bp/h</span><b class="${ready?'positive':'status-warn'}">${ready?(state.strategy.enabled?'自动排队':'策略已暂停'):escapeHtml(reason)}</b></div></div>`).join(''):'<div class="empty-state">正在等待行情和策略判断</div>';
}

function renderPerformance(){
  const closed=loadClosedTrades(),openPnls=state.paper.map(p=>state.market?exitPnl(p,state.market,settings().feesBps):null).filter(Boolean),perf=performanceSnapshot({closedTrades:closed,openPnls});
  const color=(value)=>value>=0?'positive':'negative',currency=(value)=>`${value>=0?'+':''}$${f(value,2)}`;
  els.accountEquity.textContent=`$${f(perf.equity,2)}`;els.sidebarEquity.textContent=`$${f(perf.equity,2)}`;els.todayPnl.textContent=currency(perf.todayPnl);els.todayPnl.className=color(perf.todayPnl);els.todayReturn.textContent=pct(perf.todayPnl/perf.initialEquity*100,2);els.todayReturn.className=color(perf.todayPnl);els.totalPnl.textContent=currency(perf.totalPnl);els.totalPnl.className=color(perf.totalPnl);els.totalReturn.textContent=pct(perf.totalPnl/perf.initialEquity*100,2);els.totalReturn.className=color(perf.totalPnl);els.maxDrawdown.textContent=`-${f(perf.maxDrawdown,2)}%`;els.maxDrawdown.className=perf.maxDrawdown?'negative':'';els.spreadPnl.textContent=currency(perf.gross);els.spreadPnl.className=color(perf.gross);els.fundingPnl.textContent=currency(perf.funding);els.fundingPnl.className=color(perf.funding);els.feePnl.textContent=`-$${f(perf.fees,2)}`;els.feePnl.className='negative';
  const ps=paperSummary();els.paperSummary.innerHTML=`<div><b>${f(ps.winRate*100,0)}%</b><span>胜率</span></div><div><b>${ps.count}</b><span>已平仓</span></div><div><b>${state.paper.length}</b><span>当前持仓</span></div><div><b>${ps.avgHoldMin<60?f(ps.avgHoldMin,0)+'m':f(ps.avgHoldMin/60,1)+'h'}</b><span>平均持仓</span></div>`;
  const now=Date.now(),last=state.equitySeries.at(-1);if(!last||now-last.t>15000){state.equitySeries.push({t:now,value:perf.equity});state.equitySeries=state.equitySeries.slice(-480);localStorage.setItem('arb-oasis-equity-series',JSON.stringify(state.equitySeries));}drawEquityChart(state.equitySeries,perf.initialEquity);
  els.openCount.textContent=`(${state.paper.length})`;els.riskOpenPositions.textContent=state.paper.length;const usage=Math.min(100,state.paper.length/PAPER_POLICY.maxPositions*100);els.riskUsage.value=usage;els.riskUsageText.textContent=`${f(usage,0)}%`;
}

function drawEquityChart(series,initial){
  const canvas=els.equityChart;if(!canvas)return;const ratio=Math.max(1,window.devicePixelRatio||1),width=Math.max(300,canvas.clientWidth||720),height=Math.max(150,canvas.clientHeight||212);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);ctx.clearRect(0,0,width,height);const values=(series.length?series:[{t:Date.now(),value:initial}]).map(x=>x.value),min=Math.min(initial,...values),max=Math.max(initial,...values),range=Math.max(1,max-min),pad=22;ctx.strokeStyle='#e4eaf2';ctx.lineWidth=1;for(let i=0;i<4;i++){const y=pad+(height-pad*2)*i/3;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(width-pad,y);ctx.stroke();}ctx.strokeStyle='#0a9f62';ctx.lineWidth=2;ctx.lineJoin='round';ctx.beginPath();values.forEach((value,index)=>{const x=pad+(width-pad*2)*(values.length===1?1:index/(values.length-1)),y=height-pad-(height-pad*2)*(value-min)/range;if(index)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();ctx.fillStyle='#6d7a90';ctx.font='10px Inter, sans-serif';ctx.fillText(`$${f(max,0)}`,pad,12);ctx.fillText(`$${f(min,0)}`,pad,height-5);
}

function renderStrategy(){
  const enabled=state.strategy.enabled,started=state.strategy.startedAt||Date.now(),minutes=Math.max(0,(Date.now()-started)/60000),healthy=VENUES.filter(v=>state.venueStatus[v].ok&&Date.now()-state.venueStatus[v].last<DEFAULTS.staleMs*2).length;els.strategyState.textContent=enabled?(state.market?'Paper 策略运行中':'Paper 策略准备中'):'Paper 策略已暂停';els.strategyState.className=enabled?'positive':'status-warn';els.strategyUptime.textContent=enabled?(minutes<60?`${f(minutes,0)}分`:`${f(minutes/60,1)}小时`):'—';els.lastDecision.textContent=state.strategy.lastDecision||'等待有效行情';els.strategyRiskState.textContent=healthy>=2?'正常':'行情降级';els.strategyRiskState.className=healthy>=2?'positive':'status-warn';els.strategyToggle.classList.toggle('paused',!enabled);els.strategyToggle.innerHTML=enabled?'<i class="fa-solid fa-pause"></i><span>暂停策略</span>':'<i class="fa-solid fa-play"></i><span>启动策略</span>';
}

function saveStrategy(){localStorage.setItem('arb-oasis-auto-paper',JSON.stringify(state.strategy));}
function tickClock(){els.topClock.textContent=new Date().toLocaleString(undefined,{hour12:false});}
function switchView(view,focus){document.querySelectorAll('.workspace-page').forEach(x=>x.classList.toggle('active',x.id===`${view}View`));document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view&&!x.dataset.focus));els.pageTitle.textContent=view==='dashboard'?'策略指挥中心':'研究中心';if(focus)setTimeout(()=>document.getElementById(focus)?.scrollIntoView({behavior:'smooth',block:'start'}),20);}

function renderResearch(){
  const remote=[...serverFunding.values()].filter(x=>x.count>=2).slice(0,10).map(x=>({symbol:x.symbol,longVenue:x.longVenue,shortVenue:x.shortVenue,stat:x}));
  const localLeaders=fundingStats.leaders(state.opportunities,10);const currentLeaders=state.opportunities.filter(x=>Number.isFinite(x.fundingHourlyBps)).sort((a,b)=>b.fundingHourlyBps-a.fundingHourlyBps).slice(0,10).map(x=>({symbol:x.symbol,longVenue:x.longVenue,shortVenue:x.shortVenue,stat:{annualizedPct:x.fundingAprPct,p10HourlyBps:x.fundingHourlyBps,p90HourlyBps:x.fundingHourlyBps,positiveRate:x.fundingHourlyBps>0?1:0,reversals:0,count:1,avgHourlyBps:x.fundingHourlyBps}}));const leaders=remote.length?remote:localLeaders.length?localLeaders:currentLeaders;els.fundingLeaders.innerHTML=leaders.length?leaders.map(x=>{const cost=2*(settings().feesBps[x.longVenue]+settings().feesBps[x.shortVenue])+settings().riskBufferBps;const breakEven=x.stat.avgHourlyBps>0?cost/x.stat.avgHourlyBps:null;return`<div class="research-row"><div><b>${x.symbol}</b><span>${LABELS[x.longVenue]} L / ${LABELS[x.shortVenue]} S</span></div><div><strong class="${x.stat.annualizedPct>=0?'positive':'negative'}">${pct(x.stat.annualizedPct)}</strong><small>${remote.length?state.serverWindow+' 服务端':localLeaders.length?'本机':'当前快照'} · P10/P90 ${bp(x.stat.p10HourlyBps)} / ${bp(x.stat.p90HourlyBps)} bp/h · 正向 ${f(x.stat.positiveRate*100,0)}% · 反转 ${x.stat.reversals||0} · 回本 ${breakEven?f(breakEven,1)+'h':'—'} · n${x.stat.count}</small></div></div>`}).join(''):'<div class="empty-state">暂无可靠 Funding 数据</div>';
  const remotePersistent=[...serverOpportunities.values()].slice(0,10);const localPersistent=history.stats(state.opportunities).slice(0,10);els.persistentRoutes.innerHTML=remotePersistent.length?remotePersistent.map(x=>`<div class="research-row"><div><b>${x.symbol}</b><span>${LABELS[x.longVenue]} L / ${LABELS[x.shortVenue]} S</span></div><div><strong>${f(x.eligibleRate*100,0)}%</strong><small>可交易率 · 平均/最大 Edge ${bp(x.avgNetEdgeBps)} / ${bp(x.maxNetEdgeBps)} bp · 平均容量 ${money(x.avgCapacityUsdt)} · n${x.count}</small></div></div>`).join(''):localPersistent.length?localPersistent.map(x=>`<div class="research-row"><div><b>${x.symbol}</b><span>${LABELS[x.longVenue]} L / ${LABELS[x.shortVenue]} S</span></div><div><strong>${f(x.persistence*100,0)}%</strong><small>本机出现率 · 平均 Edge ${bp(x.avg)} bp · 最大 ${bp(x.max)} bp</small></div></div>`).join(''):'<div class="empty-state">Edge 持续性数据正在积累</div>';
  const risk=[...serverFunding.values()].filter(x=>x.count>=2).sort((a,b)=>(b.reversals/b.count)-(a.reversals/a.count)).slice(0,10);els.reversalRisk.innerHTML=risk.length?risk.map(x=>`<div class="research-row"><div><b>${x.symbol}</b><span>${LABELS[x.longVenue]} L / ${LABELS[x.shortVenue]} S</span></div><div><strong class="${x.reversals?'negative':'positive'}">${x.reversals}</strong><small>反转 · n${x.count} · 正向 ${f(x.positiveRate*100,0)}%</small></div></div>`).join(''):'<div class="empty-state">至少积累 2 个服务端样本后显示</div>';
  const tradfi=(remote.length?remote:leaders).filter(x=>x.stat&&((serverFunding.get(x.stat.id)?.assetClass)||state.opportunities.find(o=>o.symbol===x.symbol)?.assetClass)==='tradfi').slice(0,10);els.tradfiCarry.innerHTML=tradfi.length?tradfi.map(x=>`<div class="research-row"><div><b>${x.symbol}</b><span>${LABELS[x.longVenue]} L / ${LABELS[x.shortVenue]} S</span></div><div><strong class="${x.stat.annualizedPct>=0?'positive':'negative'}">${pct(x.stat.annualizedPct)}</strong><small>Carry APR · n${x.stat.count}</small></div></div>`).join(''):'<div class="empty-state">当前共同交易池暂无可靠 TradFi Carry 样本</div>';
  const settlements=[];const seen=new Set();for(const x of state.opportunities){for(const side of ['long','short']){const venue=x[side+'Venue'],time=x[side+'NextFundingTime'],rate=x[side+'Funding'];const key=x.symbol+':'+venue;if(time>Date.now()&&!seen.has(key)){seen.add(key);settlements.push({symbol:x.symbol,venue,time,rate});}}}settlements.sort((a,b)=>a.time-b.time);els.settlementCalendar.innerHTML=settlements.length?settlements.slice(0,10).map(x=>`<div class="research-row"><div><b>${x.symbol}</b><span>${LABELS[x.venue]}</span></div><div><strong>${new Date(x.time).toLocaleTimeString()}</strong><small>${new Date(x.time).toLocaleDateString()} · Funding ${pct(x.rate*100,4)}</small></div></div>`).join(''):'<div class="empty-state">当前行情未返回下一结算时间</div>';
  const fundingSamples=[...serverFunding.values()].reduce((sum,x)=>sum+x.count,0);const opportunitySamples=[...serverOpportunities.values()].reduce((sum,x)=>sum+x.count,0);els.researchCoverage.innerHTML=`<div class="research-row"><div><b>${state.serverWindow.toUpperCase()}</b><span>当前服务端窗口</span></div><div><strong>${fundingSamples.toLocaleString()}</strong><small>Funding 样本</small></div></div><div class="research-row"><div><b>${serverOpportunities.size}</b><span>已观察路线</span></div><div><strong>${opportunitySamples.toLocaleString()}</strong><small>机会快照</small></div></div>`;
  const sessionRows=[...serverFunding.values()].filter(x=>x.count>=2).flatMap(x=>(x.sessions||[]).map(s=>({...s,symbol:x.symbol,longVenue:x.longVenue,shortVenue:x.shortVenue,currentStreakSign:x.currentStreakSign,currentStreakLength:x.currentStreakLength}))).sort((a,b)=>b.avgHourlyBps-a.avgHourlyBps).slice(0,10);els.sessionCarry.innerHTML=sessionRows.length?sessionRows.map(x=>`<div class="research-row"><div><b>${x.symbol}</b><span>${LABELS[x.longVenue]} L / ${LABELS[x.shortVenue]} S · ${x.name}</span></div><div><strong class="${x.avgHourlyBps>=0?'positive':'negative'}">${bp(x.avgHourlyBps)} bp/h</strong><small>正向 ${f(x.positiveRate*100,0)}% · 连续 ${x.currentStreakSign>0?'+':x.currentStreakSign<0?'-':'—'}${x.currentStreakLength||0} · n${x.count}</small></div></div>`).join(''):'<div class="empty-state">至少积累 2 个服务端样本后显示</div>';
  els.venueReliability.innerHTML=serverHealth.some(x=>x.count)?serverHealth.map(x=>`<div class="research-row"><div><b>${LABELS[x.venue]||x.venue}</b><span>${x.lastMode||'—'} · n${x.count}</span></div><div><strong class="${x.uptimeRate>=.95?'positive':x.uptimeRate<.8?'negative':''}">${f(x.uptimeRate*100,1)}%</strong><small>可用率 · 平均延迟 ${f(x.avgLatencyMs,0)}ms${x.lastError?' · '+escapeHtml(x.lastError):''}</small></div></div>`).join(''):'<div class="empty-state">等待服务端健康样本</div>';
}

function pushEvent(text,level='info'){state.events.unshift({text,level,time:Date.now()});state.events=state.events.slice(0,10);renderEvents();}
function renderEvents(){if(!state.events.length){els.events.innerHTML='<div class="empty-state">系统事件会显示在这里</div>';return;}els.events.innerHTML=state.events.map(e=>`<div class="event-item"><span class="event-title"><i class="fa-solid ${e.level==='bad'?'fa-triangle-exclamation negative':e.level==='warn'?'fa-circle-exclamation status-warn':e.level==='ok'?'fa-circle-check positive':'fa-circle-info'}"></i> ${escapeHtml(e.text)}</span><span class="event-time">${new Date(e.time).toLocaleTimeString()}</span></div>`).join('');}
function escapeHtml(s){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));}
function parseStored(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}}

init();
