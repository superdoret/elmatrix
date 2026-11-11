/* Sports: last result and next match of a team (TheSportsDB v1). */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};
  E.widgets = E.widgets || {};

  var BASE = 'https://www.thesportsdb.com/api/v1/json/%KEY%/';

  // The old free key "3" was disabled by TheSportsDB; its free test key is now "123".
  function sportsKey(value) {
    var key = String(value || '').trim();
    return (!key || key === '3') ? '123' : key;
  }

  var TEAM_TTL = 86400000, EVENT_TTL = 600000;

  function list(data, key) {
    var items = data && data[key];
    return Array.isArray(items) ? items.filter(function (e) { return e && typeof e === 'object'; }) : [];
  }

  // Exact (case-insensitive) name match first, else the first result.
  function pickTeam(data, name) {
    var teams = list(data, 'teams'), wanted = String(name || '').trim().toLowerCase();
    for (var i = 0; i < teams.length; i++) {
      if (String(teams[i].strTeam || '').trim().toLowerCase() === wanted) return teams[i];
    }
    return teams[0] || null;
  }

  /* Event instant: TheSportsDB reports UTC. -> {date: Date, hasTime} or null. */
  function eventDate(ev) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(String(ev.strTimestamp || ''));
    if (m) return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])), hasTime: true };
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ev.dateEvent || ''));
    if (!d) return null;
    var t = /^(\d{2}):(\d{2})/.exec(String(ev.strTime || ''));
    if (t) return { date: new Date(Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], 0)), hasTime: true };
    return { date: new Date(+d[1], +d[2] - 1, +d[3]), hasTime: false };
  }

  function formatWhen(ev) {
    var r = eventDate(ev);
    if (!r) return '--/--';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var s = p(r.date.getDate()) + '/' + p(r.date.getMonth() + 1);
    return r.hasTime ? s + ' ' + p(r.date.getHours()) + ':' + p(r.date.getMinutes()) : s;
  }

  function ts(ev) { var r = eventDate(ev); return r ? r.date.getTime() : 0; }

  function score(v) { return v !== null && v !== undefined && /^\d{1,3}$/.test(String(v)) ? String(v) : '-'; }

  // Most recent finished event -> {home, away, homeScore, awayScore, when} or null.
  function parseLast(data) {
    var evs = list(data, 'results').concat(list(data, 'events'));
    if (!evs.length) return null;
    var ev = evs.reduce(function (a, b) { return ts(b) > ts(a) ? b : a; });
    return { home: ev.strHomeTeam || '?', away: ev.strAwayTeam || '?', homeScore: score(ev.intHomeScore), awayScore: score(ev.intAwayScore), when: formatWhen(ev) };
  }

  // Earliest upcoming event -> {home, away, when} or null.
  function parseNext(data) {
    var evs = list(data, 'events').concat(list(data, 'results'));
    if (!evs.length) return null;
    var ev = evs.reduce(function (a, b) { return ts(b) < ts(a) ? b : a; });
    return { home: ev.strHomeTeam || '?', away: ev.strAwayTeam || '?', when: formatWhen(ev) };
  }

  var widget = {
    id: 'sports',
    sportsKey: sportsKey, pickTeam: pickTeam, parseLast: parseLast, parseNext: parseNext, formatWhen: formatWhen, eventDate: eventDate,
    run: async function (ctx) {
      var fb = ctx.fb, w = ctx.w, h = ctx.h, cfg = ctx.cfg, TL = ctx.TL;
      var teamName = String(cfg.team || '').trim();
      var msg = async function (lines, color, secs) {
        await ctx.loopFixed(secs || 4, 2, function () {
          fb.clear(0);
          lines.forEach(function (l, i) {
            ctx.drawFit(l, { fonts: ['9x18B', '7x14B'], x: 4, y: 20 + i * 34, w: w - 8, h: 30, align: 'center', color: color, maxScale: 2 });
          });
        });
      };
      if (!teamName) { await msg(['Sin equipo'], 0xffb020); return; }
      fb.clear(0);
      ctx.drawFit('Cargando deportes…', { fonts: ['9x18B', '7x14B'], x: 4, y: 0, w: w - 8, h: h, align: 'center', valign: 'middle', color: 0x8080a0, maxScale: 2 });
      ctx.present();
      var base = BASE.replace('%KEY%', encodeURIComponent(sportsKey(cfg.api_key)));
      var team, last = null, next = null;
      try {
        team = pickTeam(await ctx.abortable(ctx.getJson(base + 'searchteams.php?t=' + encodeURIComponent(teamName), TEAM_TTL)), teamName);
        if (!team || !team.idTeam) { await msg(['Equipo no', 'encontrado'], 0xffb020); return; }
        var id = encodeURIComponent(String(team.idTeam));
        try { last = parseLast(await ctx.abortable(ctx.getJson(base + 'eventslast.php?id=' + id, EVENT_TTL))); } catch (e1) { if (e1 && e1.name === 'AbortError') throw e1; }
        try { next = parseNext(await ctx.abortable(ctx.getJson(base + 'eventsnext.php?id=' + id, EVENT_TTL))); } catch (e2) { if (e2 && e2.name === 'AbortError') throw e2; }
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        await ctx.offline('DEPORTES', Math.min(cfg.duration, 6));
        return;
      }
      var title = String(team.strTeam || teamName).toUpperCase();
      if (!last && !next) { await msg(['Sin datos', title], 0xffd23c); return; }
      var panels = [];
      if (last) panels.push({ title: 'ÚLTIMO PARTIDO', m: last, scores: true });
      if (next) panels.push({ title: 'PRÓXIMO PARTIDO', m: next, scores: false });
      await ctx.loop(cfg.duration, 2, function () {
        fb.clear(0);
        ctx.drawFit(title, { fonts: ['10x20', '9x18B', '7x14B'], x: 4, y: 2, w: w - 8, h: 20, align: 'center', color: 0xffd23c, maxScale: 1 });
        fb.fillRect(6, 24, w - 12, 1, 0x242436);
        var colW = Math.floor(w / panels.length);
        panels.forEach(function (p, i) {
          var x0 = i * colW + 6, inner = colW - 12, y0 = 28;
          if (i > 0) fb.fillRect(i * colW, 30, 1, h - 36, 0x1c1c2c);
          ctx.drawFit(p.title, { fonts: ['6x13', '5x8'], x: x0, y: y0, w: inner, h: 13, align: 'center', color: 0x9090b0, maxScale: 1 });
          var scoreW = p.scores ? 14 : 0, nameW = inner - scoreW;
          var longest = p.m.home.length >= p.m.away.length ? p.m.home : p.m.away;
          var nf = ctx.fit(longest.toUpperCase(), ['9x18B', '7x14B', '6x13', '5x8'], nameW, 18, 1);
          [[p.m.home, p.scores ? p.m.homeScore : null], [p.m.away, p.scores ? p.m.awayScore : null]].forEach(function (r, k) {
            var ry = y0 + 14 + k * 19;
            fb.drawText(nf.font, TL.truncate(nf.font, r[0].toUpperCase(), nameW, 1), x0, ry, 0xf0f0ff, 1);
            if (r[1] !== null) {
              var sw = ctx.fonts['10x20'].measure(r[1]);
              fb.drawText(ctx.fonts['10x20'], r[1], x0 + inner - sw, ry - 1, 0x7dffb0, 1);
            }
          });
          ctx.drawFit(p.m.when, { fonts: ['9x18B', '7x14B', '6x13'], x: x0, y: y0 + 56, w: inner, h: 14, align: 'center', color: 0x6cd0ff, maxScale: 1 });
        });
      });
    }
  };
  E.widgets.sports = widget;
  if (typeof module !== 'undefined' && module.exports) module.exports = widget;
})(typeof window !== 'undefined' ? window : global);
