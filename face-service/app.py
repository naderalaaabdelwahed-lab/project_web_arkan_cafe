import base64
import os
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DETECTOR_PATH = BASE_DIR / "models" / "face_detection_yunet_2023mar.onnx"
RECOGNIZER_PATH = BASE_DIR / "models" / "face_recognition_sface_2021dec.onnx"
MODEL_VERSION = "opencv-yunet-sface-2021dec"

app = FastAPI(title="ARKAN Local Face Service", version="1.0.0")
detector = None
recognizer = None


class ImageRequest(BaseModel):
    image_base64: str = Field(min_length=100, max_length=8_000_000)


@app.on_event("startup")
def load_models():
    global detector, recognizer
    if not DETECTOR_PATH.is_file() or not RECOGNIZER_PATH.is_file():
        raise RuntimeError("Face models are missing. Run python download_models.py first.")
    detector = cv2.FaceDetectorYN.create(
        str(DETECTOR_PATH), "", (320, 320), 0.85, 0.3, 5000
    )
    recognizer = cv2.FaceRecognizerSF.create(str(RECOGNIZER_PATH), "")


@app.get("/health")
def health():
    return {"ok": detector is not None and recognizer is not None, "model_version": MODEL_VERSION}


@app.post("/embedding")
def create_embedding(payload: ImageRequest):
    try:
        encoded = payload.image_base64.split(",", 1)[-1]
        raw = base64.b64decode(encoded, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image encoding.")

    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image is too large.")

    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Could not read image.")

    height, width = image.shape[:2]
    if width < 160 or height < 160:
        raise HTTPException(status_code=422, detail="Camera image resolution is too low.")

    detector.setInputSize((width, height))
    _, faces = detector.detect(image)
    if faces is None or len(faces) == 0:
        raise HTTPException(status_code=422, detail="No face detected. Look directly at the camera.")
    if len(faces) != 1:
        raise HTTPException(status_code=422, detail="Only one person may stand in front of the camera.")

    face = faces[0]
    aligned = recognizer.alignCrop(image, face)
    feature = recognizer.feature(aligned).reshape(-1).astype(np.float32)
    norm = float(np.linalg.norm(feature))
    if norm == 0:
        raise HTTPException(status_code=422, detail="Could not extract a face template.")

    normalized = (feature / norm).tolist()
    return {"embedding": normalized, "model_version": MODEL_VERSION}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=int(os.getenv("FACE_SERVICE_PORT", "8765")))
