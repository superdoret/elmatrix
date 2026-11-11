/* Forecast: Open-Meteo geocoding + daily forecast, columns per day with procedural icons. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  var GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&name=';
  var FORECAST = 'https://api.open-meteo.com/v1/forecast?latitude=%LAT%&longitude=%LON%' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=%DAYS%';

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  // -> {name, lat, lon} or null
  function parseGeocode(data) {
    var r = data && Array.isArray(data.results) ? data.results[0] : null;
    if (!r || num(r.latitude) === null || num(r.longitude) === null) return null;
    return { name: String(r.name || ''), lat: r.latitude, lon: r.longitude };
  }

  // -> [{date:'YYYY-MM-DD', code, tmax, tmin}] up to `days`; missing values are null.
  function parseDaily(data, days) {
    var d = data && data.daily;
    if (!d || !Array.isArray(d.time)) return [];
    var out = [];
    for (var i = 0; i < d.time.length && out.length < days; i++) {
      out.push({
        date: String(d.time[i]),
        code: num((d.weather_code || [])[i]),
        tmax: num((d.temperature_2m_max || [])[i]),
        tmin: num((d.temperature_2m_min || [])[i])
      });
    }
    return out;
  }

  function formatTemp(v) { return v === null ? '--' : String(Math.round(v)); }

  function dayLabel(dateStr, index) {
    var U = E.util || require('../util.js'), icons;
    void icons;
    if (index === 0) return 'HOY';
    var ymd = U.parseYMD(dateStr);
    return ymd ? U.DAYS_SHORT[U.weekdayOfYMD(ymd)] + ' ' + ymd.d : '--';
  }

  var widget = {
    id: 'forecast',
    GEOCODE: GEOCODE, parseGeocode: parseGeocode, parseDaily: parseDaily, formatTemp: formatTemp, dayLabel: dayLabel,
    run: async function (ctx) {
      var fb = ctx.fb, w = ctx.w, h = ctx.h, cfg = ctx.cfg, ICONS = E.icons;
      fb.clear(0);
      ctx.drawFit('Cargando pronóstico…', { fonts: ['9x18B', '7x14B'], x: 4, y: 0, w: w - 8, h: h, align: 'center', valign: 'middle', color: 0x8080a0, maxScale: 2 });
      ctx.present();
      var city = String(cfg.city || '').trim() || 'Barcelona', place, days;
      try {
        var geo = parseGeocode(await ctx.abortable(ctx.getJson(GEOCODE + encodeURIComponent(city), 7 * 86400000)));
        if (!geo) {
          fb.clear(0);
          await ctx.loopFixed(4, 2, function () {
            ctx.drawFit('Ciudad no encontrada', { fonts: ['9x18B', '7x14B'], x: 4, y: 20, w: w - 8, h: 30, align: 'center', color: 0xffb020, maxScale: 2 });
            ctx.drawFit(city, { fonts: ['9x18B', '7x14B'], x: 4, y: 60, w: w - 8, h: 30, align: 'center', color: 0xc0c0d0, maxScale: 2 });
          });
          return;
        }
        place = geo.name || city;
        var url = FORECAST.replace('%LAT%', geo.lat).replace('%LON%', geo.lon).replace('%DAYS%', cfg.days);
        days = parseDaily(await ctx.abortable(ctx.getJson(url, 1800000)), cfg.days);
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        await ctx.offline('PRONÓSTICO', Math.min(cfg.duration, 6));
        return;
      }
      if (!days.length) { await ctx.offline('PRONÓSTICO', Math.min(cfg.duration, 6)); return; }
      var n = days.length;
      await ctx.loop(cfg.duration, 8, function (t) {
        fb.clear(0);
        ctx.drawFit(place.toUpperCase(), { fonts: ['9x18B', '7x14B', '6x13'], x: 4, y: 2, w: w - 8, h: 18, align: 'center', color: 0xf0f0ff, maxScale: 1 });
        var top = 22, colW = Math.floor(w / n), labelH = 18, tempH = 20;
        var size = Math.max(16, Math.min(colW - 10, h - top - labelH - tempH - 6, 60));
        days.forEach(function (d, i) {
          var x0 = i * colW;
          if (i > 0) fb.fillRect(x0, top, 1, h - top - 2, 0x1c1c2c);
          ctx.drawFit(dayLabel(d.date, i), { fonts: ['9x18B', '7x14B', '6x13', '5x8'], x: x0 + 2, y: top, w: colW - 4, h: labelH, align: 'center', color: i === 0 ? 0xffd23c : 0xa0a0b8, maxScale: 1 });
          var kind = d.code === null ? 'unknown' : ICONS.iconForWmo(d.code);
          ICONS.drawWeatherIcon(fb, kind, x0 + Math.floor((colW - size) / 2), top + labelH + 2, size, t);
          var ty = h - tempH - 2, half = Math.floor((colW - 6) / 2);
          ctx.drawFit(formatTemp(d.tmax) + '°', { fonts: ['10x20', '9x18B', '7x14B', '6x13'], x: x0 + 3, y: ty, w: half, h: tempH, align: 'center', color: 0xff9a4a, maxScale: 1 });
          ctx.drawFit(formatTemp(d.tmin) + '°', { fonts: ['10x20', '9x18B', '7x14B', '6x13'], x: x0 + 3 + half, y: ty, w: half, h: tempH, align: 'center', color: 0x6cc8ff, maxScale: 1 });
        });
      });
    }
  };
  E.widgets.forecast = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
