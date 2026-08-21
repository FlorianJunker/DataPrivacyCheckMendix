<script>
  // Generates a self-contained probe (console snippet + bookmarklet) that runs
  // INSIDE a running Mendix app's page, using the client data API. Because
  // `mx.data.get` uses the live session and the app's own origin, it reports
  // exactly which objects the current user (e.g. anonymous) can actually read
  // per entity — the real question for a data-privacy check.

  let entitiesText = ''; // empty = auto-discover every entity via mx.meta.getMap
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

    // Same palette as the generator UI, inlined so the panel is standalone.
    var C = {
      bg: '#0a0d12',
      surface: '#0f131a',
      surface2: '#151b24',
      border: '#222b37',
      text: '#dde5ee',
      muted: '#7d8b9c',
      faint: '#55616f',
      accent: '#56d4dd'
    };
    var MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
    var COLORS = {
      READABLE: '#4ec96f',
      'empty/constrained': '#e0b341',
      denied: '#ff6b62',
      timeout: C.faint,
      error: '#ff6b62',
      '...': C.faint
    };

    var old = document.getElementById('__dp_probe_panel');
    if (old) old.remove();

    var panel = document.createElement('div');
    panel.id = '__dp_probe_panel';
    panel.style.cssText =
      'position:fixed;top:12px;right:12px;width:470px;max-height:92vh;overflow:auto;' +
      'z-index:2147483647;background:' + C.surface + ';color:' + C.text + ';' +
      'font:12px/1.6 ' + MONO + ';border:1px solid ' + C.border + ';' +
      'border-radius:3px;box-shadow:0 12px 40px rgba(0,0,0,.6)';

    var head = document.createElement('div');
    head.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;padding:7px 12px;' +
      'border-bottom:1px solid ' + C.border + ';position:sticky;top:0;background:' +
      C.surface2 + ';z-index:2';
    var title = document.createElement('span');
    title.style.cssText =
      'font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:' + C.muted;
    title.textContent = '▮ dataprivacy-probe';
    head.appendChild(title);
    var close = document.createElement('button');
    close.textContent = '×';
    close.style.cssText =
      'background:none;border:none;color:' + C.faint +
      ';font:16px/1 ' + MONO + ';cursor:pointer;padding:0 2px';
    close.onclick = function () {
      panel.remove();
    };
    head.appendChild(close);
    panel.appendChild(head);

    var bar = document.createElement('div');
    bar.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;gap:8px;' +
      'padding:6px 12px;border-bottom:1px solid ' + C.border +
      ';position:sticky;top:34px;background:' + C.surface + ';z-index:1;font-size:11px';
    var statusLine = document.createElement('span');
    statusLine.style.cssText = 'color:' + C.muted;
    statusLine.textContent = 'discovered ' + entities.length + ' entities — probing...';
    var filterLbl = document.createElement('label');
    filterLbl.style.cssText =
      'color:' + C.muted +
      ';display:flex;gap:5px;align-items:center;cursor:pointer;white-space:nowrap';
    var filterChk = document.createElement('input');
    filterChk.type = 'checkbox';
    filterChk.style.cssText = 'accent-color:' + C.accent + ';margin:0';
    filterLbl.appendChild(filterChk);
    filterLbl.appendChild(document.createTextNode('--readable-only'));
    bar.appendChild(statusLine);
    bar.appendChild(filterLbl);
    panel.appendChild(bar);

    var body = document.createElement('div');
    body.style.cssText = 'padding:8px 12px 12px';
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

    // --- build a row per entity ---
    entities.forEach(function (entity) {
      var card = document.createElement('div');
      card.style.cssText =
        'border:1px solid ' + C.border + ';border-radius:3px;margin:5px 0;overflow:hidden';

      var ch = document.createElement('div');
      ch.style.cssText =
        'padding:6px 9px;cursor:pointer;display:flex;justify-content:space-between;' +
        'gap:8px;align-items:center';
      ch.onmouseenter = function () {
        ch.style.background = C.surface2;
      };
      ch.onmouseleave = function () {
        ch.style.background = '';
      };
      var left = document.createElement('span');
      left.style.cssText =
        'display:flex;gap:6px;min-width:0;align-items:center';
      var caret = document.createElement('span');
      caret.style.cssText = 'color:' + C.faint + ';font-size:10px;flex:none';
      caret.textContent = '▸';
      var nameEl = document.createElement('span');
      nameEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      nameEl.textContent = entity;
      left.appendChild(caret);
      left.appendChild(nameEl);
      var right = document.createElement('span');
      right.style.cssText = 'display:flex;gap:8px;align-items:center;white-space:nowrap;flex:none';
      var countEl = document.createElement('span');
      countEl.style.cssText =
        'color:' + C.accent + ';font-variant-numeric:tabular-nums';
      var badge = document.createElement('span');
      badge.style.cssText = 'font-size:10px;letter-spacing:.08em;color:' + C.faint;
      badge.textContent = '...';
      right.appendChild(countEl);
      right.appendChild(badge);
      ch.appendChild(left);
      ch.appendChild(right);

      var det = document.createElement('pre');
      det.style.cssText =
        'display:none;margin:0;padding:8px 9px;font:11px/1.5 ' + MONO + ';' +
        'background:' + C.bg + ';border-top:1px solid ' + C.border + ';color:' + C.muted +
        ';white-space:pre-wrap;word-break:break-word;max-height:340px;overflow:auto';

      ch.onclick = function () {
        var showing = det.style.display !== 'none';
        det.style.display = showing ? 'none' : 'block';
        caret.textContent = showing ? '▸' : '▾';
        if (!showing && !rows[entity].loaded) loadObjects(entity);
      };

      card.appendChild(ch);
      card.appendChild(det);
      body.appendChild(card);
      rows[entity] = {
        card: card,
        badge: badge,
        countEl: countEl,
        det: det,
        loaded: false,
        status: '...'
      };
    });

    // --- click-to-load the actual objects of one entity ---
    function loadObjects(entity) {
      var r = rows[entity];
      r.det.textContent = 'loading...';
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
      r.badge.style.color = COLORS[status] || C.faint;
      r.countEl.textContent = count != null ? count + ' obj' : '';
      if (status === 'READABLE') readableCount++;
      window.__scan.push({
        entity: entity,
        status: status,
        count: count != null ? count : '',
        attrs: attrs || '',
        msg: msg || ''
      });
    }

    function probeNext() {
      if (i >= entities.length) {
        statusLine.textContent =
          readableCount + ' readable of ' + entities.length + ' entities';
        applyFilter();
        console.log(
          '[dataprivacy-probe] done. Full scan in window.__scan; objects in window.__dp_results'
        );
        console.table(window.__scan);
        return;
      }
      var entity = entities[i++];
      statusLine.textContent =
        'probing ' + i + '/' + entities.length + '  (' + readableCount + ' readable)';
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

<section class="panel">
  <div class="panel__head">
    <span class="panel__title">entities</span>
    <span class="head-note">{entities.length ? `${entities.length} listed` : 'auto-discover all'}</span>
  </div>
  <div class="panel__body stack">
    <label class="fld">
      <span class="hint">
        leave empty to discover every entity via <code>mx.meta.getMap()</code>
      </span>
      <textarea
        class="textarea"
        rows="3"
        bind:value={entitiesText}
        spellcheck="false"
        placeholder="(empty = discover every entity)&#10;Administration.Account&#10;Sales.Order"
      ></textarea>
    </label>
    <div class="opts">
      <label>
        <span class="label">amount</span>
        <input class="num" type="number" min="1" max="10000" bind:value={amount} />
      </label>
      <label>
        <span class="label">offset</span>
        <input class="num" type="number" min="0" bind:value={offset} />
      </label>
    </div>
  </div>
</section>

<section class="panel">
  <div class="panel__head"><span class="panel__title">how to run it</span></div>
  <div class="panel__body stack">
    <ol class="list list--num">
      <li>
        Open the running Mendix app in a browser tab — logged in as the user whose
        access you want to test, or left anonymous.
      </li>
      <li>
        Open the DevTools console (<kbd>F12</kbd>), paste the script below, hit
        <kbd>Enter</kbd> — or click the dragged bookmarklet.
      </li>
      <li>
        It discovers every entity, probes each for readability + exact count, then
        lists them. <strong>Click an entity</strong> to load and view its objects.
      </li>
    </ol>
    <p class="note">
      Only sees what the current session may read. Full scan lands in
      <code>window.__scan</code>, loaded objects in <code>window.__dp_results</code>.
    </p>
  </div>
</section>

<section class="panel">
  <div class="panel__head">
    <span class="panel__title">payload</span>
    <span class="head-note">{(script.length / 1024).toFixed(1)} kB</span>
    <div class="head-actions">
      <button class="btn btn--primary" on:click={copyScript}>
        {copied ? 'copied ✓' : 'copy script'}
      </button>
      <a
        class="btn btn--ghost bm"
        href={bookmarklet}
        on:click|preventDefault
        title="Drag me to your bookmarks bar"
      >
        ▣ drag to bookmarks
      </a>
    </div>
  </div>
  <div class="panel__body">
    <pre class="code-block script">{script}</pre>
  </div>
</section>

<style>
  .stack { display: flex; flex-direction: column; gap: 0.75rem; }
  .fld { display: flex; flex-direction: column; gap: 0.35rem; }
  .hint { color: var(--faint); font-size: 11px; }

  .head-note { font-size: 10px; color: var(--faint); }
  .head-actions { margin-left: auto; display: flex; gap: 0.4rem; align-items: center; }
  .head-actions .btn { padding: 0.25rem 0.7rem; font-size: 11px; }
  .bm { border-style: dashed; cursor: grab; }

  .script { max-height: 260px; }
</style>
