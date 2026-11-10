/* Time-zone fallback for engines whose Intl.DateTimeFormat does not support IANA `timeZone`
 * reliably (LG webOS 3.x, Chromium 38). A built-in table of UTC offsets + DST rules covers the
 * common zones. Pure logic: unit tested against Intl in Node. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  // std = standard offset in minutes east of UTC; dst = 'eu' | 'us' | 'au' | null
  var TABLE = {
    'UTC': [0, null], 'Etc/UTC': [0, null], 'GMT': [0, null],
    'Europe/London': [0, 'eu'], 'Europe/Dublin': [0, 'eu'], 'Europe/Lisbon': [0, 'eu'],
    'Europe/Madrid': [60, 'eu'], 'Europe/Paris': [60, 'eu'], 'Europe/Berlin': [60, 'eu'], 'Europe/Rome': [60, 'eu'],
    'Europe/Amsterdam': [60, 'eu'], 'Europe/Brussels': [60, 'eu'], 'Europe/Vienna': [60, 'eu'], 'Europe/Zurich': [60, 'eu'],
    'Europe/Athens': [120, 'eu'], 'Europe/Helsinki': [120, 'eu'], 'Europe/Kiev': [120, 'eu'], 'Europe/Istanbul': [180, null],
    'Europe/Moscow': [180, null],
    'America/New_York': [-300, 'us'], 'America/Toronto': [-300, 'us'], 'America/Chicago': [-360, 'us'],
    'America/Denver': [-420, 'us'], 'America/Los_Angeles': [-480, 'us'], 'America/Phoenix': [-420, null],
    'America/Mexico_City': [-360, null], 'America/Bogota': [-300, null], 'America/Lima': [-300, null],
    'America/Caracas': [-240, null], 'America/La_Paz': [-240, null],
    'America/Sao_Paulo': [-180, null], 'America/Montevideo': [-180, null], 'America/Asuncion': [-180, null],
    'America/Argentina/Buenos_Aires': [-180, null], 'America/Argentina/Cordoba': [-180, null],
    'America/Argentina/Mendoza': [-180, null], 'America/Argentina/Salta': [-180, null], 'America/Buenos_Aires': [-180, null],
    'Asia/Tokyo': [540, null], 'Asia/Seoul': [540, null], 'Asia/Shanghai': [480, null], 'Asia/Hong_Kong': [480, null],
    'Asia/Singapore': [480, null], 'Asia/Kolkata': [330, null], 'Asia/Dubai': [240, null], 'Asia/Bangkok': [420, null],
    'Africa/Johannesburg': [120, null], 'Africa/Lagos': [60, null], 'Africa/Nairobi': [180, null],
    'Australia/Sydney': [600, 'au'], 'Australia/Melbourne': [600, 'au'], 'Australia/Brisbane': [600, null]
  };

  function lastSunday(y, m0) { // UTC midnight of the last Sunday of month m0
    var d = new Date(Date.UTC(y, m0 + 1, 0));
    return Date.UTC(y, m0, d.getUTCDate() - d.getUTCDay());
  }
  function nthSunday(y, m0, n) {
    var first = new Date(Date.UTC(y, m0, 1)).getUTCDay();
    return Date.UTC(y, m0, 1 + ((7 - first) % 7) + (n - 1) * 7);
  }

  // Is DST in effect at UTC instant ms for a rule (std offset in minutes)?
  function dstActive(rule, std, ms) {
    var y = new Date(ms).getUTCFullYear(), H = 3600000, start, end;
    if (rule === 'eu') { start = lastSunday(y, 2) + H; end = lastSunday(y, 9) + H; return ms >= start && ms < end; }
    if (rule === 'us') { // 2:00 local standard time -> 2:00 local daylight time
      start = nthSunday(y, 2, 2) + 2 * H - std * 60000; end = nthSunday(y, 10, 1) + 1 * H - std * 60000;
      return ms >= start && ms < end;
    }
    if (rule === 'au') { // southern hemisphere: DST from first Sunday of October to first Sunday of April
      start = nthSunday(y, 9, 1) + 2 * H - std * 60000; end = nthSunday(y, 3, 1) + 2 * H - (std + 60) * 60000;
      return ms >= start || ms < end;
    }
    return false;
  }

  function known(zone) { return Object.prototype.hasOwnProperty.call(TABLE, zone); }

  function offsetMinutes(date, zone) {
    var e = TABLE[zone];
    return e[0] + (e[1] && dstActive(e[1], e[0], date.getTime()) ? 60 : 0);
  }

  // Calendar fields of an instant in `zone` using the table.
  function parts(date, zone) {
    var l = new Date(date.getTime() + offsetMinutes(date, zone) * 60000);
    return { y: l.getUTCFullYear(), m: l.getUTCMonth() + 1, d: l.getUTCDate(), h: l.getUTCHours(), mi: l.getUTCMinutes(), s: l.getUTCSeconds() };
  }

  var api = { TABLE: TABLE, known: known, offsetMinutes: offsetMinutes, parts: parts, dstActive: dstActive };
  E.zones = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
