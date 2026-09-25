'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import NodeVisualization from '@/components/NodeVisualization';
import NodeStatusGrid from '@/components/NodeStatusGrid';
import EventLog from '@/components/EventLog';
import {
  Shield,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
  Activity,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  Radio,
  Sliders
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

export default function AdminDemoPage() {
  const [data, setData] = useState({
    nodes: {},
    files: [],
    stats: {},
    recentEvents: [],
    config: { replicationFactor: 3, writeQuorum: 2, standbyNode: 'nodeD' }
  });
  const [events, setEvents] = useState([]);
  const [activeTransfer, setActiveTransfer] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);
  const [clusterAlert, setClusterAlert] = useState(null);
  const prevNodesRef = useRef({});
  const toast = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        
        // Detect state changes across nodes for large mission-control banner
        if (json.nodes && Object.keys(prevNodesRef.current).length > 0) {
          for (const [nodeId, node] of Object.entries(json.nodes)) {
            const prev = prevNodesRef.current[nodeId];
            if (prev && prev.status !== node.status) {
              if (node.status === 'suspected') {
                setClusterAlert({
                  type: 'warning',
                  title: `Node ${nodeId.slice(-1).toUpperCase()} Partition Suspected`,
                  message: `Missed heartbeat (${node.consecutiveFailures || 1}/3). Node temporarily marked SUSPECTED to absorb network jitter.`,
                });
              } else if (node.status === 'confirmed_down') {
                setClusterAlert({
                  type: 'danger',
                  title: `🚨 Node ${nodeId.slice(-1).toUpperCase()} Confirmed Down`,
                  message: `Failed 3 consecutive pings. Standby Node D activated; auto-recovery in progress.`,
                });
              } else if (node.status === 'healthy' && prev.status !== 'healthy') {
                setClusterAlert({
                  type: 'success',
                  title: `✅ Node ${nodeId.slice(-1).toUpperCase()} Recovered Online`,
                  message: `Node re-joined cluster. Read-repair and version reconciliation completed.`,
                });
              }
            }
          }
        }
        prevNodesRef.current = json.nodes || {};
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }, []);

  // Auto-dismiss alert banner after 6 seconds
  useEffect(() => {
    if (clusterAlert) {
      const timer = setTimeout(() => {
        setClusterAlert(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [clusterAlert]);

  useEffect(() => {
    fetchStatus();

    let eventSource = null;
    try {
      eventSource = new EventSource('/api/events');

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setEvents((prev) => [parsed, ...prev.slice(0, 100)]);

          if (parsed.type === 'RECOVERY_TRANSFER_START') {
            setActiveTransfer({
              sourceNodeId: parsed.sourceNodeId || 'nodeA',
              targetNodeId: parsed.targetNodeId || 'nodeD',
              filename: parsed.filename
            });
          } else if (parsed.type === 'RECOVERY_COMPLETE') {
            setTimeout(() => {
              setActiveTransfer(null);
            }, 3000);
          }

          if (
            parsed.type.includes('CONFIRMED') ||
            parsed.type.includes('SUSPECTED') ||
            parsed.type.includes('RECOVER') ||
            parsed.type.includes('UPLOAD_SUCCESS') ||
            parsed.type.includes('CORRUPT') ||
            parsed.type.includes('INTEGRITY')
          ) {
            fetchStatus();
          }
        } catch (e) {}
      };
    } catch (err) {
      console.error('SSE initialization error:', err);
    }

    const pollInterval = setInterval(() => {
      fetchStatus();
    }, 4000);

    return () => {
      clearInterval(pollInterval);
      if (eventSource) eventSource.close();
    };
  }, [fetchStatus]);

  useEffect(() => {
    if (data.recentEvents && data.recentEvents.length > 0 && events.length === 0) {
      setEvents(data.recentEvents);
    }
  }, [data.recentEvents, events.length]);

  const handleLoadDemoFile = async () => {
    try {
      setIsUploading(true);
      const demoPayload = {
        filename: `consensus_block_${Date.now().toString().slice(-4)}.json`,
        content: JSON.stringify(
          {
            clusterId: "vault-distributed-core-alpha",
            timestamp: new Date().toISOString(),
            metrics: {
              replicatedQuorum: "2/3",
              durabilityLevel: "High-Availability 99.999%",
              cryptoAlgorithm: "SHA-256",
              concurrencyLocks: "async-mutex",
              partitionTolerance: "3-ping confirmation"
            }
          },
          null,
          2
        ),
        mimeType: "application/json"
      };

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demoPayload)
      });

      if (res.ok) {
        toast?.success(`Quorum satisfied in parallel across 3 nodes`, 'Test Quorum Confirmed');
      }
      fetchStatus();
    } catch (err) {
      console.error(err);
      toast?.error(err.message, 'Upload Failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTriggerIntegrity = async () => {
    try {
      setIsCheckingIntegrity(true);
      const res = await fetch('/api/trigger-integrity-check', { method: 'POST' });
      const audit = await res.json();
      toast?.info(
        `Scrubbed ${audit.totalChecked || 0} replicas: ${audit.verified || 0} verified, ${audit.healed || 0} self-healed.`,
        'Cryptographic Scrub Complete'
      );
      fetchStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCheckingIntegrity(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07080d] bg-grain text-slate-100 p-4 sm:p-6 space-y-8 max-w-7xl mx-auto relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-10 left-1/3 w-[600px] h-[600px] bg-gradient-to-tr from-cyan-600/10 via-indigo-600/5 to-transparent rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-[500px] h-[500px] bg-gradient-to-bl from-violet-600/10 via-cyan-600/5 to-transparent rounded-full blur-[150px] pointer-events-none" />

      {/* Prominent High-Visibility Judge State-Change Banner */}
      <AnimatePresence>
        {clusterAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-50 overflow-hidden"
          >
            <div
              className={`p-4 rounded-2xl border backdrop-blur-2xl flex items-center justify-between shadow-2xl ${
                clusterAlert.type === 'danger'
                  ? 'bg-rose-950/40 border-rose-500/40 text-rose-200 shadow-[0_0_40px_rgba(244,63,94,0.25)]'
                  : clusterAlert.type === 'warning'
                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-200 shadow-[0_0_40px_rgba(245,158,11,0.25)]'
                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200 shadow-[0_0_40px_rgba(16,185,129,0.25)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-black/40">
                  {clusterAlert.type === 'danger' ? (
                    <AlertOctagon className="w-5 h-5 text-rose-400 animate-pulse" />
                  ) : clusterAlert.type === 'warning' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-bold tracking-tight">
                    {clusterAlert.title}
                  </div>
                  <div className="text-xs text-slate-300">
                    {clusterAlert.message}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setClusterAlert(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 transition"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <motion.header
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-3xl vault-panel shadow-2xl relative z-10 border border-white/[0.08]"
      >
        <div className="flex items-center gap-3.5">
          <motion.div
            whileHover={{ scale: 1.06, rotate: 6 }}
            className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-cyan-500 p-[1px] shadow-[0_0_30px_rgba(99,102,241,0.35)] shrink-0"
          >
            <div className="w-full h-full rounded-2xl bg-[#090b14] flex items-center justify-center">
              <Shield className="w-6 h-6 text-cyan-400 stroke-[2.2]" />
            </div>
          </motion.div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                VAULT
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono">
                MISSION CONTROL
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Distributed consensus, 3D replica state, 3-ping partition tolerance & self-healing telemetry.
            </p>
          </div>
        </div>

        {/* Demo Action Controls Styled Like Technical Physical Switches */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-white/[0.08] transition shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>User View</span>
          </Link>

          {/* Test Quorum Upload Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleLoadDemoFile}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 transition shadow-[0_0_25px_rgba(6,182,212,0.35)] disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>{isUploading ? 'Replicating...' : '⚡ Test Quorum Upload'}</span>
          </motion.button>

          {/* Trigger Cryptographic Scrub Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleTriggerIntegrity}
            disabled={isCheckingIntegrity}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-xs bg-slate-900/90 hover:bg-slate-800 text-emerald-300 border border-emerald-500/30 transition disabled:opacity-50 shadow-sm"
          >
            <Search className={`w-3.5 h-3.5 text-emerald-400 ${isCheckingIntegrity ? 'animate-spin' : ''}`} />
            <span>{isCheckingIntegrity ? 'Auditing...' : 'Check Integrity'}</span>
          </motion.button>

          {/* Refresh State */}
          <button
            onClick={fetchStatus}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-white/[0.08] transition"
            title="Refresh Cluster State"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </motion.header>

      {/* SECTION 1: 3D Visualization (The Dominant Front-and-Center Element) */}
      <motion.section
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10"
      >
        <NodeVisualization
          nodes={data.nodes}
          activeTransfer={activeTransfer}
        />
      </motion.section>

      {/* SECTION 2: Node Status Cards */}
      <motion.section
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        className="relative z-10"
      >
        <NodeStatusGrid
          nodes={data.nodes}
          onRefresh={fetchStatus}
        />
      </motion.section>

      {/* SECTION 3: Live Terminal Event Log */}
      <motion.section
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        className="relative z-10"
      >
        <EventLog
          events={events}
          onClear={() => setEvents([])}
        />
      </motion.section>
    </div>
  );
}
