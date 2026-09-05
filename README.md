# KI-News-Loop — wöchentliche Claude Code Routine

Ein wöchentlicher, unbeaufsichtigter Claude-Code-Loop, der:

1. mit 3 parallelen Research-Subagenten aktuelle KI-Entwicklungen recherchiert
   (Tools, Studium, Alltag/Automatisierung),
2. daraus die 3 wichtigsten Neuigkeiten der Woche auswählt plus 0–3 kleinere
   Alltagshelfer-Tools ("Quick Hits") — ohne Wiederholungen aus den letzten Wochen,
   dafür sorgt eine State-Datei,
3. daraus eine saubere HTML-Email baut,
4. dieselbe Ausgabe als Website (GitHub Pages, mit Archiv) veröffentlicht,
5. Auswahl und Dateien vor dem Versand gegenprüft (Quellen, Dubletten, Plausibilität),
6. die Email über den **Gmail-Connector** verschickt,
7. und den State im Repo committet, damit die nächste Woche weiß, was schon dran war.

**Website:** https://alfaab.github.io/ki-news-loop/

## Warum eine Cloud Routine (und nicht `/loop` oder lokaler Cron)

Die **Cloud Routine** läuft unabhängig vom eigenen Rechner (der muss nicht an sein) und
ist nicht an eine offene Session gebunden wie `/loop`. Der Preis dafür: Jeder Lauf
startet mit einem frischen Git-Clone des Repos — es gibt also keinen lokalen Zustand
zwischen den Läufen. Deshalb lebt der gesamte Zustand (`state/history.json`,
`state/last_run.json`) im Git-Repo selbst und wird nach jedem erfolgreichen Lauf
zurückcommittet.

## Enthaltene Dateien

```
.claude/agents/research-agent.md      Subagent: Recherche (3x parallel, je ein Fokus)
.claude/agents/synthesis-agent.md     Subagent: Auswahl Top 3 + Quick Hits + Dedupe
.claude/agents/email-agent.md         Subagent: HTML-Email bauen (nur Inline-Styles)
.claude/agents/page-agent.md          Subagent: Website + Archiv bauen
.claude/agents/verification-agent.md  Subagent: Qualitätsprüfung vor Versand
ROUTINE_PROMPT.md                     Der Prompt fürs "Instructions"-Feld der Routine
state/history.json                    Verlauf behandelter Themen (Dedupe)
state/last_run.json                   Schutz vor Doppel-Versand + Retry-Erkennung
email/output/<KW>.html                Die verschickte Email-Fassung je Woche
docs/index.html                       Startseite: neueste Ausgabe + Archivliste
docs/weeks/<KW>.html                  Unveränderlicher Wochen-Snapshot
docs/.nojekyll                        Damit GitHub Pages nicht durch Jekyll läuft
scripts/send_email.py                 Alt-Bestand aus der SMTP-Zeit, NICHT mehr genutzt
```

> **Hinweis:** `scripts/send_email.py` stammt aus der ursprünglichen SMTP-Variante und
> wird vom aktuellen Ablauf nicht mehr aufgerufen. Der Versand läuft über den
> Gmail-Connector. Das Skript liegt nur noch als Fallback herum und kann gelöscht
> werden, wenn es endgültig nicht mehr gebraucht wird.

## Konfiguration

### Umgebungsvariablen (in der Cloud Environment)

| Variable | Wert | Zweck |
|---|---|---|
| `EMAIL_TO` | `antonino0815@outlook.de` | Empfänger der Wochen-Email |
| `SITE_URL` | `https://alfaab.github.io/ki-news-loop/` | Basis-URL der Website (endet mit `/`) |

Ist `SITE_URL` nicht gesetzt, entfallen die Website-Links in der Email ersatzlos —
der Rest läuft normal weiter.

### Connectors

Der **Gmail-Connector** muss verbunden und für die Routine aktiviert sein — darüber
läuft der Versand. Ohne ihn bricht der Lauf in Schritt 6 ab und markiert
`state/last_run.json` als `failed`, damit ein späterer Lauf es erneut versucht, ohne
neu zu recherchieren.

### GitHub Pages

Die Website wird aus dem Ordner `docs/` auf dem Branch `main` ausgeliefert
(Repo → Settings → Pages → Source: „Deploy from a branch", Branch `main`, Ordner
`/docs`). `docs/.nojekyll` verhindert, dass GitHub die Dateien durch Jekyll schickt.

### Routine

