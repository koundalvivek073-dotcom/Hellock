'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Radio,
  Skull,
  Bug,
  Network,
  Terminal,
  Sparkles
} from 'lucide-react';

const SCENARIOS = [
  {
    key: 'node_failure',
    name: 'Node Failure',
    tagline: 'Kill a primary, prove W=2 quorum still serves, then heal.',
    icon: Skull,
    accent: 'from-rose-600 to-orange-500',
    duration: '~8s',
  },
  {
    key: 'bit_rot',
    name: 'Bit Rot',
    tagline: 'Flip bytes on disk; SHA-256 catches it and repairs it.',
    icon: Bug,
    accent: 'from-amber-600 to-yellow-500',
    duration: '~5s',
  },
  {
    key: 'full_partition',
    name: 'Total Partition',
    tagline: 'Kill all 4 nodes, then restore the cluster step by step.',
    icon: Network,
    accent: 'from-fuchsia-600 to-purple-500',
    duration: '~10s',
  },
];

/**
 * ChaosTheater — turns your project into a one-click live demo.
 *
 * Judges rarely have time to click through a manual failure drill. This runs a
 * scripted disaster against the live cluster, narrates each step as it happens,
 * and drives the rest of the dashboard via the existing SSE stream. The result
 * reads like a rehearsed incident response, not a UI demo.
 */
export default function ChaosTheater({ onRefresh }) {
  const [running, setRunning] = useState(null);
  const [narration, setNarration] = useState([]);
  const [done, setDone] = useState(null);
  const logRef = useRef(null);

  // Consume narration pushed over SSE while a scenario runs, so the log fills
  // in real time instead of appearing all at once when the request resolves.
  useEffect(() => {
    if (!running) return;
    let es;
    try {
      es = new EventSource('/api/events');
      es.onmessage = (e) => {
        try {
          const p = JSON.parse(e.data);
          if (p.type === 'CHAOS_NARRATION' && p.scenario === running) {
            setNarration((prev) =>
              prev.includes(p.message) ? prev : [...prev, p.message]
            );
          }
        } catch {
          /* heartbeat */
        }
      };
    } catch {
      /* SSE unavailable; the POST response still returns the full narration */
    }
    return () => es?.close();
  }, [running]);

  // Keep the log scrolled to the newest line.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [narration]);

  const run = async (key) => {
    if (running) return;
    setRunning(key);
    setNarration([]);
    setDone(null);
    try {
      const res = await fetch('/api/chaos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: key }),
      });
      const json = await res.json();
      if (json.narration?.length) setNarration(json.narration);
      setDone({ ok: res.ok, message: json.error || json.name });
    } catch (err) {
      setDone({ ok: false, message: err.message });
    } finally {
      setRunning(null);
      onRefresh?.();
    }
  };

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-rose-950/40 via-slate-950/50 to-slate-950/50">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-rose-600 to-fuchsia-500 flex items-center justify-center">
          <Terminal className="w-4.5 h-4.5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            Chaos Theater
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
              Live Fire Drill
            </span>
          </h3>
          <p className="text-[11px] text-slate-400">
            One click runs a real disaster against the cluster and narrates the recovery.
          </p>
        </div>
        {running && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-rose-300">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            RUNNING
          </span>
        )}
      </div>

      {/* Scenario buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-4">
        {SCENARIOS.map((s) => {
          const isRunning = running === s.key;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              onClick={() => run(s.key)}
              disabled={!!running}
              className={`group relative text-left p-3 rounded-xl border transition disabled:opacity-40 disabled:cursor-not-allowed ${
                isRunning
                  ? 'border-rose-500/60 bg-rose-950/30'
                  : 'border-slate-800 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.accent} flex items-center justify-center flex-shrink-0 shadow-lg`}
                >
                  {isRunning ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <Icon className="w-4 h-4 text-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-100">{s.name}</span>
                    <span className="text-[9px] text-slate-500 font-mono">{s.duration}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug mt-0.5">{s.tagline}</p>
                </div>
              </div>
              {!isRunning && !running && (
                <div className="flex items-center gap-1 mt-2.5 text-[10px] font-bold text-cyan-400 opacity-0 group-hover:opacity-100 transition">
                  <Play className="w-3 h-3" />
                  Run scenario
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Live narration console */}
      <AnimatePresence>
        {(running || narration.length > 0) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <div
                ref={logRef}
                className="rounded-xl bg-slate-950 border border-slate-800 p-3 h-40 overflow-y-auto font-mono text-[10.5px] leading-relaxed"
              >
                {narration.length === 0 ? (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Injecting fault into the live cluster…</span>
                  </div>
                ) : (
                  narration.map((line, i) => (
                    <motion.div
                      key={`${i}-${line.slice(0, 12)}`}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex gap-2 py-0.5"
                    >
                      <span className="text-slate-700 flex-shrink-0">
                        [{String(i + 1).padStart(2, '0')}]
                      </span>
                      <span className="text-slate-300">{line}</span>
                    </motion.div>
                  ))
                )}

                {done && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-800 font-bold ${
                      done.ok ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {done.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    <span>{done.ok ? 'SCENARIO PASSED — zero data loss' : done.message}</span>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!running && narration.length === 0 && (
        <div className="px-4 pb-4 -mt-1">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/25">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="text-[10.5px] text-cyan-200/90 leading-relaxed">
              <span className="font-bold">Demo tip:</span> run{' '}
              <span className="font-mono font-bold">Node Failure</span> while a judge watches — the
              3D view shows the node go dark, the event log narrates the failure, and replicas
              visibly migrate to the standby.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
