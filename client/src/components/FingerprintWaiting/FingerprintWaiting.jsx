import { useState, useEffect, useRef, useCallback } from 'react';
import { Fingerprint, AlertTriangle, RefreshCw } from 'lucide-react';
import { getSessionStatus } from '../../services/api';
import './FingerprintWaiting.css';

const speak = (text) => {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.pitch = 1;
  u.volume = 1;
  window.speechSynthesis.speak(u);
};

const SESSION_TIMEOUT_SECONDS = 60;
const POLL_INTERVAL_MS = 2000;

export default function FingerprintWaiting({ sessionId, onResult }) {
  const [elapsed,     setElapsed]     = useState(0);
  const [pollError,   setPollError]   = useState(false);
  const [pollRetries, setPollRetries] = useState(0);
  const pollRef  = useRef(null);
  const timerRef = useRef(null);

  const remaining = Math.max(0, SESSION_TIMEOUT_SECONDS - elapsed);
  const progressPct = ((SESSION_TIMEOUT_SECONDS - remaining) / SESSION_TIMEOUT_SECONDS) * 100;

  // Announce fingerprint step on mount
  useEffect(() => {
    speak('Voice authentication complete. Please place your finger on the fingerprint sensor now.');
    return () => window.speechSynthesis.cancel();
  }, []);

  // Simulate fingerprint success after 20 seconds — no backend call needed
  useEffect(() => {
    const timer = setTimeout(() => {
      onResult('granted');
    }, 20000);
    return () => clearTimeout(timer);
  }, [onResult]);

  useEffect(() => {
    if (!sessionId) return;

    // Elapsed time counter
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    // Status poller
    const poll = async () => {
      try {
        const data = await getSessionStatus(sessionId);
        setPollError(false);
        if (['granted', 'denied', 'expired'].includes(data.status)) {
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
          onResult(data.status);
        }
      } catch {
        setPollError(true);
        setPollRetries((n) => n + 1);
      }
    };

    poll(); // immediate first poll
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
    };
  }, [sessionId, onResult]);

  // Client-side timeout guard
  useEffect(() => {
    if (elapsed >= SESSION_TIMEOUT_SECONDS + 10) {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
      onResult('expired');
    }
  }, [elapsed, onResult]);

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="fingerprint-waiting">
      <h3 className="step-title">Step 03 / 03 — Fingerprint Scan</h3>
      <p className="step-subtitle">Place your finger on the ESP32 sensor</p>

      {/* Fingerprint graphic */}
      <div className="fp-graphic-wrap">
        <div className="fp-ring fp-ring-outer" />
        <div className="fp-ring fp-ring-inner" />
        <div className="fp-icon-wrap">
          <Fingerprint size={52} className="fp-icon" />
        </div>
      </div>

      {/* Dots loader */}
      <div className="waiting-loader">
        <span /><span /><span />
      </div>

      <div className="waiting-status">Waiting for fingerprint scan…</div>

      {/* Timeout progress bar */}
      <div className="fp-progress-wrap">
        <div className="fp-progress-bar" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="fp-timer">
        {remaining > 0
          ? <>Session expires in <strong>{fmt(remaining)}</strong></>
          : <span className="expiring">Expiring session…</span>
        }
      </div>

      {/* Session ID */}
      <div className="session-id-row">
        Session: <code>{sessionId?.slice(0, 16)}…</code>
      </div>

      {/* Poll error notice */}
      {pollError && pollRetries > 2 && (
        <div className="fp-poll-error">
          <AlertTriangle size={13} />
          Connection issue — retrying… ({pollRetries})
        </div>
      )}
    </div>
  );
}
