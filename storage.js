// ══════════════════════════════════════════════════════════
// storage.js — Notizen speichern/laden
// ══════════════════════════════════════════════════════════

import { STORAGE_NOTES_KEY, MAX_NOTES } from "./config.js";

export function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_NOTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
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
  return note;
}

export function deleteNote(id) {
  const notes = loadNotes().filter(n => n.id !== id);
  localStorage.setItem(STORAGE_NOTES_KEY, JSON.stringify(notes));
}

export function exportNotes() {
  const notes = loadNotes();
  if (!notes.length) return "";
  const lines = notes.map(n => {
    const d       = new Date(n.timestamp);
    const dateStr = d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
    const timeStr = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const lang    = n.language ? ` [${n.language}]` : "";
    const summary = n.summary ? `\nZusammenfassung: ${n.summary}` : "";
    return `[${dateStr} ${timeStr}${lang}]\n${n.text}${summary}`;
  });
  return lines.join("\n\n---\n\n");
}
