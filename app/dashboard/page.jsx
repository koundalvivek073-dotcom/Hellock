'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UploadZone from '@/components/UploadZone';
import FileGrid from '@/components/FileGrid';
import SharedWithMePanel from '@/components/SharedWithMePanel';
import { Shield, LogOut, Sparkles, Terminal, ChevronDown, FolderOpen, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [activeTab, setActiveTab] = useState('my-files');
  const [downloadingId, setDownloadingId] = useState(null);

  // If unauthenticated, redirect to login
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Fetch current user's accessible files (owned + shared)
  const fetchFiles = useCallback(async () => {
    try {
      setLoadingFiles(true);
      const res = await fetch('/api/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchFiles();
    }
  }, [session, fetchFiles]);

  const handleDownload = async (file) => {
    try {
      setDownloadingId(file.fileId);
      const res = await fetch(`/api/download/${file.fileId}`);
      if (!res.ok) {
        const err = await res.json();
        console.error('Download failed:', err.error);
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
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07080d]">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const user = session?.user;

  // Count shared files for badge
  const sharedWithMeCount = files.filter((f) => !f.isOwner).length;

  // Ambient cluster network particles for background
  const clusterNodes = [
    { x: '8%', y: '18%', color: 'from-cyan-400 to-blue-500', size: 10, delay: 0 },
    { x: '88%', y: '14%', color: 'from-violet-500 to-indigo-500', size: 12, delay: 1.2 },
    { x: '78%', y: '68%', color: 'from-emerald-400 to-teal-500', size: 8, delay: 2.1 },
    { x: '12%', y: '72%', color: 'from-indigo-400 to-cyan-400', size: 10, delay: 0.8 },
    { x: '50%', y: '92%', color: 'from-cyan-400 to-violet-500', size: 8, delay: 1.7 },
    { x: '33%', y: '50%', color: 'from-rose-400 to-pink-500', size: 6, delay: 3.2 },
    { x: '65%', y: '30%', color: 'from-amber-400 to-orange-500', size: 7, delay: 2.8 },
  ];

  return (
    <div className="min-h-screen bg-[#05060a] bg-grain text-slate-100 flex flex-col relative overflow-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Perspective Cyber Grid Overlay */}
      <div className="absolute inset-0 bg-cyber-grid pointer-events-none opacity-30 z-0" />

      {/* Scanline overlay for depth */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.025]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)', backgroundSize: '100% 3px' }} />

      {/* Floating Animated Nebula Orbs — more dramatic, layered */}
      <div className="absolute top-[-10%] left-[15%] w-[750px] h-[750px] bg-gradient-to-tr from-indigo-700/25 via-violet-700/12 to-transparent rounded-full blur-[160px] pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-[10%] right-[-10%] w-[700px] h-[700px] bg-gradient-to-bl from-cyan-500/18 via-blue-700/12 to-transparent rounded-full blur-[160px] pointer-events-none animate-float-slow" />
      <div className="absolute top-[40%] left-[-12%] w-[550px] h-[550px] bg-gradient-to-br from-emerald-600/12 via-teal-600/6 to-transparent rounded-full blur-[170px] pointer-events-none" />
      <div className="absolute top-[20%] right-[20%] w-[400px] h-[400px] bg-gradient-to-bl from-violet-600/14 via-fuchsia-600/8 to-transparent rounded-full blur-[140px] pointer-events-none animate-pulse-glow" style={{ animationDelay: '4s' }} />
      <div className="absolute bottom-0 left-[30%] w-[500px] h-[400px] bg-gradient-to-tr from-cyan-600/10 via-indigo-600/6 to-transparent rounded-full blur-[150px] pointer-events-none animate-float-slow" style={{ animationDelay: '7s' }} />

      {/* Interactive Micro-Node Constellation Pins */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {clusterNodes.map((node, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0.3 }}
            animate={{
              opacity: [0.3, 0.7, 0.3],
              y: [0, -14, 0],
              scale: [1, 1.15, 1],
            }}
            transition={{
              duration: 6 + i * 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: node.delay,
            }}
            style={{ left: node.x, top: node.y }}
            className="absolute flex items-center gap-2"
          >
            <div
              className={`rounded-full bg-gradient-to-tr ${node.color} shadow-[0_0_16px_rgba(6,182,212,0.8)]`}
              style={{ width: `${node.size}px`, height: `${node.size}px` }}
            />
            <div className="hidden md:block w-16 h-[1px] bg-gradient-to-r from-cyan-500/25 to-transparent" />
          </motion.div>
        ))}
      </div>

      {/* Top Navbar */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-[#07080d]/80 backdrop-blur-2xl"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Hellock Brand Logo */}
          <div className="flex items-center gap-2.5">
            <motion.div
              whileHover={{ rotate: 8, scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 350, damping: 15 }}
              className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-cyan-500 p-[1px] shadow-[0_0_20px_rgba(99,102,241,0.25)]"
            >
              <div className="w-full h-full rounded-xl bg-[#090b14] flex items-center justify-center">
                <Shield className="w-4 h-4 text-cyan-400 stroke-[2.2]" />
              </div>
            </motion.div>
            <div className="flex items-center gap-2">
              <span className="font-black text-lg tracking-tight text-white">Hellock</span>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold">
                Network
              </span>
            </div>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-3">
            {/* Quick Link to Mission Control (for hackathon judges) */}
            <Link
              href="/admin"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-white/[0.08] transition shadow-sm"
              title="Open Cluster 3D Mission Control"
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Mission Control</span>
            </Link>

            {user && (
              <div className="relative">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800/80 border border-white/[0.08] transition text-left"
                >
                  {user.image ? (
                    <img
                      src={user.image}
                      alt={user.name || 'User'}
                      className="w-6 h-6 rounded-full"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-[11px] font-bold">
                      {user.name?.[0] || 'U'}
                    </div>
                  )}
                  <span className="text-xs font-medium text-slate-200 hidden sm:inline max-w-[140px] truncate">
                    {user.name || user.email}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </motion.button>

                {/* Dropdown Menu */}
                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      transition={{ duration: 0.16 }}
                      className="absolute right-0 mt-2 w-56 p-2 rounded-2xl vault-panel shadow-2xl z-50 text-xs border border-white/[0.1]"
                    >
                      <div className="px-3 py-2 border-b border-white/[0.06] mb-1">
                        <div className="font-bold text-slate-200 truncate">{user.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
                      </div>

                      <Link
                        href="/admin"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/[0.06] text-slate-300 hover:text-cyan-300 transition"
                      >
                        <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Cluster 3D Visualization</span>
                      </Link>

                      <button
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-red-950/40 text-rose-300 hover:text-rose-200 transition text-left mt-1"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </motion.header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-10 z-10">
        {/* Upload Zone */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <UploadZone onUploadSuccess={fetchFiles} />
        </motion.section>

        {/* Tab switcher: My Files | Shared with Me */}
        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="space-y-5"
        >
          {/* Tab Bar */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-900/70 border border-white/[0.06] w-fit">
            <button
              onClick={() => setActiveTab('my-files')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'my-files'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>My Files</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                activeTab === 'my-files'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {files.filter(f => f.isOwner !== false).length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('shared')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'shared'
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Shared with Me</span>
              {sharedWithMeCount > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  activeTab === 'shared'
                    ? 'bg-white/20 text-white'
                    : 'bg-violet-900/70 text-violet-300 border border-violet-700/60'
                }`}>
                  {sharedWithMeCount}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'my-files' ? (
              <motion.div
                key="my-files"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                <FileGrid
                  files={files}
                  loading={loadingFiles}
                  onRefresh={fetchFiles}
                  currentUser={user}
                />
              </motion.div>
            ) : (
              <motion.div
                key="shared"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                <SharedWithMePanel
                  files={files}
                  onDownload={handleDownload}
                  downloadingId={downloadingId}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full border-t border-white/[0.04] py-6 text-center text-xs text-slate-500 z-10">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Hellock Distributed Consensus Core • 99.999% Durability</span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Triple Replicated with SHA-256 Self-Healing
          </span>
        </div>
      </footer>
    </div>
  );
}
