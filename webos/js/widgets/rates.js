/* Rates: crypto prices (CoinGecko) with 24h change and the Argentine dollar (dolarapi.com). */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  function util() { return E.util || require('../util.js'); }

  var COINGECKO = 'https://api.coingecko.com/api/v3/simple/price?ids=%IDS%&vs_currencies=%VS%&include_24hr_change=true';
  var DOLAR = 'https://dolarapi.com/v1/dolares/%TYPE%';
  var CACHE_MS = 60000;
  var SYMBOLS = {
    bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', dogecoin: 'DOGE', cardano: 'ADA', ripple: 'XRP', litecoin: 'LTC',
    tether: 'USDT', binancecoin: 'BNB', polkadot: 'DOT', tron: 'TRX', monero: 'XMR'
  };
  var DOLAR_LABELS = { blue: 'BLUE', oficial: 'OFICIAL', bolsa: 'BOLSA (MEP)', contadoconliqui: 'CCL', tarjeta: 'TARJETA' };

  function cleanIds(values) {
    var out = [];
    (values || []).forEach(function (v) {
      v = String(v).trim().toLowerCase();
      if (/^[a-z0-9-]{1,60}$/.test(v) && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }
  function symbolFor(id) { return SYMBOLS[id] || id.slice(0, 4).toUpperCase(); }

  // At most ~8 characters whatever the magnitude (es-AR separators).
  function formatPrice(value) {
    var U = util();
    value = Number(value);
    if (value >= 1000) return U.formatNumberEs(Math.round(value), 0);
    if (value >= 1) return U.formatNumberEs(value, 2);
    return U.formatNumberEs(value, 4);
  }
  function formatChange(pct) {
    var U = util();
    return (pct >= 0 ? '+' : '-') + U.formatNumberEs(Math.abs(pct), 1) + '%';
  }

  /* CoinGecko simple/price JSON -> [{symbol, price, text, change|null}] in the requested order. */
  function parseCrypto(data, ids, vs) {
    var rows = [];
    if (!data || typeof data !== 'object') return rows;
    ids.forEach(function (id) {
      var e = data[id];
      if (!e || typeof e[vs] !== 'number') return;
      var ch = e[vs + '_24h_change'];
      rows.push({ id: id, symbol: symbolFor(id), price: e[vs], text: formatPrice(e[vs]), change: typeof ch === 'number' ? ch : null });
    });
    return rows;
  }

  /* dolarapi.com quote JSON -> {name, buy, sell} or null. */
  function parseDolar(data, type) {
    if (!data || typeof data !== 'object') return null;
    var buy = data.compra, sell = data.venta;
    if (typeof buy !== 'number' && typeof sell !== 'number') return null;
    return { name: DOLAR_LABELS[type] || String(data.nombre || type).toUpperCase(),
      buy: typeof buy === 'number' ? buy : null, sell: typeof sell === 'number' ? sell : null };
  }

  function settle(p) {
    return p.then(function (v) { return { ok: true, v: v }; }, function (e) {
      if (e && e.name === 'AbortError') throw e;
      return { ok: false, e: e };
    });
  }

  var widget = {
    id: 'rates',
    cleanIds: cleanIds, formatPrice: formatPrice, formatChange: formatChange, parseCrypto: parseCrypto, parseDolar: parseDolar,
    run: async function (ctx) {
      var fb = ctx.fb, w = ctx.w, h = ctx.h, cfg = ctx.cfg, U = util();
      var ids = cleanIds(cfg.assets).slice(0, 6), wantDolar = !!cfg.show_dolar;
      fb.clear(0);
      ctx.drawFit('Cargando cotizaciones…', { fonts: ['9x18B', '7x14B'], x: 4, y: 0, w: w - 8, h: h, align: 'center', valign: 'middle', color: 0x8080a0, maxScale: 2 });
      ctx.present();
      var cryptoP = ids.length ? settle(ctx.abortable(ctx.getJson(COINGECKO.replace('%IDS%', encodeURIComponent(ids.join(','))).replace('%VS%', cfg.vs_currency), CACHE_MS))) : Promise.resolve(null);
      var dolarP = wantDolar ? settle(ctx.abortable(ctx.getJson(DOLAR.replace('%TYPE%', cfg.dolar_type), CACHE_MS))) : Promise.resolve(null);
      var res = await Promise.all([cryptoP, dolarP]);
      var crypto = res[0] && res[0].ok ? parseCrypto(res[0].v, ids, cfg.vs_currency) : [];
      var dolar = res[1] && res[1].ok ? parseDolar(res[1].v, cfg.dolar_type) : null;
      var cryptoFailed = !!(res[0] && !res[0].ok), dolarFailed = !!(res[1] && !res[1].ok);
      if (!crypto.length && !dolar) {
        await ctx.offline('COTIZACIONES', Math.min(cfg.duration, 6));
        return;
      }
      var stamp = U.pad2(ctx.date().getHours()) + ':' + U.pad2(ctx.date().getMinutes());
      var cur = String(cfg.vs_currency).toUpperCase();
      await ctx.loop(cfg.duration, 2, function (t) {
        fb.clear(0);
        ctx.drawText('5x8', 'COTIZACIONES', 4, 2, 0x707088, 1);
        var sw = fb.textWidth(ctx.fonts['5x8'], 'ACT. ' + stamp, 1);
        ctx.drawText('5x8', 'ACT. ' + stamp, w - sw - 4, 2, 0x606078, 1);
        var top = 13, bandH = dolar ? (crypto.length ? 38 : h - top - 2) : 0;
        var cryptoH = h - top - bandH - 2;
        if (crypto.length) {
          var rowH = Math.min(Math.floor(cryptoH / crypto.length), 30);
          crypto.forEach(function (r, i) {
            var y0 = top + i * rowH;
            if (i % 2 === 0) fb.fillRect(2, y0, w - 4, rowH - 1, 0x0c0c14);
            var up = r.change === null ? null : r.change >= 0;
            var col = up === null ? 0xc0c0d0 : up ? 0x44e07a : 0xff5a5a;
            ctx.drawFit(r.symbol, { fonts: ['9x18B', '7x14B', '6x13'], x: 6, y: y0, w: 44, h: rowH - 1, valign: 'middle', color: 0xf0f0ff, maxScale: 1 });
            var pf = ctx.fit(r.text, ['10x20', '9x18B', '7x14B', '6x13'], 76, rowH - 2, 1);
            fb.drawText(pf.font, r.text, 56 + (76 - pf.width), y0 + Math.floor((rowH - 1 - pf.height) / 2), 0xffffff, 1);
            if (up !== null) {
              fb.arrow(w - 52, y0 + Math.floor((rowH - 1) / 2) - 3, 7, up ? 'up' : 'down', col);
              ctx.drawFit(formatChange(r.change), { fonts: ['7x14B', '6x13', '5x8'], x: w - 42, y: y0, w: 38, h: rowH - 1, valign: 'middle', align: 'right', color: col, maxScale: 1 });
            }
          });
        } else if (cryptoFailed) {
          ctx.drawFit('Cripto sin datos', { fonts: ['7x14B', '6x13'], x: 4, y: top, w: w - 8, h: 24, align: 'center', color: 0xffb020, maxScale: 1 });
        }
        if (dolar) {
          var by = h - bandH - 1;
          if (crypto.length) fb.fillRect(6, by - 1, w - 12, 1, 0x242436);
          var big = !crypto.length;
          ctx.drawFit('DÓLAR ' + dolar.name, { fonts: big ? ['9x18B', '7x14B'] : ['6x13', '5x8'], x: 6, y: by + 2, w: w - 12, h: big ? 20 : 13, align: big ? 'center' : 'left', color: 0x6cd0ff, maxScale: 1 });
          var cw = Math.floor((w - 12) / 2);
          [['COMPRA', dolar.buy, 0xffe08a], ['VENTA', dolar.sell, 0x7dffb0]].forEach(function (q, i) {
            var qx = 6 + i * cw;
            if (q[1] === null) return;
            var txt = '$' + U.formatNumberEs(q[1], q[1] % 1 ? 2 : 0);
            if (big) {
              ctx.drawText('5x8', q[0], qx, by + 30, 0x808098, 1);
              ctx.drawFit(txt, { fonts: ['10x20', '9x18B', '7x14B'], x: qx, y: by + 42, w: cw - 4, h: h - by - 46, maxScale: 3, color: q[2] });
            } else {
              ctx.drawText('5x8', q[0], qx, by + 21, 0x808098, 1);
              ctx.drawFit(txt, { fonts: ['10x20', '9x18B', '7x14B'], x: qx + 38, y: by + 15, w: cw - 42, h: 20, maxScale: 1, color: q[2] });
            }
          });
        } else if (dolarFailed) {
          ctx.drawFit('Dólar sin datos', { fonts: ['6x13', '5x8'], x: 4, y: h - 14, w: w - 8, h: 12, align: 'center', color: 0xffb020, maxScale: 1 });
        }
        void t; void cur;
      });
    }
  };
  E.widgets.rates = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
