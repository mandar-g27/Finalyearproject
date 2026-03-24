import cv2
import face_recognition
import pickle
import numpy as np
import time
import logging

# -------------------------------
# Load model ONCE (fail fast)
# -------------------------------

import os

# Get path to face_model.pkl in the same folder as this script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "face_model.pkl")

try:
    with open(MODEL_PATH, "rb") as f:
        MODEL_DATA = pickle.load(f)
except Exception as e:
    raise RuntimeError(f"Failed to load face_model.pkl at {MODEL_PATH}") from e

METHOD = MODEL_DATA.get("method", "svm")

if METHOD == "svm":
    CLF = MODEL_DATA["classifier"]
    LABEL_NAMES = MODEL_DATA["label_names"]
else:
    KNOWN_ENCODINGS = MODEL_DATA["encodings"]
    KNOWN_NAMES = MODEL_DATA["names"]

CONFIDENCE_THRESHOLD = 60
DISTANCE_THRESHOLD = 0.55


# -------------------------------
# Camera-based verification
# -------------------------------
def verify_face_from_camera(timeout=5):
    """
    Captures frames from webcam for `timeout` seconds.
    Returns: (name, verified_flag)
    """

    cap = None

    # Try common camera indexes
    for idx in (0, 1, 2):
        cap = cv2.VideoCapture(idx)
        if cap.isOpened():
            logging.info(f"Using camera index {idx}")
            break

    if cap is None or not cap.isOpened():
        logging.error("No accessible webcam found")
        return ("Unknown", 0)

    # Camera warm-up
    time.sleep(0.3)

    start_time = time.time()

    try:
        while time.time() - start_time < timeout:
            ret, frame = cap.read()
            if not ret or frame is None:
                continue

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            locations = face_recognition.face_locations(rgb, model="hog")

            if not locations:
                continue

            encodings = face_recognition.face_encodings(rgb, locations)

            for encoding in encodings:
                if METHOD == "svm":
                    probs = CLF.predict_proba([encoding])[0]
                    idx = int(np.argmax(probs))
                    confidence = probs[idx] * 100
                    prediction = CLF.classes_[idx]

                    if confidence >= CONFIDENCE_THRESHOLD:
                        return (prediction, 1)

                else:
                    distances = face_recognition.face_distance(
                        KNOWN_ENCODINGS, encoding
                    )
                    min_dist = float(np.min(distances))

                    if min_dist < DISTANCE_THRESHOLD:
                        idx = int(np.argmin(distances))
                        return (KNOWN_NAMES[idx], 1)

        return ("Unknown", 0)

    finally:
        cap.release()


# -------------------------------
# Image-bytes verification (API)
# -------------------------------
def verify_face_from_image_bytes(
    image_bytes,
    distance_threshold=DISTANCE_THRESHOLD,
    confidence_threshold=CONFIDENCE_THRESHOLD,
):
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    if img is None:
        logging.warning("Image decode failed")
        return ("Unknown", 0)


    # 🔥 FIX: selfie camera mirror
    img = cv2.flip(img, 1)

    # 🔥 Stabilize detection on high-res mobile images
    img = cv2.resize(img, (0, 0), fx=0.75, fy=0.75)

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    locations = face_recognition.face_locations(rgb, model="hog")

    logging.info(f"Faces found: {len(locations)}")

    if not locations:
        return ("Unknown", 0)

    encodings = face_recognition.face_encodings(rgb, locations)
    logging.info(f"Encodings found: {len(encodings)}")

    for encoding in encodings:
        if METHOD == "svm":
            probs = CLF.predict_proba([encoding])[0]
            idx = int(np.argmax(probs))
            confidence = probs[idx] * 100
            prediction = CLF.classes_[idx]

            logging.info(f"Prediction: {prediction}, Confidence: {confidence:.1f}%")

            if confidence >= confidence_threshold:
                return (prediction, 1)

        else:
            distances = face_recognition.face_distance(
                KNOWN_ENCODINGS, encoding
            )
            min_dist = float(np.min(distances))
            idx = int(np.argmin(distances))

            logging.info(f"Prediction: {KNOWN_NAMES[idx]}, Distance: {min_dist:.4f}")

            if min_dist < distance_threshold:
                return (KNOWN_NAMES[idx], 1)

    return ("Unknown", 0)
