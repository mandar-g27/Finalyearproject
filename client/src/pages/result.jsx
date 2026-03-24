/**
 * result.jsx — AccessResult screen (Access Granted / Denied)
 * Extracted here to avoid the circular import in auth.jsx.
 */
import { useEffect, useRef, useState } from "react";

const speak = (text) => {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
};

function getDeniedReason(failedStep) {
  switch (failedStep) {
    case "face":
      return {
        desc: "Face recognition failed — your face could not be identified in our database.",
        speech: "Access denied. Face recognition failed. Your face could not be identified.",
      };
    case "voice":
      return {
        desc: "Voice authentication failed — your passphrase did not match any registered user.",
        speech: "Access denied. Voice authentication failed. Your passphrase did not match.",
      };
    case "fingerprint":
      return {
        desc: "Fingerprint rejected — the scanned fingerprint does not match the verified identity.",
        speech: "Access denied. Fingerprint rejected. Identity mismatch on the sensor.",
      };
    default:
      return {
        desc: "Biometric verification could not be completed. Please contact your administrator.",
        speech: "Access denied. Biometric verification failed.",
      };
  }
}

function getStepStatuses(granted, failedStep) {
  if (granted) return { face: "pass", voice: "pass", fingerprint: "pass" };
  switch (failedStep) {
    case "face":        return { face: "fail", voice: "skip", fingerprint: "skip" };
    case "voice":       return { face: "pass", voice: "fail", fingerprint: "skip" };
    case "fingerprint": return { face: "pass", voice: "pass", fingerprint: "fail" };
    default:            return { face: "skip", voice: "skip", fingerprint: "fail" };
  }
}

