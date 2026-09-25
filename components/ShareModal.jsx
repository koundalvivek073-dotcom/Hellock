'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Shield, UserX, Check, AlertCircle, Mail } from 'lucide-react';
import { useToast } from './ToastProvider';

export default function ShareModal({ file, isOpen, onClose, onUpdate }) {
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const toast = useToast();

  if (!isOpen || !file) return null;

  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleGrant = async (e) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();

    if (!cleanEmail) return;

    if (!isValidEmail(cleanEmail)) {
      setErrorMsg('Please enter a valid Google email address');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: file.fileId,
          targetEmail: cleanEmail,
          action: 'grant',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to share file');
      }

      toast?.success(`Access granted to ${cleanEmail}`, 'File Shared');
      setEmailInput('');
      if (onUpdate) onUpdate();
    } catch (err) {
      setErrorMsg(err.message);
      toast?.error(err.message, 'Share Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (targetEmail) => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: file.fileId,
          targetEmail,
          action: 'revoke',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to revoke access');
      }

      toast?.info(`Revoked access for ${targetEmail}`, 'Access Revoked');
      if (onUpdate) onUpdate();
    } catch (err) {
      setErrorMsg(err.message);
      toast?.error(err.message, 'Revoke Failed');
    } finally {
      setLoading(false);
    }
  };

  const authorizedList = file.authorizedAccounts || [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop Blur */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#07080d]/80 backdrop-blur-md"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-md rounded-3xl vault-panel shadow-2xl p-6 sm:p-7 overflow-hidden border border-white/[0.1]"
        >
          {/* Top Edge Highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

          {/* Modal Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-cyan-400" />
                <span>Share &quot;{file.filename}&quot;</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Grant access to any collaborator with a Google account
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Share Input Form with Inline Validation */}
          <form onSubmit={handleGrant} className="mb-6">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="collaborator@gmail.com"
                  className={`w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950/80 border text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition ${
                    errorMsg
                      ? 'border-rose-500/60 focus:border-rose-400'
                      : 'border-white/[0.08] focus:border-cyan-500'
                  }`}
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading || !emailInput}
                className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition disabled:opacity-50 shadow-[0_0_15px_rgba(6,182,212,0.3)] whitespace-nowrap"
              >
                {loading ? 'Adding...' : 'Add'}
              </motion.button>
            </div>

            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-xs text-rose-400 flex items-center gap-1.5 font-medium"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </motion.div>
            )}
          </form>

          {/* Authorized Collaborators List */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
              People with access ({authorizedList.length + 1})
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {/* File Owner */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-white/[0.05]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
                    {file.owner?.[0]?.toUpperCase() || 'O'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-200 truncate">
                      {file.ownerName || file.owner}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{file.owner}</div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-800/80 text-slate-400 border border-white/[0.06] shrink-0">
                  Owner
                </span>
              </div>

              {/* Shared Collaborators */}
              {authorizedList.map((email) => (
                <motion.div
                  key={email}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-white/[0.04] hover:border-white/[0.08] transition group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`}
                      alt="avatar"
                      className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">{email}</div>
                      <div className="text-[10px] text-slate-500">Google Account</div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRevoke(email)}
                    title="Revoke access"
                    className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition opacity-80 group-hover:opacity-100 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
