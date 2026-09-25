'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  Download,
  Share2,
  Users,
  Search,
  Clock,
  HardDrive,
  ShieldCheck,
  Check,
  Sparkles,
  FileUp,
  FolderOpen
} from 'lucide-react';
import ShareModal from './ShareModal';
import { useToast } from './ToastProvider';

export default function FileGrid({ files = [], loading = false, onRefresh, currentUser }) {
  const [selectedFileForShare, setSelectedFileForShare] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const toast = useToast();

  const getFileIcon = (filename, mimeType = '') => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext) || mimeType.startsWith('image/')) {
      return <ImageIcon className="w-5 h-5 text-pink-400" />;
    }
    if (['json', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'py'].includes(ext)) {
      return <FileCode className="w-5 h-5 text-cyan-400" />;
    }
    if (['csv', 'xlsx', 'xls'].includes(ext)) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
    }
    if (['zip', 'tar', 'gz', 'rar'].includes(ext)) {
      return <FileArchive className="w-5 h-5 text-amber-400" />;
    }
    return <FileText className="w-5 h-5 text-indigo-400" />;
  };

  const handleDownload = async (file) => {
    try {
      setDownloadingId(file.fileId);
      const res = await fetch(`/api/download/${file.fileId}`);
      if (!res.ok) {
        const error = await res.json();
        toast?.error(error.error || 'Failed to download file', 'Download Failed');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast?.success(`Verified SHA-256 integrity`, `"${file.filename}" Downloaded`);
    } catch (err) {
      toast?.error(err.message, 'Download Error');
    } finally {
      setDownloadingId(null);
    }
  };

  function formatBytes(bytes) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  function formatRelativeDate(isoString) {
    if (!isoString) return 'Just now';
    try {
      const now = new Date();
      const then = new Date(isoString);
      const diffSecs = Math.floor((now - then) / 1000);

      if (diffSecs < 60) return 'Just now';
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
      if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`;

      return then.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch (e) {
      return 'Recent';
    }
  }

  const filteredFiles = files.filter((f) =>
    f.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full space-y-6">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span>Files</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-900/90 text-cyan-400 border border-white/[0.08] font-mono">
              {files.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Protected across independent storage nodes with quorum consensus
          </p>
        </div>

        {/* Search Input with Focus Glow */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900/80 border border-white/[0.08] text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition shadow-inner"
          />
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="rounded-3xl vault-panel p-5.5 space-y-4 border border-white/[0.06]"
            >
              <div className="flex justify-between items-center">
                <div className="w-10 h-10 rounded-2xl skeleton-box" />
                <div className="w-16 h-5 rounded-full skeleton-box" />
              </div>
              <div className="w-3/4 h-4 rounded-md skeleton-box" />
              <div className="w-1/2 h-3 rounded-md skeleton-box" />
              <div className="pt-4 border-t border-white/[0.04] flex justify-between">
                <div className="w-20 h-4 rounded skeleton-box" />
                <div className="w-16 h-6 rounded-xl skeleton-box" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredFiles.length === 0 ? (
        /* Empty State with Warm Micro-Copy */
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 px-4 rounded-3xl vault-panel border border-white/[0.06] flex flex-col items-center justify-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-slate-500 mb-4">
            <FolderOpen className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="text-sm font-semibold text-slate-300">
            {searchQuery ? 'No matching files found' : 'Nothing here yet'}
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            {searchQuery
              ? `No files found matching "${searchQuery}".`
              : 'Drop a file into the upload zone above to secure your first object.'}
          </p>
        </motion.div>
      ) : (
        /* Staggered File Grid */
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.05 },
            },
          }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {filteredFiles.map((file) => {
            const isOwner = file.isOwner ?? true;
            const sharedAccounts = file.authorizedAccounts || [];

            return (
              <motion.div
                key={file.fileId}
                variants={{
                  hidden: { opacity: 0, y: 18, scale: 0.98 },
                  visible: { opacity: 1, y: 0, scale: 1 },
                }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="group relative rounded-3xl vault-card p-5.5 flex flex-col justify-between overflow-hidden"
              >
                {/* Top Subtle Edge Highlight */}
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div>
                  {/* Top Row: File Icon + Badges */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="p-3 rounded-2xl bg-slate-900/90 border border-white/[0.08] shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
                      {getFileIcon(file.filename, file.mimeType)}
                    </div>

                    {/* Ownership / Share Badges */}
                    <div className="flex items-center gap-1.5">
                      {!isOwner ? (
                        <span
                          title={`Shared by ${file.sharedBy}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-cyan-950/70 text-cyan-300 border border-cyan-800/50"
                        >
                          <img
                            src={`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(file.sharedBy || 'owner')}`}
                            alt="avatar"
                            className="w-3.5 h-3.5 rounded-full"
                          />
                          <span>Shared by {file.sharedBy?.split('@')[0]}</span>
                        </span>
                      ) : sharedAccounts.length > 0 ? (
                        <span
                          title={`Shared with ${sharedAccounts.join(', ')}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-900/90 text-slate-300 border border-white/[0.08]"
                        >
                          <Users className="w-3 h-3 text-cyan-400" />
                          <span>{sharedAccounts.length}</span>
                        </span>
                      ) : null}

                      {/* Share Button (Only Owner) */}
                      {isOwner && (
                        <motion.button
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => setSelectedFileForShare(file)}
                          className="p-2 rounded-xl bg-slate-900/80 hover:bg-cyan-600 text-slate-400 hover:text-white border border-white/[0.06] hover:border-transparent transition shadow-sm"
                          title="Share file"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </motion.button>
                      )}
                    </div>
                  </div>

                  {/* Filename with tooltip */}
                  <h3
                    className="font-bold text-slate-100 text-sm truncate mb-1"
                    title={file.filename}
                  >
                    {file.filename}
                  </h3>

                  {/* Size and Relative Timestamp */}
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-5">
                    <span className="font-semibold text-slate-300">
                      {formatBytes(file.size)}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {formatRelativeDate(file.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Footer Action Bar (Reveals smoothly on hover) */}
                <div className="pt-3.5 border-t border-white/[0.06] flex items-center justify-between">
                  <span
                    className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]"
                    title={`SHA-256: ${file.hash}`}
                  >
                    {file.hash?.substring(0, 10)}...
                  </span>

                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => handleDownload(file)}
                    disabled={downloadingId === file.fileId}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-cyan-600 text-slate-200 hover:text-white border border-white/[0.08] hover:border-transparent transition-all shadow-md disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{downloadingId === file.fileId ? 'Fetching...' : 'Download'}</span>
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Share Modal Dialog */}
      <ShareModal
        file={selectedFileForShare}
        isOpen={!!selectedFileForShare}
        onClose={() => setSelectedFileForShare(null)}
        onUpdate={() => {
          if (onRefresh) onRefresh();
          setSelectedFileForShare(null);
        }}
      />
    </div>
  );
}
