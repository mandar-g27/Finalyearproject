/**
 * API Service — communicates with Flask backend
 * Base URL defaults to localhost:5000 for development.
 */
import { API_BASE_URL } from "./config";

/**
 * Step 1: Verify face image against the known face model.
 * @param {string} faceBase64 - Raw base64 face image (no data-URL prefix)
 * @returns {Promise<{status: "face_ok"|"face_failed", session_id?: string, identity?: string}>}
 */
export async function verifyFace(faceBase64) {
  const res = await fetch(`${API_BASE_URL}/verify-face`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ face_image: faceBase64 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.reason || "Face verification request failed");
  return data;
}

/**
 * Step 2: Verify voice passphrase for the given session.
 * @param {string} sessionId - Session ID returned from verifyFace
 * @param {string} audioBase64 - Raw base64 voice audio (no data-URL prefix)
 * @returns {Promise<{status: "voice_ok"|"voice_failed"}>}
 */
export async function verifyVoice(sessionId, audioBase64) {
  const res = await fetch(`${API_BASE_URL}/verify-voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, voice_audio: audioBase64 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.reason || "Voice verification request failed");
  return data;
}

/**
 * Poll the session status (used by fingerprint waiting screen)
 * @param {string} sessionId
 * @returns {Promise<{status: string}>}
 */
export async function getSessionStatus(sessionId) {
  const res = await fetch(`${API_BASE_URL}/session-status/${sessionId}`);
  return res.json();
}

/**
 * Check backend health/connectivity
 * @returns {Promise<boolean>}
 */
export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/active-session`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export { API_BASE_URL };
