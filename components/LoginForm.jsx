'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Sparkles, Lock, ArrowRight, Users, CheckCircle2, ChevronDown } from 'lucide-react';

export default function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [demoEmail, setDemoEmail] = useState('alice.hacks@gmail.com');
  const [demoName, setDemoName] = useState('Alice (Owner)');
  const [showDemoSelector, setShowDemoSelector] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signIn('google', { callbackUrl: '/dashboard' });
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleDemoSignIn = async (email, name) => {
    setLoading(true);
    try {
      const res = await signIn('demo-google-account', {
        redirect: false,
        email,
        name,
        callbackUrl: '/dashboard',
      });
      if (res?.ok) {
        router.push('/dashboard');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-[420px] p-8 sm:p-10 rounded-3xl vault-panel text-center overflow-hidden preserve-3d shadow-2xl"
    >
      {/* Top Subtle Indigo-Violet Ambient Glow */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-32 bg-gradient-to-b from-indigo-500/25 via-violet-500/15 to-transparent blur-3xl pointer-events-none" />

      {/* Subtle Shimmer Accent along Border */}
      <div className="absolute inset-0 rounded-3xl animate-shimmer pointer-events-none opacity-30" />

      {/* Floating Brand Badge */}
      <motion.div
        whileHover={{ scale: 1.06, rotateY: 8 }}
        transition={{ type: 'spring', stiffness: 350, damping: 18 }}
        className="w-14 h-14 mx-auto mb-6 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-cyan-500 p-[1px] shadow-[0_0_30px_rgba(99,102,241,0.35)]"
      >
        <div className="w-full h-full rounded-2xl bg-[#090b14] flex items-center justify-center">
          <Shield className="w-7 h-7 text-cyan-400 stroke-[2.2]" />
        </div>
      </motion.div>

      {/* Logo & Tagline */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-2 flex items-center justify-center gap-2">
          <span>Vault</span>
          <span className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold align-middle">
            Hellock
          </span>
        </h1>
        <p className="text-sm font-medium text-slate-400">
          Your files, <span className="text-cyan-400 font-semibold drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]">indestructible.</span>
        </p>
      </div>

      {/* Main Google Sign-In Action */}
      <div className="space-y-4">
        <motion.button
          whileHover={{ scale: 1.015, boxShadow: '0 0 30px rgba(255, 255, 255, 0.15)' }}
          whileTap={{ scale: 0.985 }}
          disabled={loading}
          onClick={handleGoogleSignIn}
          className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm flex items-center justify-center gap-3 transition-all duration-180 shadow-lg disabled:opacity-60 relative overflow-hidden group"
        >
          {loading ? (
            <div className="w-5 h-5 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
          ) : (
            <>
              {/* Google G Logo SVG */}
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.04h3.87c2.27-2.09 3.675-5.17 3.675-9.14z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.04c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.13C3.26 21.36 7.34 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.25c-.25-.72-.38-1.49-.38-2.25s.13-1.53.38-2.25V6.62H1.27C.46 8.23 0 10.06 0 12s.46 3.77 1.27 5.38l4-3.13z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.27 6.62l4 3.13c.95-2.85 3.6-4.96 6.73-4.96z"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </motion.button>

        {/* Divider */}
        <div className="relative my-6 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/[0.07]" />
          </div>
          <span className="relative px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-[#0c0e18] rounded-full">
            Hackathon Quick-Access
          </span>
        </div>

        {/* Expandable Demo Persona Selector */}
        {!showDemoSelector ? (
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setShowDemoSelector(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 text-xs font-semibold border border-white/[0.06] transition flex items-center justify-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Select Demo Persona (Alice / Bob)</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 ml-1" />
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-white/[0.08] text-left backdrop-blur-md"
          >
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Select Active Account:</span>
              <button
                onClick={() => setShowDemoSelector(false)}
                className="text-[10px] text-slate-500 hover:text-slate-300"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleDemoSignIn('alice.hacks@gmail.com', 'Alice (Owner)')}
                className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-cyan-950/50 hover:border-cyan-500/50 border border-white/[0.06] text-left transition"
              >
                <div className="text-xs font-bold text-slate-200">Alice</div>
                <div className="text-[10px] text-slate-400 truncate">alice.hacks@gmail.com</div>
              </button>
              <button
                type="button"
                onClick={() => handleDemoSignIn('bob.dev@gmail.com', 'Bob (Collaborator)')}
                className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-cyan-950/50 hover:border-cyan-500/50 border border-white/[0.06] text-left transition"
              >
                <div className="text-xs font-bold text-slate-200">Bob</div>
                <div className="text-[10px] text-slate-400 truncate">bob.dev@gmail.com</div>
              </button>
            </div>

            <div className="pt-2 border-t border-white/[0.06] flex items-center gap-2">
              <input
                type="email"
                value={demoEmail}
                onChange={(e) => setDemoEmail(e.target.value)}
                placeholder="custom.user@gmail.com"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={() => handleDemoSignIn(demoEmail, demoName)}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold whitespace-nowrap transition"
              >
                Enter
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-8 text-xs text-slate-500 flex items-center justify-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>Hellock Quorum Consensus Engine active</span>
      </div>
    </motion.div>
  );
}
