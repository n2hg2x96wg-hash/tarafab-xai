import axios from 'axios';
import { MarketData } from '../types';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';

export async function fetchBitcoinPrice(): Promise<MarketData> {
  try {
    const response = await axios.get(`${COINGECKO_API}/simple/price`, {
      params: {
        ids: 'bitcoin',
        vs_currencies: 'usd',
        include_market_cap: 'true',
        include_24hr_vol: 'true',
        include_24hr_change: 'true',
        include_last_updated_at: 'true',
      },
    });

    const data = response.data.bitcoin;

    return {
      symbol: 'BTC',
      price: data.usd,
      change24h: data.usd_24h_change,
      high24h: data.usd_24h_high || data.usd,
      low24h: data.usd_24h_low || data.usd,
      volume24h: data.usd_24h_vol,
      lastUpdated: new Date(data.last_updated_at * 1000).toISOString(),
    };
  } catch (error) {
    console.error('Failed to fetch Bitcoin price:', error);
    throw new Error('Market data unavailable');
  }
}

export async function fetchMarketData(symbol: string = 'bitcoin'): Promise<MarketData> {
  if (symbol.toLowerCase() === 'btc' || symbol.toLowerCase() === 'bitcoin') {
    return fetchBitcoinPrice();
  }

  throw new Error(`Symbol ${symbol} not supported yet`);
}