export default function AccessResult({ granted, failedStep, sessionId, onReset }) {
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(false);

  const { desc, speech } = granted
    ? {
        desc: "All three biometric layers passed. Identity confirmed and session authorized.",
        speech: "Access granted. Welcome. All three biometric checks passed successfully.",
      }
    : getDeniedReason(failedStep);

  const statuses = getStepStatuses(granted, failedStep);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
    speak(speech);
  }, [speech]);

  // Particle burst
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;
    const ctx = canvas.getContext("2d");
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const color = granted ? "#00ff96" : "#ff4060";
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const particles = Array.from({ length: 60 }, (_, i) => {
      const angle = (i / 60) * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      return { x: cx, y: cy, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed,
               r: Math.random() * 2.5 + 0.5, life: 1, decay: Math.random() * 0.012 + 0.006 };
    });
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach((p) => {
        if (p.life <= 0) return;
        alive = true;
        p.life -= p.decay; p.x += p.dx; p.y += p.dy; p.dy += 0.04;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = color + Math.floor(p.life * 255).toString(16).padStart(2, "0");
        ctx.fill();
      });
      if (alive) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [visible, granted]);

  const timestamp = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" });
  const steps = [
    { key: "face",        icon: "👁",  label: "Face Recognition" },
    { key: "voice",       icon: "🎙", label: "Voice Authentication" },
    { key: "fingerprint", icon: "👆", label: "Fingerprint Scan" },
  ];

  return (
    <div className={`result-screen ${granted ? "granted" : "denied"} ${visible ? "visible" : ""}`}>
      <canvas ref={canvasRef} className="result-canvas" />
      <div className="result-content">
        <div className={`result-icon-wrap ${granted ? "granted" : "denied"}`}>
          <div className="icon-ring outer" />
          <div className="icon-ring inner" />
          <div className="icon-core">
            {granted ? (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#00ff96" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ff4060" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
          </div>
        </div>
        <div className="result-label">{granted ? "ACCESS GRANTED" : "ACCESS DENIED"}</div>
        <h1 className="result-title">{granted ? "Welcome Back" : "Verification Failed"}</h1>
        <p className="result-desc">{desc}</p>
        <div className="result-stats">
          {steps.map(({ key, icon, label }) => {
            const s = statuses[key];
            return (
              <div className="stat-row" key={key}>
                <span className="stat-icon">{icon}</span>
                <span>{label}</span>
                <span className={`stat-status ${s}`}>
                  {s === "pass" ? "PASSED" : s === "fail" ? "FAILED" : "–"}
                </span>
              </div>
            );
          })}
        </div>
        <div className="result-meta">
          {sessionId && <span>Session: #{String(sessionId).slice(0, 10).toUpperCase()}</span>}
          <span>{timestamp}</span>
        </div>
        <button className="retry-btn" onClick={onReset}>
          {granted ? "Sign Out" : "Try Again"}
        </button>
      </div>
      <style>{`
        .result-screen {
          width:100vw; height:100vh; background:#030712;
          display:flex; align-items:center; justify-content:center;
          font-family:'DM Sans',sans-serif;
          position:relative; overflow:hidden;
          opacity:0; transition:opacity 0.5s;
        }
        .result-screen.visible { opacity:1; }
        .result-screen.granted::before {
          content:''; position:absolute; inset:0;
          background:radial-gradient(circle at 50% 40%, rgba(0,255,150,0.05) 0%, transparent 60%);
        }
        .result-screen.denied::before {
          content:''; position:absolute; inset:0;
          background:radial-gradient(circle at 50% 40%, rgba(255,64,96,0.05) 0%, transparent 60%);
        }
        .result-canvas { position:absolute; inset:0; pointer-events:none; z-index:1; }
        .result-content {
          position:relative; z-index:2;
          display:flex; flex-direction:column; align-items:center; gap:20px;
          text-align:center; padding:40px 24px; max-width:480px;
          animation:slideUp 0.6s cubic-bezier(0.34,1.2,0.64,1) 0.2s both;
        }
        @keyframes slideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:none} }
        .result-icon-wrap { position:relative; width:140px; height:140px; display:flex; align-items:center; justify-content:center; }
        .icon-ring { position:absolute; border-radius:50%; }
        .icon-ring.outer { width:140px; height:140px; border:1px solid; animation:ringExpand 0.6s ease 0.4s both; }
        .icon-ring.inner { width:110px; height:110px; border:1.5px solid; animation:ringExpand 0.6s ease 0.6s both; }
        .granted .icon-ring { border-color:rgba(0,255,150,0.3); }
        .denied  .icon-ring { border-color:rgba(255,64,96,0.3); }
        @keyframes ringExpand { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }
        .icon-core {
          width:80px; height:80px; border-radius:50%;
          background:rgba(10,16,28,0.9); border:1.5px solid;
          display:flex; align-items:center; justify-content:center;
          animation:popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.3s both;
        }
        .granted .icon-core { border-color:rgba(0,255,150,0.6); box-shadow:0 0 40px rgba(0,255,150,0.2); }
        .denied  .icon-core { border-color:rgba(255,64,96,0.6);  box-shadow:0 0 40px rgba(255,64,96,0.2); }
        @keyframes popIn { from{transform:scale(0.3);opacity:0} to{transform:scale(1);opacity:1} }
        .result-label {
          font-size:11px; font-weight:800; letter-spacing:3.5px;
          padding:5px 16px; border-radius:20px; border:1px solid;
        }
        .granted .result-label { color:#00ff96; border-color:rgba(0,255,150,0.3); background:rgba(0,255,150,0.05); }
        .denied  .result-label { color:#ff4060; border-color:rgba(255,64,96,0.3);  background:rgba(255,64,96,0.05); }
        .result-title {
          font-family:'Syne',sans-serif;
          font-size:clamp(32px,6vw,52px); font-weight:800;
          margin:0; letter-spacing:-1.5px; color:#f0f6ff;
        }
        .result-desc { font-size:14px; color:rgba(180,200,220,0.6); line-height:1.6; margin:0; max-width:380px; }
        .result-stats {
          width:100%; max-width:360px;
          display:flex; flex-direction:column; gap:8px;
          background:rgba(255,255,255,0.02);
          border:1px solid rgba(255,255,255,0.06);
          border-radius:14px; padding:16px;
        }
        .stat-row { display:flex; align-items:center; gap:10px; font-size:13px; color:rgba(180,200,220,0.7); }
        .stat-row span:nth-child(2) { flex:1; text-align:left; }
        .stat-icon { font-size:15px; }
        .stat-status { font-size:10px; font-weight:800; letter-spacing:1.5px; padding:3px 10px; border-radius:8px; }
        .stat-status.pass { color:#00ff96; background:rgba(0,255,150,0.08); border:1px solid rgba(0,255,150,0.2); }
        .stat-status.fail { color:#ff4060; background:rgba(255,64,96,0.08);  border:1px solid rgba(255,64,96,0.2); }
        .stat-status.skip { color:rgba(150,170,190,0.4); background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); }
        .result-meta { display:flex; gap:20px; flex-wrap:wrap; justify-content:center; font-size:11px; color:rgba(150,170,190,0.35); }
        .retry-btn {
          padding:13px 36px; border-radius:12px;
          border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04);
          color:rgba(196,212,232,0.7); font-size:14px; font-weight:600;
          font-family:'DM Sans',sans-serif; cursor:pointer; transition:all 0.2s;
        }
        .retry-btn:hover { background:rgba(255,255,255,0.08); color:#c4d4e8; transform:translateY(-1px); }
      `}</style>
    </div>
  );
}
