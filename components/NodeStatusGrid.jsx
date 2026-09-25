'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Server,
  Activity,
  HardDrive,
  AlertOctagon,
  CheckCircle2,
  RefreshCw,
  Zap,
  Power,
  Flame,
  Radio
} from 'lucide-react';
import { useToast } from './ToastProvider';

export default function NodeStatusGrid({ nodes = {}, onRefresh }) {
  const [loadingNodeId, setLoadingNodeId] = useState(null);
  const toast = useToast();

  const nodeKeys = ['nodeA', 'nodeB', 'nodeC', 'nodeD'];
  const nodePorts = { nodeA: 4001, nodeB: 4002, nodeC: 4003, nodeD: 4004 };

  const toggleNodeFailure = async (nodeId, currentSimulatedState) => {
    try {
      setLoadingNodeId(nodeId);
      const action = currentSimulatedState ? 'recover' : 'fail';
      const res = await fetch(`/api/simulate-failure/${nodeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        if (!currentSimulatedState) {
          toast?.info(
            `Node ${nodeId.slice(-1).toUpperCase()} disconnected. Pings will fail to demonstrate 3-ping partition detection.`,
            `Failure Injected on ${nodeId}`
          );
        } else {
          toast?.success(
            `Node ${nodeId.slice(-1).toUpperCase()} reconnected. Version reconciliation active.`,
            `Node Recovered`
          );
        }
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('Error toggling failure:', err);
    } finally {
      setLoadingNodeId(null);
    }
  };

  const simulateCorrupt = async (nodeId) => {
    try {
      setLoadingNodeId(nodeId);
      const res = await fetch('/api/simulate-corruption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId })
      });
      if (res.ok) {
        toast?.error(
          `Inverted raw disk bits on ${nodeId}. Run "Check Integrity" to watch auto-healing!`,
          'Bit Rot Injected'
        );
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('Error corrupting replica:', err);
    } finally {
      setLoadingNodeId(null);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            Cluster Node Topology & Health Telemetry
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            10-second ping cycles. Click &quot;Simulate Failure&quot; to test network partition tolerance and failover.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {nodeKeys.map((nodeId) => {
          const node = nodes[nodeId] || {};
          const isStandby = nodeId === 'nodeD';
          const isDown = node.status === 'confirmed_down';
          const isSuspected = node.status === 'suspected';
          const isSimulatedDown = node.simulatedFailure;

          // Status Badge styling
          let cardBorder = 'border-white/[0.08] vault-panel';
          let statusBadge = {
            label: 'Healthy',
            bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
            dot: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
          };

          if (isDown) {
            cardBorder = 'border-rose-500/40 bg-rose-950/20 shadow-[0_0_35px_rgba(244,63,94,0.2)]';
            statusBadge = {
              label: 'Confirmed Down (3/3)',
              bg: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
              dot: 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,1)]'
            };
          } else if (isSuspected) {
            cardBorder = 'border-amber-500/40 bg-amber-950/20 shadow-[0_0_30px_rgba(245,158,11,0.2)]';
            statusBadge = {
              label: `Suspected (${node.consecutiveFailures || 1}/3)`,
              bg: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
              dot: 'bg-amber-500 animate-ping'
            };
          } else if (isStandby) {
            if ((node.diskFiles || 0) > 0) {
              statusBadge = {
                label: 'Standby (Active Replicas)',
                bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                dot: 'bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
              };
            } else {
              statusBadge = {
                label: 'Standby (Idle)',
                bg: 'bg-slate-900 text-slate-400 border-white/[0.08]',
                dot: 'bg-slate-500'
              };
            }
          }

          return (
            <motion.div
              key={nodeId}
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className={`rounded-3xl border p-5 flex flex-col justify-between transition-all duration-300 shadow-xl ${cardBorder}`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`p-2 rounded-xl border ${
                        isDown
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                          : isSuspected
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-slate-900 text-cyan-400 border-white/[0.08]'
                      }`}
                    >
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-100 text-sm tracking-tight">
                        {node.name || nodeId}
                      </h4>
                      <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                        {isStandby ? 'Failover Standby' : 'Primary Storage'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Indicator Pill */}
                <div
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusBadge.bg} mb-4`}
                >
                  <span className={`w-2 h-2 rounded-full ${statusBadge.dot}`} />
                  {statusBadge.label}
                </div>

                {/* Telemetry Stats */}
                <div className="space-y-2 text-xs text-slate-400 bg-black/40 p-3.5 rounded-2xl border border-white/[0.06] mb-4 font-sans">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Zap className="w-3.5 h-3.5 text-cyan-400" /> Endpoint:
                    </span>
                    <span className="font-mono text-cyan-300 text-[11px] font-semibold">
                      127.0.0.1:{nodePorts[nodeId]}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <HardDrive className="w-3.5 h-3.5 text-slate-500" /> Replicas:
                    </span>
                    <span className="font-semibold text-slate-200">
                      {node.diskFiles || 0} files
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Activity className="w-3.5 h-3.5 text-slate-500" /> Stored Size:
                    </span>
                    <span className="font-semibold text-slate-200">
                      {node.diskBytesFormatted || '0 B'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span>Missed Pings:</span>
                    <span
                      className={`font-mono font-bold ${
                        node.consecutiveFailures > 0 ? 'text-amber-400' : 'text-slate-400'
                      }`}
                    >
                      {node.consecutiveFailures || 0} / 3
                    </span>
                  </div>
                </div>
              </div>

              {/* Physical Breaker-Style Control Switches */}
              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                {/* Simulate Failure Switch */}
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => toggleNodeFailure(nodeId, isSimulatedDown)}
                  disabled={loadingNodeId === nodeId}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border shadow-sm ${
                    isSimulatedDown
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                      : 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-white border-rose-500/30'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{isSimulatedDown ? 'Reconnect Node' : 'Simulate Failure'}</span>
                </motion.button>

                {/* Simulate Bit Rot Button */}
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => simulateCorrupt(nodeId)}
                  disabled={loadingNodeId === nodeId || isDown}
                  className="w-full py-1.5 px-3 rounded-xl text-[11px] font-semibold bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-white/[0.06] transition flex items-center justify-center gap-1.5 disabled:opacity-40"
                  title="Invert raw disk bytes to test SHA-256 self-healing"
                >
                  <Flame className="w-3 h-3 text-amber-500" />
                  <span>Corrupt Replica (Bit Rot)</span>
                </motion.button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
