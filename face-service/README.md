# ARKAN Local Face Recognition Service

This local Python service extracts face embeddings using OpenCV YuNet + SFace. It does not store images or employee data. It binds to 127.0.0.1 only.

## Windows setup

Open PowerShell in the repository root:

```powershell
py -3.11 -m venv face-service/.venv
.ace-service/.venv/Scripts/python.exe -m pip install --upgrade pip
.ace-service/.venv/Scripts/python.exe -m pip install -r face-service/requirements.txt
.ace-service/.venv/Scripts/python.exe face-service/download_models.py
.ace-service/.venv/Scripts/python.exe -m uvicorn face-service.app:app --host 127.0.0.1 --port 8765
```

The health endpoint is http://127.0.0.1:8765/health.

Run Next.js in a second terminal with `npm run dev`. The Next.js server calls this local service through `FACE_RECOGNITION_URL` (default http://127.0.0.1:8765).

## Model licensing

- YuNet detector model: OpenCV Zoo model directory license (MIT).
- SFace recognizer model: OpenCV Zoo model directory license (Apache-2.0).
- Keep the license and attribution notices with redistributed model files. Review upstream provenance and applicable local law before commercial deployment.

The model files are downloaded locally and are not committed to Git.

## Important limitations

This first version performs face detection and face-template matching only. It does **not** implement reliable presentation-attack detection (liveness). A printed photo or replayed screen may fool a basic face matcher. Keep PIN/manual attendance as fallback and do not use face-only records for payroll decisions until liveness, consent, accuracy and security have been independently tested.
