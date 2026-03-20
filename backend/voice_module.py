import speech_recognition as sr
import tempfile
import os
import logging
from voice_config import VOICE_PASSWORDS

def verify_voice_from_audio_bytes(audio_bytes):
    recognizer = sr.Recognizer()

    try:
        # Save raw audio bytes to a temp file (could be webm, wav, ogg etc.)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".audio") as f:
            f.write(audio_bytes)
            raw_path = f.name

        # Convert to WAV using pydub (handles webm, ogg, mp4, wav, etc.)
        wav_path = raw_path + ".wav"
        try:
            from pydub import AudioSegment
            audio_seg = AudioSegment.from_file(raw_path)
            audio_seg = audio_seg.set_frame_rate(16000).set_channels(1)
            audio_seg.export(wav_path, format="wav")
        except Exception as conv_err:
            logging.warning(f"pydub conversion failed: {conv_err}. Trying raw as wav.")
            wav_path = raw_path  # fallback – hope it's already wav

        with sr.AudioFile(wav_path) as source:
            audio = recognizer.record(source)

        spoken_text = recognizer.recognize_google(audio).lower().strip()
        logging.info(f"Recognized voice text: '{spoken_text}'")

        # Clean up temp files
        try:
            os.remove(raw_path)
            if wav_path != raw_path:
                os.remove(wav_path)
        except Exception:
            pass

        # Check spoken passphrase against all registered users
        # Use substring match to handle minor STT variations (extra words at start/end)
        for name, expected in VOICE_PASSWORDS.items():
            if expected.lower().strip() in spoken_text:
                return (name, 1)

        logging.info(f"No passphrase match. Heard: '{spoken_text}'")
        return ("Unknown", 0)

    except sr.UnknownValueError:
        logging.warning("Google Speech Recognition could not understand the audio.")
        return ("Unknown", 0)
    except sr.RequestError as e:
        logging.error(f"Google Speech Recognition service error: {e}")
        return ("Unknown", 0)
    except Exception:
        logging.exception("Voice verification failed")
        return ("Unknown", 0)
