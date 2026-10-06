// Session tracing — so "it didn't work" can be answered from the data instead of
// from memory.
//
// WHY. Testing a sign-in flow by hand across three products and a WebView means
// reporting, by hand, which page you were on and which button you pressed before
// it stopped. That is slow and the detail that matters is usually the one not
// mentioned. With tracing on, the app records every page, every click and every
// failure against one trace id, and the answer to "where did it break" is a query.
//
// ON BY DEFAULT during the beta, because there are no real users yet and the whole
// point is that a failure should not need reproducing. A switch you have to
// remember to flip is a switch that is off the one time it mattered.
//
// It expires BY DATE, not by anyone remembering. After BETA_TRACE_UNTIL it reverts
// to opt-in with no code change and no deploy — which matters because the risk here
// was never volume, it is that default-on quietly outlives the beta and starts
// recording real people. A per-session cap stops a runaway loop filling the table
// the way cron spam filled its predecessor (343k junk rows, 96% machine events).
//
// Force on:  https://gamerplex.com/?trace=1   (overrides the date, ~2h)
// Force off: https://gamerplex.com/?trace=0   (overrides default-on, this device)

const KEY = 'gpx_trace';
const OFF_KEY = 'gpx_trace_off';
const ID_KEY = 'gpx_trace_id';
const COUNT_KEY = 'gpx_trace_n';
/** Long enough for a test run, short enough that nobody leaves it on by accident. */
const TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Default-on ends here, by the calendar. Push it out deliberately if the beta runs
 * long; do not remove the check. This is the thing that stops a debug default
 * becoming a permanent one.
 */
const BETA_TRACE_UNTIL = Date.parse('2026-12-01T00:00:00Z');

/** A run is tens of events. Hundreds means a loop, not a person. */
const MAX_EVENTS_PER_SESSION = 400;

function now() { return Date.now(); }

/** Is this device currently tracing? Cheap enough to call per event. */
export function isTracing(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // An explicit ?trace=0 wins over the beta default, so it can always be silenced.
    if (localStorage.getItem(OFF_KEY)) return false;
    // A session that has produced hundreds of events is looping, not testing.
    if (Number(sessionStorage.getItem(COUNT_KEY) || 0) > MAX_EVENTS_PER_SESSION) return false;
    const until = Number(localStorage.getItem(KEY) || 0);
    if (until && now() <= until) return true;      // explicitly switched on
    return now() < BETA_TRACE_UNTIL;               // beta default
  } catch { return false; }
}

/** Counts toward the per-session cap. Called once per recorded event. */
export function noteTraceEvent(): void {
  try {
    const n = Number(sessionStorage.getItem(COUNT_KEY) || 0) + 1;
    sessionStorage.setItem(COUNT_KEY, String(n));
  } catch { /* no storage — the cap simply does not apply */ }
}

/** True while the beta default is what is keeping tracing on. */
export function isBetaDefault(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(OFF_KEY)) return false;
    const until = Number(localStorage.getItem(KEY) || 0);
    return !(until && now() <= until) && now() < BETA_TRACE_UNTIL;
  } catch { return false; }
}

/** Stable id for one tracing session, so events can be grouped and ordered. */
export function traceId(): string {
  try {
    let id = sessionStorage.getItem(ID_KEY);
    if (!id) {
      id = `t-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}-${Math.random().toString(36).slice(2, 7)}`;
      sessionStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch { return 't-nostore'; }
}

export function setTracing(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem(KEY, String(now() + TTL_MS));
      localStorage.removeItem(OFF_KEY);
    } else {
      localStorage.removeItem(KEY);
      // Sticky, so ?trace=0 also defeats the beta default on this device.
      localStorage.setItem(OFF_KEY, '1');
      sessionStorage.removeItem(ID_KEY);
      sessionStorage.removeItem(COUNT_KEY);
    }
  } catch { /* private mode — tracing simply stays off */ }
}

/** Reads ?trace=1 / ?trace=0 once, so the switch is a link you can tap on a phone. */
export function applyTraceFromUrl(): void {
  if (typeof window === 'undefined') return;
  const v = new URLSearchParams(window.location.search).get('trace');
  if (v === '1') setTracing(true);
  else if (v === '0') setTracing(false);
}

/** A short, human-readable label for whatever was clicked. */
export function describeTarget(el: Element | null): { label: string; detail: string } {
  if (!el) return { label: '(none)', detail: '' };
  const node = (el.closest('a,button,[role="button"],input,select,summary') || el) as HTMLElement;
  const tag = node.tagName.toLowerCase();
  const text = (node.getAttribute('aria-label') || node.textContent || '')
    .replace(/\s+/g, ' ').trim().slice(0, 60);
  const href = node.getAttribute('href') || '';
  const id = node.id ? `#${node.id}` : '';
  // The href matters more than the class list: it says where the click was meant
  // to go, which is the thing that fails.
  return { label: text || `${tag}${id}` || tag, detail: [tag + id, href].filter(Boolean).join(' ') };
}
