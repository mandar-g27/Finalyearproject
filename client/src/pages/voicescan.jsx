import { useEffect, useRef, useState } from "react";
import { verifyVoice } from "../services/api";

const speak = (text, onEnd) => {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.pitch = 1;
  u.volume = 1;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
};

/* ── WAV encoder (16-bit PCM mono) ──────────────────────────────────── */
function encodeWav(audioBuffer) {
  const sr  = audioBuffer.sampleRate;
  const pcm = audioBuffer.getChannelData(0); // mono – use channel 0
  const len = pcm.length;
  const buf = new ArrayBuffer(44 + len * 2);
  const view = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); view.setUint32(4, 36 + len * 2, true);
  ws(8, "WAVE"); ws(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);   // PCM, mono
  view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ws(36, "data"); view.setUint32(40, len * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([buf], { type: "audio/wav" });
}

/* ── Convert any audio Blob → WAV Blob via AudioContext ─────────────── */
async function blobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    return encodeWav(decoded);
  } finally {
    audioCtx.close();
  }
}

/* ── Blob → raw base64 (no data-URL prefix) ─────────────────────────── */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = reader.result;
      resolve(r.includes(",") ? r.split(",")[1] : r);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function VoiceAuth({ onComplete, sessionId }) {
  const [phase, setPhase]       = useState("intro");
  const [waveData, setWaveData] = useState(new Array(40).fill(2));
  const [statusMsg, setStatusMsg] = useState("Preparing voice authentication…");
  const [errorMsg, setErrorMsg]  = useState("");
  const [dots, setDots]          = useState(0);
  const [liveText, setLiveText]  = useState(""); // what user is saying live

  const analyserRef      = useRef(null);
  const rafRef           = useRef(null);
  const streamRef        = useRef(null);
  const chunksRef        = useRef([]);
  const mimeTypeRef      = useRef("audio/webm");
  const startedRef       = useRef(false);
  const speechRecRef     = useRef(null); // Web Speech API instance

  /* ── Dots animation ─── */
  useEffect(() => {
    const i = setInterval(() => setDots((d) => (d + 1) % 4), 400);
    return () => clearInterval(i);
  }, []);

  /* ── Auto-start after TTS prompt ─── */
  useEffect(() => {
    const t = setTimeout(() => {
      speak(
        "Face scan complete. Please speak your voice passphrase clearly.",
        () => {
          setPhase("listening");
          setStatusMsg("Listening for passphrase");
          startMic();
        }
      );
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* cleanup on unmount */
  useEffect(
    () => () => {
      stopMic();
      window.speechSynthesis.cancel();
      try { speechRecRef.current?.stop(); } catch { /* ignore */ }
    },
    []
  );

  /* ── Start live Web Speech API transcription ────────────────────────── */
  const startLiveTranscription = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return; // not supported — graceful degradation
    const rec = new SR();
    rec.continuous       = true;
    rec.interimResults   = true;
    rec.lang             = "en-US";
    rec.onresult = (e) => {
      let interim = "";
      let final_  = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final_ += t;
        else interim += t;
      }
      setLiveText((final_ || interim).trim());
    };
    rec.onerror = () => {}; // silent
    try { rec.start(); speechRecRef.current = rec; } catch { /* already started */ }
  };

  /* ── Submit audio to backend ─────────────────────────────────────── */
  const finishVoice = async (rawBlob) => {
    setPhase("analyzing");
    setStatusMsg("Analyzing voice pattern…");
    stopMic();

    let audioBase64;
    try {
      const wavBlob = await blobToWav(rawBlob);
      audioBase64   = await blobToBase64(wavBlob);
    } catch (convErr) {
      console.warn("WAV conversion failed, falling back to raw:", convErr);
      try {
        audioBase64 = await blobToBase64(rawBlob);
      } catch {
        setPhase("error");
        setErrorMsg("Audio processing failed — please try again.");
        setStatusMsg("Processing error");
        setTimeout(() => onComplete(null, "audio_error"), 2500);
        return;
      }
    }

    try {
      const data = await verifyVoice(sessionId, audioBase64);

      if (data.status === "voice_ok") {
        setPhase("done");
        setStatusMsg("Voice verified ✓");
        speak("Voice passphrase verified. Proceeding to fingerprint.", () => {
          setTimeout(() => onComplete(), 800);
        });
      } else {
        const reason = data.reason || "Passphrase not recognised";
        setPhase("error");
        setStatusMsg("Voice failed");
        setErrorMsg(reason);
        speak("Voice authentication failed. " + reason, () => {
          setTimeout(() => onComplete(null, reason), 1200);
        });
      }
    } catch (err) {
      const msg = err.message || "Server error — please try again.";
      setPhase("error");
      setStatusMsg("Server error");
      setErrorMsg(msg);
      setTimeout(() => onComplete(null, "server_error"), 2500);
    }
  };

  /* ── Start microphone & MediaRecorder ───────────────────────────── */
  const startMic = async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // Waveform visualiser
      const audioCtx = new AudioContext();
      const src      = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      src.connect(analyser);
      analyserRef.current = analyser;
      animateWave();

      // Best supported format
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      mimeTypeRef.current = mimeType || "audio/webm";

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      // ✅ Attach handlers BEFORE calling start()
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        finishVoice(blob);
      };

      recorder.start(100); // 100 ms timeslice

      // Start live transcription display
      setLiveText("");
      startLiveTranscription();

      // Auto-stop after 6 seconds
      setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
        try { speechRecRef.current?.stop(); } catch { /* ignore */ }
      }, 6000);
    } catch (err) {
      const msg =
        err.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow access and try again."
          : "Microphone unavailable. Please check your device.";
      setPhase("error");
      setStatusMsg("Microphone error");
      setErrorMsg(msg);
      setTimeout(() => onComplete(null, "mic_denied"), 2500);
    }
  };

  const stopMic = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const animateWave = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      setWaveData(
        Array.from({ length: 40 }, (_, i) => {
          const idx = Math.floor((i / 40) * data.length);
          return Math.max(2, (data[idx] / 255) * 80);
        })
      );
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const barColor = (i, h) => {
    if (phase === "done")      return `rgba(0,255,150,${0.4 + (h / 80) * 0.6})`;
    if (phase === "analyzing") return `rgba(167,139,250,${0.4 + (h / 80) * 0.6})`;
    if (phase === "error")     return `rgba(255,64,96,${0.3 + (h / 80) * 0.5})`;
    return `rgba(0,212,255,${0.3 + (h / 80) * 0.7})`;
  };

  return (
    <div className="auth-screen voice">
      {/* Step indicator */}
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

      {/* Mic icon */}
      <div className="mic-visual">
        <div className={`mic-ring outer ${phase === "listening" ? "pulse" : ""}`} />
        <div className={`mic-ring middle ${phase === "listening" ? "pulse-delay" : ""}`} />
        <div className={`mic-core ${phase}`}>
          {phase === "done" ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00ff96" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : phase === "error" ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ff4060" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
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

      {/* Waveform */}
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

      {/* Live transcription — what the user is saying */}
      <div className="voice-passphrase-hint">
        {phase === "listening" && (
          <div className="passphrase-box">
            <span className="passphrase-label">What you're saying</span>
            {liveText ? (
              <span className="live-transcript">{liveText}</span>
            ) : (
              <span className="passphrase-sample waiting-text">
                {"speak now".split("").map((c, i) => (
                  <span key={i} className="bounce-char" style={{ animationDelay: `${i * 0.06}s` }}>
                    {c === " " ? "\u00A0" : c}
                  </span>
                ))}
              </span>
            )}
          </div>
        )}
        {phase === "analyzing" && liveText && (
          <div className="passphrase-box analyzing">
            <span className="passphrase-label">Heard</span>
            <span className="live-transcript">{liveText}</span>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="status-area">
        <div className={`status-msg ${phase}`}>
          {statusMsg}
          {phase === "listening" ? ".".repeat(dots) : ""}
        </div>
        {phase === "done" && (
          <div className="check-row">
            <span>✓</span>
            <span>Voice passphrase accepted</span>
          </div>
        )}
        {phase === "error" && errorMsg && (
          <div className="check-row error-row">
            <span>✗</span>
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      <style>{`
        .auth-screen {
          width: 100vw; height: 100vh;
          background: #030712;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 28px;
          font-family: 'DM Sans', sans-serif;
          position: relative; overflow: hidden;
        }
        .auth-screen::before {
          content: '';
          position: absolute; top: -200px; left: 50%;
          transform: translateX(-50%);
          width: 700px; height: 700px;
          background: radial-gradient(circle, rgba(123,47,255,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .auth-header { position: absolute; top: 32px; }
        .step-indicators { display: flex; align-items: center; gap: 32px; }
        .step-dot {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          opacity: 0.3; transition: opacity 0.3s;
        }
        .step-dot.active { opacity: 1; }
        .step-dot.done  { opacity: 0.6; }
        .step-dot .dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #00d4ff; box-shadow: 0 0 10px #00d4ff;
        }
        .step-dot.active .dot { animation: pulse 1.5s ease-in-out infinite; }
        .step-dot.done   .dot { background: #00ff96; box-shadow: 0 0 8px #00ff96; }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.5)} }
        .step-dot span {
          font-size: 10px; font-weight: 600; letter-spacing: 1.5px;
          color: #c4d4e8; text-transform: uppercase;
        }
        .mic-visual {
          position: relative; width: 160px; height: 160px;
          display: flex; align-items: center; justify-content: center;
        }
        .mic-ring {
          position: absolute; border-radius: 50%;
          border: 1.5px solid rgba(123,47,255,0.3);
        }
        .mic-ring.outer  { width: 160px; height: 160px; }
        .mic-ring.middle { width: 120px; height: 120px; }
        .mic-ring.pulse       { animation: ringPulse 1.2s ease-in-out infinite; }
        .mic-ring.pulse-delay { animation: ringPulse 1.2s ease-in-out 0.4s infinite; }
        @keyframes ringPulse {
          0%,100% { opacity:0.3; transform:scale(1); }
          50%     { opacity:0.8; transform:scale(1.05); border-color:rgba(0,212,255,0.6); }
        }
        .mic-core {
          width:80px; height:80px; border-radius:50%;
          background:rgba(15,20,35,0.9);
          border:1.5px solid rgba(123,47,255,0.5);
          display:flex; align-items:center; justify-content:center;
          color:#a78bfa; position:relative; z-index:2; transition:all 0.3s;
        }
        .mic-core.listening { border-color:#00d4ff; color:#00d4ff; box-shadow:0 0 30px rgba(0,212,255,0.2),inset 0 0 20px rgba(0,212,255,0.05); }
        .mic-core.analyzing { border-color:#a78bfa; color:#a78bfa; box-shadow:0 0 30px rgba(167,139,250,0.2); }
        .mic-core.done      { border-color:#00ff96; box-shadow:0 0 30px rgba(0,255,150,0.3); }
        .mic-core.error     { border-color:#ff4060; color:#ff4060; box-shadow:0 0 30px rgba(255,64,96,0.3); }
        .waveform-wrap {
          width:min(340px,88vw); height:100px;
          display:flex; align-items:center; justify-content:center;
          background:rgba(255,255,255,0.02);
          border:1px solid rgba(255,255,255,0.05);
          border-radius:16px; padding:12px;
        }
        .waveform { display:flex; align-items:center; gap:3px; height:80px; }
        .wave-bar  { width:5px; border-radius:3px; min-height:2px; background:rgba(0,212,255,0.4); }
        .passphrase-box {
          display:flex; flex-direction:column; align-items:center; gap:6px;
          padding:14px 24px;
          border:1px dashed rgba(0,212,255,0.25);
          border-radius:12px;
          background:rgba(0,212,255,0.03);
          animation:fadeIn 0.5s ease;
        }
        .passphrase-label {
          font-size:11px; font-weight:600; letter-spacing:1.5px;
          text-transform:uppercase; color:rgba(196,212,232,0.5);
        }
        .live-transcript {
          font-size: 18px;
          font-weight: 700;
          color: #00d4ff;
          letter-spacing: 0.3px;
          text-align: center;
          min-height: 28px;
          transition: all 0.2s ease;
          text-shadow: 0 0 20px rgba(0,212,255,0.4);
        }
        .passphrase-box.analyzing .live-transcript { color: #a78bfa; text-shadow: 0 0 20px rgba(167,139,250,0.4); }
        .passphrase-sample {
          font-size:13px; font-weight:600; color:#c4d4e8;
          font-style:italic; letter-spacing:0.3px; text-align:center;
        }
        .waiting-text { display: inline-flex; gap: 1px; }
        .bounce-char {
          display: inline-block;
          animation: charBounce 1.4s ease-in-out infinite;
          color: rgba(0,212,255,0.4);
        }
        @keyframes charBounce {
          0%,100% { transform: translateY(0); opacity: 0.3; }
          40%      { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        .voice-passphrase-hint { min-height:70px; display:flex; align-items:center; justify-content:center; }
        .status-area { display:flex; flex-direction:column; align-items:center; gap:10px; min-height:60px; }
        .status-msg { font-size:15px; font-weight:500; color:rgba(196,212,232,0.6); }
        .status-msg.listening { color:#00d4ff; }
        .status-msg.analyzing { color:#a78bfa; }
        .status-msg.done      { color:#00ff96; font-weight:700; }
        .status-msg.error     { color:#ff4060; font-weight:700; }
        .check-row {
          display:flex; align-items:flex-start; gap:8px;
          color:#00ff96; font-weight:700; font-size:14px;
          animation:fadeIn 0.4s ease;
          max-width:340px; text-align:center;
        }
        .error-row { color:#ff4060; }
      `}</style>
    </div>
  );
}