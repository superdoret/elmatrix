const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const E = require('./load.js');

const fixture = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
const W = E.widgets;

// ---- util -------------------------------------------------------------
test('util: parseYMD rejects impossible dates; daysBetween is DST safe', () => {
  const U = E.util;
  assert.deepStrictEqual(U.parseYMD('2027-01-01'), { y: 2027, m: 1, d: 1 });
  assert.strictEqual(U.parseYMD('2027-02-31'), null);
  assert.strictEqual(U.parseYMD('27-1-1'), null);
  assert.strictEqual(U.daysBetween({ y: 2026, m: 11, d: 10 }, { y: 2027, m: 1, d: 1 }), 52);
  assert.strictEqual(U.daysBetween({ y: 2026, m: 3, d: 28 }, { y: 2026, m: 3, d: 30 }), 2); // spans a DST change in Europe
  assert.strictEqual(U.daysBetween({ y: 2026, m: 1, d: 5 }, { y: 2026, m: 1, d: 1 }), -4);
});

test('util: parsePairs, formatNumberEs, weekday, Spanish date', () => {
  const U = E.util;
  assert.deepStrictEqual(U.parsePairs(['A|b', 'nosep', '|x', 'c | d ']), [{ label: 'A', value: 'b' }, { label: 'c', value: 'd' }]);
  assert.strictEqual(U.formatNumberEs(1234.5, 2), '1.234,50');
  assert.strictEqual(U.formatNumberEs(67432, 0), '67.432');
  assert.strictEqual(U.formatNumberEs(0.5, 4), '0,5000');
  assert.strictEqual(U.formatNumberEs(-1234567, 0), '-1.234.567');
  assert.strictEqual(U.weekdayOfYMD({ y: 2026, m: 11, d: 10 }), 2); // Tuesday
  assert.strictEqual(U.formatDateEs(new Date(2026, 10, 10)), 'MARTES 10 DE NOVIEMBRE');
});

// ---- clock / worldclock -------------------------------------------------
test('clock: 12h and 24h text', () => {
  assert.deepStrictEqual(W.clock.timeText(new Date(2026, 0, 1, 0, 5), true), { hh: '00', mm: '05', ampm: '' });
  assert.deepStrictEqual(W.clock.timeText(new Date(2026, 0, 1, 0, 5), false), { hh: '12', mm: '05', ampm: 'AM' });
  assert.deepStrictEqual(W.clock.timeText(new Date(2026, 0, 1, 15, 30), false), { hh: '3', mm: '30', ampm: 'PM' });
});

test('worldclock: valid zones kept, invalid dropped, max 6', () => {
  const z = W.worldclock.parseZones(['Madrid|Europe/Madrid', 'Bad|Mars/Olympus', 'Tokyo|Asia/Tokyo', 'nolabel']);
  assert.deepStrictEqual(z.map(x => x.label), ['Madrid', 'Tokyo']);
  const many = W.worldclock.parseZones(Array.from({ length: 9 }, (_, i) => 'Z' + i + '|UTC'));
  assert.strictEqual(many.length, 6);
});

test('worldclock: zone times and day difference', () => {
  // 2026-11-10 20:00 UTC
  const d = new Date(Date.UTC(2026, 10, 10, 20, 0, 0));
  const tokyo = W.worldclock.zoneClock(d, 'Asia/Tokyo', true, new Date(Date.UTC(2026, 10, 10, 20, 0, 0)));
  assert.strictEqual(tokyo.hh + ':' + tokyo.mm, '05:00'); // UTC+9, next day
  const madrid = W.worldclock.zoneClock(d, 'Europe/Madrid', true, d);
  assert.strictEqual(madrid.hh + ':' + madrid.mm, '21:00'); // CET in November
  const ny = W.worldclock.zoneClock(d, 'America/New_York', false, d);
  assert.strictEqual(ny.hh + ':' + ny.mm + ' ' + ny.ampm, '3:00 PM'); // EST
  const utc = W.worldclock.zoneClock(d, 'UTC', true, d);
  assert.strictEqual(utc.dayDiff, 0);
  // dayDiff is relative to the supplied local date, independent of the machine zone
  const local = new Date(2026, 10, 10, 12, 0, 0);
  assert.strictEqual(W.worldclock.zoneClock(d, 'Asia/Tokyo', true, new Date(2026, 10, 10, 12)).dayDiff, 1);
  assert.strictEqual(W.worldclock.zoneClock(d, 'America/New_York', true, local).dayDiff, 0);
  assert.strictEqual(W.worldclock.zoneClock(d, 'America/New_York', true, new Date(2026, 10, 11, 12)).dayDiff, -1);
});

