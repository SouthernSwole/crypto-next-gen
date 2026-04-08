import 'dotenv/config';

/*
  crypto-next-gen
  Single-file AI-ready crypto trading bot scaffold
  Mode: paper trading
  Run: node bot.js
*/

const CONFIG = {
  PAIR: process.env.PAIR || 'TXC/USDT',
  MODE: process.env.MODE || 'paper',
  LOOP_MS: Number(process.env.LOOP_MS || 10000),
  START_BALANCE_USD: Number(process.env.START_BALANCE_USD || 1000),
  RISK_PER_TRADE: Number(process.env.RISK_PER_TRADE || 0.02),
  STOP_LOSS_PCT: Number(process.env.STOP_LOSS_PCT || 0.03),
  TAKE_PROFIT_PCT: Number(process.env.TAKE_PROFIT_PCT || 0.05),
  MAX_POSITION_USD: Number(process.env.MAX_POSITION_USD || 100),
  MAX_OPEN_TRADES: Number(process.env.MAX_OPEN_TRADES || 1)
};

const state = {
  balanceUSD: CONFIG.START_BALANCE_USD,
  balanceCOIN: 0,
  openTrades: [],
  tradeHistory: [],
  tick: 0,
  lastPrice: 50,
  candles: []
};

function logBanner() {
  console.log('====================================');
  console.log('🚀 CRYPTO NEXT-GEN AI BOT STARTED');
  console.log(`Pair: ${CONFIG.PAIR}`);
  console.log(`Mode: ${CONFIG.MODE}`);
  console.log(`Loop: ${CONFIG.LOOP_MS}ms`);
  console.log('====================================');
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

async function getMarketData() {
  const drift = randomBetween(-2.5, 2.5);
  const spike = Math.random() < 0.08 ? randomBetween(-6, 6) : 0;
  let price = Math.max(0.0001, state.lastPrice + drift + spike);

  state.lastPrice = price;

  const candle = {
    time: new Date().toISOString(),
    open: price + randomBetween(-1.2, 1.2),
    high: price + Math.abs(randomBetween(0, 2.0)),
    low: Math.max(0.0001, price - Math.abs(randomBetween(0, 2.0))),
    close: price,
    volume: randomBetween(1000, 10000)
  };

  state.candles.push(candle);
  if (state.candles.length > 100) state.candles.shift();

  return {
    price,
    candles: [...state.candles]
  };
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

function getMomentum(values, period = 5) {
  if (values.length < period + 1) return null;
  return values[values.length - 1] - values[values.length - 1 - period];
}

async function aiDecision(market) {
  const closes = market.candles.map(c => c.close);
  const fast = sma(closes, 5);
  const slow = sma(closes, 12);
  const momentum = getMomentum(closes, 4);
  const price = market.price;

  if (fast === null || slow === null || momentum === null) {
    return {
      action: 'HOLD',
      confidence: 0.2,
      reason: 'Not enough candle data yet'
    };
  }

  const trendUp = fast > slow;
  const trendDown = fast < slow;
  const bullishMomentum = momentum > 0.8;
  const bearishMomentum = momentum < -0.8;

  if (trendUp && bullishMomentum && price > fast) {
    return {
      action: 'BUY',
      confidence: 0.78,
      reason: 'Fast SMA above slow SMA with bullish momentum'
    };
  }

  if (trendDown && bearishMomentum && price < fast) {
    return {
      action: 'SELL',
      confidence: 0.78,
      reason: 'Fast SMA below slow SMA with bearish momentum'
    };
  }

  return {
    action: 'HOLD',
    confidence: 0.45,
    reason: 'No strong edge'
  };
}

function riskCheck(signal, market) {
  if (signal.action === 'HOLD') {
    return { approved: false, reason: 'No trade signal' };
  }

  if (state.openTrades.length >= CONFIG.MAX_OPEN_TRADES) {
    return { approved: false, reason: 'Max open trades reached' };
  }

  const positionUSD = Math.min(
    state.balanceUSD * CONFIG.RISK_PER_TRADE * 10,
    CONFIG.MAX_POSITION_USD,
    state.balanceUSD
  );

  if (positionUSD <= 10) {
    return { approved: false, reason: 'Balance too low for minimum position' };
  }

  return {
    approved: true,
    reason: 'Risk approved',
    positionUSD,
    entryPrice: market.price,
    stopLoss:
      signal.action === 'BUY'
        ? market.price * (1 - CONFIG.STOP_LOSS_PCT)
        : market.price * (1 + CONFIG.STOP_LOSS_PCT),
    takeProfit:
      signal.action === 'BUY'
        ? market.price * (1 + CONFIG.TAKE_PROFIT_PCT)
        : market.price * (1 - CONFIG.TAKE_PROFIT_PCT)
  };
}

function executePaperTrade(signal, risk, market) {
  const qty = risk.positionUSD / market.price;

  const trade = {
    id: `T${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    side: signal.action,
    entryPrice: risk.entryPrice,
    stopLoss: risk.stopLoss,
    takeProfit: risk.takeProfit,
    positionUSD: risk.positionUSD,
    qty,
    openedAt: new Date().toISOString(),
    status: 'OPEN',
    reason: signal.reason
  };

  state.balanceUSD -= risk.positionUSD;
  state.openTrades.push(trade);

  console.log(`✅ ${trade.side} OPENED`);
  console.log(`   Entry: ${trade.entryPrice.toFixed(4)}`);
  console.log(`   Size: $${trade.positionUSD.toFixed(2)}`);
  console.log(`   Qty: ${trade.qty.toFixed(4)}`);
  console.log(`   SL: ${trade.stopLoss.toFixed(4)}`);
  console.log(`   TP: ${trade.takeProfit.toFixed(4)}`);
  console.log(`   Reason: ${trade.reason}`);
}

function closeTrade(trade, exitPrice, reason) {
  let pnl = 0;

  if (trade.side === 'BUY') {
    pnl = (exitPrice - trade.entryPrice) * trade.qty;
  } else {
    pnl = (trade.entryPrice - exitPrice) * trade.qty;
  }

  const returnedCapital = trade.positionUSD + pnl;
  state.balanceUSD += returnedCapital;

  trade.exitPrice = exitPrice;
  trade.closedAt = new Date().toISOString();
  trade.status = 'CLOSED';
  trade.exitReason = reason;
  trade.pnl = pnl;

  state.tradeHistory.push(trade);

  console.log(`💥 ${trade.side} CLOSED`);
  console.log(`   Exit: ${exitPrice.toFixed(4)}`);
  console.log(`   PnL: $${pnl.toFixed(2)}`);
  console.log(`   Reason: ${reason}`);
}

function monitorOpenTrades(market) {
  const remaining = [];

  for (const trade of state.openTrades) {
    if (trade.side === 'BUY') {
      if (market.price <= trade.stopLoss) {
        closeTrade(trade, market.price, 'Stop loss hit');
        continue;
      }
      if (market.price >= trade.takeProfit) {
        closeTrade(trade, market.price, 'Take profit hit');
        continue;
      }
    }

    if (trade.side === 'SELL') {
      if (market.price >= trade.stopLoss) {
        closeTrade(trade, market.price, 'Stop loss hit');
        continue;
      }
      if (market.price <= trade.takeProfit) {
        closeTrade(trade, market.price, 'Take profit hit');
        continue;
      }
    }

    remaining.push(trade);
  }

  state.openTrades = remaining;
}

function printStatus(market, signal) {
  console.log('------------------------------------');
  console.log(`Tick: ${state.tick}`);
  console.log(`Time: ${new Date().toLocaleString()}`);
  console.log(`Price: ${market.price.toFixed(4)}`);
  console.log(`Signal: ${signal.action} (${Math.round(signal.confidence * 100)}%)`);
  console.log(`Reason: ${signal.reason}`);
  console.log(`USD Balance: $${state.balanceUSD.toFixed(2)}`);
  console.log(`Open Trades: ${state.openTrades.length}`);
  console.log(`Closed Trades: ${state.tradeHistory.length}`);
}

async function runBot() {
  state.tick += 1;

  const market = await getMarketData();

  monitorOpenTrades(market);

  const signal = await aiDecision(market);

  printStatus(market, signal);

  const risk = riskCheck(signal, market);

  if (!risk.approved) {
    console.log(`⏸ No trade: ${risk.reason}`);
    return;
  }

  executePaperTrade(signal, risk, market);
}

async function main() {
  logBanner();

  await runBot();

  setInterval(async () => {
    try {
      await runBot();
    } catch (error) {
      console.error('Bot loop error:', error.message);
    }
  }, CONFIG.LOOP_MS);
}

main().catch(err => {
  console.error('Fatal startup error:', err);
});
{
  "name": "crypto-next-gen",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "start": "node bot.js"
  },
  "dependencies": {
    "dotenv": "^16.4.5"
  }npm install
npm start
  
}
