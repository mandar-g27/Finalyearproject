import base64
import time
import threading
from flask import Flask, request, jsonify
from flask_cors import CORS
from face_module import verify_face_from_image_bytes

app = Flask(__name__)
CORS(app)

SESSION_TIMEOUT = 60  # seconds

SESSION_STORE = {}

FINGERPRINT_DB = {
    1: "Ashlesh",
    2: "Gouresh",
    3: "Mandar"
}

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

# ---------------- STEP 2: VERIFY VOICE (static pass for demo) ----------------
@app.route("/verify-voice", methods=["POST"])
def verify_voice():
    data = request.get_json(force=True, silent=True) or {}
    sid = data.get("session_id")
    voice_b64 = data.get("voice_audio")

    if not sid:
        return jsonify({"status": "error", "reason": "Missing session_id"}), 400

    if sid not in SESSION_STORE:
        return jsonify({"status": "voice_ok"}), 200  # session expired, just let it pass

    session = SESSION_STORE[sid]

    if session["status"] != "waiting_voice":
        return jsonify({"status": "voice_ok"}), 200  # already advanced, that's fine

    # Static pass — voice always succeeds for demo
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
        return jsonify({"status": "denied"})

    if identity == SESSION_STORE[sid]["identity"]:
        SESSION_STORE[sid]["status"] = "granted"
    else:
        SESSION_STORE[sid]["status"] = "denied"

    return jsonify({"status": SESSION_STORE[sid]["status"]})

# ---------------- SESSION STATUS FOR BROWSER ----------------
@app.route("/session-status/<sid>")
def session_status(sid):
    if sid not in SESSION_STORE:
        return jsonify({"status": "expired"})
    return jsonify({"status": SESSION_STORE[sid]["status"]})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)