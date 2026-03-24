"""
voice_module.py — Voice passphrase verification.

The frontend sends a proper WAV file (16-bit PCM, produced by AudioContext).
We write it to a temp file so speech_recognition can open it (it needs a path,
not a BytesIO object). pydub / ffmpeg are NOT required.
"""
import os
import logging
import tempfile
import speech_recognition as sr
from voice_config import VOICE_PASSWORDS


def verify_voice_from_audio_bytes(audio_bytes: bytes):
    """
    Verify the spoken passphrase in `audio_bytes` (expected WAV from browser).

    Returns:
        (str, int) — (matched_identity, 1) on success, ("Unknown", 0) on failure.
    """
    recognizer = sr.Recognizer()

    # Write bytes to a real temp file — sr.AudioFile() requires a file path
    print(f"DEBUG: Received {len(audio_bytes)} bytes of audio data")
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
            f.write(audio_bytes)
            tmp_path = f.name

        with sr.AudioFile(tmp_path) as source:
            audio = recognizer.record(source)

        spoken_text = recognizer.recognize_google(audio, language="en-IN").lower().strip()
        logging.info(f"[voice] Recognised: '{spoken_text}'")

    except sr.UnknownValueError:
        logging.warning("[voice] Could not understand audio")
        return ("Unknown", 0)
    except sr.RequestError as e:
        logging.error(f"[voice] Google STT error: {e}")
        return ("Unknown", 0)
    except Exception as e:
        logging.error(f"[voice] Error processing audio: {e}")
        return ("Unknown", 0)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    # Match against registered passphrases (substring match handles minor STT drift)
    for name, expected in VOICE_PASSWORDS.items():
        exp = expected.lower().strip()
        # Bi-directional matching: allows for partial recognition or "extra" words
        if exp in spoken_text or spoken_text in exp:
            logging.info(f"[voice] Matched: {name} (Heard: '{spoken_text}', Expected: '{exp}')")
            return (name, 1)

    print(f"DEBUG: No passphrase match. Expected one of {list(VOICE_PASSWORDS.values())}. Heard: '{spoken_text}'")
    logging.info(f"[voice] No passphrase match. Heard: '{spoken_text}'")
    return ("Unknown", 0)
