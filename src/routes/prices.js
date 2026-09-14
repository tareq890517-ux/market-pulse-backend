const express = require('express');
const router = express.Router();

let cache = { data: null, timestamp: 0 };
const CACHE_MS = 30 * 1000;

router.get('/', async (req, res) => {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_MS) {
    return res.json(cache.data);
  }

  try {
    const [cgRes, fxRes] = await Promise.all([
      fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h'
      ),
      fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP'),
    ]);

    const coins = await cgRes.json();
    const fx = await fxRes.json();

    const crypto = Array.isArray(coins)
      ? coins.map((c) => ({
          symbol: c.symbol.toUpperCase() + '/USD',
          price: c.current_price,
          change24h: c.price_change_percentage_24h,
        }))
      : [];

    const forex = [];
    if (fx.rates && fx.rates.EUR) forex.push({ symbol: 'EUR/USD', price: 1 / fx.rates.EUR, change24h: null });
    if (fx.rates && fx.rates.GBP) forex.push({ symbol: 'GBP/USD', price: 1 / fx.rates.GBP, change24h: null });

    const payload = { crypto, forex, updated_at: new Date().toISOString() };
    cache = { data: payload, timestamp: now };
    res.json(payload);
  } catch (err) {
    console.error('فشل جلب الأسعار الحية:', err.message);
    res.status(502).json({ error: 'ت
