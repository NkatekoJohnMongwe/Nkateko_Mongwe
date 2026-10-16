/* Live RSS news for the Viewpoint page.
   Add or remove sources in the FEEDS list below. */
(function () {
  'use strict';

  var FEEDS = [
    // South Africa
    { name: 'MarkLives',             url: 'https://www.marklives.com/feed/',                 topic: 'Marketing',           region: 'South Africa' },
    { name: 'Bizcommunity',          url: 'https://www.bizcommunity.com/rss/196/423.html',   topic: 'Marketing',           region: 'South Africa' },
    { name: 'The Media Online',      url: 'https://themediaonline.co.za/feed/',              topic: 'Media',               region: 'South Africa' },
    { name: 'TechCentral',           url: 'https://techcentral.co.za/feed/',                 topic: 'Media',               region: 'South Africa' },
    { name: 'Moneyweb',              url: 'https://www.moneyweb.co.za/feed/',                topic: 'Market intelligence', region: 'South Africa' },
    { name: 'BusinessTech',          url: 'https://businesstech.co.za/news/feed/',           topic: 'Market intelligence', region: 'South Africa' },

    // Global: marketing
    { name: 'Marketing Week',        url: 'https://www.marketingweek.com/feed/',             topic: 'Marketing',           region: 'Global' },
    { name: 'Adweek',                url: 'https://www.adweek.com/feed/',                    topic: 'Marketing',           region: 'Global' },
    { name: 'Marketing Dive',        url: 'https://www.marketingdive.com/feeds/news/',       topic: 'Marketing',           region: 'Global' },
    { name: 'Search Engine Land',    url: 'https://searchengineland.com/feed',               topic: 'Marketing',           region: 'Global' },

    // Global: media
    { name: 'Digiday',               url: 'https://digiday.com/feed/',                       topic: 'Media',               region: 'Global' },
    { name: 'Nieman Lab',            url: 'https://www.niemanlab.org/feed/',                 topic: 'Media',               region: 'Global' },
    { name: 'Press Gazette',         url: 'https://pressgazette.co.uk/feed/',                topic: 'Media',               region: 'Global' },

    // Global: digital analytics
    { name: "Simo Ahava's blog",     url: 'https://www.simoahava.com/index.xml',             topic: 'Digital analytics',   region: 'Global' },
    { name: 'Analytics Mania',       url: 'https://www.analyticsmania.com/feed/',            topic: 'Digital analytics',   region: 'Global' },
    { name: 'Measurelab',            url: 'https://www.measurelab.co.uk/feed/',              topic: 'Digital analytics',   region: 'Global' },
    { name: 'CXL',                   url: 'https://cxl.com/blog/feed/',                      topic: 'Digital analytics',   region: 'Global' },

    // Global: market intelligence
    { name: 'MarketingCharts',       url: 'https://www.marketingcharts.com/feed',            topic: 'Market intelligence', region: 'Global' },
    { name: 'Harvard Business Review', url: 'https://feeds.hbr.org/harvardbusiness',         topic: 'Market intelligence', region: 'Global' },
    { name: 'BBC Business',          url: 'https://feeds.bbci.co.uk/news/business/rss.xml',  topic: 'Market intelligence', region: 'Global' }
  ];

  var CACHE_PREFIX = 'vpfeed1:';
  var CACHE_TTL = 30 * 60 * 1000;   // reuse fetched stories for 30 minutes
  var PER_FEED = 6;                 // newest stories kept per source
  var PAGE_SIZE = 18;               // stories shown per click
  var CONCURRENCY = 5;              // feeds requested at once
  var TIMEOUT = 9000;               // ms before a request is abandoned

  var listEl = document.querySelector('[data-feed-list]');
  if (!listEl) return;
  var statusEl = document.querySelector('[data-feed-status]');
  var moreBtn = document.querySelector('[data-feed-more]');
  var refreshBtn = document.querySelector('[data-feed-refresh]');

  var state = { topic: 'All', region: 'All', shown: PAGE_SIZE, items: [], loaded: 0, failed: 0, running: false, updated: null };

  /* ---------- storage (always guarded) ---------- */
  function cacheGet(key) {
    try {
      var raw = window.localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.items || Date.now() - obj.t > CACHE_TTL) return null;
      return obj.items;
    } catch (e) { return null; }
  }
  function cacheSet(key, items) {
    try { window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), items: items })); } catch (e) { /* storage full or blocked */ }
  }
  function cacheClear() {
    try {
      Object.keys(window.localStorage).forEach(function (k) {
        if (k.indexOf(CACHE_PREFIX) === 0) window.localStorage.removeItem(k);
      });
    } catch (e) { /* ignore */ }
  }

  /* ---------- text helpers ---------- */
  function plainText(html) {
    if (!html) return '';
    var doc = new DOMParser().parseFromString(String(html), 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function summarise(html) {
    var t = plainText(html);
    if (t.length <= 170) return t;
    t = t.slice(0, 170);
    return t.slice(0, t.lastIndexOf(' ') > 100 ? t.lastIndexOf(' ') : 170) + '…';
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }

  /* ---------- fetching ---------- */
  function timedFetch(url, asJson) {
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return asJson ? r.json() : r.text();
    }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  // Route 1: rss2json turns a feed into CORS-friendly JSON.
  function viaJson(feed) {
    var api = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(feed.url);
    return timedFetch(api, true).then(function (d) {
      if (!d || d.status !== 'ok' || !d.items) throw new Error('bad response');
      return d.items.map(function (i) {
        // rss2json dates are "YYYY-MM-DD HH:MM:SS" in UTC
        var ms = i.pubDate ? Date.parse(String(i.pubDate).replace(' ', 'T') + 'Z') : NaN;
        return { title: plainText(i.title), link: safeUrl(i.link), date: isNaN(ms) ? 0 : ms, summary: summarise(i.description || i.content) };
      });
    });
  }

  // Route 2: fetch the raw XML through a CORS proxy and parse it in the browser.
  function viaXml(feed) {
    var proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(feed.url);
    return timedFetch(proxy, false).then(function (txt) {
      var xml = new DOMParser().parseFromString(txt, 'text/xml');
      if (xml.querySelector('parsererror')) throw new Error('not xml');
      function text(el, names) {
        for (var n = 0; n < names.length; n++) {
          var f = el.getElementsByTagName(names[n])[0];
          if (f && f.textContent) return f.textContent;
        }
        return '';
      }
      var nodes = Array.prototype.slice.call(xml.querySelectorAll('item, entry'));
      return nodes.map(function (el) {
        var link = text(el, ['link']);
        if (!link || !/^https?:/i.test(link.trim())) {
          var a = el.querySelector('link[href]');
          link = a ? a.getAttribute('href') : '';
        }
        var ms = Date.parse(text(el, ['pubDate', 'published', 'updated', 'dc:date']));
        return {
          title: plainText(text(el, ['title'])),
          link: safeUrl(link.trim()),
          date: isNaN(ms) ? 0 : ms,
          summary: summarise(text(el, ['description', 'summary', 'content:encoded', 'content']))
        };
      });
    });
  }

  function loadFeed(feed) {
    var cached = cacheGet(feed.url);
    var done = function (items) {
      return items
        .filter(function (i) { return i.title && i.link; })
        .sort(function (a, b) { return b.date - a.date; })
        .slice(0, PER_FEED)
        .map(function (i) { i.source = feed.name; i.topic = feed.topic; i.region = feed.region; return i; });
    };
    if (cached) return Promise.resolve(cached);
    return viaJson(feed).catch(function () { return viaXml(feed); }).then(function (items) {
      var out = done(items);
      if (!out.length) throw new Error('empty');
      cacheSet(feed.url, out);
      return out;
    });
  }

  function loadAll() {
    if (state.running) return;
    state.running = true;
    state.items = []; state.loaded = 0; state.failed = 0;
    state.shown = PAGE_SIZE;
    render();

    var queue = FEEDS.slice();
    var active = 0;

    function next() {
      if (!queue.length) {
        if (active === 0) { state.running = false; state.updated = new Date(); render(); }
        return;
      }
      var feed = queue.shift();
      active++;
      loadFeed(feed).then(function (items) {
        state.loaded++;
        state.items = state.items.concat(items);
      }, function () {
        state.failed++;
      }).then(function () {
        active--;
        render();
        next();
      });
    }
    for (var i = 0; i < CONCURRENCY; i++) next();
  }

  /* ---------- rendering ---------- */
  function timeAgo(ms) {
    if (!ms) return null;
    var mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    var days = Math.round(hrs / 24);
    if (days < 7) return days + (days === 1 ? ' day ago' : ' days ago');
    return new Date(ms).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt) n.textContent = txt;
    return n;
  }

  function visibleItems() {
    var seen = {};
    return state.items
      .filter(function (i) {
        if (state.topic !== 'All' && i.topic !== state.topic) return false;
        if (state.region !== 'All' && i.region !== state.region) return false;
        if (seen[i.link]) return false;
        seen[i.link] = true;
        return true;
      })
      .sort(function (a, b) { return b.date - a.date; });
  }

  function render() {
    var all = visibleItems();
    var shown = all.slice(0, state.shown);
    var frag = document.createDocumentFragment();

    shown.forEach(function (i) {
      var li = el('li', 'feed-item');
      var a = el('a', 'feed-title', i.title);
      a.href = i.link; a.target = '_blank'; a.rel = 'noopener';
      li.appendChild(a);
      if (i.summary) li.appendChild(el('p', 'feed-summary', i.summary));
      var meta = el('p', 'feed-meta');
      meta.appendChild(el('span', 'feed-source', i.source));
      meta.appendChild(el('span', null, i.region));
      meta.appendChild(el('span', null, i.topic));
      var when = timeAgo(i.date);
      if (when) {
        var t = el('time', null, when);
        t.setAttribute('datetime', new Date(i.date).toISOString());
        meta.appendChild(t);
      }
      li.appendChild(meta);
      frag.appendChild(li);
    });
    listEl.replaceChildren(frag);

    moreBtn.hidden = all.length <= state.shown;

    var total = FEEDS.length;
    var msg;
    if (state.running) {
      msg = 'Loading the latest stories… ' + (state.loaded + state.failed) + ' of ' + total + ' sources checked.';
    } else if (!state.items.length) {
      msg = 'Couldn’t load the feeds. Check your connection and select Refresh.';
    } else if (!all.length) {
      msg = 'No stories for this selection right now. Try another topic or region.';
    } else {
      var time = state.updated ? state.updated.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '';
      msg = 'Latest from ' + state.loaded + ' sources, updated ' + time + '.';
      if (state.failed) msg += ' ' + state.failed + (state.failed === 1 ? ' source' : ' sources') + ' didn’t respond.';
    }
    statusEl.textContent = msg;
  }

  /* ---------- controls ---------- */
  function bindFilter(attr, key) {
    var buttons = document.querySelectorAll('[' + attr + ']');
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        state[key] = b.getAttribute(attr);
        state.shown = PAGE_SIZE;
        buttons.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        render();
      });
    });
  }
  bindFilter('data-feed-topic', 'topic');
  bindFilter('data-feed-region', 'region');

  moreBtn.addEventListener('click', function () { state.shown += PAGE_SIZE; render(); });
  refreshBtn.addEventListener('click', function () { if (!state.running) { cacheClear(); loadAll(); } });

  loadAll();
})();
