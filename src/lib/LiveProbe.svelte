<script>
  // Generates a self-contained probe (console snippet + bookmarklet) that runs
  // INSIDE a running Mendix app's page, using the client data API. Because
  // `mx.data.get` uses the live session and the app's own origin, it reports
  // exactly which objects the current user (e.g. anonymous) can actually read
  // per entity — the real question for a data-privacy check.

  let entitiesText = 'Administration.Account';
  let amount = 100;
  let offset = 0;
  let copied = false;

  // The payload that runs in the Mendix page. Kept as a real function so it
  // stays lintable; serialized via toString() and called with the config.
  // Phase 1: discover every entity (mx.meta.getMap) and probe each for
  // readability + exact count. Phase 2: click an entity to load its objects.
  function probePayload(cfg) {
    if (typeof mx === 'undefined' || !mx.data || !mx.data.get) {
      alert(
        'mx.data not found.\n\nRun this in the browser tab of the RUNNING Mendix app ' +
          '(the page where you are logged in / browsing the app), not on this generator page.'
      );
      return;
    }
    var amount = cfg.amount || 100;
    var offset = cfg.offset || 0;

    // Entities: explicit list wins, else discover the full metamodel.
    var entities = cfg.entities && cfg.entities.length ? cfg.entities : null;
    if (!entities) {
      try {
        var map = mx.meta.getMap();
        entities = map instanceof Map ? Array.from(map.keys()) : Object.keys(map);
      } catch (e) {
        alert('Could not read the metamodel (mx.meta.getMap): ' + (e && e.message));
        return;
      }
    }
    entities = entities.slice().sort();

    var COLORS = {
      READABLE: '#3fb950',
      'empty/constrained': '#d29922',
      denied: '#f85149',
      timeout: '#8b98a5',
      error: '#f85149',
      '…': '#8b98a5'
    };

    var old = document.getElementById('__dp_probe_panel');
    if (old) old.remove();

    var panel = document.createElement('div');
    panel.id = '__dp_probe_panel';
    panel.style.cssText =
      'position:fixed;top:12px;right:12px;width:460px;max-height:92vh;overflow:auto;' +
      'z-index:2147483647;background:#1a2029;color:#e6edf3;' +
      'font:13px system-ui,-apple-system,Segoe UI,sans-serif;border:1px solid #2e3946;' +
      'border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.55)';

    var head = document.createElement('div');
    head.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;' +
      'border-bottom:1px solid #2e3946;position:sticky;top:0;background:#232b36;z-index:1';
    var title = document.createElement('strong');
    title.textContent = 'Data Privacy Probe';
    head.appendChild(title);
    var close = document.createElement('button');
    close.textContent = '×';
    close.style.cssText =
      'background:none;border:none;color:#8b98a5;font-size:20px;line-height:1;cursor:pointer';
    close.onclick = function () {
      panel.remove();
    };
    head.appendChild(close);
    panel.appendChild(head);

    var bar = document.createElement('div');
    bar.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;gap:8px;' +
      'padding:8px 12px;border-bottom:1px solid #2e3946;position:sticky;top:41px;background:#1a2029;z-index:1';
    var statusLine = document.createElement('span');
    statusLine.style.cssText = 'color:#8b98a5';
    statusLine.textContent = 'Discovered ' + entities.length + ' entities — probing…';
    var filterLbl = document.createElement('label');
    filterLbl.style.cssText = 'color:#8b98a5;display:flex;gap:5px;align-items:center;cursor:pointer;white-space:nowrap';
    var filterChk = document.createElement('input');
    filterChk.type = 'checkbox';
    filterLbl.appendChild(filterChk);
    filterLbl.appendChild(document.createTextNode('readable only'));
    bar.appendChild(statusLine);
    bar.appendChild(filterLbl);
    panel.appendChild(bar);

    var body = document.createElement('div');
    body.style.cssText = 'padding:6px 12px 12px';
    panel.appendChild(body);
    document.body.appendChild(panel);

    window.__scan = [];
    window.__dp_results = {};

    var rows = {}; // entity -> { card, badge, countEl, det, loaded, status }

    function applyFilter() {
      var only = filterChk.checked;
      Object.keys(rows).forEach(function (e) {
        var r = rows[e];
        r.card.style.display = !only || r.status === 'READABLE' ? '' : 'none';
      });
    }
    filterChk.onchange = applyFilter;

    function esc(s) {
      return String(s).replace(/[&<>]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
      });
    }

    // --- build a row per entity ---
    entities.forEach(function (entity) {
      var card = document.createElement('div');
      card.style.cssText =
        'border:1px solid #2e3946;border-radius:8px;margin:8px 0;overflow:hidden';

      var ch = document.createElement('div');
      ch.style.cssText =
        'padding:8px 10px;background:#232b36;cursor:pointer;display:flex;' +
        'justify-content:space-between;gap:8px;align-items:center';
      var left = document.createElement('span');
      left.style.cssText = 'font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      left.textContent = entity;
      var right = document.createElement('span');
      right.style.cssText = 'display:flex;gap:8px;align-items:center;white-space:nowrap';
      var countEl = document.createElement('span');
      countEl.style.cssText = 'color:#4f9cf9;font-variant-numeric:tabular-nums';
      var badge = document.createElement('span');
      badge.style.cssText = 'font-size:11px;color:#8b98a5';
      badge.textContent = '…';
      right.appendChild(countEl);
      right.appendChild(badge);
      ch.appendChild(left);
      ch.appendChild(right);

      var det = document.createElement('pre');
      det.style.cssText =
        'display:none;margin:0;padding:8px 10px;font-family:monospace;font-size:12px;' +
        'white-space:pre-wrap;word-break:break-word;max-height:340px;overflow:auto';

      ch.onclick = function () {
        var showing = det.style.display !== 'none';
        det.style.display = showing ? 'none' : 'block';
        if (!showing && !rows[entity].loaded) loadObjects(entity);
      };

      card.appendChild(ch);
      card.appendChild(det);
      body.appendChild(card);
      rows[entity] = { card: card, badge: badge, countEl: countEl, det: det, loaded: false, status: '…' };
    });

    // --- click-to-load the actual objects of one entity ---
    function loadObjects(entity) {
      var r = rows[entity];
      r.det.textContent = 'loading…';
      mx.data.get({
        xpath: '//' + entity,
        count: true,
        filter: { amount: amount, offset: offset },
        callback: function (objs, count) {
          r.loaded = true;
          var list = objs.map(function (o) {
            var a = {};
            o.getAttributes().forEach(function (n) {
              a[n] = o.get(n);
            });
            return { guid: o.getGuid(), attributes: a };
          });
          window.__dp_results[entity] = list;
          var header =
            'total: ' + (count != null ? count : '?') + '   |   showing ' + list.length;
          r.det.textContent = header + '\n\n' + JSON.stringify(list, null, 2);
        },
        error: function (e) {
          r.det.textContent = 'error: ' + ((e && e.message) || 'no access');
        }
      });
    }

    // --- Phase 1: sequential readability probe (one at a time) ---
    var i = 0;
    var readableCount = 0;

    function setStatus(entity, status, count, attrs, msg) {
      var r = rows[entity];
      r.status = status;
      r.badge.textContent = status + (msg ? ' — ' + msg : '');
      r.badge.style.color = COLORS[status] || '#8b98a5';
      r.countEl.textContent = count != null ? count + ' obj' : '';
      if (status === 'READABLE') readableCount++;
      window.__scan.push({ entity: entity, status: status, count: count != null ? count : '', attrs: attrs || '', msg: msg || '' });
    }

    function probeNext() {
      if (i >= entities.length) {
        statusLine.textContent =
          readableCount + ' readable of ' + entities.length + ' entities';
        applyFilter();
        console.log('[Data Privacy Probe] done. Full scan in window.__scan; objects in window.__dp_results');
        console.table(window.__scan);
        return;
      }
      var entity = entities[i++];
      statusLine.textContent = 'Probing ' + i + '/' + entities.length + '…  (' + readableCount + ' readable)';
      var done = false;
      var to = setTimeout(function () {
        if (done) return;
        done = true;
        setStatus(entity, 'timeout');
        probeNext();
      }, 8000);
      try {
        mx.data.get({
          xpath: '//' + entity,
          count: true,
          filter: { amount: 1, offset: 0 },
          callback: function (objs, count) {
            if (done) return;
            done = true;
            clearTimeout(to);
            setStatus(
              entity,
              objs.length ? 'READABLE' : 'empty/constrained',
              count,
              objs[0] ? objs[0].getAttributes().join(', ') : ''
            );
            probeNext();
          },
          error: function (e) {
            if (done) return;
            done = true;
            clearTimeout(to);
            setStatus(entity, 'denied', null, '', ((e && e.message) || '').slice(0, 80));
            probeNext();
          }
        });
      } catch (e) {
        if (done) return;
        done = true;
        clearTimeout(to);
        setStatus(entity, 'error', null, '', String(e).slice(0, 80));
        probeNext();
      }
    }
    probeNext();
    void esc; // reserved for future html rendering
  }

  $: entities = entitiesText
    .split(/[\n,]+/)
    .map((s) => s.trim().replace(/^\/\//, ''))
    .filter(Boolean);

  $: cfg = { entities, amount: Number(amount) || 100, offset: Number(offset) || 0 };

  $: script = '(' + probePayload.toString() + ')(' + JSON.stringify(cfg) + ');';
  $: bookmarklet = 'javascript:' + encodeURIComponent(script);

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }
</script>

<section class="controls">
  <label class="fld">
    <span>Entities <small>(leave empty to auto-discover ALL via mx.meta.getMap; or list specific ones)</small></span>
    <textarea
      rows="3"
      bind:value={entitiesText}
      spellcheck="false"
      placeholder="(empty = discover every entity)&#10;Administration.Account&#10;Sales.Order"
    ></textarea>
  </label>
  <div class="opts">
    <label>
      Amount (page size / max)
      <input class="num" type="number" min="1" max="10000" bind:value={amount} />
    </label>
    <label>
      Offset
      <input class="num" type="number" min="0" bind:value={offset} />
    </label>
    <span class="count-hint">
      {entities.length ? `${entities.length} listed` : 'auto-discover all'}
    </span>
  </div>
</section>

<section class="howto">
  <h3>How to run it</h3>
  <ol>
    <li>Open the running Mendix app in a browser tab (log in as the user whose access you want to test — or leave anonymous).</li>
    <li>Open DevTools console (<code>F12</code>), paste the script below, press Enter — or click the dragged <strong>bookmarklet</strong>.</li>
    <li>It discovers every entity, probes each for readability + exact count, and lists them. <strong>Click any entity</strong> to load and view its objects.</li>
  </ol>
  <p class="note">
    Uses your <code>mx.meta.getMap()</code> + <code>mx.data.get</code> pattern, so it only sees what the current session may read. Full scan lands in <code>window.__scan</code>; loaded objects in <code>window.__dp_results</code>.
  </p>
</section>

<div class="actions">
  <button class="go" on:click={copyScript}>{copied ? 'Copied ✓' : 'Copy console script'}</button>
  <a class="bm" href={bookmarklet} on:click|preventDefault title="Drag me to your bookmarks bar">▣ Data Privacy Probe (drag to bookmarks)</a>
</div>

<pre class="script">{script}</pre>

<style>
  .controls,
  .howto {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .fld { display: flex; flex-direction: column; gap: 0.4rem; }
  .fld span small { color: var(--muted); font-weight: 400; }
  textarea {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.75rem;
    font-family: var(--mono);
    font-size: 0.9rem;
    resize: vertical;
  }
  textarea:focus { outline: none; border-color: var(--accent); }
  .opts {
    display: flex;
    gap: 1.5rem;
    align-items: center;
    margin-top: 0.75rem;
    color: var(--muted);
    font-size: 0.85rem;
    flex-wrap: wrap;
  }
  .opts label { display: inline-flex; align-items: center; gap: 0.4rem; }
  .num {
    width: 6rem;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.25rem 0.4rem;
  }
  .count-hint { margin-left: auto; }
  .howto h3 { margin: 0 0 0.5rem; }
  .howto ol { margin: 0 0 0.5rem; padding-left: 1.2rem; }
  .howto li { margin-bottom: 0.35rem; }
  .note { color: var(--muted); font-size: 0.83rem; margin: 0.25rem 0 0; }
  .actions { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; }
  .go {
    background: var(--accent-2);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.55rem 1.2rem;
    font-weight: 600;
  }
  .bm {
    display: inline-block;
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 0.5rem 0.9rem;
    color: var(--accent);
    text-decoration: none;
    font-size: 0.85rem;
    cursor: grab;
  }
  .script {
    font-family: var(--mono);
    font-size: 0.72rem;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
    max-height: 260px;
    overflow: auto;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--muted);
  }
  code { font-family: var(--mono); background: var(--panel-2); padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.85em; }
</style>
