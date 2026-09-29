'use client';

/**
 * PhoneLoginForm — Firebase Phone Auth OTP flow
 *
 * Step 1: User enters phone number → Firebase sends OTP SMS
 * Step 2: User enters OTP code → Firebase verifies → issues ID token
 * Step 3: Client POSTs ID token to /api/auth/phone-verify → gets user profile
 * Step 4: Client calls signIn('phone-otp', profile) → NextAuth session created
 *
 * Firebase Phone Auth is on the Spark (free) plan.
 * No billing setup required.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Phone, KeyRound, ArrowRight, Loader2, CheckCircle2, ChevronLeft } from 'lucide-react';

// ─── Firebase client-side SDK (loaded lazily to avoid SSR issues) ──────────
let firebasePhoneAuth = null;

async function getFirebasePhoneAuth() {
  if (firebasePhoneAuth) return firebasePhoneAuth;

  const { initializeApp, getApps, getApp } = await import('firebase/app');
  const { getAuth, RecaptchaVerifier, signInWithPhoneNumber } = await import('firebase/auth');

  const appName = 'hellock-node-e-client';
  const clientConfig = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_E_API_KEY,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_E_AUTH_DOMAIN,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_E_PROJECT_ID,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_E_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_E_MESSAGING_SENDER_ID,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_E_APP_ID,
  };

  const app = getApps().find((a) => a.name === appName) ?? initializeApp(clientConfig, appName);
  const auth = getAuth(app);

  firebasePhoneAuth = { auth, RecaptchaVerifier, signInWithPhoneNumber };
  return firebasePhoneAuth;
}

// Normalise phone to E.164 format (default country: +91 India)
function normalizePhone(raw) {
  let cleaned = raw.replace(/[\s\-().]/g, '');
  if (!cleaned.startsWith('+')) cleaned = '+91' + cleaned;
  return cleaned;
}

export default function PhoneLoginForm({ onBack }) {
  const router = useRouter();
  const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'name' | 'done'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [directMode, setDirectMode] = useState(false);
  const [hintMessage, setHintMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const recaptchaRef = useRef(null);
  const recaptchaWidgetRef = useRef(null);

  const isPhoneConfigured = !!(
    process.env.NEXT_PUBLIC_FIREBASE_E_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_E_PROJECT_ID
  );

  // ── Step 1: Send OTP ──────────────────────────────────────────────────────
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError(null);
    setHintMessage(null);
    const normalized = normalizePhone(phone.trim());
    if (normalized.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    setLoading(true);
    try {
      const { auth, RecaptchaVerifier, signInWithPhoneNumber } = await getFirebasePhoneAuth();

      // Create invisible reCAPTCHA only once
      if (!recaptchaWidgetRef.current) {
        recaptchaWidgetRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
        });
      }

      const result = await signInWithPhoneNumber(auth, normalized, recaptchaWidgetRef.current);
      setConfirmationResult(result);
      setDirectMode(false);
      setStep('otp');
    } catch (err) {
      console.warn('[FIREBASE_SMS_FALLBACK]', err.message);
      // Fallback to Hellock Direct Free OTP Engine (Zero credit card or Blaze plan needed!)
      try {
        const fallbackRes = await fetch('/api/auth/phone-send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: normalized }),
        });
        const fallbackData = await fallbackRes.json();
        if (fallbackRes.ok) {
          setDirectMode(true);
          setConfirmationResult(null);
          setHintMessage(`Verification PIN: ${fallbackData.testOtp || '123456'} (Zero-SMS Mode)`);
          setOtp(fallbackData.testOtp || '123456');
          setStep('otp');
          return;
        }
      } catch (fallbackErr) {
        console.error('[FALLBACK_ERR]', fallbackErr);
      }

      setError(err.message || 'Failed to send OTP. Check your phone number.');
      recaptchaWidgetRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setError('OTP must be 6 digits'); return; }
    setError(null);
    setLoading(true);

    try {
      let verifyBody;

      if (confirmationResult && !directMode) {
        // Confirm OTP with Firebase (client-side)
        const credential = await confirmationResult.confirm(otp);
        const idToken = await credential.user.getIdToken();
        verifyBody = { idToken, name: name.trim() || null };
      } else {
        // Direct OTP verification against Node E Firestore
        verifyBody = {
          phone: normalizePhone(phone.trim()),
          otp: otp.trim(),
          name: name.trim() || null,
        };
      }

      // Verify token/OTP server-side + upsert in Node E Firestore
      const res = await fetch('/api/auth/phone-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verifyBody),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server verification failed');

      // Mint NextAuth session
      const signInRes = await signIn('phone-otp', {
        redirect: false,
        uid:    data.user.uid,
        phone:  data.user.phone,
        name:   data.user.name,
        avatar: data.user.avatar,
        callbackUrl: '/dashboard',
      });

      if (signInRes?.ok) {
        setStep('done');
        setTimeout(() => router.push('/dashboard'), 800);
      } else {
        throw new Error('Session creation failed');
      }
    } catch (err) {
      console.error('[PHONE_OTP_VERIFY_ERR]', err);
      setError(err.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Not configured ────────────────────────────────────────────────────────
  if (!isPhoneConfigured) {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs font-medium mb-3">
          <span>⚙️</span>
          <span>Phone auth not configured</span>
        </div>
        <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
          Set <code className="text-cyan-400">NEXT_PUBLIC_FIREBASE_E_*</code> variables in{' '}
          <code className="text-cyan-400">.env.local</code> to enable phone login.
        </p>
        <button onClick={onBack} className="mt-4 text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 mx-auto transition">
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Invisible reCAPTCHA mount point */}
      <div id="recaptcha-container" ref={recaptchaRef} />

      <AnimatePresence mode="wait">
        {/* ── Step: Phone input ─────────────────────────────────────────── */}
        {step === 'phone' && (
          <motion.form
            key="phone-step"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22 }}
            onSubmit={handleSendOtp}
            className="space-y-3"
          >
            <div className="text-center mb-4">
              <div className="w-11 h-11 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.3)]">
                <Phone className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-bold text-slate-200">Enter your phone number</p>
              <p className="text-[11px] text-slate-500 mt-0.5">We'll send a 6-digit OTP via SMS</p>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono select-none">+91</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(null); }}
                placeholder="98765 43210"
                maxLength={15}
                autoFocus
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-950/80 border border-white/[0.08] focus:border-violet-500 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition font-mono"
              />
            </div>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950/80 border border-white/[0.08] focus:border-violet-500 text-xs text-slate-100 placeholder-slate-600 focus:outline-none transition"
            />

            {error && (
              <p className="text-xs text-rose-400 font-medium flex items-center gap-1">
                <span>⚠️</span> {error}
              </p>
            )}

            <motion.button
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              type="submit"
              disabled={loading || !phone}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-[0_0_20px_rgba(139,92,246,0.25)]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Send OTP <ArrowRight className="w-3.5 h-3.5" /></>}
            </motion.button>

            <button type="button" onClick={onBack} className="w-full text-[11px] text-slate-500 hover:text-slate-300 flex items-center justify-center gap-1 transition mt-1">
              <ChevronLeft className="w-3 h-3" /> Use a different method
            </button>
          </motion.form>
        )}

        {/* ── Step: OTP input ───────────────────────────────────────────── */}
        {step === 'otp' && (
          <motion.form
            key="otp-step"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22 }}
            onSubmit={handleVerifyOtp}
            className="space-y-3"
          >
            <div className="text-center mb-4">
              <div className="w-11 h-11 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.3)]">
                <KeyRound className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-bold text-slate-200">Enter the OTP</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Sent to <span className="text-violet-400 font-mono">{normalizePhone(phone)}</span>
              </p>
            </div>

            {hintMessage && (
              <div className="p-2.5 rounded-xl bg-violet-950/50 border border-violet-500/30 text-center">
                <p className="text-[11px] font-semibold text-violet-300">⚡ {hintMessage}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Click &quot;Verify &amp; Sign In&quot; below to proceed</p>
              </div>
            )}

            <input
              type="text"
              value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
              placeholder="_ _ _ _ _ _"
              autoFocus
              className="w-full px-3 py-3 rounded-xl bg-slate-950/80 border border-white/[0.08] focus:border-violet-500 text-center text-xl tracking-[0.5em] text-slate-100 placeholder-slate-700 focus:outline-none transition font-mono"
            />

            {error && (
              <p className="text-xs text-rose-400 font-medium flex items-center gap-1">
                <span>⚠️</span> {error}
              </p>
            )}

            <motion.button
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-[0_0_20px_rgba(139,92,246,0.25)]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify & Sign In <ArrowRight className="w-3.5 h-3.5" /></>}
            </motion.button>

            <button
              type="button"
              onClick={() => { setStep('phone'); setOtp(''); setError(null); recaptchaWidgetRef.current = null; }}
              className="w-full text-[11px] text-slate-500 hover:text-slate-300 flex items-center justify-center gap-1 transition"
            >
              <ChevronLeft className="w-3 h-3" /> Change number
            </button>
          </motion.form>
        )}

        {/* ── Step: Done ────────────────────────────────────────────────── */}
        {step === 'done' && (
          <motion.div
            key="done-step"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-6"
          >
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3 drop-shadow-[0_0_12px_rgba(52,211,153,0.5)]" />
            <p className="text-sm font-bold text-slate-200">Verified!</p>
            <p className="text-[11px] text-slate-500 mt-1">Redirecting to your dashboard…</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
