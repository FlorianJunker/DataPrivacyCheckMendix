<script>
  import { scan } from './lib/scanner.js';
  import ObjectList from './lib/ObjectList.svelte';
  import LiveProbe from './lib/LiveProbe.svelte';

  let mode = 'live'; // 'live' | 'odata'

  let url = '';
  let useProxy = true;
  let top = 100;

  let loading = false;
  let error = '';
  let result = null; // { kind, base, endpoints, results }
  let progress = { done: 0, total: 0 };
  let expanded = new Set();

  const MODES = [
    { id: 'live', label: 'live-probe', hint: 'mx.data.get' },
    { id: 'odata', label: 'odata-scan', hint: 'http' }
  ];

  const KIND_LABEL = {
    'odata-v4': 'odata v4',
    'odata-v3': 'odata v3',
    generic: 'generic rest'
  };

  async function run() {
    error = '';
    result = null;
    expanded = new Set();
    const target = url.trim();
    if (!target) {
      error = 'Enter a URL first.';
      return;
    }
    loading = true;
    progress = { done: 0, total: 0 };
    try {
      result = await scan(target, {
        useProxy,
        top: Number(top) || 100,
        onProgress: (done, total) => (progress = { done, total })
      });
    } catch (e) {
      error = e.message || String(e);
    } finally {
      loading = false;
    }
  }

  function toggle(name) {
    const next = new Set(expanded);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    expanded = next;
  }

  function onKey(e) {
    if (e.key === 'Enter') run();
  }

  // 1 / 2 switch modes, as long as focus is not in a field.
  function onWindowKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const i = { 1: 'live', 2: 'odata' }[e.key];
    if (i) mode = i;
  }

  $: totalObjects = result
    ? result.results.reduce((s, r) => s + (r.error ? 0 : r.count || 0), 0)
    : 0;

  $: errorCount = result ? result.results.filter((r) => r.error).length : 0;
</script>

<svelte:window on:keydown={onWindowKey} />

