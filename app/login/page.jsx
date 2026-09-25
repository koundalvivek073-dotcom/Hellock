'use client';

import React from 'react';
import LoginForm from '@/components/LoginForm';
import { motion } from 'framer-motion';

export default function LoginPage() {
  // Replicating nodes background dots (simulating distributed replication)
  const nodeDots = [
    { x: '15%', y: '20%', delay: 0 },
    { x: '25%', y: '65%', delay: 1.5 },
    { x: '80%', y: '25%', delay: 0.8 },
    { x: '85%', y: '70%', delay: 2.2 },
    { x: '50%', y: '85%', delay: 1.2 },
    { x: '10%', y: '80%', delay: 2.8 },
    { x: '70%', y: '80%', delay: 1.9 },
  ];

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#07080d] bg-grain selection:bg-cyan-500/30">
      {/* Deep Ambient Gradient Mesh */}
      <div className="absolute top-1/4 -left-32 w-[600px] h-[600px] bg-gradient-to-tr from-indigo-600/15 via-violet-600/10 to-transparent rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-20 -right-32 w-[650px] h-[650px] bg-gradient-to-bl from-cyan-500/15 via-blue-600/10 to-transparent rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-950/20 rounded-full blur-[160px] pointer-events-none" />

      {/* Floating Replicating Node Cluster Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {nodeDots.map((dot, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0.15, scale: 0.8 }}
            animate={{
              opacity: [0.15, 0.45, 0.15],
              scale: [0.8, 1.2, 0.8],
              y: [0, -18, 0],
            }}
            transition={{
              duration: 7 + idx,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: dot.delay,
            }}
            style={{ left: dot.x, top: dot.y }}
            className="absolute flex items-center gap-2"
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.8)]" />
            <div className="w-12 h-[1px] bg-gradient-to-r from-cyan-500/30 to-transparent hidden sm:block" />
          </motion.div>
        ))}
      </div>

      {/* Subtle Orbital Circles for Depth */}
      <div className="absolute w-[680px] h-[680px] rounded-full border border-white/[0.03] pointer-events-none" />
      <div className="absolute w-[980px] h-[980px] rounded-full border border-white/[0.02] pointer-events-none" />

      {/* Centered Glass Card */}
      <div className="relative z-10 w-full flex justify-center perspective-1000">
        <LoginForm />
      </div>
    </div>
  );
}
