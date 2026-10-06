"use client";

// Records a test run: every page, every click, every failure, against one trace id.
//
// Mounted app-wide but inert unless the device has tracing switched on (see
// lib/trace.ts). When it is on, "where did it stop working" stops being something
// anyone has to remember and describe — it is the last row of the trace.
//
// What it captures, and why each one:
//   page   — route changes, so the trail shows where the person actually got to
//   click  — the control's visible label and href, which is what "I pressed the
//            button" means; the href is usually the thing that misfires
//   error  — uncaught errors and rejected promises, the usual silent stop
//   http   — any non-2xx or failed request, which is the other silent stop
//   leave  — navigation away, so a redirect that lands nowhere is still visible
//
// Deliberately records no field values: labels, paths and status codes only. A
// trace is for finding a broken step, not for reading what somebody typed.

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { track } from "../lib/analytics";
import { applyTraceFromUrl, describeTarget, isTracing, traceId } from "../lib/trace";

function Probe() {
  const pathname = usePathname();
  const search = useSearchParams();
  const seq = useRef(0);
  const installed = useRef(false);

  // The switch is a URL so it can be tapped on a phone with no devtools.
  useEffect(() => { applyTraceFromUrl(); }, []);

  // One row per page the run reaches.
  useEffect(() => {
    if (!isTracing()) return;
    track("trace", { kind: "page", seq: ++seq.current, label: pathname, detail: search?.toString() || "" });
  }, [pathname, search]);

  useEffect(() => {
    if (!isTracing() || installed.current) return;
    installed.current = true;

    const onClick = (e: MouseEvent) => {
      const { label, detail } = describeTarget(e.target as Element);
      track("trace", { kind: "click", seq: ++seq.current, label, detail });
    };
    const onError = (e: ErrorEvent) => {
      track("trace", { kind: "error", seq: ++seq.current, label: e.message?.slice(0, 120) || "error",
                       detail: `${e.filename || ""}:${e.lineno || 0}` });
    };
    const onReject = (e: PromiseRejectionEvent) => {
      track("trace", { kind: "error", seq: ++seq.current,
                       label: String(e.reason?.message || e.reason || "rejection").slice(0, 120), detail: "unhandled" });
    };
    // Leaving the page is itself a result: a redirect that strands you shows up
    // as a leave with no page row after it.
    const onLeave = () => {
      track("trace", { kind: "leave", seq: ++seq.current, label: location.pathname, detail: "" });
    };

    // Wrap fetch so a failing request is attributed to the step that made it.
    const origFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url ?? String(args[0]);
      try {
        const res = await origFetch(...args);
        if (!res.ok) {
          track("trace", { kind: "http", seq: ++seq.current, label: `${res.status} ${shortUrl(url)}`, detail: url.slice(0, 160) });
        }
        return res;
      } catch (err) {
        track("trace", { kind: "http", seq: ++seq.current, label: `failed ${shortUrl(url)}`,
                         detail: String((err as Error)?.message || err).slice(0, 120) });
        throw err;
      }
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
      window.removeEventListener("pagehide", onLeave);
      window.fetch = origFetch;
    };
  }, []);

  // A visible marker, because a trace left on by accident is worse than no trace.
  if (!isTracing()) return null;
  return (
    <div style={badge} aria-live="polite">
      ● tracing {traceId()} · <a href="?trace=0" style={{ color: "inherit" }}>stop</a>
    </div>
  );
}

function shortUrl(u: string) {
  try { return new URL(u, location.origin).pathname.slice(0, 48); } catch { return u.slice(0, 48); }
}

const badge: React.CSSProperties = {
  position: "fixed", bottom: 8, left: 8, zIndex: 9999,
  background: "rgba(255,46,136,.92)", color: "#fff",
  font: "600 11px/1 system-ui, sans-serif", padding: "6px 9px", borderRadius: 999,
  pointerEvents: "auto",
};

export default function TraceProbe() {
  // useSearchParams needs a Suspense boundary in the app router.
  return <Suspense fallback={null}><Probe /></Suspense>;
}
