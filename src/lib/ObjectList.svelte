<script>
  // Renders the objects returned by one endpoint, either as a table (when the
  // rows share a flat shape) or as raw JSON.
  export let objects = [];

  let view = 'table'; // 'table' | 'json'

  // Collect a stable-ish column set from the first rows, skipping OData meta.
  $: columns = deriveColumns(objects);

  function deriveColumns(rows) {
    const seen = [];
    const set = new Set();
    for (const row of rows.slice(0, 50)) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
      for (const k of Object.keys(row)) {
        if (k.startsWith('@') || k === '__metadata') continue;
        if (!set.has(k)) {
          set.add(k);
          seen.push(k);
        }
      }
    }
    return seen;
  }

  function cell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
</script>

<div class="wrap">
  <div class="toolbar">
    <span class="hint">{objects.length} object{objects.length === 1 ? '' : 's'} shown</span>
    <div class="toggle">
      <button class:active={view === 'table'} on:click={() => (view = 'table')}>Table</button>
      <button class:active={view === 'json'} on:click={() => (view = 'json')}>JSON</button>
    </div>
  </div>

  {#if objects.length === 0}
    <p class="empty">No objects returned.</p>
  {:else if view === 'table' && columns.length}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th class="idx">#</th>
            {#each columns as col}<th>{col}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each objects as row, i}
            <tr>
              <td class="idx">{i + 1}</td>
              {#each columns as col}<td title={cell(row[col])}>{cell(row[col])}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <pre class="json">{JSON.stringify(objects, null, 2)}</pre>
  {/if}
</div>

<style>
  .wrap { margin-top: 0.75rem; }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .hint { color: var(--muted); font-size: 0.85rem; }
  .toggle button {
    background: var(--panel-2);
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 0.2rem 0.6rem;
  }
  .toggle button:first-child { border-radius: 6px 0 0 6px; }
  .toggle button:last-child { border-radius: 0 6px 6px 0; border-left: none; }
  .toggle button.active { color: var(--text); background: var(--accent-2); border-color: var(--accent-2); }
  .empty { color: var(--muted); font-style: italic; }
  .scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; max-height: 420px; }
  table { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
  thead th {
    position: sticky;
    top: 0;
    background: var(--panel-2);
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: 0.35rem 0.6rem;
    border-bottom: 1px solid var(--border);
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .idx { color: var(--muted); width: 3ch; }
  tbody tr:hover td { background: rgba(255, 255, 255, 0.03); }
  .json {
    font-family: var(--mono);
    font-size: 0.8rem;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
    max-height: 420px;
    overflow: auto;
    margin: 0;
  }
</style>
