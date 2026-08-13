export const VENUES = ['binance','bitget','gate'];
export const PAIRS = [['binance','bitget'],['binance','gate'],['bitget','gate']];
export const LABELS = { binance:'Binance', bitget:'Bitget', gate:'Gate' };
export const DEFAULTS = {
  pollMs: 2500,
  metaRefreshMs: 10 * 60 * 1000,
  staleMs: 9000,
  minEdgeBps: 0,
  minCapacityUsdt: 5000,
  riskBufferBps: 1.5,
  maxMarkDevBps: 40,
  feesBps: { binance: 5, bitget: 6, gate: 7.5 }
};
export const ENDPOINTS = {
  binance: {
    contracts: 'https://fapi.binance.com/fapi/v1/exchangeInfo',
    bbo: 'https://fapi.binance.com/fapi/v1/ticker/bookTicker',
    premium: 'https://fapi.binance.com/fapi/v1/premiumIndex'
  },
  bitget: {
    contracts: 'https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES',
    tickers: 'https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES'
  },
  gate: {
    contracts: 'https://api.gateio.ws/api/v4/futures/usdt/contracts',
    tickers: 'https://api.gateio.ws/api/v4/futures/usdt/tickers'
  }
};
