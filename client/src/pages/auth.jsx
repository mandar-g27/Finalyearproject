import { useState, useCallback } from "react";
import FaceScan from "./facescan";
import VoiceAuth from "./voicescan";
import FingerprintWait from "./fingre";
import AccessResult from "./result";          // ✅ was "./auth" (circular self-import)
import { verifyFace } from "../services/api";

// ── Verifying overlay ─────────────────────────────────────────────────────────
function VerifyingScreen({ step, error }) {
  return (
    <div className="verify-screen">
      <div className="verify-glow" />
      <div className="verify-spinner" />
      {error ? (
        <p className="verify-error">⚠ {error}</p>
      ) : (
        <p className="verify-msg">
          Verifying {step} with server…
        </p>
      )}
      <style>{`
        .verify-screen {
          width: 100vw; height: 100vh;
          background: #030712;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 24px;
          font-family: 'DM Sans', sans-serif;
          position: relative; overflow: hidden;
        }
        .verify-glow {
          position: absolute; top: -160px; left: 50%;
          transform: translateX(-50%);
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(0,212,255,0.07) 0%, transparent 70%);
          pointer-events: none;
        }
        .verify-spinner {
          width: 56px; height: 56px;
          border: 3px solid rgba(0,212,255,0.1);
          border-top-color: #00d4ff;
          border-right-color: rgba(123,47,255,0.6);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .verify-msg { font-size: 15px; color: rgba(196,212,232,0.5); }
        .verify-error { font-size: 14px; color: #ff4060; }
      `}</style>
    </div>
  );
}

// ── Landing Page ───────────────────────────────────────────────────────────────
function LandingPage({ onStart }) {
  return (
    <div className="landing-screen">
      <div className="landing-glow" />
      <div className="landing-content">
        <div className="landing-badge">BIOMETRIC ACCESS SYSTEM</div>
        <h1 className="landing-title">SecureGate<span className="landing-accent">MFA</span></h1>
        <p className="landing-desc">
          3-factor authentication: Face · Voice · Fingerprint.<br />
          Each factor is verified immediately — all three must match.
        </p>
        <div className="landing-steps">
          {[
            { icon: "👁", label: "Face Recognition", sub: "Step 1" },
            { icon: "🎙", label: "Voice Passphrase", sub: "Step 2" },
            { icon: "👆", label: "Fingerprint Scan", sub: "Step 3" },
          ].map((s, i) => (
            <div key={i} className="landing-step">
              <span className="ls-icon">{s.icon}</span>
              <span className="ls-sub">{s.sub}</span>
              <span className="ls-label">{s.label}</span>
            </div>
          ))}
        </div>
        <button id="start-auth-btn" className="landing-btn" onClick={onStart}>
          Begin Authentication
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <p className="landing-note">Ensure camera &amp; microphone access is allowed</p>
      </div>
      <style>{`
        .landing-screen {
          width: 100vw; height: 100vh;
          background: #030712;
          display: flex; align-items: center; justify-content: center;
          font-family: 'DM Sans', sans-serif;
          position: relative; overflow: hidden;
        }
        .landing-glow {
          position: absolute; top: -180px; left: 50%;
          transform: translateX(-50%);
          width: 700px; height: 700px;
          background: radial-gradient(circle, rgba(0,212,255,0.07) 0%, rgba(123,47,255,0.04) 40%, transparent 70%);
          pointer-events: none;
        }
        .landing-content {
          position: relative; z-index: 1;
          display: flex; flex-direction: column;
          align-items: center; gap: 22px;
          text-align: center; padding: 40px 24px;
          max-width: 520px;
          animation: fadeUp 0.7s cubic-bezier(0.34,1.2,0.64,1);
        }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:none} }
        .landing-badge {
          font-size: 10px; font-weight: 800; letter-spacing: 3px;
          color: rgba(0,212,255,0.7);
          border: 1px solid rgba(0,212,255,0.2);
          background: rgba(0,212,255,0.04);
          padding: 5px 16px; border-radius: 20px;
        }
        .landing-title {
          font-family: 'Syne', sans-serif;
          font-size: clamp(38px,8vw,64px);
          font-weight: 800; letter-spacing: -2px;
          color: #e8f0fe; margin: 0;
        }
        .landing-accent { color: #00d4ff; }
        .landing-desc {
          font-size: 14px; color: rgba(180,200,220,0.5);
          line-height: 1.7; margin: 0;
        }
        .landing-steps {
          display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;
          width: 100%;
        }
        .landing-step {
          flex: 1; min-width: 110px;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: 18px 12px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          transition: border-color 0.2s, background 0.2s;
        }
        .landing-step:hover { border-color: rgba(0,212,255,0.2); background: rgba(0,212,255,0.03); }
        .ls-icon { font-size: 22px; }
        .ls-sub { font-size: 10px; letter-spacing: 2px; font-weight: 700; color: rgba(0,212,255,0.5); text-transform: uppercase; }
        .ls-label { font-size: 12px; font-weight: 600; color: rgba(196,212,232,0.7); }
        .landing-btn {
          display: flex; align-items: center; gap: 10px;
          padding: 15px 36px;
          background: linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,47,255,0.15));
          border: 1px solid rgba(0,212,255,0.3);
          color: #c4d4e8; border-radius: 14px;
          font-size: 15px; font-weight: 700;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer; letter-spacing: 0.3px;
          transition: all 0.25s;
        }
        .landing-btn:hover {
          background: linear-gradient(135deg, rgba(0,212,255,0.25), rgba(123,47,255,0.25));
          border-color: rgba(0,212,255,0.5);
          color: #fff; transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0,212,255,0.12);
        }
        .landing-note { font-size: 11px; color: rgba(140,160,180,0.35); }
      `}</style>
    </div>
  );
}

