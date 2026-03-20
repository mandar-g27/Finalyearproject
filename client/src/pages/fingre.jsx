import { useEffect, useRef, useState, useCallback } from "react";
import { API_BASE_URL } from "../services/config";

const speak = (text, onEnd) => {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
};

const SESSION_TIMEOUT = 60;
const POLL_INTERVAL = 2000;

export default function FingerprintWait({ sessionId, onResult }) {
  const canvasRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const [pollError, setPollError] = useState(false);
  const [retries, setRetries] = useState(0);
  const [dots, setDots] = useState(0);
  const tickRef = useRef(0);
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const remaining = Math.max(0, SESSION_TIMEOUT - elapsed);
  const progressPct = ((SESSION_TIMEOUT - remaining) / SESSION_TIMEOUT) * 100;

  useEffect(() => {
    const i = setInterval(() => setDots((d) => (d + 1) % 4), 400);
    return () => clearInterval(i);
  }, []);

  const handleResult = useCallback((status) => {
    clearInterval(pollRef.current);
    clearInterval(timerRef.current);
    onResult(status);
  }, [onResult]);

  useEffect(() => {
    if (!sessionId) return;
    speak("Excellent! Now please place your finger on the fingerprint sensor to complete authentication.");

    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/session-status/${sessionId}`);
        const data = await res.json();
        setPollError(false);
        if (["granted", "denied", "expired"].includes(data.status)) {
          handleResult(data.status);
        }
      } catch {
        setPollError(true);
        setRetries((n) => n + 1);
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
    };
  }, [sessionId, handleResult]);

  // Client-side timeout guard
  useEffect(() => {
    if (elapsed >= SESSION_TIMEOUT + 5) {
      handleResult("expired");
    }
  }, [elapsed, handleResult]);

  // Canvas fingerprint animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;

    const draw = () => {
      tickRef.current++;
      const tick = tickRef.current;
      const w = (canvas.width = canvas.offsetWidth);
      const h = (canvas.height = canvas.offsetHeight);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;

      // Outer pulsing ring
      ctx.beginPath();
      ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,212,255,${0.2 + 0.15 * Math.sin(tick * 0.05)})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -tick * 0.8;
      ctx.stroke();
      ctx.setLineDash([]);

      // Clip to circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();

      // Fingerprint ridges (idle glow animation)
      const lines = 18;
      for (let i = 0; i < lines; i++) {
        const t = i / lines;
        const radius = r * (0.15 + t * 0.85);
        const warp = Math.sin(t * Math.PI * 3) * 8;
        const pulse = 0.08 + 0.06 * Math.sin(tick * 0.04 + i * 0.5);
        ctx.beginPath();
        ctx.ellipse(cx + warp * 0.3, cy, radius, radius * 0.7, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,212,255,${pulse})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Slow sweep
      const sweepY = cy - r + ((tick * 1.5) % (r * 2));
      const sweepGrad = ctx.createLinearGradient(cx - r, sweepY, cx + r, sweepY);
      sweepGrad.addColorStop(0, "rgba(0,212,255,0)");
      sweepGrad.addColorStop(0.5, "rgba(0,212,255,0.3)");
      sweepGrad.addColorStop(1, "rgba(0,212,255,0)");
      ctx.beginPath();
      ctx.moveTo(cx - r, sweepY);
      ctx.lineTo(cx + r, sweepY);
      ctx.strokeStyle = sweepGrad;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="fp-wait-screen">
      <div className="fp-wait-header">
        <div className="step-indicators">
          {["Face", "Voice", "Fingerprint"].map((s, i) => (
            <div key={i} className={`step-dot ${i === 2 ? "active" : "done"}`}>
              <div className="dot" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="fp-wait-scanner">
        <canvas ref={canvasRef} className="fp-wait-canvas" />
        <div className="fp-wait-icon">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round">
            <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z" />
            <path d="M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
          </svg>
        </div>
        <div className="fp-wait-loader">
          <span /><span /><span />
        </div>
      </div>

      <div className="fp-wait-info">
        <div className="fp-wait-title">Place finger on sensor</div>
        <div className="fp-wait-sub">Waiting for ESP32 fingerprint scan{".".repeat(dots)}</div>
      </div>

      {pollError && retries > 2 && (
        <div className="fp-poll-error">
          ⚠ Connection issue — retrying… ({retries})
        </div>
      )}

      <div className="fp-timeout-wrap">
        <div className="fp-timeout-bar-bg">
          <div className="fp-timeout-bar" style={{ width: `${100 - progressPct}%` }} />
        </div>
        <div className="fp-timer">
          {remaining > 0
            ? <>Session expires in <strong>{fmt(remaining)}</strong></>
            : <span style={{ color: "#ff4060" }}>Session expiring…</span>
          }
        </div>
      </div>

      <div className="fp-session-id">
        Session: <code>{sessionId?.slice(0, 14)}…</code>
      </div>

      <style>{`
        .fp-wait-screen {
          width: 100vw; height: 100vh;
          background: #030712;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 24px;
          font-family: 'DM Sans', sans-serif;
          position: relative; overflow: hidden;
        }
        .fp-wait-screen::before {
          content: '';
          position: absolute; bottom: -200px; left: 50%;
          transform: translateX(-50%);
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(0,212,255,0.05) 0%, transparent 70%);
          pointer-events: none;
        }
        .fp-wait-header { position: absolute; top: 32px; }
        .step-indicators { display: flex; align-items: center; gap: 32px; }
        .step-dot { display: flex; flex-direction: column; align-items: center; gap: 5px; opacity: 0.3; transition: opacity 0.3s; }
        .step-dot.active { opacity: 1; }
        .step-dot.done { opacity: 0.6; }
        .step-dot .dot { width: 8px; height: 8px; border-radius: 50%; background: #00d4ff; box-shadow: 0 0 10px #00d4ff; }
        .step-dot.active .dot { animation: pulse 1.5s ease-in-out infinite; }
        .step-dot.done .dot { background: #00ff96; box-shadow: 0 0 8px #00ff96; }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.5)} }
        .step-dot span { font-size: 10px; font-weight: 600; letter-spacing: 1.5px; color: #c4d4e8; text-transform: uppercase; }
        .fp-wait-scanner {
          position: relative;
          width: min(240px, 70vw); height: min(240px, 70vw);
          border-radius: 50%;
          background: rgba(8,14,26,0.9);
          border: 1px solid rgba(0,212,255,0.12);
          display: flex; align-items: center; justify-content: center;
          flex-direction: column; gap: 12px;
          box-shadow: 0 0 60px rgba(0,212,255,0.06);
        }
        .fp-wait-canvas { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%; }
        .fp-wait-icon { position: relative; z-index: 2; opacity: 0.6; animation: iconPulse 2s ease-in-out infinite; }
        @keyframes iconPulse { 0%,100%{opacity:0.5} 50%{opacity: 0.9} }
        .fp-wait-loader {
          display: flex; gap: 6px; position: relative; z-index: 2;
        }
        .fp-wait-loader span {
          width: 6px; height: 6px; border-radius: 50%;
          background: #00d4ff;
          animation: dotBounce 1.2s ease-in-out infinite;
        }
        .fp-wait-loader span:nth-child(2) { animation-delay: 0.2s; }
        .fp-wait-loader span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dotBounce { 0%,100%{opacity:0.2;transform:scale(0.6)} 50%{opacity:1;transform:scale(1)} }
        .fp-wait-info { text-align: center; }
        .fp-wait-title { font-size: 20px; font-weight: 700; color: #c4d4e8; letter-spacing: -0.3px; }
        .fp-wait-sub { font-size: 13px; color: rgba(196,212,232,0.45); margin-top: 6px; }
        .fp-poll-error {
          font-size: 12px; color: #ff9060;
          background: rgba(255,100,60,0.08);
          border: 1px solid rgba(255,100,60,0.2);
          border-radius: 8px; padding: 8px 16px;
        }
        .fp-timeout-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; width: min(300px, 80vw); }
        .fp-timeout-bar-bg { width: 100%; height: 3px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; }
        .fp-timeout-bar { height: 100%; background: linear-gradient(90deg, #00d4ff, #7b2fff); border-radius: 3px; transition: width 1s linear; }
        .fp-timer { font-size: 12px; color: rgba(150,170,190,0.4); }
        .fp-timer strong { color: rgba(150,170,190,0.7); }
        .fp-session-id { font-size: 11px; color: rgba(120,140,160,0.3); }
        .fp-session-id code { font-family: monospace; letter-spacing: 0.5px; }
      `}</style>
    </div>
  );
}