'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Shield, UserX, Check, AlertCircle, Mail, Globe, Lock, Link, Copy, Phone, Loader2 } from 'lucide-react';
import { useToast } from './ToastProvider';

export default function ShareModal({ file, isOpen, onClose, onUpdate }) {
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [publicLoading, setPublicLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [phonePreview, setPhonePreview] = useState(null); // { name, avatar } | null | 'not-found'
  const [phoneCheckLoading, setPhoneCheckLoading] = useState(false);
  const toast = useToast();

  if (!isOpen || !file) return null;

  const isPublic = Boolean(file.isPublic);

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isValidPhone = (v) => /^[+]?[0-9]{10,15}$/.test(v.replace(/[\s\-().]/g, ''));

  const normalizePhone = (raw) => {
    let cleaned = raw.replace(/[\s\-().]/g, '');
    if (!cleaned.startsWith('+')) cleaned = '+91' + cleaned;
    return cleaned;
  };

  const isPhone = isValidPhone(inputVal);
  const isEmail = isValidEmail(inputVal);
  const identifier = isPhone ? normalizePhone(inputVal) : inputVal.trim().toLowerCase();

  // Look up phone number in Node E Firestore when input looks like a phone
  const handleInputChange = async (val) => {
    setInputVal(val);
    setErrorMsg(null);
    setPhonePreview(null);

    const cleanVal = val.replace(/[\s\-().]/g, '');
    // Check if it looks like a complete phone number (10+ digits)
    if (/^[+]?[0-9]{10,15}$/.test(cleanVal)) {
      setPhoneCheckLoading(true);
      try {
        const normalized = cleanVal.startsWith('+') ? cleanVal : '+91' + cleanVal;
        const res = await fetch(`/api/auth/phone-lookup?phone=${encodeURIComponent(normalized)}`);
        const data = await res.json();
        setPhonePreview(data.found ? data.user : 'not-found');
      } catch {
        setPhonePreview(null);
      } finally {
        setPhoneCheckLoading(false);
      }
    }
  };

  const handleGrant = async (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    if (!isEmail && !isPhone) {
      setErrorMsg('Enter a valid email address or phone number (10 digits)');
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
          targetEmail: identifier,
          action: 'grant',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to share file');

      toast?.success(`Access granted to ${identifier}`, 'File Shared');
      setInputVal('');
      setPhonePreview(null);
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

  const handleTogglePublic = async (newPublicVal) => {
    try {
      setPublicLoading(true);
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: file.fileId,
          action: 'setPublic',
          isPublic: newPublicVal,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to change link access');
      }

      if (newPublicVal) {
        toast?.success('Anyone with the link can now view this file', 'Public Link Active');
      } else {
        toast?.info('File access restricted to specified Google accounts', 'Restricted Mode');
      }

      if (onUpdate) onUpdate();
    } catch (err) {
      toast?.error(err.message, 'Link Setting Failed');
    } finally {
      setPublicLoading(false);
    }
  };

  const handleCopyLink = () => {
    const downloadUrl = `${window.location.origin}/api/download/${file.fileId}`;
    navigator.clipboard.writeText(downloadUrl);
    setCopied(true);
    toast?.success('Direct link copied to clipboard', 'Link Copied');
    setTimeout(() => setCopied(false), 2200);
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
          className="relative z-10 w-full max-w-lg rounded-3xl vault-panel shadow-2xl p-6 sm:p-7 overflow-hidden border border-white/[0.1]"
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
                Manage Google account permissions or share with a public link
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Share Input Form */}
          <form onSubmit={handleGrant} className="mb-5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                {isPhone
                  ? <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400" />
                  : <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />}
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="Email or phone number (+91…)"
                  className={`w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950/80 border text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition ${
                    errorMsg
                      ? 'border-rose-500/60 focus:border-rose-400'
                      : isPhone
                        ? 'border-violet-500/40 focus:border-violet-400'
                        : 'border-white/[0.08] focus:border-cyan-500'
                  }`}
                />
                {phoneCheckLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 animate-spin" />
                )}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading || !inputVal || (!isEmail && !isPhone)}
                className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition disabled:opacity-50 shadow-[0_0_15px_rgba(6,182,212,0.3)] whitespace-nowrap"
              >
                {loading ? 'Adding...' : 'Add'}
              </motion.button>
            </div>

            {/* Phone user preview */}
            {isPhone && phonePreview && phonePreview !== 'not-found' && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-950/40 border border-violet-500/30"
              >
                <img src={phonePreview.avatar} alt="" className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-violet-200">{phonePreview.name}</div>
                  <div className="text-[10px] text-violet-400">Hellock Phone User ✓</div>
                </div>
              </motion.div>
            )}
            {isPhone && phonePreview === 'not-found' && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-[11px] text-amber-400 flex items-center gap-1.5 font-medium"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>No Hellock account found for this number — they&apos;ll need to sign up first.</span>
              </motion.div>
            )}

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
          <div className="mb-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              People with access ({authorizedList.length + 1})
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
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
              {authorizedList.map((identifier) => {
                const isPhoneNum = /^\+?[0-9]{10,15}$/.test(identifier.replace(/[\s\-().]/g, ''));
                return (
                <motion.div
                  key={identifier}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-white/[0.04] hover:border-white/[0.08] transition group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(identifier)}`}
                      alt="avatar"
                      className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">{identifier}</div>
                      <div className="text-[10px] text-slate-500">{isPhoneNum ? '📱 Phone User' : 'Email Account'}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRevoke(identifier)}
                    title="Revoke access"
                    className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition opacity-80 group-hover:opacity-100 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
                );
              })}
            </div>
          </div>

          {/* Google Drive-Style General Access Section */}
          <div className="pt-4 border-t border-white/[0.08]">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              General access
            </div>

            <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/[0.06] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                    isPublic
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                      : 'bg-slate-800 text-slate-400 border-white/[0.06]'
                  }`}
                >
                  {isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <select
                      value={isPublic ? 'public' : 'restricted'}
                      disabled={publicLoading}
                      onChange={(e) => handleTogglePublic(e.target.value === 'public')}
                      className="bg-slate-900 border border-white/[0.1] text-xs font-semibold text-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="restricted">Restricted</option>
                      <option value="public">Anyone with the link</option>
                    </select>
                    {publicLoading && (
                      <span className="text-[10px] text-slate-500 animate-pulse">Updating...</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 truncate">
                    {isPublic
                      ? 'Anyone on the internet with this link can view & download'
                      : 'Only people added above can access with this link'}
                  </div>
                </div>
              </div>

              {/* Copy Link Button */}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition shrink-0 ${
                  copied
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                    : 'bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 border-cyan-500/30 hover:border-cyan-500/60'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Link className="w-3.5 h-3.5" />
                    <span>Copy link</span>
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
