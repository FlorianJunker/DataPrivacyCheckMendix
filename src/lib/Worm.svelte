<script>
  // Idle-time easter egg: every so often a little worm inches along the top
  // border of one of the panels, tips over the far end, drops to the bottom of
  // the page and creeps off along it.
  //
  // Seen from the side, not from above: a single steep arch travels from tail to
  // head, and a segment only slides forward while that arch has it off the
  // ground — everything else stays perfectly still. One pass of the arch is one
  // stride, and that is where all forward motion comes from.
  //
  // Purely decorative: pointer-events off, skipped under reduced motion.
  import { onDestroy, onMount } from 'svelte';

  /** Root to look for panels in. Falls back to the whole document. */
  export let container = null;

  const SEGS = 9; // body segments, all the same size
  const BODY = Array.from({ length: SEGS });
  const R = 3; // segment radius (must match the CSS)
  const STEP = 6; // px between segment centres (6px dot, no gap)
  const LEN = (SEGS - 1) * STEP; // head-to-tail length
  const FLOOR_GAP = 4; // where the "ground" line sits above the page bottom

  const HUMP = 2.5; // half-width of the arch, in segments — the arch spans 2x this
  const LIFT = 9; // px the arch raises a segment off the ground

  let live = false;
  let stage = 'top'; // 'top' | 'fall' | 'bottom'

  // head position: transform-origin sits on the head, so x/y IS the head
  let x = 0;
  let y = 0;
  let panel = null;
  let dir = 1; // +1 rightwards, -1 leftwards

  let stride = 11; // px gained per arch pass
  let cadence = 1; // arch passes per second  (speed = stride * cadence)
  let p = 0; // 0..1 progress of the arch along the body
  let travelled = 0; // ground distance covered in this stage, in whole strides
  let anchorX = 0; // where the bottom crawl started
  let liftScale = 1;
  let vy = 0;

  let waitTimer = null;
  let raf = null;
  let last = 0;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const smooth = (t) => t * t * (3 - 2 * t);

  // Per-segment offsets, in body-local px: dx forward (negative = towards the
  // head), dy up off the ground. Arguments are spelled out so Svelte sees them
  // as dependencies — it does not look inside function bodies.
  //
  //   hump  arch centre in segment-index space (0 = head), sweeping from just
  //         past the tail to just past the head over one cycle: tail -> head
  //   dy    zero unless the arch is currently over that segment
  //   dx    0 ahead of the arch, one full stride once it has passed; the ramp
  //         lines up with the lift, so a segment on the ground never slides
  $: segs = shape(SEGS - 1 + HUMP - p * (SEGS - 1 + 2 * HUMP), liftScale, stride);

  function shape(hump, ls, st) {
    return BODY.map((_, i) => {
      const u = (i - hump) / HUMP;
      const dy = u <= -1 || u >= 1 ? 0 : LIFT * ls * 0.5 * (1 + Math.cos(Math.PI * u));
      const dx = -st * smooth(clamp01((i - hump + HUMP) / (2 * HUMP)));
      return { dx, dy };
    });
  }

  function schedule(min, max) {
    waitTimer = setTimeout(spawn, rnd(min, max));
  }

  // Panels whose top border is actually on screen — a worm nobody can see is a
  // waste of a worm.
  function candidates() {
    const root = container || document;
    return [...root.querySelectorAll('.panel')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 120 && r.top > 24 && r.top < window.innerHeight - 90;
    });
  }

  function spawn() {
    // rAF is paused in a hidden tab; don't park a frozen worm on screen.
    if (document.hidden) return schedule(4000, 9000);

    const pool = candidates();
    if (!pool.length) return schedule(6000, 15000);

    panel = pool[Math.floor(Math.random() * pool.length)]; // equal odds per panel
    dir = Math.random() < 0.5 ? 1 : -1;
    stride = rnd(11, 15);
    cadence = rnd(0.5, 0.75);
    stage = 'top';
    travelled = 0;
    p = 0;
    liftScale = 1;
    vy = 0;

    const r = panel.getBoundingClientRect();
    x = dir > 0 ? r.left : r.right;
    y = r.top - R;

    live = true;
    last = performance.now();
    raf = requestAnimationFrame(step);
  }

  // Advance the arch. Each completed pass banks exactly one stride of ground at
  // the same moment every segment's reach() snaps back to 0 — so the body keeps
  // moving continuously while no grounded segment ever slips.
  function advance(dt, rate = 1) {
    p += cadence * rate * dt;
    while (p >= 1) {
      p -= 1;
      travelled += stride;
    }
  }

  function step(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (stage === 'top') {
      const r = panel.getBoundingClientRect();
      if (r.width === 0) {
        stage = 'fall'; // panel went away (mode switch) — just drop
        liftScale = 0.45;
      } else {
        advance(dt);
        y = r.top - R;
        x = dir > 0 ? r.left + travelled : r.right - travelled;
        if (travelled >= r.width) {
          stage = 'fall';
          liftScale = 0.45; // curls rather than arches, mid-air
          vy = 0;
        }
      }
    } else if (stage === 'fall') {
      advance(dt, 0.6);
      vy = Math.min(vy + 620 * dt, 430);
      y += vy * dt;
      const floor = window.innerHeight - FLOOR_GAP - R;
      if (y >= floor) {
        y = floor;
        stage = 'bottom';
        anchorX = x;
        travelled = 0;
        liftScale = 1;
      }
    } else {
      advance(dt);
      x = anchorX + dir * travelled;
      y = window.innerHeight - FLOOR_GAP - R;
      if (x < -LEN - 20 || x > window.innerWidth + LEN + 20) {
        live = false;
        schedule(20000, 70000);
        return;
      }
    }

    raf = requestAnimationFrame(step);
  }

  onMount(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    schedule(6000, 16000);
  });

  onDestroy(() => {
    clearTimeout(waitTimer);
    cancelAnimationFrame(raf);
  });

  // The body always trails backwards and the arch always lifts away from the
  // surface, so heading right mirrors rather than rotates — a 180° rotation
  // would turn "up" into "down".
  $: orient = stage === 'fall' ? 'rotate(-90deg)' : dir > 0 ? 'scaleX(-1)' : '';
</script>

{#if live}
  <div class="worm" aria-hidden="true" style="transform: translate({x}px, {y}px) {orient}">
    {#each segs as s, i}
      <span class:head={i === 0} style="transform: translate({s.dx}px, {-s.dy}px)"></span>
    {/each}
  </div>
{/if}

<style>
  .worm {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 0;
    pointer-events: none;
    /* origin on the head, so translate(x, y) places the head itself */
    transform-origin: 3px 3px;
    will-change: transform;
  }
  .worm span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--muted);
    opacity: 0.62;
    flex: none;
  }
  .worm span.head {
    background: var(--accent);
    opacity: 0.75;
  }
</style>
