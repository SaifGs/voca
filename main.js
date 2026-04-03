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

const log    = (msg, ...args) => console.log(`%c[Voca] ${msg}`, "color:#A78BFA;font-weight:600", ...args);
const logErr = (msg, ...args) => console.error(`%c[Voca] ${msg}`, "color:#FCA5A5;font-weight:600", ...args);

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    log("Wake Lock: API nicht verfügbar (kein Chrome/Android?)");
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    log("Wake Lock: Bildschirm-Sperre aktiv");
  } catch (e) {
    logErr("Wake Lock: Anfrage fehlgeschlagen —", e.message);
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch {}
  wakeLock = null;
  log("Wake Lock: freigegeben");
}

window.toggleDimScreen = function() {
  dimActive = !dimActive;
  if (dimActive) { showDarkScreen(); log("Dark Screen: eingeschaltet"); }
  else           { hideDarkScreen(); log("Dark Screen: ausgeschaltet"); }
};

function loadKey() {
  try {
    const k = localStorage.getItem(STORAGE_KEY_OPENAI);
    if (k) { openaiKey = atob(k); return true; }
  } catch {}
  return false;
}

function init() {
  log("App gestartet");
  initUI();
  if (loadKey()) {
    log("API Key geladen");
    initRecorder(openaiKey);
    document.getElementById("overlay").classList.add("hidden");
    renderNotes(loadNotes());
    setState("idle");
  } else {
    log("Kein API Key gefunden — Setup-Overlay angezeigt");
  }
}

// ── Aufnahme toggle ────────────────────────────────────────
window.toggleRecording = async function() {
  if (recording) {
    log("Aufnahme gestoppt");
    recording = false;
    if (dimActive) { dimActive = false; hideDarkScreen(); }
    await releaseWakeLock();
    setState("transcribing");

    try {
      const { blob, duration } = await stopRecording();
      log(`Audio-Blob: ${(blob?.size / 1024).toFixed(1)} KB, Dauer: ${(duration / 1000).toFixed(1)}s`);

      if (!blob || blob.size < 1500) {
        log("Aufnahme zu kurz — wird verworfen");
        setState("idle");
        return;
      }

      log("Sende Audio an Whisper…");
      const { text, language } = await transcribe(blob);
      log(`Transkription fertig [${language}]: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`);

      if (text && text.trim()) {
        showTranscript(text);
        setState("summarizing");
        log("Sende Text an GPT für Zusammenfassung…");
        const summary = await summarize(text, language).catch((e) => { logErr("Zusammenfassung fehlgeschlagen —", e.message); return ""; });
        if (summary) log(`Zusammenfassung: "${summary.slice(0, 80)}${summary.length > 80 ? "…" : ""}"`);
        saveNote(text, duration, language, summary);
        renderNotes(loadNotes());
      } else {
        log("Kein Text transkribiert — Notiz nicht gespeichert");
      }

      setState("idle");
    } catch (e) {
      logErr("Fehler im Recording-Flow —", e.message);
      showError(e.message);
      showTranscript("");
    }

  } else {
    log("Starte Aufnahme…");
    try {
      await startRecording();
      await requestWakeLock();
      recording = true;
      showTranscript("");
      setState("recording");
    } catch (e) {
      logErr("Mikrofon nicht verfügbar —", e.message);
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