test('worldclock: dayDiff with explicit calendar dates', () => {
  const U = E.util;
  const d = new Date(Date.UTC(2026, 10, 10, 20, 0, 0));
  const p = U.zoneParts(d, 'Asia/Tokyo');
  assert.deepStrictEqual([p.y, p.m, p.d, p.h], [2026, 11, 11, 5]);
  assert.strictEqual(U.zoneParts(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)), 'UTC').h, 0); // never 24
});

// ---- countdown -----------------------------------------------------------
test('countdown: parse, order, past filtering', () => {
  const ev = W.countdown.parseEvents(['Ano nuevo|2027-01-01', 'Mal|2027-13-01', 'Cumple|2026-11-12', 'Viejo|2026-11-01']);
  assert.deepStrictEqual(ev.map(e => e.name), ['Ano nuevo', 'Cumple', 'Viejo']);
  const today = { y: 2026, m: 11, d: 10 };
  const rows = W.countdown.buildCountdown(ev, today, false);
  assert.deepStrictEqual(rows, [{ name: 'Cumple', days: 2 }, { name: 'Ano nuevo', days: 52 }]);
  const withPast = W.countdown.buildCountdown(ev, today, true);
  assert.deepStrictEqual(withPast.map(r => r.days), [2, 52, -9]);
  assert.strictEqual(W.countdown.daysLabel(0), '¡HOY!');
  assert.strictEqual(W.countdown.daysLabel(1), 'MAÑANA');
  assert.strictEqual(W.countdown.daysLabel(5), 'DÍAS');
});

// ---- rates ------------------------------------------------------------------
test('rates: CoinGecko canned JSON', () => {
  const rows = W.rates.parseCrypto(fixture('coingecko'), ['bitcoin', 'ethereum', 'solana', 'missing'], 'usd');
  assert.deepStrictEqual(rows.map(r => r.symbol), ['BTC', 'ETH', 'SOL']);
  assert.strictEqual(rows[0].text, '67.432');
  assert.ok(rows[0].change > 2.3 && rows[1].change < 0);
  assert.strictEqual(rows[2].change, null); // null change tolerated
  assert.strictEqual(rows[2].text, '0,5000');
  assert.deepStrictEqual(W.rates.parseCrypto(null, ['bitcoin'], 'usd'), []);
  assert.deepStrictEqual(W.rates.parseCrypto({ bitcoin: { eur: 1 } }, ['bitcoin'], 'usd'), []);
});

test('rates: dolarapi canned JSON and formatting', () => {
  const d = W.rates.parseDolar(fixture('dolarapi'), 'blue');
  assert.deepStrictEqual(d, { name: 'BLUE', buy: 1180, sell: 1200 });
  assert.strictEqual(W.rates.parseDolar({}, 'blue'), null);
  assert.strictEqual(W.rates.parseDolar('x', 'blue'), null);
  assert.strictEqual(W.rates.formatChange(2.345), '+2,3%');
  assert.strictEqual(W.rates.formatChange(-1.25), '-1,3%');
  assert.deepStrictEqual(W.rates.cleanIds([' Bitcoin ', 'bad id!', 'bitcoin', 'eth-1']), ['bitcoin', 'eth-1']);
});

