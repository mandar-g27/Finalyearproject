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

export default function FaceScan({ onComplete }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const [phase, setPhase] = useState("init"); // init | ready | scanning | analyzing | done
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("Initializing camera...");
  const [dots, setDots] = useState(0);
  const streamRef = useRef(null);

  useEffect(() => {
    const dotInterval = setInterval(() => setDots((d) => (d + 1) % 4), 400);
    return () => clearInterval(dotInterval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setPhase("ready");
        setStatusMsg("Camera ready");
        setTimeout(() => {
          speak("Please stand directly in front of the camera. Keep your face centered and still for facial recognition.", () => {
            if (!cancelled) beginScan();
          });
          setStatusMsg("Position your face in the frame");
        }, 600);
      } catch {
        setStatusMsg("Camera access denied. Please allow camera permissions.");
      }
    };
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const captureImage = () => {
    const video = videoRef.current;
    if (!video) return null;
    const cap = captureCanvasRef.current || document.createElement("canvas");
    cap.width = video.videoWidth || 640;
    cap.height = video.videoHeight || 480;
    const ctx = cap.getContext("2d");
    // mirror match the display (scaleX(-1))
    ctx.translate(cap.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, cap.width, cap.height);
    return cap.toDataURL("image/jpeg", 0.85);
  };

  const beginScan = () => {
    setPhase("scanning");
    setStatusMsg("Scanning face");
    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 3 + 1;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setPhase("analyzing");
        setStatusMsg("Analyzing biometrics");
        setTimeout(() => {
          const imageBase64 = captureImage();
          setPhase("done");
          setStatusMsg("Face captured");
          speak("Face scan complete. Switching to voice authentication.", () => {
            setTimeout(() => onComplete(imageBase64), 800);
          });
        }, 1800);
      }
      setProgress(Math.min(p, 100));
    }, 80);
  };

  // Draw scan overlay on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    let tick = 0;

    const draw = () => {
      tick++;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const rx = canvas.width * 0.3;
      const ry = canvas.height * 0.42;

      // Face oval guide
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      const grad = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
      const alpha = phase === "done" ? 0.9 : 0.5 + 0.2 * Math.sin(tick * 0.05);
      grad.addColorStop(0, `rgba(0,212,255,${alpha})`);
      grad.addColorStop(1, `rgba(123,47,255,${alpha})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = -tick * 0.5;
      ctx.stroke();
      ctx.setLineDash([]);

      if (phase === "scanning" || phase === "analyzing") {
        // Scan line
        const scanY = cy - ry + ((tick * 2) % (ry * 2));
        const scanGrad = ctx.createLinearGradient(cx - rx, scanY, cx + rx, scanY);
        scanGrad.addColorStop(0, "rgba(0,212,255,0)");
        scanGrad.addColorStop(0.5, "rgba(0,212,255,0.8)");
        scanGrad.addColorStop(1, "rgba(0,212,255,0)");
        ctx.beginPath();
        ctx.moveTo(cx - rx, scanY);
        ctx.lineTo(cx + rx, scanY);
        ctx.strokeStyle = scanGrad;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Glow below scan
        const glowGrad = ctx.createLinearGradient(cx, scanY - 40, cx, scanY);
        glowGrad.addColorStop(0, "rgba(0,212,255,0)");
        glowGrad.addColorStop(1, "rgba(0,212,255,0.06)");
        ctx.fillStyle = glowGrad;
        ctx.fillRect(cx - rx, scanY - 40, rx * 2, 40);
      }

      // Corner brackets
      const corners = [
        [cx - rx, cy - ry, 1, 1],
        [cx + rx, cy - ry, -1, 1],
        [cx - rx, cy + ry, 1, -1],
        [cx + rx, cy + ry, -1, -1],
      ];
      corners.forEach(([x, y, dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(x + dx * 18, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + dy * 18);
        ctx.strokeStyle = phase === "done" ? "rgba(0,255,150,0.9)" : "rgba(0,212,255,0.9)";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();
      });

      // Landmark dots when scanning
      if (phase === "scanning" || phase === "done") {
        const landmarks = [
          [cx - rx * 0.3, cy - ry * 0.1],
          [cx + rx * 0.3, cy - ry * 0.1],
          [cx, cy + ry * 0.05],
          [cx - rx * 0.15, cy + ry * 0.3],
          [cx + rx * 0.15, cy + ry * 0.3],
          [cx, cy - ry * 0.35],
        ];
        landmarks.forEach(([lx, ly]) => {
          ctx.beginPath();
          ctx.arc(lx, ly, 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,212,255,${0.4 + 0.4 * Math.sin(tick * 0.1 + lx)})`;
          ctx.fill();
        });
      }

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  return (
    <div className="auth-screen">
      <div className="auth-header">
        <div className="step-indicators">
          {["Face", "Voice", "Fingerprint"].map((s, i) => (
            <div key={i} className={`step-dot ${i === 0 ? "active" : ""}`}>
              <div className="dot" /><span>{s}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="scan-container">
        <video ref={videoRef} className="cam-feed" autoPlay muted playsInline />
        <canvas ref={canvasRef} className="scan-overlay" />

        {phase === "done" && (
          <div className="verified-badge">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00ff96" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
      </div>

      <div className="status-area">
        <div className={`status-msg ${phase}`}>
          {statusMsg}{phase !== "done" && phase !== "init" && phase !== "ready" ? ".".repeat(dots) : ""}
        </div>

        {(phase === "scanning" || phase === "analyzing") && (
          <div className="progress-bar-wrap">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-pct">{Math.round(progress)}%</span>
          </div>
        )}

        {phase === "done" && (
          <div className="check-row">
            <span className="check-icon">✓</span>
            <span className="check-label">Image captured</span>
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
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(0,212,255,0.05) 0%, transparent 70%);
          pointer-events: none;
        }
        .auth-header {
          position: absolute;
          top: 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
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
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #00d4ff;
          box-shadow: 0 0 10px #00d4ff;
        }
        .step-dot.active .dot { animation: pulse 1.5s ease-in-out infinite; }
        .step-dot.done .dot { background: #00ff96; box-shadow: 0 0 8px #00ff96; }
        @keyframes pulse {
          0%,100% { transform: scale(1); box-shadow: 0 0 8px #00d4ff; }
          50% { transform: scale(1.4); box-shadow: 0 0 20px #00d4ff; }
        }
        .step-dot span {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1.5px;
          color: #c4d4e8;
          text-transform: uppercase;
        }
        .scan-container {
          position: relative;
          width: min(340px, 88vw);
          height: min(400px, 55vh);
          border-radius: 20px;
          overflow: hidden;
          background: #0a0f1a;
          border: 1px solid rgba(0,212,255,0.1);
          box-shadow: 0 0 80px rgba(0,212,255,0.06);
        }
        .cam-feed {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: scaleX(-1);
          opacity: 0.85;
        }
        .scan-overlay {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .verified-badge {
          position: absolute;
          bottom: 16px;
          right: 16px;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(0,255,150,0.1);
          border: 1.5px solid #00ff96;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: popIn 0.4s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes popIn {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .status-area {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          min-height: 70px;
        }
        .status-msg {
          font-size: 15px;
          font-weight: 500;
          color: rgba(196,212,232,0.7);
          letter-spacing: 0.3px;
        }
        .status-msg.scanning { color: #00d4ff; }
        .status-msg.analyzing { color: #a78bfa; }
        .status-msg.done { color: #00ff96; font-weight: 700; }
        .progress-bar-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          width: min(300px, 80vw);
        }
        .progress-bar {
          flex: 1;
          height: 4px;
          background: rgba(255,255,255,0.06);
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00d4ff, #7b2fff);
          border-radius: 4px;
          transition: width 0.1s linear;
        }
        .progress-pct {
          font-size: 12px;
          color: #00d4ff;
          font-weight: 700;
          width: 36px;
          text-align: right;
        }
        .check-row {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #00ff96;
          font-weight: 700;
          font-size: 15px;
          animation: fadeIn 0.4s ease;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .check-icon { font-size: 18px; }
      `}</style>
    </div>
  );
}