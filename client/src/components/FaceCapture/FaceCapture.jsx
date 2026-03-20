import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, RotateCcw, Check, VideoOff, AlertTriangle } from 'lucide-react';
import './FaceCapture.css';

const CAMERA_ERRORS = {
  NotAllowedError:  'Camera permission denied. Please allow camera access in your browser settings.',
  NotFoundError:    'No camera found. Please connect a webcam and try again.',
  NotReadableError: 'Camera is already in use by another application.',
  OverconstrainedError: 'Camera does not meet requirements. Please try a different camera.',
};

export default function FaceCapture({ onCapture }) {
  const [phase, setPhase]       = useState('idle');   // idle | starting | streaming | captured | error
  const [captured, setCaptured] = useState(null);
  const [error, setError]       = useState('');
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Stop stream on unmount
  useEffect(() => () => stopStream(), []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startCamera = useCallback(async () => {
    setError('');
    setPhase('starting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
      setPhase('streaming');
    } catch (err) {
      const msg = CAMERA_ERRORS[err.name] || 'Camera access failed. Please check permissions.';
      setError(msg);
      setPhase('error');
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.9);

    stopStream();
    setCaptured(base64);
    setPhase('captured');
  }, []);

  const retake = useCallback(() => {
    setCaptured(null);
    startCamera();
  }, [startCamera]);

  const confirm = useCallback(() => {
    if (captured) onCapture(captured);
  }, [captured, onCapture]);

  return (
    <div className="face-capture">
      <h3 className="step-title">Step 01 / 03 — Face Recognition</h3>
      <p className="step-subtitle">Position your face in the oval and capture a clear photo</p>

      {phase !== 'captured' ? (
        <>
          <div className={`camera-container ${phase === 'streaming' ? 'active' : ''}`}>
            <video ref={videoRef} playsInline muted className={phase === 'streaming' ? 'visible' : ''} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Face oval overlay */}
            {phase === 'streaming' && (
              <div className="face-overlay">
                <div className="face-oval" />
                <div className="scan-line" />
              </div>
            )}

            {/* Placeholder states */}
            {phase !== 'streaming' && (
              <div className="camera-placeholder">
                {phase === 'starting' ? (
                  <>
                    <div className="cam-spinner" />
                    <span>Starting camera…</span>
                  </>
                ) : phase === 'error' ? (
                  <>
                    <AlertTriangle size={36} className="cam-error-icon" />
                    <span className="cam-error-text">{error}</span>
                  </>
                ) : (
                  <>
                    <VideoOff size={36} />
                    <span>Camera not started</span>
                  </>
                )}
              </div>
            )}

            {/* LIVE indicator */}
            {phase === 'streaming' && (
              <div className="live-badge">
                <span className="live-dot-anim" />
                LIVE CAM
              </div>
            )}
          </div>

          <div className="face-actions">
            {(phase === 'idle' || phase === 'error') && (
              <button className="btn btn-primary" onClick={startCamera}>
                <Camera size={16} />
                {phase === 'error' ? 'Retry Camera' : 'Start Camera'}
              </button>
            )}
            {phase === 'streaming' && (
              <button className="btn btn-primary" onClick={capturePhoto}>
                <Camera size={16} />
                Capture Face
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="face-preview-wrap">
            <img src={captured} alt="Captured face" className="face-preview" />
            <div className="preview-badge">
              <Check size={14} /> Photo Captured
            </div>
          </div>
          <div className="face-actions">
            <button className="btn btn-secondary" onClick={retake}>
              <RotateCcw size={16} /> Retake
            </button>
            <button className="btn btn-primary" onClick={confirm}>
              <Check size={16} /> Use This Photo
            </button>
          </div>
        </>
      )}
    </div>
  );
}
