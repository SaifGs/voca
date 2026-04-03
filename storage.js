// ══════════════════════════════════════════════════════════
// storage.js — Notizen speichern/laden
// ══════════════════════════════════════════════════════════

import { STORAGE_NOTES_KEY, MAX_NOTES } from "./config.js";

const log = (msg, ...args) => console.log(`%c[Storage] ${msg}`, "color:#F59E0B;font-weight:600", ...args);

export function loadNotes() {
  try {
    const raw   = localStorage.getItem(STORAGE_NOTES_KEY);
    const notes = raw ? JSON.parse(raw) : [];
    log(`${notes.length} note(s) loaded`);
    return notes;
  } catch {
    log("Load error — returning empty array");
    return [];
  }
}

export function saveNote(text, durationMs, language, summary) {
  const notes = loadNotes();
  const note = {
    id:        Date.now(),
    text:      text.trim(),
    summary:   summary || "",
    timestamp: new Date().toISOString(),
    duration:  durationMs,
    language:  language || "",
  };
  notes.unshift(note);
  if (notes.length > MAX_NOTES) notes.length = MAX_NOTES;
  localStorage.setItem(STORAGE_NOTES_KEY, JSON.stringify(notes));
  log(`Note saved — ID: ${note.id}, language: "${note.language}", chars: ${note.text.length}, summary: ${note.summary ? "yes" : "no"}`);
  return note;
}

export function deleteNote(id) {
  const notes = loadNotes().filter(n => n.id !== id);
  localStorage.setItem(STORAGE_NOTES_KEY, JSON.stringify(notes));
  log(`Note deleted — ID: ${id}`);
}

export function exportNotes() {
  const notes = loadNotes();
  if (!notes.length) return "";
  const lines = notes.map(n => {
    const d       = new Date(n.timestamp);
    const dateStr = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const timeStr = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const lang    = n.language ? ` [${n.language}]` : "";
    const summary = n.summary ? `\nSummary: ${n.summary}` : "";
    return `[${dateStr} ${timeStr}${lang}]\n${n.text}${summary}`;
  });
  return lines.join("\n\n---\n\n");
}
