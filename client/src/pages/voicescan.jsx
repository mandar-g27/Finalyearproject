import { useEffect, useRef, useState } from "react";

const speak = (text, onEnd) => {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.pitch = 1;
  u.volume = 1;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
};

/* ── WAV encoder (16-bit PCM) ─────────────────────────────────────── */
function encodeWav(buffer) {
  const ch  = buffer.numberOfChannels;
  const sr  = buffer.sampleRate;
  const pcm = buffer.getChannelData(0);
  const len = pcm.length;
  const view = new DataView(new ArrayBuffer(44 + len * 2));
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); view.setUint32(4, 36 + len * 2, true);
  ws(8, "WAVE"); ws(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, ch, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * ch * 2, true);
  view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true);
  ws(36, "data"); view.setUint32(40, len * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}

export default function VoiceAuth({ onComplete }) {
  const [phase, setPhase] = useState("intro"); // intro | listening | analyzing | done | error
  const [waveData, setWaveData] = useState(new Array(40).fill(2));
  const [statusMsg, setStatusMsg] = useState("Preparing voice authentication...");
  const [dots, setDots] = useState(0);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    const i = setInterval(() => setDots((d) => (d + 1) % 4), 400);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      speak(
        "Face scan complete. Now, please speak your voice passphrase clearly. The microphone is ready to listen.",
        () => {
          setPhase("listening");
          setStatusMsg("Listening for passphrase");
          startMic();
        }
      );
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Always succeeds after 4s — backend ignores audio content and always returns voice_ok
  const finishVoice = () => {
    setPhase("analyzing");
    setStatusMsg("Analyzing voice pattern");
    setTimeout(() => {
      setPhase("done");
      setStatusMsg("Voice verified");
      speak("Voice passphrase verified. Processing authentication.", () => {
        // Send a minimal dummy base64 string — backend doesn't use the audio
        setTimeout(() => onComplete("dummyvoice"), 800);
      });
    }, 1500);
  };

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Visual analyser for the waveform animation
      const audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      src.connect(analyser);
      analyserRef.current = analyser;
      animateWave();

      // Record audio (just for the UI demo — backend ignores the content)
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(100);

      // Auto-stop after 4 seconds — always advances regardless
      setTimeout(() => {
        try { recorder.stop(); } catch { /* ignore */ }
        stopMic();
        finishVoice();
      }, 4000);

    } catch {
      // Mic denied or unavailable — still advance after a short delay
      setStatusMsg("Processing voice...");
      setTimeout(() => finishVoice(), 2000);
    }
  };

  const stopMic = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const animateWave = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const bars = Array.from({ length: 40 }, (_, i) => {
        const idx = Math.floor((i / 40) * data.length);
        return Math.max(2, (data[idx] / 255) * 80);
      });
      setWaveData(bars);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  useEffect(() => () => { stopMic(); window.speechSynthesis.cancel(); }, []);

  const barColor = (i, h) => {
    if (phase === "done") return `rgba(0,255,150,${0.4 + (h / 80) * 0.6})`;
    if (phase === "analyzing") return `rgba(167,139,250,${0.4 + (h / 80) * 0.6})`;
    return `rgba(0,212,255,${0.3 + (h / 80) * 0.7})`;
  };

  return (
    <div className="auth-screen voice">
      <div className="auth-header">
        <div className="step-indicators">
          {["Face", "Voice", "Fingerprint"].map((s, i) => (
            <div key={i} className={`step-dot ${i === 1 ? "active" : i === 0 ? "done" : ""}`}>
              <div className="dot" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mic-visual">
        <div className={`mic-ring outer ${phase === "listening" ? "pulse" : ""}`} />
        <div className={`mic-ring middle ${phase === "listening" ? "pulse-delay" : ""}`} />
        <div className={`mic-core ${phase}`}>
          {phase === "done" ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00ff96" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </div>
      </div>

      <div className="waveform-wrap">
        <div className="waveform">
          {waveData.map((h, i) => (
            <div
              key={i}
              className="wave-bar"
              style={{
                height: `${h}px`,
                background: barColor(i, h),
                transition: phase === "analyzing" ? "height 0.3s ease" : "height 0.05s ease",
              }}
            />
          ))}
        </div>
      </div>

      <div className="voice-passphrase-hint">
        {phase === "listening" && (
          <div className="passphrase-box">
            <span className="passphrase-label">Say your passphrase:</span>
            {/* Must match voice_config.py VOICE_PASSWORDS */}
            <span className="passphrase-sample">"open the door"</span>
          </div>
        )}
      </div>

      <div className="status-area">
        <div className={`status-msg ${phase}`}>
          {statusMsg}{phase === "listening" ? ".".repeat(dots) : ""}
        </div>
        {phase === "done" && (
          <div className="check-row">
            <span>✓</span>
            <span>Audio recorded</span>
          </div>
        )}
        {phase === "error" && (
          <div className="check-row" style={{ color: "#ff4060" }}>
            <span>✗</span>
            <span>Microphone unavailable</span>
          </div>
        )}
      </div>

      <style>{`
        .auth-screen {
          width: 100vw;
          height: 100vh;
          background: #030712;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 28px;
          font-family: 'DM Sans', sans-serif;
          position: relative;
          overflow: hidden;
        }
        .auth-screen::before {
          content: '';
          position: absolute;
          top: -200px;
          left: 50%;
          transform: translateX(-50%);
          width: 700px;
          height: 700px;
          background: radial-gradient(circle, rgba(123,47,255,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .auth-header {
          position: absolute;
          top: 32px;
        }
        .step-indicators {
          display: flex;
          align-items: center;
          gap: 32px;
        }
        .step-dot {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          opacity: 0.3;
          transition: opacity 0.3s;
        }
        .step-dot.active { opacity: 1; }
        .step-dot.done { opacity: 0.6; }
        .step-dot .dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #00d4ff;
          box-shadow: 0 0 10px #00d4ff;
        }
        .step-dot.active .dot { animation: pulse 1.5s ease-in-out infinite; }
        .step-dot.done .dot { background: #00ff96; box-shadow: 0 0 8px #00ff96; }
        @keyframes pulse {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.5); }
        }
        .step-dot span {
          font-size: 10px; font-weight: 600;
          letter-spacing: 1.5px;
          color: #c4d4e8;
          text-transform: uppercase;
        }
        .mic-visual {
          position: relative;
          width: 160px; height: 160px;
          display: flex; align-items: center; justify-content: center;
        }
        .mic-ring {
          position: absolute;
          border-radius: 50%;
          border: 1.5px solid rgba(123,47,255,0.3);
        }
        .mic-ring.outer { width: 160px; height: 160px; }
        .mic-ring.middle { width: 120px; height: 120px; }
        .mic-ring.pulse { animation: ringPulse 1.2s ease-in-out infinite; }
        .mic-ring.pulse-delay { animation: ringPulse 1.2s ease-in-out 0.4s infinite; }
        @keyframes ringPulse {
          0%,100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); border-color: rgba(0,212,255,0.6); }
        }
        .mic-core {
          width: 80px; height: 80px;
          border-radius: 50%;
          background: rgba(15,20,35,0.9);
          border: 1.5px solid rgba(123,47,255,0.5);
          display: flex; align-items: center; justify-content: center;
          color: #a78bfa;
          position: relative;
          z-index: 2;
          transition: all 0.3s;
        }
        .mic-core.listening {
          border-color: #00d4ff;
          color: #00d4ff;
          box-shadow: 0 0 30px rgba(0,212,255,0.2), inset 0 0 20px rgba(0,212,255,0.05);
        }
        .mic-core.done {
          border-color: #00ff96;
          box-shadow: 0 0 30px rgba(0,255,150,0.3);
        }
        .waveform-wrap {
          width: min(340px, 88vw);
          height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 12px;
        }
        .waveform {
          display: flex;
          align-items: center;
          gap: 3px;
          height: 80px;
        }
        .wave-bar {
          width: 5px;
          border-radius: 3px;
          min-height: 2px;
          background: rgba(0,212,255,0.4);
        }
        .passphrase-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 14px 24px;
          border: 1px dashed rgba(0,212,255,0.25);
          border-radius: 12px;
          background: rgba(0,212,255,0.03);
          animation: fadeIn 0.5s ease;
        }
        .passphrase-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: rgba(196,212,232,0.5);
        }
        .passphrase-sample {
          font-size: 17px;
          font-weight: 600;
          color: #c4d4e8;
          font-style: italic;
          letter-spacing: 0.3px;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .voice-passphrase-hint { min-height: 70px; display: flex; align-items: center; justify-content: center; }
        .status-area { display: flex; flex-direction: column; align-items: center; gap: 10px; min-height: 60px; }
        .status-msg { font-size: 15px; font-weight: 500; color: rgba(196,212,232,0.6); }
        .status-msg.listening { color: #00d4ff; }
        .status-msg.analyzing { color: #a78bfa; }
        .status-msg.done { color: #00ff96; font-weight: 700; }
        .check-row {
          display: flex; align-items: center; gap: 8px;
          color: #00ff96; font-weight: 700; font-size: 15px;
          animation: fadeIn 0.4s ease;
        }
      `}</style>
    </div>
  );
}