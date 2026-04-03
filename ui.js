// ══════════════════════════════════════════════════════════
// ui.js — DOM Manipulation
// ══════════════════════════════════════════════════════════

const log = (msg, ...args) => console.log(`%c[UI] ${msg}`, "color:#38BDF8;font-weight:600", ...args);

let btnEl, statusEl, transcriptEl, transcriptTextEl, timerEl, listEl, noteCountEl, dimBtnEl, darkScreenEl;
let timerInterval = null;

export function initUI() {
  btnEl           = document.getElementById("rec-btn");
  statusEl        = document.getElementById("status");
  transcriptEl    = document.getElementById("transcript");
  transcriptTextEl= document.getElementById("transcript-text");
  timerEl         = document.getElementById("timer");
  listEl          = document.getElementById("notes-list");
  noteCountEl     = document.getElementById("note-count");
  dimBtnEl        = document.getElementById("btn-dim");
  darkScreenEl    = document.getElementById("dark-screen");
}

export function showDarkScreen() {
  darkScreenEl.classList.add("visible");
}

export function hideDarkScreen() {
  darkScreenEl.classList.remove("visible");
}

export function setState(state) {
  log(`State → ${state}`);
  btnEl.dataset.state = state;
  const rings = document.querySelectorAll(".ripple-ring");

  if (state === "idle") {
    statusEl.textContent = "Tippen zum Aufnehmen";
    rings.forEach(r => r.classList.remove("show"));
    dimBtnEl.classList.remove("visible");
    stopTimer();
  } else if (state === "recording") {
    statusEl.textContent = "Aufnahme läuft — nochmal tippen zum Stoppen";
    rings.forEach(r => r.classList.add("show"));
    dimBtnEl.classList.add("visible");
    startTimer();
  } else if (state === "transcribing") {
    statusEl.textContent = "Wird transkribiert…";
    rings.forEach(r => r.classList.remove("show"));
    dimBtnEl.classList.remove("visible");
    stopTimer();
  } else if (state === "summarizing") {
    statusEl.textContent = "Zusammenfassung wird erstellt…";
  }
}

export function showTranscript(text) {
  transcriptTextEl.textContent = text;
  transcriptEl.classList.toggle("visible", !!text);
}

export function renderNotes(notes) {
  log(`Render: ${notes.length} Notiz(en)`);
  if (noteCountEl) noteCountEl.textContent = notes.length ? `${notes.length}` : "";

  if (!notes.length) {
    listEl.innerHTML = `<p class="empty">Noch keine Aufnahmen gespeichert.<br>Tippe auf den Knopf und sprich.</p>`;
    return;
  }

  listEl.innerHTML = notes.map(note => {
    const d       = new Date(note.timestamp);
    const dateStr = d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
    const timeStr = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const dur     = note.duration ? formatDur(note.duration) : "";
    const lang    = note.language ? `<span class="note-lang">${note.language}</span>` : "";

    return `
      <div class="note-card" data-id="${note.id}">
        <div class="note-meta">
          <span class="note-date">${dateStr} · ${timeStr}</span>
          ${lang}
          ${dur ? `<span class="note-dur">${dur}</span>` : ""}
        </div>
        <p class="note-text">${escHtml(note.text)}</p>
        ${note.summary ? `<div class="note-summary"><span class="note-summary-label">KI-Zusammenfassung</span>${escHtml(note.summary)}</div>` : ""}
        <div class="note-actions">
          <button class="btn-copy" onclick="copyNote(${note.id})">Kopieren</button>
          <button class="btn-del"  onclick="deleteNoteUI(${note.id})">Löschen</button>
        </div>
      </div>`;
  }).join("");
}

export function showError(msg) {
  log(`Fehler angezeigt: "${msg}"`);
  statusEl.textContent = "⚠ " + msg;
  setTimeout(() => setState("idle"), 4000);
}

function startTimer() {
  const start = Date.now();
  timerEl.textContent = "00:00";
  timerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - start) / 1000);
    const m   = String(Math.floor(sec / 60)).padStart(2, "0");
    const s   = String(sec % 60).padStart(2, "0");
    timerEl.textContent = `${m}:${s}`;
  }, 500);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  if (timerEl) timerEl.textContent = "";
}

function formatDur(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s/60)}m${s%60}s`;
}

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
