/* Date, zone and number helpers shared by widgets (pure). Spanish names without relying on Intl locales. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  var DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DAYS_SHORT = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function formatDateEs(d) {
    return (DAYS[d.getDay()] + ' ' + d.getDate() + ' de ' + MONTHS[d.getMonth()]).toUpperCase();
  }

  // 'YYYY-MM-DD' -> {y,m,d} or null (rejects impossible dates like 2027-02-31).
  function parseYMD(str) {
    var m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(String(str));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }

  function ymdOfDate(date) { return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }; }

  // Whole calendar days from a to b (negative if b is before a). DST-safe: uses UTC midnights.
  function daysBetween(a, b) {
    return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
  }

  function weekdayOfYMD(ymd) { return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay(); }

  // ['Label|value', ...] -> [{label, value}]; entries without a separator or label are dropped.
  function parsePairs(list) {
    var out = [];
    (list || []).forEach(function (line) {
      var i = String(line).indexOf('|');
      if (i < 0) return;
      var label = String(line).slice(0, i).trim(), value = String(line).slice(i + 1).trim();
      if (label && value) out.push({ label: label, value: value });
    });
    return out;
  }

  // 1234.5 -> "1.234,50" (es-AR style), independent of Intl locale data.
  function formatNumberEs(value, decimals) {
    var neg = value < 0;
    var s = Math.abs(value).toFixed(decimals || 0);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + parts.join(',');
  }

  /* Intl-based zone parts. Parses the en-US formatted string ("M/D/YYYY, HH:MM:SS") instead of using
   * formatToParts/hourCycle, which old engines lack. Returns null if Intl cannot do `timeZone`. */
  var fmtCache = {};
  function intlParts(date, zone) {
    var f = fmtCache[zone];
    if (!f) {
      f = fmtCache[zone] = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
      });
    }
    var n = f.format(date).match(/\d+/g);
    if (!n || n.length < 6) return null;
    return { y: +n[2], m: +n[0], d: +n[1], h: (+n[3]) % 24, mi: +n[4], s: +n[5] };
  }

  // Self-test once: does Intl honour IANA zones and DST on this engine?
  var intlOk = null;
  function intlReliable() {
    if (intlOk !== null) return intlOk;
    try {
      var tk = intlParts(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)), 'Asia/Tokyo');
      var md = intlParts(new Date(Date.UTC(2026, 6, 1, 12, 0, 0)), 'Europe/Madrid');
      intlOk = !!tk && !!md && tk.d === 1 && tk.h === 9 && md.h === 14;
    } catch (e) { intlOk = false; }
    return intlOk;
  }
  function setIntlReliable(v) { intlOk = v; } // tests

  function zoneValid(zone) {
    if (intlReliable()) {
      try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch (e) { return false; }
    }
    return (E.zones || require('./zones.js')).known(zone);
  }

  // Calendar fields of an instant in an IANA time zone (Intl, or the built-in table on old engines).
  function zoneParts(date, zone) {
    if (intlReliable()) return intlParts(date, zone);
    return (E.zones || require('./zones.js')).parts(date, zone);
  }

  var api = {
    DAYS: DAYS, DAYS_SHORT: DAYS_SHORT, MONTHS: MONTHS, pad2: pad2, formatDateEs: formatDateEs, parseYMD: parseYMD,
    ymdOfDate: ymdOfDate, daysBetween: daysBetween, weekdayOfYMD: weekdayOfYMD, parsePairs: parsePairs,
    formatNumberEs: formatNumberEs, zoneValid: zoneValid, zoneParts: zoneParts, intlParts: intlParts, setIntlReliable: setIntlReliable
  };
  E.util = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
