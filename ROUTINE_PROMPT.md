# Prompt für das Feld "Instructions" der Claude Code Routine

Kopiere den kompletten Text zwischen den Markierungen unten in das Prompt-/Instructions-
Feld beim Erstellen der Routine auf claude.ai/code/routines. Der Text ist bewusst
vollständig und explizit gehalten, da die Routine jede Woche autonom (ohne Rückfragen)
läuft.

--- PROMPT START ---

Du führst den wöchentlichen "KI-News-Radar" für Anton aus, einen Studenten. Ziel: eine
kurze, hochwertige Email mit den 3 wichtigsten KI-Neuigkeiten der Woche — Fokus auf neue
Tools, neue Einsatzmöglichkeiten und neue Trends, sowohl für Studium/Forschung als auch
für Alltag und Automatisierung. Arbeite diesen Ablauf vollständig und in dieser
Reihenfolge ab. Du läufst unbeaufsichtigt — triff sinnvolle Entscheidungen selbst, frage
nicht nach.

## Schritt 0 — Vorbereitung & Idempotenz-Check

1. Stelle sicher, dass das Repository aktuell ist (`git pull --ff-only`).
2. Lies `state/last_run.json` und `state/history.json`.
3. Ermittle die aktuelle ISO-Kalenderwoche (Format `YYYY-Www`, z.B. `2026-W36`,
   Zeitzone Europe/Berlin).
4. Wenn `state/last_run.json.last_sent_iso_week` bereits der aktuellen Woche entspricht
   UND `last_status == "success"`: Breche sofort ab, ändere nichts, gib eine kurze
   Meldung aus ("Diese Woche wurde bereits erfolgreich verschickt, kein erneuter
   Versand.") und beende die Session. Das verhindert Doppel-Versand bei doppeltem
   Trigger (z.B. manuelles "Run now" + planmäßiger Lauf).

## Schritt 1 — Recherche (3 parallele Subagenten)

Rufe über das Task-Tool die drei Subagenten aus `.claude/agents/` **parallel in einem
einzigen Nachrichtenblock** auf: `research-agent` mit Fokus `"tools"`, `research-agent`
mit Fokus `"studium"` und `research-agent` mit Fokus `"alltag"`. Jeder liefert 5-8
Kandidaten mit Quelle zurück (siehe deren Agentendefinition für das genaue Format).

## Schritt 2 — Synthese

Rufe den Subagenten `synthesis-agent` auf. Übergib ihm alle Kandidaten aus Schritt 1 und
den Inhalt von `state/history.json`. Er liefert genau 3 final ausgewählte, aufbereitete
Einträge (`week_top3`) zurück — dedupliziert gegen die History der letzten
`dedupe_window_weeks` Wochen, priorisiert nach Relevanz.

## Schritt 3 — Email erzeugen

Rufe den Subagenten `email-agent` auf. Übergib ihm `week_top3`, die aktuelle
Kalenderwoche und das Datum. Er schreibt eine vollständige, inline-gestylte HTML-Datei
nach `email/output/<YYYY-Www>.html`.

## Schritt 4 — Qualitätsprüfung (max. 2 Revisionsrunden)

Rufe den Subagenten `verification-agent` auf mit `week_top3`, dem Pfad der HTML-Datei
und `state/history.json`.

- Bei `"recommendation": "send"` oder `"send_with_caveat"` → weiter zu Schritt 5.
- Bei `"recommendation": "revise"` → behebe die gemeldeten `issues` (ggf. erneuter aber
  gezielter Aufruf von `synthesis-agent`/`email-agent` nur für die betroffenen
  Einträge) und rufe `verification-agent` erneut auf. Maximal 2 Revisionsrunden
  insgesamt — danach in jedem Fall mit dem besten verfügbaren Stand zu Schritt 5
  weitergehen (ein verlässlicher wöchentlicher Rhythmus ist wichtiger als Perfektion).

## Schritt 5 — Versand

Führe aus:

```
python3 scripts/send_email.py --html email/output/<YYYY-Www>.html \
  --subject "🧠 KI-Update KW<Wochennummer> — <Kurztitel des wichtigsten Themas>"
```

Die SMTP-Zugangsdaten kommen aus den Environment-Variablen der Cloud Environment
(SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_TO) — diese sind bereits gesetzt,
du musst sie nicht selbst setzen.

- **Exit-Code 0** → Versand erfolgreich → weiter zu Schritt 6.
- **Exit-Code != 0** → Versand fehlgeschlagen. Aktualisiere `state/last_run.json` NICHT
  auf "success" (setze `last_status` auf `"failed"` und `last_sent_iso_week` NICHT auf
  die aktuelle Woche, damit der nächste Lauf es erneut versuchen kann), committe und
  push diese Fehlermarkierung, und beende die Session mit einer klaren Fehlermeldung im
  Klartext (damit sie im Run-Verlauf der Routine sichtbar ist). Versuche NICHT, das
  SMTP-Problem selbst zu beheben (z.B. Netzwerk-Policy ändern) — das kann nur Anton in
  den Environment-Einstellungen.

## Schritt 6 — State aktualisieren (nur bei Erfolg)

1. Füge `week_top3` als neuen Eintrag zu `state/history.json.entries` hinzu:
   `{ "iso_week": "...", "sent_date": "YYYY-MM-DD", "items": [{ "title": "...",
   "short_id": "...", "source_url": "..." }] }`.
2. Entferne aus `entries` alles, was älter ist als `max_history_entries` Einträge
   (älteste zuerst löschen), damit die Datei nicht unbegrenzt wächst.
3. Aktualisiere `state/last_run.json`: `last_sent_iso_week` = aktuelle Woche,
   `last_sent_at` = aktueller Zeitstempel (ISO 8601), `last_status` = `"success"`.
4. Committe beide Dateien mit Nachricht `chore: KI-News KW<Wochennummer> versendet` und
   push auf den Default-Branch (main). Dies ist dein persönliches Automatisierungs-Repo
   ohne weitere Mitwirkende — ein direkter Push auf main ist hier bewusst der einfachste
   und richtige Weg (kein PR nötig).

## Schritt 7 — Abschluss

Gib zum Abschluss eine kurze Zusammenfassung im Klartext aus: welche 3 Themen
verschickt wurden, an welche Adresse, und ob es Auffälligkeiten aus der
Qualitätsprüfung gab.

## Leitplanken

- Erfinde niemals Quellen, Zahlen oder Zitate. Wenn eine Woche wirklich nichts
  Nennenswertes hergibt, ist es besser, 3 kleinere echte Neuigkeiten zu senden als
  etwas zu erfinden.
- Alle Texte in der Email sind auf Deutsch.
- Ändere `state/history.json` oder `state/last_run.json` niemals außerhalb von Schritt 6
  (also nicht "vorsorglich" oder bei einem abgebrochenen Lauf).

--- PROMPT ENDE ---
