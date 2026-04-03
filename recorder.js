// ══════════════════════════════════════════════════════════
// recorder.js — Aufnahme + Whisper Transkription
// ══════════════════════════════════════════════════════════

import { OPENAI_STT_MODEL, OPENAI_CHAT_MODEL } from "./config.js";

const log    = (msg, ...args) => console.log(`%c[Recorder] ${msg}`, "color:#3FB950;font-weight:600", ...args);
const logErr = (msg, ...args) => console.error(`%c[Recorder] ${msg}`, "color:#FCA5A5;font-weight:600", ...args);

let mediaRecorder  = null;
let audioChunks    = [];
let recordingStart = 0;
let openaiKey      = "";

export function initRecorder(key) {
  openaiKey = key;
  log("Initialized");
}

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/mp4";

  log(`Microphone active — codec: ${mimeType}`);
  audioChunks    = [];
  recordingStart = Date.now();
  mediaRecorder  = new MediaRecorder(stream, { mimeType });

  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.start(250);
  log("MediaRecorder started (250ms chunks)");
}

export function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      resolve({ blob: null, duration: 0 });
      return;
    }
    const duration = Date.now() - recordingStart;

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
      mediaRecorder = null;
      resolve({ blob, duration });
    };

    mediaRecorder.stop();
  });
}

export async function transcribe(blob) {
  const ext      = blob.type.includes("mp4") ? "mp4" : "webm";
  log(`Whisper request — model: ${OPENAI_STT_MODEL}, file: audio.${ext}, size: ${(blob.size / 1024).toFixed(1)} KB`);

  const formData = new FormData();
  formData.append("file",            blob, `audio.${ext}`);
  formData.append("model",           OPENAI_STT_MODEL);
  formData.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method:  "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body:    formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    logErr(`Whisper HTTP ${res.status} —`, errData.error?.message || "(no error message)");
    throw new Error(`Transcription failed: ${res.status} — ${errData.error?.message || ""}`);
  }

  const data = await res.json();
  log(`Whisper response — language: "${data.language}", chars: ${data.text?.length ?? 0}`);
  return {
    text:     data.text     || "",
    language: data.language || "",
  };
}

export async function summarize(text, language) {
  log(`GPT summary — model: ${OPENAI_CHAT_MODEL}, language: "${language}", input: ${text.length} chars`);
  const langHint = language ? ` The text is in language code "${language}".` : "";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:    OPENAI_CHAT_MODEL,
      messages: [
        {
          role:    "system",
          content: `You are a precise summarization assistant. Summarize the user's text in 1–2 sentences. Reply in the same language as the input text.${langHint}`,
        },
        { role: "user", content: text },
      ],
      max_tokens:  120,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    logErr(`GPT HTTP ${res.status} —`, errData.error?.message || "(no error message)");
    throw new Error(`Summary failed: ${res.status} — ${errData.error?.message || ""}`);
  }

  const data   = await res.json();
  const result = data.choices?.[0]?.message?.content?.trim() || "";
  log(`GPT response — ${result.length} chars`);
  return result;
}