// ---- forecast -----------------------------------------------------------------
test('forecast: geocode + daily parsing, WMO icons', () => {
  assert.deepStrictEqual(W.forecast.parseGeocode(fixture('geocode')), { name: 'Barcelona', lat: 41.38879, lon: 2.15899 });
  assert.strictEqual(W.forecast.parseGeocode({}), null);
  assert.strictEqual(W.forecast.parseGeocode({ results: [{ name: 'x' }] }), null);
  const days = W.forecast.parseDaily(fixture('forecast'), 3);
  assert.strictEqual(days.length, 3);
  assert.deepStrictEqual(days[2], { date: '2026-11-12', code: 61, tmax: 15.8, tmin: 9.5 });
  assert.deepStrictEqual(W.forecast.parseDaily({ daily: { time: ['2026-11-10'] } }, 2), [{ date: '2026-11-10', code: null, tmax: null, tmin: null }]);
  assert.deepStrictEqual(W.forecast.parseDaily(null, 3), []);
  const I = E.icons;
  assert.deepStrictEqual([0, 2, 3, 45, 63, 75, 95, 1234].map(I.iconForWmo), ['clear', 'partly', 'cloudy', 'fog', 'rain', 'snow', 'storm', 'unknown']);
  assert.strictEqual(W.forecast.formatTemp(14.6), '15');
  assert.strictEqual(W.forecast.formatTemp(null), '--');
  assert.strictEqual(W.forecast.dayLabel('2026-11-10', 0), 'HOY');
  assert.strictEqual(W.forecast.dayLabel('2026-11-11', 1), 'MIÉ 11');
});

// ---- sports --------------------------------------------------------------------
test('sports: the disabled free key "3" and blanks map to the current test key "123"', () => {
  assert.strictEqual(W.sports.sportsKey('3'), '123');
  assert.strictEqual(W.sports.sportsKey(' 3 '), '123');
  assert.strictEqual(W.sports.sportsKey(''), '123');
  assert.strictEqual(W.sports.sportsKey(undefined), '123');
  assert.strictEqual(W.sports.sportsKey('123'), '123');
  assert.strictEqual(W.sports.sportsKey('mykey'), 'mykey');
});

test('sports: team pick, last and next events from canned JSON', () => {
  const team = W.sports.pickTeam(fixture('sports-teams'), 'barcelona');
  assert.strictEqual(team.idTeam, '133739'); // exact match beats first result order
  assert.strictEqual(W.sports.pickTeam(fixture('sports-teams'), 'Zzz').idTeam, '133739'); // falls back to first
  assert.strictEqual(W.sports.pickTeam({ teams: null }, 'x'), null);
  const last = W.sports.parseLast(fixture('sports-last'));
  assert.strictEqual(last.home, 'Barcelona');
  assert.strictEqual(last.homeScore, '2');
  assert.strictEqual(last.awayScore, '1');
  const next = W.sports.parseNext(fixture('sports-next'));
  assert.strictEqual(next.home, 'Real Madrid');
  assert.strictEqual(W.sports.parseLast({}), null);
  assert.strictEqual(W.sports.parseNext({ events: null }), null);
  // scores that are not numbers become "-"
  const nl = W.sports.parseLast({ results: [{ strHomeTeam: 'A', strAwayTeam: 'B', intHomeScore: null, intAwayScore: 'x', dateEvent: '2026-01-02' }] });
  assert.deepStrictEqual([nl.homeScore, nl.awayScore], ['-', '-']);
});

test('sports: event dates are UTC converted to local and tolerate missing time', () => {
  const r = W.sports.eventDate({ strTimestamp: '2026-11-15T20:00:00' });
  assert.strictEqual(r.date.toISOString(), '2026-11-15T20:00:00.000Z');
  assert.strictEqual(r.hasTime, true);
  const d = W.sports.eventDate({ dateEvent: '2026-11-15' });
  assert.strictEqual(d.hasTime, false);
  assert.strictEqual(W.sports.eventDate({}), null);
  assert.strictEqual(W.sports.formatWhen({}), '--/--');
  assert.match(W.sports.formatWhen({ dateEvent: '2026-11-15' }), /^15\/11$/);
});

// ---- phrases / word / data ------------------------------------------------------
test('data: phrases and words are non-empty uppercase Spanish/English strings', () => {
  assert.ok(E.data.phrases.length > 40);
  assert.ok(E.data.words.length > 100);
  assert.ok(E.data.phrases.every(p => typeof p === 'string' && p.length > 5));
  assert.ok(!E.data.phrases.some(p => p.includes('DÏAS')));
});

