import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MODEL_VERSION = "opencv-yunet-sface-2021dec";

function encryptionKey() {
  const value = process.env.HR_FACE_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("HR_FACE_ENCRYPTION_KEY must be a 64-character hexadecimal (32-byte) key.");
  }
  return Buffer.from(value, "hex");
}

export async function extractFaceEmbedding(imageBase64) {
  if (typeof imageBase64 !== "string" || imageBase64.length < 100 || imageBase64.length > 8_000_000) {
    throw new Error("صورة الكاميرا غير صالحة أو حجمها كبير.");
  }
  const base = (process.env.FACE_RECOGNITION_URL || "http://127.0.0.1:8765").replace(/\/$/, "");
  let response;
  try {
    response = await fetch(base + "/embedding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: imageBase64 }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("خدمة التعرف على الوجه غير شغالة. شغّل face-service أولاً.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.detail || "تعذر تحليل الوجه.");
  if (!Array.isArray(result.embedding) || result.embedding.length !== 128 || result.model_version !== MODEL_VERSION) {
    throw new Error("استجابة موديل الوجه غير متوافقة.");
  }
  return result.embedding.map(Number);
}

export function encryptFaceEmbedding(embedding) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(embedding), "utf8"), cipher.final()]);
  return {
    embedding_ciphertext: encrypted.toString("base64"),
    embedding_iv: iv.toString("base64"),
    embedding_auth_tag: cipher.getAuthTag().toString("base64"),
    model_version: MODEL_VERSION,
  };
}

export function decryptFaceEmbedding(profile) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(profile.embedding_iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(profile.embedding_auth_tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(profile.embedding_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const embedding = JSON.parse(plain);
  if (!Array.isArray(embedding) || embedding.length !== 128 || embedding.some((x) => !Number.isFinite(x))) {
    throw new Error("قالب الوجه المخزن غير صالح.");
  }
  return embedding;
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return -1;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : -1;
}
