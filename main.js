// ══════════════════════════════════════════════════════════
// main.js — Voca Entry Point
// ══════════════════════════════════════════════════════════

import { STORAGE_KEY_OPENAI }                                                from "./config.js";
import { initUI, setState, renderNotes, showError, showDarkScreen, hideDarkScreen } from "./ui.js";
import { initRecorder, startRecording, stopRecording, transcribe, summarize } from "./recorder.js";
import { loadNotes, saveNote, deleteNote, exportNotes }                     from "./storage.js";

let openaiKey  = "";
let recording  = false;
let wakeLock   = null;
let dimActive  = false;

const log    = (msg, ...args) => console.log(`%c[Voca] ${msg}`, "color:#A78BFA;font-weight:600", ...args);
const logErr = (msg, ...args) => console.error(`%c[Voca] ${msg}`, "color:#FCA5A5;font-weight:600", ...args);

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    log("Wake Lock: API not available (not Chrome/Android?)");
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    log("Wake Lock: active");
  } catch (e) {
    logErr("Wake Lock: request failed —", e.message);
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch {}
  wakeLock = null;
  log("Wake Lock: released");
}

// ── iOS keep-alive (prevents auto-sleep on iOS PWA) ────────
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

let iosAudioCtx  = null;
let iosOscillator = null;

function startSilentAudio() {
  if (!isIOS) return;
  try {
    iosAudioCtx = new AudioContext();

    // Nearly-inaudible oscillator — iOS must see actual audio output, not silence
    const gain = iosAudioCtx.createGain();
    gain.gain.value = 0.001;
    gain.connect(iosAudioCtx.destination);

    iosOscillator = iosAudioCtx.createOscillator();
    iosOscillator.frequency.value = 440;
    iosOscillator.connect(gain);
    iosOscillator.start();

    // If iOS suspends the context, immediately resume it
    iosAudioCtx.addEventListener("statechange", () => {
      if (iosAudioCtx && iosAudioCtx.state === "suspended") {
        iosAudioCtx.resume().catch(() => {});
        log("iOS AudioContext resumed after suspension");
      }
    });

    log(`iOS keep-alive started (AudioContext state: ${iosAudioCtx.state})`);
  } catch (e) {
    logErr("iOS keep-alive failed —", e.message);
  }
}

function stopSilentAudio() {
  if (!iosAudioCtx) return;
  try { iosOscillator?.stop(); iosAudioCtx.close(); } catch {}
  iosAudioCtx  = null;
  iosOscillator = null;
  log("iOS keep-alive stopped");
}

window.toggleDimScreen = async function() {
  dimActive = !dimActive;
  if (dimActive) {
    showDarkScreen();
    try { await document.documentElement.requestFullscreen(); } catch {}
    log("Dark Screen: on");
  } else {
    hideDarkScreen();
    if (document.fullscreenElement) try { await document.exitFullscreen(); } catch {}
    log("Dark Screen: off");
  }
};

function loadKey() {
  try {
    const k = localStorage.getItem(STORAGE_KEY_OPENAI);
    if (k) { openaiKey = atob(k); return true; }
  } catch {}
  return false;
}

function init() {
  log("App started");
  initUI();
  if (loadKey()) {
    log("API key loaded");
    initRecorder(openaiKey);
    document.getElementById("overlay").classList.add("hidden");
    renderNotes(loadNotes());
    setState("idle");
  } else {
    log("No API key found — showing setup overlay");
  }
}

// ── Aufnahme toggle ────────────────────────────────────────
window.toggleRecording = async function() {
  if (recording) {
    log("Recording stopped");
    recording = false;
    if (dimActive) { dimActive = false; hideDarkScreen(); }
    await releaseWakeLock();
    stopSilentAudio();
    setState("transcribing");

    try {
      const { blob, duration } = await stopRecording();
      log(`Audio blob: ${(blob?.size / 1024).toFixed(1)} KB, duration: ${(duration / 1000).toFixed(1)}s`);

      if (!blob || blob.size < 1500) {
        log("Recording too short — discarded");
        setState("idle");
        return;
      }

      log("Sending audio to Whisper…");
      const { text, language } = await transcribe(blob);
      log(`Transcription done [${language}]: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`);

      if (text && text.trim()) {
        setState("summarizing");
        log("Sending text to GPT for summary…");
        const summary = await summarize(text, language).catch((e) => { logErr("Summary failed —", e.message); return ""; });
        if (summary) log(`Summary: "${summary.slice(0, 80)}${summary.length > 80 ? "…" : ""}"`);
        saveNote(text, duration, language, summary);
        renderNotes(loadNotes());
      } else {
        log("No text transcribed — note not saved");
      }

      setState("idle");
    } catch (e) {
      logErr("Error in recording flow —", e.message);
      showError(e.message);
    }

  } else {
    log("Starting recording…");
    try {
      await startRecording();
      await requestWakeLock();
      startSilentAudio();
      recording = true;
      setState("recording");
    } catch (e) {
      logErr("Microphone not available —", e.message);
      showError("Microphone not available");
    }
  }
};

// ── Note Actions ───────────────────────────────────────────
window.copyNote = function(id) {
  const note = loadNotes().find(n => n.id === id);
  if (note) navigator.clipboard.writeText(note.text).catch(() => {});
};

window.deleteNoteUI = function(id) {
  deleteNote(id);
  renderNotes(loadNotes());
};

window.exportAll = function() {
  const text = exportNotes();
  if (!text) return;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `voca-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Key Management ─────────────────────────────────────────
window.saveKey = function() {
  const val = document.getElementById("openai-key-input").value.trim();
  const err = document.getElementById("key-err");

  if (!val.startsWith("sk-")) {
    err.textContent = "OpenAI key must start with sk-";
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY_OPENAI, btoa(val));
    openaiKey = val;
    initRecorder(val);
    document.getElementById("overlay").classList.add("hidden");
    renderNotes(loadNotes());
    setState("idle");
  } catch (e) {
    err.textContent = "Failed to save";
  }
};

window.showResetConfirm = function() {
  if (!confirm("Really delete the API key?")) return;
  localStorage.removeItem(STORAGE_KEY_OPENAI);
  openaiKey = "";
  document.getElementById("openai-key-input").value = "";
  document.getElementById("key-err").textContent    = "";
  document.getElementById("overlay").classList.remove("hidden");
};

document.addEventListener("DOMContentLoaded", init);
