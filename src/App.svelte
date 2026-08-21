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

  const KIND_LABEL = {
    'odata-v4': 'OData v4 service',
    'odata-v3': 'OData v3 service',
    generic: 'Generic REST endpoint'
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

  $: totalObjects = result
    ? result.results.reduce((s, r) => s + (r.error ? 0 : r.count || 0), 0)
    : 0;
</script>

<main>
  <header>
    <h1>Data Privacy Check</h1>
    <p class="sub">
      Inspect a Mendix app for readable data — live via the client session, or
      through published OData/REST endpoints.
    </p>
  </header>

  <nav class="tabs">
    <button class:active={mode === 'live'} on:click={() => (mode = 'live')}>
      Live client probe <small>(mx.data.get)</small>
    </button>
    <button class:active={mode === 'odata'} on:click={() => (mode = 'odata')}>
      OData / REST scanner
    </button>
  </nav>

  {#if mode === 'live'}
    <LiveProbe />
  {:else}
  <section class="controls">
    <div class="row">
      <input
        type="url"
        placeholder="https://your-app.mendixcloud.com/odata/myservice/v1"
        bind:value={url}
        on:keydown={onKey}
        autocomplete="off"
        spellcheck="false"
      />
      <button class="go" on:click={run} disabled={loading}>
        {loading ? 'Scanning…' : 'Scan'}
      </button>
    </div>
    <div class="opts">
      <label title="Route requests through the dev server to avoid browser CORS errors.">
        <input type="checkbox" bind:checked={useProxy} />
        Use dev proxy (avoids CORS)
      </label>
      <label>
        Max objects/endpoint
        <input class="num" type="number" min="1" max="10000" bind:value={top} />
      </label>
    </div>
  </section>

  {#if loading && progress.total}
    <p class="progress">Probing endpoints {progress.done}/{progress.total}…</p>
  {/if}

  {#if error}
    <div class="banner err">{error}</div>
  {/if}

  {#if result}
    <section class="summary">
      <div class="chip">{KIND_LABEL[result.kind] || result.kind}</div>
      <div class="chip">{result.endpoints.length} endpoint{result.endpoints.length === 1 ? '' : 's'}</div>
      <div class="chip">{totalObjects} objects total</div>
      <div class="chip base" title={result.base}>{result.base}</div>
    </section>

    <section class="results">
      {#each result.results as r (r.name)}
        <article class="card" class:bad={r.error}>
          <button class="head" on:click={() => toggle(r.name)}>
            <span class="caret" class:open={expanded.has(r.name)}>▶</span>
            <span class="name">{r.name}</span>
            {#if r.error}
              <span class="count err-text">error</span>
            {:else}
              <span class="count">
                {r.count}{r.countIsExact === false ? '+' : ''}
                <small>object{r.count === 1 ? '' : 's'}</small>
              </span>
            {/if}
          </button>

          {#if r.url}
            <div class="url">{r.url}</div>
          {/if}

          {#if expanded.has(r.name)}
            <div class="body">
              {#if r.error}
                <div class="banner err">{r.error}</div>
              {:else}
                {#if r.countIsExact === false || (r.returned != null && r.returned < r.count)}
                  <p class="note">
                    Showing {r.returned ?? r.objects.length} of {r.count}
                    {r.countIsExact === false ? '(count not reported exactly)' : ''}
                    — raise “Max objects/endpoint” to fetch more.
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
    <section class="hintbox">
      <h3>What this does</h3>
      <ul>
        <li><strong>OData</strong>: paste a Mendix OData service root — the service document lists every published entity set, and each is queried for its <code>$count</code> and objects.</li>
        <li><strong>Generic</strong>: paste any URL that returns JSON — the response is treated as one endpoint and its objects are listed.</li>
      </ul>
      <p class="note">
        Keep the dev-proxy toggle on unless the target already sends CORS
        headers. The proxy only works while running <code>npm run dev</code>.
      </p>
    </section>
  {/if}
  {/if}
</main>

<style>
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }
  header h1 { margin: 0 0 0.25rem; font-size: 1.6rem; }
  .sub { color: var(--muted); margin: 0 0 1.25rem; }

  .tabs { display: flex; gap: 0.4rem; margin-bottom: 1.25rem; }
  .tabs button {
    background: var(--panel);
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem 1rem;
    font-weight: 600;
  }
  .tabs button small { font-weight: 400; opacity: 0.8; }
  .tabs button.active { color: var(--text); background: var(--accent-2); border-color: var(--accent-2); }

  .controls {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
  }
  .row { display: flex; gap: 0.5rem; }
  input[type='url'] {
    flex: 1;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.75rem;
    font-family: var(--mono);
    font-size: 0.9rem;
  }
  input[type='url']:focus { outline: none; border-color: var(--accent); }
  .go {
    background: var(--accent-2);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0 1.4rem;
    font-weight: 600;
  }
  .go:disabled { opacity: 0.6; cursor: default; }

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
  .num { width: 5rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 0.25rem 0.4rem; }

  .progress { color: var(--muted); }

  .banner { border-radius: 8px; padding: 0.6rem 0.8rem; margin: 1rem 0; }
  .banner.err { background: rgba(248, 81, 73, 0.12); border: 1px solid var(--err); color: #ffb4ae; }

  .summary { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 1.25rem 0; }
  .chip {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.3rem 0.8rem;
    font-size: 0.82rem;
  }
  .chip.base { font-family: var(--mono); color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .results { display: flex; flex-direction: column; gap: 0.6rem; }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  .card.bad { border-color: rgba(248, 81, 73, 0.5); }
  .head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: transparent;
    border: none;
    color: var(--text);
    padding: 0.75rem 1rem;
    text-align: left;
  }
  .caret { color: var(--muted); transition: transform 0.15s; font-size: 0.7rem; }
  .caret.open { transform: rotate(90deg); }
  .name { font-weight: 600; flex: 1; }
  .count { color: var(--accent); font-variant-numeric: tabular-nums; font-weight: 600; }
  .count small { color: var(--muted); font-weight: 400; }
  .err-text { color: var(--err); }
  .url {
    font-family: var(--mono);
    font-size: 0.75rem;
    color: var(--muted);
    padding: 0 1rem 0.6rem 2.2rem;
    word-break: break-all;
  }
  .body { padding: 0 1rem 1rem; }
  .note { color: var(--muted); font-size: 0.82rem; margin: 0.25rem 0; }

  .hintbox {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem 1.25rem;
    margin-top: 1.5rem;
  }
  .hintbox h3 { margin: 0 0 0.5rem; }
  .hintbox ul { margin: 0 0 0.5rem; padding-left: 1.2rem; }
  .hintbox li { margin-bottom: 0.4rem; }
  code { font-family: var(--mono); background: var(--panel-2); padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.85em; }
</style>
