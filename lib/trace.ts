// Session tracing — so "it didn't work" can be answered from the data instead of
// from memory.
//
// WHY. Testing a sign-in flow by hand across three products and a WebView means
// reporting, by hand, which page you were on and which button you pressed before
// it stopped. That is slow and the detail that matters is usually the one not
// mentioned. With tracing on, the app records every page, every click and every
// failure against one trace id, and the answer to "where did it break" is a query.
//
// OFF BY DEFAULT, and deliberately so: the events table exists to answer "how many
// plays per game", and an open funnel is exactly how its predecessor filled with
// 343k junk rows. Tracing is opt-in per device, expires on its own, and is meant
// for a developer reproducing something — never for collecting on real players.
//
// Turn on:  https://gamerplex.com/?trace=1       (persists ~2h on that device)
// Turn off: https://gamerplex.com/?trace=0

const KEY = 'gpx_trace';
const ID_KEY = 'gpx_trace_id';
/** Long enough for a test run, short enough that nobody leaves it on by accident. */
const TTL_MS = 2 * 60 * 60 * 1000;

function now() { return Date.now(); }

/** Is this device currently tracing? Cheap enough to call per event. */
export function isTracing(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const until = Number(localStorage.getItem(KEY) || 0);
    if (!until || now() > until) return false;
    return true;
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
    if (on) localStorage.setItem(KEY, String(now() + TTL_MS));
    else { localStorage.removeItem(KEY); sessionStorage.removeItem(ID_KEY); }
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
