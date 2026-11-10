const test = require('node:test');
const assert = require('node:assert');
require('./load.js');
const Z = require('../js/zones.js');
const U = require('../js/util.js');

// Compare the built-in table against the (modern) Intl implementation over a year of instants.
test('zone table matches Intl for every table zone across the year (DST included)', () => {
  const dates = [];
  for (let m = 0; m < 12; m++) for (const d of [1, 8, 15, 22, 28]) for (const h of [0, 7, 13, 23]) dates.push(new Date(Date.UTC(2026, m, d, h, 30, 0)));
  // also the days around DST switches
  for (const [m, d] of [[2, 8], [2, 9], [2, 29], [2, 30], [9, 25], [9, 26], [10, 1], [10, 2], [3, 5], [3, 6], [9, 3], [9, 4]]) {
    for (let h = 0; h < 24; h += 3) dates.push(new Date(Date.UTC(2026, m, d, h, 0, 0)));
  }
  let checked = 0;
  for (const zone of Object.keys(Z.TABLE)) {
    for (const date of dates) {
      const want = U.intlParts(date, zone), got = Z.parts(date, zone);
      assert.deepStrictEqual(got, want, zone + ' @ ' + date.toISOString());
      checked++;
    }
  }
  assert.ok(checked > 3000);
});

test('zoneParts / zoneValid use the table when Intl is flagged unreliable', () => {
  try {
    U.setIntlReliable(false);
    assert.strictEqual(U.zoneValid('Europe/Madrid'), true);
    assert.strictEqual(U.zoneValid('Mars/Olympus'), false);
    const p = U.zoneParts(new Date(Date.UTC(2026, 10, 10, 20, 0, 0)), 'Asia/Tokyo');
    assert.deepStrictEqual([p.y, p.m, p.d, p.h], [2026, 11, 11, 5]);
    const ws = require('../js/widgets/worldclock.js');
    const z = ws.parseZones(['Madrid|Europe/Madrid', 'Cordoba|America/Argentina/Cordoba', 'X|Nowhere/City']);
    assert.deepStrictEqual(z.map(x => x.zone), ['Europe/Madrid', 'America/Argentina/Cordoba']);
    const d = new Date(Date.UTC(2026, 6, 1, 12, 0, 0));
    assert.strictEqual(ws.zoneClock(d, 'Europe/Madrid', true, d).hh, '14'); // CEST
  } finally { U.setIntlReliable(null); }
});

test('Intl self-test passes on this (modern) engine', () => {
  U.setIntlReliable(null);
  assert.strictEqual(U.zoneParts(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)), 'Asia/Tokyo').h, 9);
  assert.strictEqual(U.zoneParts(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)), 'UTC').h, 0); // never 24
});

test('default catalog zones are all in the fallback table', () => {
  const C = require('../js/catalog.js');
  const zones = C.byId('worldclock').fields[0].def.map(s => s.split('|')[1]);
  zones.forEach(z => assert.ok(Z.known(z), z));
});
