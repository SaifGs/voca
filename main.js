// ══════════════════════════════════════════════════════════
// main.js — Voca Entry Point
// ══════════════════════════════════════════════════════════

import { STORAGE_KEY_OPENAI }                                                from "./config.js";
import { initUI, setState, showTranscript, renderNotes, showError, showDarkScreen, hideDarkScreen } from "./ui.js";
import { initRecorder, startRecording, stopRecording, transcribe, summarize } from "./recorder.js";
import { loadNotes, saveNote, deleteNote, exportNotes }                     from "./storage.js";

let openaiKey  = "";
let recording  = false;
let wakeLock   = null;
let dimActive  = false;

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request("screen"); } catch {}
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch {}
  wakeLock = null;
}

window.toggleDimScreen = function() {
  dimActive = !dimActive;
  if (dimActive) showDarkScreen();
  else            hideDarkScreen();
};

function loadKey() {
  try {
    const k = localStorage.getItem(STORAGE_KEY_OPENAI);
    if (k) { openaiKey = atob(k); return true; }
  } catch {}
  return false;
}

function init() {
  initUI();
  if (loadKey()) {
    initRecorder(openaiKey);
    document.getElementById("overlay").classList.add("hidden");
    renderNotes(loadNotes());
    setState("idle");
  }
}

// ── Aufnahme toggle ────────────────────────────────────────
window.toggleRecording = async function() {
  if (recording) {
    recording = false;
    if (dimActive) { dimActive = false; hideDarkScreen(); }
    await releaseWakeLock();
    setState("transcribing");

    try {
      const { blob, duration } = await stopRecording();

      if (!blob || blob.size < 1500) {
        setState("idle");
        return;
      }

      const { text, language } = await transcribe(blob);

      if (text && text.trim()) {
        showTranscript(text);
        setState("summarizing");
        const summary = await summarize(text, language).catch(() => "");
        saveNote(text, duration, language, summary);
        renderNotes(loadNotes());
      }

      setState("idle");
    } catch (e) {
      showError(e.message);
      showTranscript("");
    }

  } else {
    try {
      await startRecording();
      await requestWakeLock();
      recording = true;
      showTranscript("");
      setState("recording");
    } catch {
      showError("Mikrofon nicht verfügbar");
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
    err.textContent = "OpenAI Key muss mit sk- beginnen";
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
    err.textContent = "Speichern fehlgeschlagen";
  }
};

window.showResetConfirm = function() {
  if (!confirm("API Key wirklich löschen?")) return;
  localStorage.removeItem(STORAGE_KEY_OPENAI);
  openaiKey = "";
  document.getElementById("openai-key-input").value = "";
  document.getElementById("key-err").textContent    = "";
  document.getElementById("overlay").classList.remove("hidden");
};

document.addEventListener("DOMContentLoaded", init);