Auf [claude.ai/code/routines](https://claude.ai/code/routines):

- **Prompt**: kompletter Inhalt aus `ROUTINE_PROMPT.md` (zwischen den Markierungen)
- **Repository**: dieses Repo
- **Trigger**: Schedule → wöchentlich (Zeitzone Europe/Berlin)

> **Wichtig:** Wird der Prompt in den Routine-Einstellungen geändert, muss
> `ROUTINE_PROMPT.md` mitgezogen werden — und umgekehrt. Sonst setzt ein späteres
> Zurückkopieren die Routine unbemerkt auf einen alten Stand zurück.

## Zustand verstehen (`state/`)

### `state/last_run.json`

Steuert Doppelversand-Sperre und Retry:

```json
{
  "last_sent_iso_week": "2026-W36",
  "last_sent_at": "2026-09-05T21:04:24+02:00",
  "last_status": "success",
  "last_attempted_iso_week": "2026-W36"
}
```

- `last_sent_iso_week` == aktuelle Woche **und** `last_status: "success"`
  → der Lauf bricht sofort ab und verschickt nichts.
- `last_attempted_iso_week` == aktuelle Woche **und** `last_status: "failed"`
  **und** `email/output/<KW>.html` existiert
  → nur der Versand wird wiederholt, ohne neue Recherche.

> **Einen Extra-Versand erzwingen:** `last_sent_iso_week` auf `null` setzen (oder auf
> eine ältere Woche) und committen. Dann läuft der nächste Trigger komplett durch und
> verschickt eine zweite Ausgabe in derselben Woche. Die bereits verschickten Themen
> stehen weiterhin in `history.json` und werden dedupliziert — es kommen also andere
> Inhalte, aber es sind zwei Mails.

### `state/history.json`

Steuert die Deduplizierung:

- `dedupe_window_weeks` (Standard `8`) — wie viele Wochen zurück ein Thema als
  „schon behandelt" gilt
- `max_history_entries` (Standard `30`) — ältere Einträge werden aus der JSON entfernt;
  die zugehörigen Dateien unter `docs/weeks/` bleiben als Archiv **erhalten**
- **Pro Kalenderwoche genau ein Eintrag.** Läuft die Routine ausnahmsweise zweimal in
  einer Woche, wird der bestehende Eintrag ergänzt statt ein zweiter angelegt — sonst
  entstünden zwei Archivzeilen, die auf dieselbe Datei zeigen.

## Was du später leicht ändern kannst

- **Dedupe-Fenster**: `dedupe_window_weeks` in `state/history.json`
- **Anzahl History-Einträge**: `max_history_entries` in derselben Datei
- **Fokusbereiche der Recherche**: `.claude/agents/research-agent.md` umformulieren
  oder einen vierten Bereich ergänzen (dann auch in `ROUTINE_PROMPT.md` Schritt 1 einen
  vierten Task-Aufruf hinzufügen)
- **Tag/Uhrzeit**: direkt in der Routine unter „Repeats"
- **Sprache/Ton**: `.claude/agents/email-agent.md` und `synthesis-agent.md`
- **Aussehen der Website**: das Design-System steht verbindlich in
  `.claude/agents/page-agent.md` — Farben, Typografie, Abstände, Layout
- **Empfänger**: `EMAIL_TO` in den Environment Variables

## Design-Entscheidungen (warum das lange stabil läuft)

- **Zustand lebt im Git-Repo, nicht in der Session** — Cloud Routines starten jedes Mal
  bei null (frischer Clone); ohne diesen Trick würde jede Woche bei null recherchiert.
- **State wird nur nach bestätigtem Erfolg geschrieben** — schlägt der Versand fehl,
  bleibt `last_sent_iso_week` unverändert, damit der nächste Lauf sauber erneut
  versucht statt einen halbfertigen Zustand fortzuschreiben.
- **Idempotenz-Check am Anfang** — verhindert Doppel-Versand, falls die Routine
  zweimal in derselben Woche feuert (z.B. „Run now" kurz vor dem planmäßigen Lauf).
- **Retry ohne Neu-Recherche** — ist nur der Versand gescheitert, wird die bereits
  geprüfte Email einfach erneut verschickt.
- **`docs/weeks/` ist unveränderlich** — vergangene Ausgaben werden nie überschrieben,
  Links bleiben dauerhaft gültig.
- **Verification-Agent als letzte Instanz** — fängt kaputte Links, Dubletten und
  unbelegte Behauptungen ab, mit begrenzten Revisionsrunden, damit der Loop nicht
  endlos in einer Korrekturschleife hängt.
- **„send_with_caveat" statt Blockade** — ein verlässlicher wöchentlicher Rhythmus ist
  wichtiger als eine perfekte Ausgabe; nach 2 Revisionsrunden wird notfalls trotzdem
  verschickt, statt die Woche ausfallen zu lassen.
