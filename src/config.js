export const VENUES = ['binance','bitget','gate'];
export const PAIRS = [['binance','bitget'],['binance','gate'],['bitget','gate']];
export const LABELS = { binance:'Binance', bitget:'Bitget', gate:'Gate' };

export const DEFAULTS = {
  pollMs: 15000,
  renderThrottleMs: 220,
  metaRefreshMs: 10 * 60 * 1000,
  staleMs: 12000,
  minEdgeBps: 0,
  minCapacityUsdt: 5000,
  riskBufferBps: 1.5,
  maxMarkDevBps: 40,
  historySampleMs: 5000,
  historyMaxSamples: 720,
  historyTopN: 40,
  fundingStatsSampleMs: 60 * 1000,
  fundingHorizonHours: 8,
  feesBps: { binance: 5, bitget: 6, gate: 7.5 }
};

export const ENDPOINTS = {
  binance: {
    contracts: '/api/market?source=binance-contracts',
    fundingInfo: '/api/market?source=binance-funding-info',
    bbo: '/api/market?source=binance-bbo',
    premium: '/api/market?source=binance-premium'
  },
  bitget: {
    contracts: '/api/market?source=bitget-contracts',
    tickers: '/api/market?source=bitget-tickers'
  },
  gate: {
    contracts: '/api/market?source=gate-contracts',
    tickers: '/api/market?source=gate-tickers'
  }
};

export const WS = {
  binanceBook: 'wss://fstream.binance.com/ws/!bookTicker',
  binanceMark: 'wss://fstream.binance.com/ws/!markPrice@arr@1s',
  bitget: 'wss://ws.bitget.com/v2/ws/public',
  gate: 'wss://ws.gate.com/v4/ws/futures/usdt'
};

// Fallback only. Prefer exchange metadata (e.g. Bitget isRwa) whenever available.
export const TRADFI_HINTS = new Set([
  'AAPL','NVDA','TSLA','MSFT','META','AMZN','GOOGL','GOOG','MSTR','COIN','BABA','PLTR','QQQ','SPY','DIA','IWM',
  'NFLX','AMD','INTC','AVGO','ORCL','CRM','UBER','HOOD','PYPL','SHOP','SNOW','SMCI','DELL','HPE','MUFG','TM','CPNG',
  'MCD','LLY','CSCO','PEP','ACN','MA','UNH','SOFI','HD','CEG','CCJ','FSLR','WDC','ALB','GLW','APH','CMI','EWJ','EWY',
  'NVDL','TSLL','AAPU','MSFU','METU','AMZU','GGLL','TZA','KORU','SHAZ','PENG',
  'TSM','MU','QCOM','DIS','WMT','JPM','BRKB','COST','DKNG','RIVN','GME','ASML','TQQQ','SQQQ','SOXL','SOXS','XLE','EWZ'
]);
