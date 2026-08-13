export const SOURCES = Object.freeze({
  "binance-contracts": { url: "https://fapi.binance.com/fapi/v1/exchangeInfo", intervalMs: 600_000 },
  "binance-funding-info": { url: "https://fapi.binance.com/fapi/v1/fundingInfo", intervalMs: 600_000 },
  "binance-bbo": { url: "https://fapi.binance.com/fapi/v1/ticker/bookTicker", intervalMs: 2_000 },
  "binance-premium": { url: "https://fapi.binance.com/fapi/v1/premiumIndex", intervalMs: 2_000 },
  "bitget-contracts": { url: "https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES", intervalMs: 600_000 },
  "bitget-tickers": { url: "https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES", intervalMs: 2_000 },
  "gate-contracts": { url: "https://api.gateio.ws/api/v4/futures/usdt/contracts", intervalMs: 600_000 },
  "gate-tickers": { url: "https://api.gateio.ws/api/v4/futures/usdt/tickers", intervalMs: 2_000 },
});

export const sourceVenue = (source) => source.split("-", 1)[0];
