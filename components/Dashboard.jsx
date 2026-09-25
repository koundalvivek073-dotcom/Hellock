'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import NodeVisualization from './NodeVisualization';
import NodeStatusGrid from './NodeStatusGrid';
import FileList from './FileList';
import EventLog from './EventLog';
import {
  ShieldCheck,
  Upload,
  RefreshCw,
  Search,
  Database,
  Layers,
  Sparkles,
  Zap,
  Activity
} from 'lucide-react';

export default function Dashboard() {
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
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  // Fetch full cluster state from /api/status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }, []);

  // Connect to live SSE stream for zero-latency dashboard updates
  useEffect(() => {
    fetchStatus();

    let eventSource = null;
    try {
      eventSource = new EventSource('/api/events');

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);

          // Add to events log
          setEvents((prev) => [parsed, ...prev.slice(0, 100)]);

          // Check if data transfer beam animation should be triggered
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

          // Trigger state re-fetch on stateful transitions
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
        } catch (e) {
          // ignore heartbeat parse errors
        }
      };

      eventSource.onerror = () => {
        // SSE fallback polling
      };
    } catch (err) {
      console.error('SSE initialization error:', err);
    }

    // Secondary fallback polling interval (every 4s)
    const pollInterval = setInterval(() => {
      fetchStatus();
    }, 4000);

    return () => {
      clearInterval(pollInterval);
      if (eventSource) eventSource.close();
    };
  }, [fetchStatus]);

  // Seed events from initial status call
  useEffect(() => {
    if (data.recentEvents && data.recentEvents.length > 0 && events.length === 0) {
      setEvents(data.recentEvents);
    }
  }, [data.recentEvents, events.length]);

  // Handle custom file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadError(null);

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      fetchStatus();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 1-Click Load Demo File (creates and uploads a realistic hackathon dataset)
  const handleLoadDemoFile = async () => {
    try {
      setIsUploading(true);
      setUploadError(null);

      const demoPayload = {
        filename: `sensor_telemetry_batch_${Date.now().toString().slice(-4)}.json`,
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
            },
            records: [
              { node: "nodeA", latencyMs: 1.2, load: "normal" },
              { node: "nodeB", latencyMs: 1.4, load: "normal" },
              { node: "nodeC", latencyMs: 1.1, load: "normal" },
              { node: "nodeD", latencyMs: 0.0, load: "standby" }
            ]
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

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Demo upload failed');
      }

      fetchStatus();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Trigger manual cryptographic integrity check
  const handleTriggerIntegrity = async () => {
    try {
      setIsCheckingIntegrity(true);
      const res = await fetch('/api/trigger-integrity-check', { method: 'POST' });
      await res.json();
      fetchStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCheckingIntegrity(false);
    }
  };

  // Cluster health status calculations
  const nodesList = Object.values(data.nodes || {});
  const healthyCount = nodesList.filter((n) => n.status === 'healthy').length;
  const isQuorumReady = healthyCount >= 2;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner / Navbar */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.4)]">
            <Database className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                VAULT
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                DISTRIBUTED OBJECT STORAGE
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Fault-tolerant cluster • Triple replication (N=3) • Quorum write (W=2) • Self-healing standby
            </p>
          </div>
        </div>

        {/* Action Controls & Cluster Badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quorum Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-400">Write Quorum:</span>
            <span className="font-mono font-bold text-slate-200">
              {data.config.writeQuorum} / {data.config.replicationFactor} confirmed
            </span>
          </div>

          {/* 1-Click Load Demo File Button */}
          <button
            onClick={handleLoadDemoFile}
            disabled={isUploading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 transition shadow-[0_0_20px_rgba(6,182,212,0.4)] disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isUploading ? 'Uploading...' : '⚡ 1-Click Load Demo File'}</span>
          </button>

          {/* Custom File Upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>Upload File</span>
          </button>

          {/* Trigger Cryptographic Integrity Check */}
          <button
            onClick={handleTriggerIntegrity}
            disabled={isCheckingIntegrity}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 transition disabled:opacity-50"
            title="Scan all replicas, re-hash with SHA-256, and auto-heal any corrupted bytes"
          >
            <Search className={`w-3.5 h-3.5 text-emerald-400 ${isCheckingIntegrity ? 'animate-spin' : ''}`} />
            <span>{isCheckingIntegrity ? 'Auditing...' : 'Check Integrity'}</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={fetchStatus}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Refresh Cluster State"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Upload Error Banner if any */}
      {uploadError && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-red-300 text-xs font-medium flex items-center justify-between">
          <span>Upload failed: {uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-white font-bold ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION 1: 3D Animated Node Visualization (Centerpiece of the demo) */}
      <section>
        <NodeVisualization
          nodes={data.nodes}
          activeTransfer={activeTransfer}
        />
      </section>

      {/* SECTION 2: Supporting Node Detail Cards & Failure Controls */}
      <section>
        <NodeStatusGrid
          nodes={data.nodes}
          onRefresh={fetchStatus}
        />
      </section>

      {/* SECTION 3: Split Row - File Replicas Table + Real-time Event Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Replicated Files */}
        <div className="lg:col-span-7">
          <FileList
            files={data.files}
            onRefresh={fetchStatus}
          />
        </div>

        {/* Right Column: Scrolling Real-time Cluster Event Log */}
        <div className="lg:col-span-5">
          <EventLog
            events={events}
            onClear={() => setEvents([])}
          />
        </div>
      </div>
    </div>
  );
}
