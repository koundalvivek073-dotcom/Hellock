'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  FileText,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  Download,
  ChevronRight,
  Inbox,
  Clock,
  Globe,
  Lock,
} from 'lucide-react';

function getFileIcon(filename = '', mimeType = '') {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext) || mimeType?.startsWith('image/')) {
    return <ImageIcon className="w-4 h-4 text-pink-400" />;
  }
  if (['json', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'py'].includes(ext)) {
    return <FileCode className="w-4 h-4 text-cyan-400" />;
  }
  if (['csv', 'xlsx', 'xls'].includes(ext)) {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
  }
  if (['zip', 'tar', 'gz', 'rar'].includes(ext)) {
    return <FileArchive className="w-4 h-4 text-amber-400" />;
  }
  return <FileText className="w-4 h-4 text-indigo-400" />;
}

function formatBytes(bytes) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelativeDate(isoString) {
  if (!isoString) return '';
  try {
    const now = new Date();
    const then = new Date(isoString);
    const diffSecs = Math.floor((now - then) / 1000);
    if (diffSecs < 60) return 'Just now';
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`;
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// Generate a deterministic color from a string (for avatar gradients)
function avatarGradient(seed = '') {
  const palettes = [
    'from-violet-500 to-indigo-500',
    'from-cyan-500 to-blue-500',
    'from-emerald-500 to-teal-500',
    'from-rose-500 to-pink-500',
    'from-amber-500 to-orange-500',
    'from-fuchsia-500 to-purple-500',
    'from-sky-500 to-cyan-500',
    'from-lime-500 to-emerald-500',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return palettes[Math.abs(hash) % palettes.length];
}

export default function SharedWithMePanel({ files = [], onDownload, downloadingId }) {
  const [selectedSharer, setSelectedSharer] = useState(null);

  // Filter files that were shared with the current user (not owned by them)
  const sharedFiles = useMemo(() => files.filter((f) => !f.isOwner), [files]);

  // Group files by sharer
  const sharerGroups = useMemo(() => {
    const groups = {};
    sharedFiles.forEach((file) => {
      // sharedBy = ownerName (display name), owner = email
      const sharerName = file.sharedByName || file.sharedBy || file.owner || 'Unknown';
      const sharerEmail = file.owner || 'unknown';
      const key = sharerEmail;

      if (!groups[key]) {
        groups[key] = {
          sharerName,
          sharerEmail,
          files: [],
        };
      }
      groups[key].files.push(file);
    });
    return Object.values(groups);
  }, [sharedFiles]);

  const selectedGroup =
    sharerGroups.find((g) => g.sharerEmail === selectedSharer) || sharerGroups[0] || null;

  if (sharedFiles.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl vault-panel border border-white/[0.06] p-8 flex flex-col items-center justify-center text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-slate-500 mb-4">
          <Inbox className="w-7 h-7 stroke-[1.5]" />
        </div>
        <p className="text-sm font-semibold text-slate-300">No files shared with you yet</p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          When someone shares a file with you, it will appear here — along with who sent it.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full"
    >
      {/* Section Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center shadow-[0_0_16px_rgba(139,92,246,0.3)]">
          <Users className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
            Shared with Me
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-900/60 text-violet-300 border border-violet-800/60 font-mono">
              {sharedFiles.length}
            </span>
          </h2>
          <p className="text-[11px] text-slate-400">Files other users have given you access to</p>
        </div>
      </div>

      {/* WhatsApp-style layout: contact list + file detail */}
      <div className="flex gap-0 rounded-3xl overflow-hidden vault-panel border border-white/[0.07] min-h-[340px]">

        {/* Left: Sharer Contact List */}
        <div className="w-52 shrink-0 border-r border-white/[0.06] flex flex-col">
          <div className="px-3 py-2.5 border-b border-white/[0.06]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Contacts</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sharerGroups.map((group, i) => {
              const isSelected = selectedSharer
                ? selectedSharer === group.sharerEmail
                : i === 0;
              const initials = group.sharerName
                .split(' ')
                .map((w) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              const gradient = avatarGradient(group.sharerEmail);
              const latestFile = group.files[group.files.length - 1];

              return (
                <motion.button
                  key={group.sharerEmail}
                  onClick={() => setSelectedSharer(group.sharerEmail)}
                  whileHover={{ x: 2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className={`w-full flex items-center gap-2.5 px-3 py-3 text-left transition-colors border-b border-white/[0.04] relative ${
                    isSelected
                      ? 'bg-violet-950/50'
                      : 'hover:bg-white/[0.04]'
                  }`}
                >
                  {/* Active indicator strip */}
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-violet-500 rounded-r-full" />
                  )}

                  {/* Avatar with gradient */}
                  <div
                    className={`w-9 h-9 rounded-full bg-gradient-to-tr ${gradient} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-lg`}
                  >
                    {initials}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Username — the primary display */}
                    <div className={`text-xs font-bold truncate ${isSelected ? 'text-violet-200' : 'text-slate-200'}`}>
                      {group.sharerName}
                    </div>
                    {/* Latest file preview */}
                    <div className="text-[10px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                      {getFileIcon(latestFile?.filename)}
                      <span className="truncate">{latestFile?.filename}</span>
                    </div>
                    <div className="text-[10px] text-slate-600 mt-0.5">
                      {group.files.length} file{group.files.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {isSelected && (
                    <ChevronRight className="w-3 h-3 text-violet-400 shrink-0" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Right: File List for selected sharer */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedGroup ? (
            <>
              {/* Sharer Info Header */}
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-full bg-gradient-to-tr ${avatarGradient(selectedGroup.sharerEmail)} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-lg`}
                >
                  {selectedGroup.sharerName
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100">{selectedGroup.sharerName}</div>
                  <div className="text-[11px] text-slate-500">{selectedGroup.sharerEmail}</div>
                </div>
                <div className="ml-auto text-[10px] text-violet-400 font-semibold px-2 py-0.5 rounded-full bg-violet-950/60 border border-violet-800/50">
                  {selectedGroup.files.length} shared with you
                </div>
              </div>

              {/* File Items */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <AnimatePresence>
                  {selectedGroup.files.map((file, idx) => (
                    <motion.div
                      key={file.fileId}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group flex items-center gap-3 p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] hover:border-violet-500/25 transition-all"
                    >
                      {/* File Icon */}
                      <div className="w-9 h-9 rounded-xl bg-slate-900/80 border border-white/[0.08] flex items-center justify-center shrink-0">
                        {getFileIcon(file.filename, file.mimeType)}
                      </div>

                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-100 truncate" title={file.filename}>
                          {file.filename}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                          <span>{formatBytes(file.size)}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {formatRelativeDate(file.createdAt)}
                          </span>
                          {file.isPublic ? (
                            <span className="flex items-center gap-0.5 text-emerald-400">
                              <Globe className="w-2.5 h-2.5" />
                              Public
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-slate-600">
                              <Lock className="w-2.5 h-2.5" />
                              Private
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Download Button */}
                      <motion.button
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => onDownload?.(file)}
                        disabled={downloadingId === file.fileId}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-slate-900 hover:bg-violet-600 text-slate-300 hover:text-white border border-white/[0.08] hover:border-transparent transition-all shadow-sm shrink-0 disabled:opacity-50"
                        title="Download file"
                      >
                        <Download className="w-3 h-3" />
                        <span>{downloadingId === file.fileId ? '...' : 'Get'}</span>
                      </motion.button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Select a contact
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