test('phrases: effects return colours; word: slide offsets converge to zero', () => {
  const FB = E.fb;
  W.phrases.EFFECTS.forEach(e => {
    const c = W.phrases.effectColor(e, FB, 1.2, 100)(10, 5);
    assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff, e);
  });
  ['left', 'right', 'top', 'bottom'].forEach(dir => {
    const start = W.word.slideOffset(dir, 0, 1, 192, 108);
    assert.ok(Math.abs(start.dx) === 192 || Math.abs(start.dy) === 108);
    assert.deepStrictEqual(W.word.slideOffset(dir, 1, 1, 192, 108), { dx: 0, dy: 0 });
  });
  assert.strictEqual(W.word.easeOut(0), 0);
  assert.strictEqual(W.word.easeOut(2), 1);
});

// ---- pixelart --------------------------------------------------------------------
test('pixelart scene: sky, night and body arc', () => {
  const P = W.pixelart;
  assert.deepStrictEqual(P.skyColor(12), [90, 170, 255]);
  assert.deepStrictEqual(P.skyColor(0), [4, 4, 28]);
  assert.deepStrictEqual(P.skyColor(24), P.skyColor(0));
  assert.strictEqual(P.isNight(3), true);
  assert.strictEqual(P.isNight(12), false);
  assert.strictEqual(P.isNight(19.5), true);
  const noon = P.bodyPosition(12, 192, 90, 10);
  assert.strictEqual(noon.kind, 'sun');
  assert.ok(Math.abs(noon.x - 95) <= 1 && noon.y === 10);
  const dawn = P.bodyPosition(6, 192, 90, 10);
  assert.ok(dawn.x === 0 && dawn.y === 90);
  assert.strictEqual(P.bodyPosition(0, 192, 90, 10).kind, 'moon');
});

test('pixelart snake: never reverses, avoids walls and body, eats food', () => {
  const P = W.pixelart;
  // head in a corner: only inward moves are legal
  assert.deepStrictEqual(P.legalMoves([[0, 0]], [5, 5], 10, 10).map(String).sort(), ['0,1', '1,0']);
  // cannot reverse into the neck
  const body = [[3, 3], [2, 3]];
  assert.ok(!P.legalMoves(body, null, 10, 10).some(d => d[0] === -1 && d[1] === 0));
  // advance: moves, grows when eating, dies on walls
  const r = P.advance([[1, 1], [0, 1]], [1, 0], null, 5, 5);
  assert.deepStrictEqual(r.body, [[2, 1], [1, 1]]);
  const eat = P.advance([[1, 1], [0, 1]], [1, 0], [2, 1], 5, 5);
  assert.strictEqual(eat.ate, true);
  assert.strictEqual(eat.body.length, 3);
  assert.strictEqual(P.advance([[4, 0], [3, 0]], [1, 0], null, 5, 5), null);
  // food never spawns on the snake
  const f = P.placeFood([[0, 0], [1, 0]], 2, 2, () => 0);
  assert.deepStrictEqual(f, [0, 1]);
  assert.strictEqual(P.placeFood([[0, 0]], 1, 1), null);
});

test('pixelart snake: a full autoplay run stays legal and makes progress', () => {
  const P = W.pixelart;
  let seed = 7;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const g = new P.SnakeGame(24, 14, rng);
  let steps = 0;
  while (!g.over && steps < 4000) {
    const before = g.body.length;
    g.step();
    steps++;
    const seen = new Set(g.body.map(String));
    assert.strictEqual(seen.size, g.body.length, 'body overlaps itself');
    g.body.forEach(c => assert.ok(c[0] >= 0 && c[0] < 24 && c[1] >= 0 && c[1] < 14));
    assert.ok(g.body.length >= before);
  }
  assert.ok(g.eaten >= 3, 'snake should eat several apples, ate ' + g.eaten);
  g.reset();
  assert.strictEqual(g.body.length, 1);
  assert.strictEqual(g.over, false);
});