// ── Main Orchestrator ──────────────────────────────────────────────────────────
export default function AuthApp() {
  // stages: landing | face | verifying-face | voice | fingerprint | result
  const [stage, setStage] = useState("landing");
  const [sessionId, setSessionId] = useState(null);
  const [authResult, setAuthResult] = useState(null);  // "granted" | "denied"
  const [failedStep, setFailedStep] = useState(null);  // "face" | "voice" | "fingerprint" | null
  const [verifyError, setVerifyError] = useState(null);

  // ── Step 1: Face captured → call /verify-face ──────────────────────────────
  const handleFaceDone = useCallback(async (imageBase64) => {
    setStage("verifying-face");
    setVerifyError(null);

    try {
      const clean = imageBase64?.includes(",") ? imageBase64.split(",")[1] : imageBase64;
      const data = await verifyFace(clean);

      if (data.status === "face_ok" && data.session_id) {
        setSessionId(data.session_id);
        setStage("voice");                    // ← go to voice with sessionId now set
      } else {
        setFailedStep("face");
        setAuthResult("denied");
        setStage("result");
      }
    } catch (err) {
      setVerifyError(err.message || "Server error. Retrying…");
      setTimeout(() => {
        setStage("landing");
        setVerifyError(null);
      }, 3000);
    }
  }, []);

  // ── Step 2: Voice done — VoiceAuth calls backend itself, reports pass/fail ──
  // CHANGED: removed dummy timeout simulation; handles real pass/fail from component
  const handleVoiceDone = useCallback((_, errorReason) => {
    if (errorReason) {
      // Voice failed (wrong passphrase, mic denied, server error)
      setFailedStep("voice");
      setAuthResult("denied");
      setStage("result");
      return;
    }
    // Voice passed → go to fingerprint
    setStage("fingerprint");
  }, []);

  // ── Step 3: ESP32 fingerprint result ──────────────────────────────────────
  const handleFingerprintResult = useCallback((status) => {
    if (status === "granted") {
      setAuthResult("granted");
      setFailedStep(null);
    } else {
      setAuthResult("denied");
      setFailedStep("fingerprint");
    }
    setSessionId(null);
    setStage("result");
  }, []);

  const handleReset = useCallback(() => {
    setStage("landing");
    setSessionId(null);
    setAuthResult(null);
    setFailedStep(null);
    setVerifyError(null);
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #030712; }
      `}</style>

      {stage === "landing"        && <LandingPage onStart={() => setStage("face")} />}
      {stage === "face"           && <FaceScan onComplete={handleFaceDone} />}
      {stage === "verifying-face" && <VerifyingScreen step="face" error={verifyError} />}

      {/* CHANGED: sessionId passed down so VoiceAuth can call /verify-voice */}
      {stage === "voice"          && <VoiceAuth onComplete={handleVoiceDone} sessionId={sessionId} />}

      {stage === "fingerprint"    && (
        <FingerprintWait sessionId={sessionId} onResult={handleFingerprintResult} />
      )}
      {stage === "result"         && (
        <AccessResult
          granted={authResult === "granted"}
          failedStep={failedStep}
          sessionId={sessionId}
          onReset={handleReset}
        />
      )}
    </div>
  );
}