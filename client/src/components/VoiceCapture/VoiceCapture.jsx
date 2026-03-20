import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, RotateCcw, Check, AlertTriangle } from 'lucide-react';
import './VoiceCapture.css';

const RECORD_SECONDS = 3;

export default function VoiceCapture({ onCapture }) {
  const [phase, setPhase]         = useState('idle');    // idle | recording | done | error
  const [countdown, setCountdown] = useState(RECORD_SECONDS);
  const [error, setError]         = useState('');
  const [audioUrl, setAudioUrl]   = useState(null);
  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);
  const blobRef     = useRef(null);
  const timerRef    = useRef(null);

  useEffect(() => () => {
    timerRef.current && clearInterval(timerRef.current);
    audioUrl && URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const startRecording = useCallback(async () => {
    setError('');
    setCountdown(RECORD_SECONDS);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Choose best supported format
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current   = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setPhase('done');
      };

      recorder.start();
      setPhase('recording');

      // Countdown every second, auto-stop at 0
      let remaining = RECORD_SECONDS;
      timerRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(timerRef.current);
          recorder.state === 'recording' && recorder.stop();
        }
      }, 1000);

    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Microphone permission denied. Please allow mic access and try again.'
        : err.name === 'NotFoundError'
        ? 'No microphone found. Please connect a microphone.'
        : 'Microphone unavailable. Please check your device settings.';
      setError(msg);
      setPhase('error');
    }
  }, []);

  const retake = useCallback(() => {
    blobRef.current = null;
    setPhase('idle');
    setCountdown(RECORD_SECONDS);
  }, []);

  const confirm = useCallback(async () => {
    if (!blobRef.current) return;
    try {
      // Try WAV conversion via AudioContext for best backend compatibility
      const arrayBuffer = await blobRef.current.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const decoded  = await audioCtx.decodeAudioData(arrayBuffer);
      const wav      = encodeWav(decoded);
      audioCtx.close();
      const reader = new FileReader();
      reader.onloadend = () => onCapture(reader.result.split(',')[1]);
      reader.readAsDataURL(wav);
    } catch {
      // Fallback: send webm directly
      const reader = new FileReader();
      reader.onloadend = () => onCapture(reader.result.split(',')[1]);
      reader.readAsDataURL(blobRef.current);
    }
  }, [onCapture]);

  return (
    <div className="voice-capture">
      <h3 className="step-title">Step 02 / 03 — Voice Verification</h3>
      <p className="step-subtitle">
        Speak your passphrase: <strong>"open the door"</strong>
      </p>

      {/* Visual indicator */}
      <div className={`voice-visual ${phase}`}>
        {phase === 'recording' && (
          <div className="waveform">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
        )}
        {phase === 'done' && <Check size={48} className="voice-check" />}
        {(phase === 'idle' || phase === 'error') && <Mic size={48} className="voice-mic" />}
      </div>

      {/* Countdown */}
      {phase === 'recording' && (
        <div className="voice-countdown">
          Recording… <span className="countdown-num">{countdown}s</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="voice-error-box">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Playback */}
      {phase === 'done' && audioUrl && (
        <audio controls src={audioUrl} className="voice-playback" />
      )}

      {/* Actions */}
      <div className="voice-actions">
        {(phase === 'idle' || phase === 'error') && (
          <button className="btn btn-danger" onClick={startRecording}>
            <Mic size={16} />
            {phase === 'error' ? 'Retry Recording' : `Start Recording (${RECORD_SECONDS}s)`}
          </button>
        )}
        {phase === 'done' && (
          <>
            <button className="btn btn-secondary" onClick={retake}>
              <RotateCcw size={16} /> Re-record
            </button>
            <button className="btn btn-primary" onClick={confirm}>
              <Check size={16} /> Confirm
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── WAV encoder ─────────────────────────────────────────────── */
function encodeWav(buffer) {
  const ch     = buffer.numberOfChannels;
  const sr     = buffer.sampleRate;
  const pcm    = buffer.getChannelData(0);
  const len    = pcm.length;
  const view   = new DataView(new ArrayBuffer(44 + len * 2));
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0,'RIFF'); view.setUint32(4, 36 + len * 2, true);
  ws(8,'WAVE'); ws(12,'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, ch, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * ch * 2, true);
  view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true);
  ws(36,'data'); view.setUint32(40, len * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2;
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}
