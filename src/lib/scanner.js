// Endpoint scanner: discovers open endpoints at a URL, then counts and lists
// the objects each one returns.
//
// Strategy ("Both"):
//   1. Fetch the given URL and inspect the JSON.
//   2. If it looks like an OData service document, enumerate its entity sets
//      as endpoints.
//   3. Otherwise treat the URL itself as a single generic REST endpoint.
//   4. For each endpoint, request the collection, extract a count and objects.

const DEFAULT_TOP = 100;

// --- fetch helper -----------------------------------------------------------

// When useProxy is true we route through the vite dev proxy to dodge CORS.
function proxied(url, useProxy) {
  if (!useProxy) return url;
  return '/__proxy?target=' + encodeURIComponent(url);
}

async function fetchJson(url, useProxy) {
  const res = await fetch(proxied(url, useProxy), {
    headers: { Accept: 'application/json' }
  });
  const text = await res.text();
  let data = null;
  let parseError = null;
  try {
    data = text.length ? JSON.parse(text) : null;
  } catch (e) {
    parseError = e.message;
  }
  return { status: res.status, ok: res.ok, data, text, parseError };
}

// --- URL helpers ------------------------------------------------------------

function normalizeBase(url) {
  return url.replace(/\/+$/, '');
}

function joinUrl(base, path) {
  if (/^https?:\/\//i.test(path)) return path;
  return normalizeBase(base) + '/' + String(path).replace(/^\/+/, '');
}

function withQuery(url, params) {
  const hasQuery = url.includes('?');
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return url + (hasQuery ? '&' : '?') + qs;
}

// --- detection --------------------------------------------------------------

// OData v4 service document: { "@odata.context": ".../$metadata", value: [
//   { name, kind: "EntitySet", url }, ... ] }
function asODataV4ServiceDoc(data) {
  if (!data || !Array.isArray(data.value)) return null;
  const ctx = data['@odata.context'] || '';
  const looksLikeMetadata = /\$metadata\/?$/.test(ctx);
  const entries = data.value.filter(
    (e) => e && typeof e === 'object' && (e.url || e.name) && !isDataObject(e)
  );
  const allLookLikeSets = entries.length > 0 && entries.every(
    (e) => typeof e.name === 'string' && (e.kind === undefined || e.kind === 'EntitySet' || e.kind === 'Singleton')
  );
  if (looksLikeMetadata && allLookLikeSets) {
    return entries
      .filter((e) => e.kind === undefined || e.kind === 'EntitySet')
      .map((e) => ({ name: e.name, path: e.url || e.name }));
  }
  return null;
}

// An entity-set descriptor has a small, fixed shape; a real data row usually
// carries other fields. This heuristic guards the v4 detection above.
function isDataObject(e) {
  const keys = Object.keys(e);
  const known = new Set(['name', 'kind', 'url', 'title']);
  return keys.some((k) => !known.has(k) && !k.startsWith('@'));
}

// OData v3 service document: { d: { EntitySets: ["A", "B"] } }
function asODataV3ServiceDoc(data) {
  const sets = data && data.d && data.d.EntitySets;
  if (Array.isArray(sets) && sets.every((s) => typeof s === 'string')) {
    return sets.map((s) => ({ name: s, path: s }));
  }
  return null;
}

// Pull the object array + count out of a collection response of any flavor.
export function extractObjects(data) {
  if (Array.isArray(data)) {
    return { objects: data, count: data.length, countIsExact: true };
  }
  if (data && typeof data === 'object') {
    // OData v4 collection
    if (Array.isArray(data.value)) {
      const count =
        typeof data['@odata.count'] === 'number'
          ? data['@odata.count']
          : data.value.length;
      return {
        objects: data.value,
        count,
        countIsExact: typeof data['@odata.count'] === 'number'
      };
    }
    // OData v3 collection: { d: { results: [...], __count: "n" } } or { d: [...] }
    if (data.d) {
      if (Array.isArray(data.d.results)) {
        const c = parseInt(data.d.__count, 10);
        return {
          objects: data.d.results,
          count: Number.isFinite(c) ? c : data.d.results.length,
          countIsExact: Number.isFinite(c)
        };
      }
      if (Array.isArray(data.d)) {
        return { objects: data.d, count: data.d.length, countIsExact: true };
      }
    }
    // A single object — treat as one-item collection.
    return { objects: [data], count: 1, countIsExact: true };
  }
  return { objects: [], count: 0, countIsExact: true };
}

// --- public API -------------------------------------------------------------

// Discover endpoints at the given URL. Returns
// { kind: 'odata-v4'|'odata-v3'|'generic', endpoints: [{name, path}], base, raw }
export async function discover(url, useProxy) {
  const base = normalizeBase(url);
  const res = await fetchJson(base, useProxy);

  if (!res.ok && res.status !== 200) {
    throw new Error(`Request failed (HTTP ${res.status}) for ${base}`);
  }
  if (res.parseError || res.data == null) {
    throw new Error(
      `Response from ${base} was not JSON` +
        (res.parseError ? ` (${res.parseError})` : '')
    );
  }

  const v4 = asODataV4ServiceDoc(res.data);
  if (v4) {
    return { kind: 'odata-v4', endpoints: v4, base, raw: res.data };
  }
  const v3 = asODataV3ServiceDoc(res.data);
  if (v3) {
    return { kind: 'odata-v3', endpoints: v3, base, raw: res.data };
  }

  // Generic: the URL itself is the endpoint.
  return {
    kind: 'generic',
    endpoints: [{ name: base.split('/').pop() || base, path: '' }],
    base,
    raw: res.data
  };
}

// Probe one endpoint: fetch it, count objects, return sample objects.
export async function probe(base, endpoint, kind, useProxy, top = DEFAULT_TOP) {
  let url = endpoint.path ? joinUrl(base, endpoint.path) : base;

  if (kind === 'odata-v4') {
    url = withQuery(url, { $top: top, $count: 'true' });
  } else if (kind === 'odata-v3') {
    url = withQuery(url, { $format: 'json', $top: top, $inlinecount: 'allpages' });
  }

  const res = await fetchJson(url, useProxy);
  if (res.parseError || res.data == null) {
    return {
      name: endpoint.name,
      url,
      status: res.status,
      ok: res.ok,
      error: res.parseError ? 'Not JSON: ' + res.parseError : `HTTP ${res.status}`,
      count: 0,
      objects: []
    };
  }

  // OData error payloads still parse as JSON — surface them.
  if (res.data && res.data.error) {
    const msg =
      (res.data.error.message && (res.data.error.message.value || res.data.error.message)) ||
      'Endpoint returned an error';
    return {
      name: endpoint.name,
      url,
      status: res.status,
      ok: false,
      error: typeof msg === 'string' ? msg : JSON.stringify(msg),
      count: 0,
      objects: []
    };
  }

  const { objects, count, countIsExact } = extractObjects(res.data);
  return {
    name: endpoint.name,
    url,
    status: res.status,
    ok: res.ok,
    error: null,
    count,
    countIsExact,
    returned: objects.length,
    objects
  };
}

// Full scan: discover, then probe every endpoint (bounded concurrency).
export async function scan(url, { useProxy = false, top = DEFAULT_TOP, onProgress } = {}) {
  const disc = await discover(url, useProxy);
  const results = [];
  const queue = [...disc.endpoints];
  const CONCURRENCY = 4;

  async function worker() {
    while (queue.length) {
      const ep = queue.shift();
      try {
        const r = await probe(disc.base, ep, disc.kind, useProxy, top);
        results.push(r);
      } catch (e) {
        results.push({ name: ep.name, error: e.message, count: 0, objects: [] });
      }
      if (onProgress) onProgress(results.length, disc.endpoints.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, disc.endpoints.length || 1) }, worker)
  );

  // Preserve discovery order.
  const order = new Map(disc.endpoints.map((e, i) => [e.name, i]));
  results.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));

  return { ...disc, results };
}
