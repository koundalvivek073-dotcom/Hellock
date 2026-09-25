'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, CheckCircle2, AlertCircle, Sparkles, ShieldCheck, FileUp } from 'lucide-react';
import { useToast } from './ToastProvider';

export default function UploadZone({ onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [currentFilename, setCurrentFilename] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const fileInputRef = useRef(null);
  const toast = useToast();

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) executeUpload(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) executeUpload(file);
  };

  const executeUpload = async (file) => {
    try {
      setIsUploading(true);
      setErrorMsg(null);
      setUploadSuccess(false);
      setCurrentFilename(file.name);
      setUploadProgress(15);

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 88) {
            clearInterval(progressInterval);
            return 88;
          }
          return prev + 18;
        });
      }, 65);

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadProgress(100);
      setUploadSuccess(true);
      toast?.success(`Replicated across quorum nodes`, `"${file.name}" Secured`);

      setTimeout(() => {
        setIsUploading(false);
        setUploadSuccess(false);
        setUploadProgress(0);
        setCurrentFilename('');
        if (onUploadSuccess) onUploadSuccess();
      }, 1300);
    } catch (err) {
      setErrorMsg(err.message);
      toast?.error(err.message, 'Upload Failed');
      setIsUploading(false);
      setUploadProgress(0);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full perspective-1000">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      <motion.div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        whileHover={{ scale: isUploading ? 1 : 1.008 }}
        whileTap={{ scale: isUploading ? 1 : 0.995 }}
        className={`relative w-full rounded-3xl p-8 sm:p-14 text-center cursor-pointer overflow-hidden border-2 transition-all duration-200 ${
          isDragging
            ? 'border-solid border-cyan-400 bg-cyan-950/30 shadow-[0_0_50px_rgba(6,182,212,0.35)]'
            : 'border-dashed border-white/[0.12] hover:border-cyan-500/40 vault-panel'
        }`}
      >
        {/* Subtle Ambient Sweep */}
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 via-cyan-500/5 to-transparent pointer-events-none" />

        {/* Shimmer Border Accent */}
        <div className="absolute inset-0 rounded-3xl animate-shimmer pointer-events-none opacity-20" />

        <AnimatePresence mode="wait">
          {isUploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              className="flex flex-col items-center justify-center py-4"
            >
              {/* Circular SVG Progress Ring with Soft Glow */}
              <div className="relative w-28 h-28 mb-4 flex items-center justify-center drop-shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#13192b"
                    strokeWidth="7"
                  />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke={uploadSuccess ? '#10b981' : '#06b6d4'}
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={251.2}
                    animate={{
                      strokeDashoffset: 251.2 - (251.2 * uploadProgress) / 100,
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </svg>

                <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-xl text-slate-100">
                  {uploadSuccess ? (
                    <motion.div
                      initial={{ scale: 0.4, rotate: -20 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      className="text-emerald-400"
                    >
                      <CheckCircle2 className="w-10 h-10" />
                    </motion.div>
                  ) : (
                    `${uploadProgress}%`
                  )}
                </div>
              </div>

              <div className="font-bold text-slate-100 text-base mb-1">
                {uploadSuccess ? 'Secured in Vault Replicas!' : 'Streaming to Quorum Nodes...'}
              </div>
              <div className="text-xs text-slate-400 font-mono truncate max-w-xs">
                {currentFilename}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex flex-col items-center justify-center"
            >
              {/* Floating Upload Icon */}
              <motion.div
                animate={{
                  y: [0, -6, 0],
                }}
                transition={{
                  duration: 3.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                whileHover={{ scale: 1.08 }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500/20 via-violet-500/20 to-cyan-500/20 border border-white/[0.12] flex items-center justify-center text-cyan-400 mb-5 shadow-[0_0_30px_rgba(6,182,212,0.2)]"
              >
                <UploadCloud className="w-8 h-8 stroke-[2.2]" />
              </motion.div>

              <h3 className="text-lg font-bold text-slate-100 mb-1.5 tracking-tight">
                Drop files into <span className="text-cyan-400 font-extrabold">Vault</span>, or browse
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
                Files are parallel-written across independent storage nodes with quorum consensus and cryptographic checksums.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-slate-900/90 text-slate-300 border border-white/[0.08] shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Quorum Durability (W=2)</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-slate-900/90 text-slate-300 border border-white/[0.08] shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Bit-Rot Auto-Healing</span>
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-400 text-xs flex items-center justify-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
