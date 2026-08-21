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
    <span class="label">
      {objects.length} object{objects.length === 1 ? '' : 's'}
      {#if columns.length} · {columns.length} column{columns.length === 1 ? '' : 's'}{/if}
    </span>
    <div class="seg">
      <button class:active={view === 'table'} on:click={() => (view = 'table')}>table</button>
      <button class:active={view === 'json'} on:click={() => (view = 'json')}>json</button>
    </div>
  </div>

  {#if objects.length === 0}
    <p class="note empty">no objects returned</p>
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
              {#each columns as col}
                <td title={cell(row[col])} class:null={row[col] == null}>
                  {row[col] == null ? '∅' : cell(row[col])}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <pre class="code-block json">{JSON.stringify(objects, null, 2)}</pre>
  {/if}
</div>

<style>
  .wrap { display: flex; flex-direction: column; gap: 0.5rem; }
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .empty { font-style: italic; }

  .scroll {
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--r);
    max-height: 420px;
    background: var(--bg);
  }
  table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 11.5px; }
  thead th {
    position: sticky;
    top: 0;
    background: var(--surface-2);
    text-align: left;
    padding: 0.35rem 0.6rem;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
  }
  th + th, td + td { border-left: 1px solid var(--border); }
  td {
    padding: 0.3rem 0.6rem;
    border-bottom: 1px solid var(--border);
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  tbody tr:last-child td { border-bottom: none; }
  td.null { color: var(--faint); }
  .idx {
    color: var(--faint);
    width: 3ch;
    text-align: right;
    background: var(--surface);
    position: sticky;
    left: 0;
  }
  tbody tr:hover td { background: var(--surface-2); }

  .json { max-height: 420px; }
</style>
