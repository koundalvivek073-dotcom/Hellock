'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UploadZone from '@/components/UploadZone';
import FileGrid from '@/components/FileGrid';
import { Shield, LogOut, Sparkles, Terminal, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);

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

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07080d]">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const user = session?.user;

  return (
    <div className="min-h-screen bg-[#07080d] bg-grain text-slate-100 flex flex-col relative overflow-hidden">
      {/* Ambient Gradient Mesh Orbs */}
      <div className="absolute top-10 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-600/10 via-violet-600/5 to-transparent rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/3 right-10 w-[450px] h-[450px] bg-gradient-to-bl from-cyan-500/10 via-blue-600/5 to-transparent rounded-full blur-[140px] pointer-events-none" />

      {/* Top Navbar */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-[#07080d]/80 backdrop-blur-2xl"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Vault Brand Logo */}
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
              <span className="font-black text-lg tracking-tight text-white">Vault</span>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold">
                Hellock
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
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-12 z-10">
        {/* Upload Zone */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <UploadZone onUploadSuccess={fetchFiles} />
        </motion.section>

        {/* File Grid */}
        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          <FileGrid
            files={files}
            loading={loadingFiles}
            onRefresh={fetchFiles}
            currentUser={user}
          />
        </motion.section>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full border-t border-white/[0.04] py-6 text-center text-xs text-slate-500 z-10">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Vault Distributed Consensus Core • 99.999% Durability</span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Triple Replicated with SHA-256 Self-Healing
          </span>
        </div>
      </footer>
    </div>
  );
}
