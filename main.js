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

// ── iOS keep-alive (hidden video trick — NoSleep.js technique) ─
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

let iosKeepAliveVideo = null;

function buildKeepAliveVideo() {
  // Minimal 1×1 transparent MP4 — iOS won't sleep during active video playback
  const src = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAA19tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0OCByMjYwMSBhMGNkN2QzIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiBzdHJlYWRzPTMgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAFZWxpYngAAkvA";
  const v = document.createElement("video");
  v.setAttribute("playsinline", "");
  v.muted  = true;
  v.loop   = true;
  v.src    = src;
  v.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.appendChild(v);
  return v;
}

function startSilentAudio() {
  if (!isIOS) return;
  try {
    if (!iosKeepAliveVideo) iosKeepAliveVideo = buildKeepAliveVideo();
    iosKeepAliveVideo.play().then(() => log("iOS keep-alive video playing"))
                             .catch(e => logErr("iOS keep-alive failed —", e.message));
  } catch (e) {
    logErr("iOS keep-alive failed —", e.message);
  }
}

function stopSilentAudio() {
  if (!iosKeepAliveVideo) return;
  iosKeepAliveVideo.pause();
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
