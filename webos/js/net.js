/* Network helper: JSON GET with timeout, TTL cache and stale fallback. */
(function (g) {
  'use strict';
  var E = g.ELM = g.ELM || {};

  /* deps: {fetch(url, opts) -> Promise<Response-like {ok,status,json()}>, now(), timeoutMs} */
  function Net(deps) {
    deps = deps || {};
    this.fetchImpl = deps.fetch || (typeof fetch === 'function' ? function (u, o) { return fetch(u, o); } : null);
    this.now = deps.now || function () { return Date.now(); };
    this.timeoutMs = deps.timeoutMs || 8000;
    this.cache = {};
  }

  /* Resolves with parsed JSON. Fresh cache (age < ttlMs) wins; on network failure a stale
   * cached value is returned if present, otherwise the promise rejects. */
  Net.prototype.getJson = function (url, ttlMs) {
    var self = this;
    var hit = this.cache[url];
    if (hit && self.now() - hit.at < (ttlMs || 0)) return Promise.resolve(hit.data);
    if (!this.fetchImpl) return Promise.reject(new Error('fetch unavailable'));
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error('timeout')); }, self.timeoutMs);
    });
    var req = Promise.resolve().then(function () { return self.fetchImpl(url, { cache: 'no-store' }); }).then(function (res) {
      if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
      return res.json();
    });
    return Promise.race([req, timeout]).then(function (data) {
      clearTimeout(timer);
      self.cache[url] = { at: self.now(), data: data };
      return data;
    }, function (err) {
      clearTimeout(timer);
      if (hit) return hit.data;
      throw err;
    });
  };

  var api = { Net: Net };
  E.net = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
