import base64
import time
import threading
import sqlite3
from flask import Flask, request, jsonify
from flask_cors import CORS
from voice_module import verify_voice_from_audio_bytes
from face_module import verify_face_from_image_bytes
from FINGERPRINT_DB import FINGERPRINT_DB

app = Flask(__name__)
CORS(app)

def init_db():
    conn = sqlite3.connect('access_logs.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS logs
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_name TEXT,
                  status TEXT,
                  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    conn.commit()
    conn.close()

init_db()

def log_access(user_name, status):
    try:
        conn = sqlite3.connect('access_logs.db')
        c = conn.cursor()
        c.execute("INSERT INTO logs (user_name, status) VALUES (?, ?)", (user_name, status))
        conn.commit()
        conn.close()
    except Exception as e:
        print("Log DB error:", e)

SESSION_TIMEOUT = 60  # seconds

SESSION_STORE = {}


# ---------------- SESSION CLEANUP ----------------
def cleanup_sessions():
    while True:
        now = time.time()
        expired = [
            sid for sid, data in SESSION_STORE.items()
            if now - data["created_at"] > SESSION_TIMEOUT
        ]
        for sid in expired:
            del SESSION_STORE[sid]
        time.sleep(10)

threading.Thread(target=cleanup_sessions, daemon=True).start()

# ---------------- STEP 1: VERIFY FACE ----------------
@app.route("/verify-face", methods=["POST"])
def verify_face():
    data = request.get_json()
    face_b64 = data.get("face_image")

    if not face_b64:
        return jsonify({"status": "error", "reason": "No face image provided"}), 400

    if "," in face_b64:
        face_b64 = face_b64.split(",")[1]

    face_bytes = base64.b64decode(face_b64)
    face_name, face_ok = verify_face_from_image_bytes(face_bytes)

    if not face_ok:
        log_access("Unknown", "Face Failed")
        return jsonify({"status": "face_failed", "reason": "Face could not be identified"}), 200

    # Create session — waiting for voice now
    session_id = str(time.time())
    SESSION_STORE[session_id] = {
        "identity": face_name,
        "status": "waiting_voice",
        "created_at": time.time()
    }

    return jsonify({
        "status": "face_ok",
        "session_id": session_id,
        "identity": face_name
    }), 200

# ---------------- STEP 2: VERIFY VOICE ----------------
@app.route("/verify-voice", methods=["POST"])
def verify_voice():
    data = request.get_json(force=True, silent=True) or {}
    sid = data.get("session_id")
    voice_b64 = data.get("voice_audio")

    if not sid:
        return jsonify({"status": "error", "reason": "Missing session_id"}), 400

    if sid not in SESSION_STORE:
        return jsonify({"status": "voice_failed", "reason": "Session expired"}), 200

    session = SESSION_STORE[sid]

    if session["status"] != "waiting_voice":
        return jsonify({"status": "voice_ok"}), 200  # already advanced

    if not voice_b64:
        return jsonify({"status": "error", "reason": "No voice audio provided"}), 400

    # Strip data-URI prefix if present (e.g. "data:audio/webm;base64,...")
    if "," in voice_b64:
        voice_b64 = voice_b64.split(",")[1]

    try:
        voice_bytes = base64.b64decode(voice_b64)
    except Exception:
        return jsonify({"status": "error", "reason": "Invalid base64 audio"}), 400

    # Real voice verification
    voice_name, voice_ok = verify_voice_from_audio_bytes(voice_bytes)

    if not voice_ok:
        log_access(session.get("identity", "Unknown"), "Voice Failed")
        return jsonify({"status": "voice_failed", "reason": "Passphrase not recognised"}), 200

    # Cross-check: voice identity must match face identity from session
    if voice_name != session["identity"]:
        SESSION_STORE[sid]["status"] = "denied"
        log_access(session["identity"], "Voice Mismatch")
        return jsonify({
            "status": "voice_failed",
            "reason": f"Voice identity '{voice_name}' does not match face identity '{session['identity']}'"
        }), 200

    SESSION_STORE[sid]["status"] = "waiting_fp"
    return jsonify({"status": "voice_ok"}), 200

# ---------------- ACTIVE SESSION FOR ESP32 ----------------
@app.route("/active-session")
def active_session():
    for sid, data in SESSION_STORE.items():
        if data["status"] == "waiting_fp":
            return jsonify({"session_id": sid})
    return jsonify({"session_id": None})

# ---------------- FINGER AUTH ----------------
@app.route("/finger-auth", methods=["POST"])
def finger_auth():
    data = request.get_json()
    sid = data.get("session_id")
    finger_id = data.get("fingerprint_id")

    if sid not in SESSION_STORE:
        return jsonify({"status": "invalid"}), 400

    if finger_id is None:
        return jsonify({"status": "error", "reason": "Missing fingerprint_id"}), 400

    try:
        identity = FINGERPRINT_DB.get(int(finger_id))
    except (ValueError, TypeError):
        return jsonify({"status": "error", "reason": "Invalid fingerprint_id"}), 400

    if identity is None:
        SESSION_STORE[sid]["status"] = "denied"
        log_access(SESSION_STORE[sid]["identity"], "Fingerprint Failed")
        return jsonify({"status": "denied"})

    if identity == SESSION_STORE[sid]["identity"]:
        SESSION_STORE[sid]["status"] = "granted"
        log_access(SESSION_STORE[sid]["identity"], "Access Granted")
    else:
        SESSION_STORE[sid]["status"] = "denied"
        log_access(SESSION_STORE[sid]["identity"], "Fingerprint Mismatch")

    return jsonify({"status": SESSION_STORE[sid]["status"]})

# ---------------- SESSION STATUS FOR BROWSER ----------------
@app.route("/session-status/<sid>")
def session_status(sid):
    if sid not in SESSION_STORE:
        return jsonify({"status": "expired"})
    return jsonify({"status": SESSION_STORE[sid]["status"]})

# ---------------- ACCESS LOGS ----------------
@app.route("/access-logs", methods=["GET"])
def get_logs():
    try:
        conn = sqlite3.connect('access_logs.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT id, user_name, status, timestamp FROM logs ORDER BY timestamp DESC")
        rows = c.fetchall()
        conn.close()
        logs = [{"id": r["id"], "user_name": r["user_name"], "status": r["status"], "timestamp": r["timestamp"]} for r in rows]
        return jsonify({"status": "success", "logs": logs})
    except Exception as e:
        return jsonify({"status": "error", "reason": str(e)}), 500

@app.route("/access-logs", methods=["DELETE"])
def clear_logs():
    try:
        conn = sqlite3.connect('access_logs.db')
        c = conn.cursor()
        c.execute("DELETE FROM logs")
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "reason": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000,debug=True)