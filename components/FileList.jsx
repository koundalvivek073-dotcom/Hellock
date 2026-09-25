'use client';

import React, { useState } from 'react';
import { FileText, Download, ShieldAlert, Check, Copy, HardDrive, RefreshCw } from 'lucide-react';

export default function FileList({ files = [], onRefresh }) {
  const [downloadingId, setDownloadingId] = useState(null);
  const [corruptingId, setCorruptingId] = useState(null);
  const [copiedHash, setCopiedHash] = useState(null);

  const copyHash = (hash) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleDownload = async (fileId, filename) => {
    try {
      setDownloadingId(fileId);
      const res = await fetch(`/api/download/${fileId}`);
      if (!res.ok) {
        const error = await res.json();
        alert(`Download failed: ${error.error}`);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download error: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCorrupt = async (fileId) => {
    try {
      setCorruptingId(fileId);
      const res = await fetch('/api/simulate-corruption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error);
      } else {
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCorruptingId(null);
    }
  };

  const getReplicaBadge = (nodeId, replica) => {
    const status = replica?.status || 'missing';

    if (status === 'synced') {
      return (
        <span
          key={nodeId}
          title={`${nodeId}: Synced (v${replica.version})`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {nodeId.replace('node', '')}: v{replica.version}
        </span>
      );
    }

    if (status === 'stale') {
      return (
        <span
          key={nodeId}
          title={`${nodeId}: Stale version (v${replica.version})`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          {nodeId.replace('node', '')}: Stale
        </span>
      );
    }

    if (status === 'corrupted') {
      return (
        <span
          key={nodeId}
          title={`${nodeId}: Checksum mismatch detected!`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          {nodeId.replace('node', '')}: Corrupt
        </span>
      );
    }

    return (
      <span
        key={nodeId}
        title={`${nodeId}: No replica stored`}
        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-500 border border-slate-700/60"
      >
        {nodeId.replace('node', '')}: -
      </span>
    );
  };

  function formatBytes(bytes) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  return (
    <div className="w-full rounded-2xl bg-slate-900/60 border border-slate-800 p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-cyan-400" />
            Distributed Objects & Replicated Files ({files.length})
          </h3>
          <p className="text-xs text-slate-500">
            Per-node replica consistency, SHA-256 signatures, and failover download routing.
          </p>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/30">
          <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">No objects stored in cluster</p>
          <p className="text-xs text-slate-500 mt-1">
            Upload a file or click &quot;Upload Demo Object&quot; above to test triple replication!
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px] tracking-wider">
                <th className="py-3 px-3">File / Object</th>
                <th className="py-3 px-3">Version</th>
                <th className="py-3 px-3">Master SHA-256</th>
                <th className="py-3 px-3">Replica Placement (A, B, C, D)</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {files.map((file) => (
                <tr key={file.fileId} className="hover:bg-slate-800/30 transition">
                  {/* File Name & Size */}
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded bg-slate-800 text-cyan-400">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200 text-sm">
                          {file.filename}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatBytes(file.size)} • {file.mimeType}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Version */}
                  <td className="py-3.5 px-3">
                    <span className="px-2 py-0.5 rounded text-xs font-bold font-mono bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                      v{file.version}
                    </span>
                  </td>

                  {/* SHA-256 Hash with Copy */}
                  <td className="py-3.5 px-3">
                    <button
                      onClick={() => copyHash(file.hash)}
                      className="group flex items-center gap-1.5 font-mono text-[11px] text-slate-400 hover:text-cyan-400 transition"
                      title="Click to copy full SHA-256 hash"
                    >
                      <span>{file.hash.substring(0, 14)}...</span>
                      {copiedHash === file.hash ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-slate-600 group-hover:text-cyan-400" />
                      )}
                    </button>
                  </td>

                  {/* Node Replicas */}
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-1.5">
                      {['nodeA', 'nodeB', 'nodeC', 'nodeD'].map((nid) =>
                        getReplicaBadge(nid, file.replicas?.[nid])
                      )}
                    </div>
                  </td>

                  {/* Action Buttons */}
                  <td className="py-3.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Failover Download */}
                      <button
                        onClick={() => handleDownload(file.fileId, file.filename)}
                        disabled={downloadingId === file.fileId}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition disabled:opacity-50"
                        title="Download file with failover & read-repair"
                      >
                        {downloadingId === file.fileId ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>Download</span>
                      </button>

                      {/* Corrupt Single Replica for Demo */}
                      <button
                        onClick={() => handleCorrupt(file.fileId)}
                        disabled={corruptingId === file.fileId}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-red-950/60 text-amber-400 hover:text-red-400 border border-slate-700 hover:border-red-500/40 transition disabled:opacity-50"
                        title="Flip bits on a replica to simulate bit rot"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Corrupt</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
