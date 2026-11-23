from pathlib import Path
from urllib.request import urlretrieve

BASE = Path(__file__).resolve().parent
MODELS = BASE / "models"
MODELS.mkdir(exist_ok=True)

FILES = {
    "face_detection_yunet_2023mar.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
}

for name, url in FILES.items():
    target = MODELS / name
    if target.exists() and target.stat().st_size > 100_000:
        print(f"Already downloaded: {name}")
        continue
    print(f"Downloading {name}...")
    urlretrieve(url, target)
    if target.stat().st_size < 100_000:
        target.unlink(missing_ok=True)
        raise RuntimeError(f"Downloaded model looks incomplete: {name}")
    print(f"Saved: {target}")

print("Model files are ready.")
