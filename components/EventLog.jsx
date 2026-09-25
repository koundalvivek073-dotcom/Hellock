'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Trash2, Pause, Play, Filter, ShieldCheck, Zap } from 'lucide-react';

export default function EventLog({ events = [], onClear }) {
  const [filterType, setFilterType] = useState('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef(null);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [events, autoScroll]);

  const filteredEvents = events.filter((ev) => {
    if (filterType === 'ALL') return true;
    if (filterType === 'FAILURES') {
      return ev.type?.includes('CONFIRMED') || ev.type?.includes('SUSPECTED') || ev.type?.includes('FAIL');
    }
    if (filterType === 'RECOVERY') {
      return ev.type?.includes('RECOVERY') || ev.type?.includes('REPAIR') || ev.type?.includes('HEAL');
    }
    if (filterType === 'INTEGRITY') {
      return ev.type?.includes('INTEGRITY') || ev.type?.includes('CORRUPT') || ev.type?.includes('VERIF');
    }
    if (filterType === 'UPLOADS') {
      return ev.type?.includes('UPLOAD') || ev.type?.includes('QUORUM');
    }
    return true;
  });

  const getEventBadge = (type = '') => {
    if (type.includes('CONFIRMED_DOWN') || type.includes('CORRUPT') || type.includes('FAIL')) {
      return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
    if (type.includes('SUSPECTED') || type.includes('WARN')) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    }
    if (type.includes('RECOVERY') || type.includes('HEAL') || type.includes('REPAIR')) {
      return 'bg-violet-500/20 text-violet-300 border-violet-500/40';
    }
    if (type.includes('QUORUM') || type.includes('SUCCESS') || type.includes('VERIFIED')) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
    if (type.includes('UPLOAD') || type.includes('WRITE')) {
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    }
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  return (
    <div className="w-full rounded-3xl vault-panel border border-white/[0.08] p-5 shadow-2xl flex flex-col h-[420px]">
      {/* Terminal Titlebar with macOS Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/50 border border-white/[0.06]">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/90 inline-block shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/90 inline-block shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/90 inline-block shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          </div>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono font-bold text-slate-200 tracking-wider">
              CONSENSUS AUDIT STREAM & EVENT BUS
            </span>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping ml-1" />
        </div>

        {/* Filter Pills & Controls */}
        <div className="flex items-center gap-2">
          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/[0.06] text-[10px]">
            {['ALL', 'UPLOADS', 'FAILURES', 'RECOVERY', 'INTEGRITY'].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterType(cat)}
                className={`px-2.5 py-0.5 rounded-lg font-mono transition ${
                  filterType === cat
                    ? 'bg-cyan-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Pause / Resume Auto-scroll */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 border border-white/[0.06] transition"
            title={autoScroll ? 'Pause live scrolling' : 'Resume live scrolling'}
          >
            {autoScroll ? <Pause className="w-3.5 h-3.5 text-cyan-400" /> : <Play className="w-3.5 h-3.5 text-slate-300" />}
          </button>

          {/* Clear Logs */}
          {onClear && (
            <button
              onClick={onClear}
              className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-white/[0.06] transition"
              title="Clear event history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal Log Output Area */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-xs"
      >
        {filteredEvents.length === 0 ? (
          <div className="text-center py-20 text-slate-600 text-xs">
            Listening for cluster transactions, heartbeats, and replication events...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredEvents.map((ev) => {
              const time = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : 'Recent';
              const badgeClass = getEventBadge(ev.type);

              return (
                <motion.div
                  key={ev.id || `${ev.timestamp}-${Math.random()}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-start gap-2.5 p-2 rounded-xl bg-black/40 border border-white/[0.04] hover:border-white/[0.08] transition"
                >
                  {/* Timestamp */}
                  <span className="text-[11px] text-slate-500 select-none pt-0.5 whitespace-nowrap">
                    [{time}]
                  </span>

                  {/* Event Type Badge */}
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap shrink-0 ${badgeClass}`}
                  >
                    {ev.type || 'LOG'}
                  </span>

                  {/* Message Body */}
                  <span className="text-slate-300 break-words flex-1 leading-relaxed text-xs">
                    {ev.message}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