<div class="shell">
  <header class="bar">
    <span class="dot" />
    <h1 class="cmd">
      dataprivacy<span class="dim">-check</span>
      <span class="flag">--mendix</span>
    </h1>
    <span class="ver">v0.1.0</span>
  </header>

  <p class="tagline">
    Inspect a Mendix app for readable data — live through the client session, or
    through published OData/REST endpoints.
  </p>

  <nav class="tabs" aria-label="Mode">
    {#each MODES as m, i}
      <button class:active={mode === m.id} on:click={() => (mode = m.id)}>
        <span class="key">{i + 1}</span>
        {m.label}
        <span class="hint">{m.hint}</span>
      </button>
    {/each}
    <span class="tabs__fill" />
  </nav>

  {#if mode === 'live'}
    <LiveProbe />
  {:else}
    <section class="panel">
      <div class="panel__head"><span class="panel__title">target</span></div>
      <div class="panel__body stack">
        <div class="row">
          <span class="prompt">
            <input
              class="input"
              type="url"
              placeholder="https://your-app.mendixcloud.com/odata/myservice/v1"
              bind:value={url}
              on:keydown={onKey}
              autocomplete="off"
              spellcheck="false"
            />
          </span>
          <button class="btn btn--primary" on:click={run} disabled={loading}>
            {loading ? 'scanning…' : 'scan'}
          </button>
        </div>
        <div class="opts">
          <label
            class="check"
            title="Route requests through the dev server to avoid browser CORS errors."
          >
            <input type="checkbox" bind:checked={useProxy} />
            --proxy
          </label>
          <label>
            <span class="label">max/endpoint</span>
            <input class="num" type="number" min="1" max="10000" bind:value={top} />
          </label>
        </div>
      </div>
    </section>

    {#if loading && progress.total}
      <p class="status">
        <span class="spin">▍</span> probing endpoints
        <span class="num-out">{progress.done}/{progress.total}</span>
      </p>
    {/if}

    {#if error}
      <div class="banner banner--err">{error}</div>
    {/if}

    {#if result}
      <section class="summary">
        <span class="chip"><span class="label">kind</span> <b>{KIND_LABEL[result.kind] || result.kind}</b></span>
        <span class="chip"><span class="label">endpoints</span> <b>{result.endpoints.length}</b></span>
        <span class="chip"><span class="label">objects</span> <b>{totalObjects}</b></span>
        {#if errorCount}
          <span class="chip chip--err"><span class="label">errors</span> <b>{errorCount}</b></span>
        {/if}
        <span class="chip base" title={result.base}>
          <span class="chip--trunc">{result.base}</span>
        </span>
      </section>

      <section class="results">
        {#each result.results as r (r.name)}
          <article class="row-card" class:bad={r.error} class:open={expanded.has(r.name)}>
            <button class="head" on:click={() => toggle(r.name)}>
              <span class="caret">{expanded.has(r.name) ? '▾' : '▸'}</span>
              <span class="name">{r.name}</span>
              {#if r.url}<span class="url">{r.url}</span>{/if}
              {#if r.error}
                <span class="tag tag--err">error</span>
              {:else}
                <span class="count">
                  <b class="num-out">{r.count}{r.countIsExact === false ? '+' : ''}</b>
                  <span class="label">obj</span>
                </span>
              {/if}
            </button>

            {#if expanded.has(r.name)}
              <div class="body">
                {#if r.error}
                  <div class="banner banner--err">{r.error}</div>
                {:else}
                  {#if r.countIsExact === false || (r.returned != null && r.returned < r.count)}
                    <p class="note">
                      showing {r.returned ?? r.objects.length} of {r.count}
                      {r.countIsExact === false ? '(count not exact)' : ''} — raise
                      <code>max/endpoint</code> to fetch more.
                    </p>
                  {/if}
                  <ObjectList objects={r.objects} />
                {/if}
              </div>
            {/if}
          </article>
        {/each}
      </section>
    {/if}

    {#if !result && !loading && !error}
      <section class="panel">
        <div class="panel__head"><span class="panel__title">what this does</span></div>
        <div class="panel__body stack">
          <ul class="list list--dash">
            <li>
              <strong>odata</strong> — paste a Mendix OData service root; the service
              document lists every published entity set, and each is queried for its
              <code>$count</code> and objects.
            </li>
            <li>
              <strong>generic</strong> — paste any URL returning JSON; the response is
              treated as one endpoint and its objects are listed.
            </li>
          </ul>
          <p class="note">
            Keep <code>--proxy</code> on unless the target already sends CORS headers.
            The proxy only works while <code>npm run dev</code> is running.
          </p>
        </div>
      </section>
    {/if}
  {/if}

  <footer class="statusbar">
    <span class="seg-l">mode <b>{mode === 'live' ? 'live-probe' : 'odata-scan'}</b></span>
    <span class="sep">│</span>
    <span>
      {#if loading}scanning…{:else if result}{result.results.length} endpoints · {totalObjects} objects{:else}idle{/if}
    </span>
    <span class="spacer" />
    <span class="keys"><kbd>1</kbd><kbd>2</kbd> switch mode</span>
  </footer>
</div>

<style>
  .shell {
    position: relative;
    z-index: 1;
    max-width: 1000px;
    margin: 0 auto;
    padding: 2.25rem 1.25rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: 100vh;
  }

  /* --- title bar --- */
  .bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--border);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 99px;
    background: var(--ok);
    box-shadow: 0 0 8px var(--ok);
    flex: none;
  }
  .cmd { font-size: 14px; letter-spacing: -0.01em; }
  .cmd .dim { color: var(--muted); }
  .cmd .flag { color: var(--accent); font-weight: 400; }
  .ver { margin-left: auto; font-size: 11px; color: var(--faint); }

  .tagline { margin: -0.5rem 0 0; color: var(--muted); font-size: 12px; max-width: 62ch; }

  /* --- tabs --- */
  .tabs { display: flex; align-items: flex-end; }
  .tabs button {
    font: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    border-bottom-color: var(--border);
    border-radius: var(--r) var(--r) 0 0;
    padding: 0.4rem 0.85rem;
    margin-right: 0.25rem;
    margin-bottom: -1px;
  }
  .tabs button:hover { color: var(--text); background: var(--surface); }
  .tabs button.active {
    color: var(--text);
    background: var(--surface);
    border-color: var(--border);
    border-bottom-color: var(--surface);
  }
  .tabs button.active .key { color: var(--accent); border-color: var(--accent); }
  .tabs .key {
    font-size: 10px;
    color: var(--faint);
    border: 1px solid var(--border);
    border-radius: 2px;
    padding: 0 0.25rem;
    line-height: 1.4;
  }
  .tabs .hint { font-size: 10px; color: var(--faint); }
  .tabs__fill { flex: 1; border-bottom: 1px solid var(--border); }

  .stack { display: flex; flex-direction: column; gap: 0.75rem; }
  .row { display: flex; gap: 0.5rem; }

  .status { margin: 0; color: var(--muted); font-size: 12px; }
  .spin { color: var(--accent); animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0.2; } }

  /* --- summary chips --- */
  .summary { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
  .summary .base { flex: 1 1 18rem; min-width: 0; color: var(--faint); }
  .chip--err { border-color: rgba(255, 107, 98, 0.4); }
  .chip--err b { color: var(--err); }

  /* --- result rows --- */
  .results { display: flex; flex-direction: column; gap: 0.35rem; }
  .row-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r);
    overflow: hidden;
  }
  .row-card.open { border-color: var(--border-strong); }
  .row-card.bad { border-left: 2px solid var(--err); }
  .head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: transparent;
    border: none;
    color: var(--text);
    font: inherit;
    padding: 0.5rem 0.75rem;
    text-align: left;
    cursor: pointer;
  }
  .head:hover { background: var(--surface-2); }
  .caret { color: var(--faint); font-size: 10px; flex: none; }
  .name { font-weight: 600; flex: none; }
  .url {
    color: var(--faint);
    font-size: 11px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }
  .count { margin-left: auto; display: inline-flex; gap: 0.3rem; align-items: baseline; flex: none; }
  .tag {
    margin-left: auto;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.05rem 0.4rem;
    border-radius: 2px;
    border: 1px solid;
  }
  .tag--err { color: var(--err); border-color: rgba(255, 107, 98, 0.4); }
  .body { padding: 0 0.75rem 0.75rem; border-top: 1px solid var(--border); padding-top: 0.6rem; }

  /* --- status bar --- */
  .statusbar {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    border-top: 1px solid var(--border);
    padding-top: 0.5rem;
    font-size: 11px;
    color: var(--faint);
  }
  .statusbar b { color: var(--accent); font-weight: 600; }
  .sep { color: var(--border-strong); }
  .spacer { flex: 1; }
  .keys kbd { font-size: 10px; padding: 0 0.25rem; margin-right: 2px; }
</style>
