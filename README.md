# KI-News-Loop: wöchentliche Claude Code Routine

Ein wöchentlicher, unbeaufsichtigter Claude-Code-Loop, der:

1. mit 3 parallelen Research-Subagenten aktuelle KI-Entwicklungen recherchiert
   (Tools, Studium, Alltag/Automatisierung),
2. daraus die 3 wichtigsten Neuigkeiten der Woche auswählt plus 0–3 kleinere
   Alltagshelfer-Tools ("Quick Hits"), ohne Wiederholungen aus den letzten Wochen;
   dafür sorgt eine State-Datei,
3. daraus eine saubere HTML-Email baut,
4. dieselbe Ausgabe als Daten für Antons Website ablegt (`data/weeks/<KW>.json`),
5. Auswahl und Dateien vor dem Versand gegenprüft (Quellen, Dubletten, Plausibilität),
6. die Email über den **Gmail-Connector** verschickt,
7. und alles ins Repo committet. Mit diesem Push ist die Ausgabe auch auf der Website.

## Wie die Website an die Daten kommt

Die Website liegt auf Antons eigenem Server und lädt ihre Daten beim Aufruf direkt aus
diesem Repo:

```
https://raw.githubusercontent.com/alfaab/ki-news-loop/main/data/index.json
https://raw.githubusercontent.com/alfaab/ki-news-loop/main/data/weeks/<KW>.json
```

Es gibt keinen Build, kein Deployment und keinen Job auf dem Server. Sobald die Routine
gepusht hat, zeigt die Website die neue Woche, spätestens fünf Minuten später; so lange
hält GitHub die Dateien zwischengespeichert. Ist GitHub nicht erreichbar, fällt die
Website auf den Ordner `data/` auf dem Server zurück und weist darauf hin.

Damit das funktioniert, **muss dieses Repo öffentlich bleiben.** Die Nachrichtentexte
sind dadurch für jeden lesbar, wie vorher mit GitHub Pages auch. Markierungen und
Notizen liegen nicht hier, sondern geschützt in Supabase.

GitHub Pages wird nicht mehr genutzt.

## Warum eine Cloud Routine (und nicht `/loop` oder lokaler Cron)

Die **Cloud Routine** läuft unabhängig vom eigenen Rechner (der muss nicht an sein) und
ist nicht an eine offene Session gebunden wie `/loop`. Der Preis dafür: Jeder Lauf
startet mit einem frischen Git-Clone des Repos, es gibt also keinen lokalen Zustand
zwischen den Läufen. Deshalb lebt der gesamte Zustand (`state/history.json`,
`state/last_run.json`) im Git-Repo selbst und wird nach jedem erfolgreichen Lauf
zurückcommittet.

## Enthaltene Dateien

```
.claude/agents/research-agent.md      Subagent: Recherche (3x parallel, je ein Fokus)
.claude/agents/synthesis-agent.md     Subagent: Auswahl Top 3 + Quick Hits + Dedupe
.claude/agents/email-agent.md         Subagent: HTML-Email bauen (nur Inline-Styles)
.claude/agents/verification-agent.md  Subagent: Qualitätsprüfung vor Versand
scripts/publish_week.mjs              Schreibt die Website-Daten aus der Synthese
ROUTINE_PROMPT.md                     Der Prompt fürs "Instructions"-Feld der Routine
state/history.json                    Verlauf behandelter Themen (Dedupe)
state/last_run.json                   Schutz vor Doppel-Versand + Retry-Erkennung
email/output/<KW>.html                Die verschickte Email-Fassung je Woche
data/weeks/<KW>.json                  Eine Ausgabe im Datenformat der Website
data/index.json                       Verzeichnis aller Wochen, liest die Website zuerst
tmp/                                  Zwischenstände eines Laufs, nicht im Repo
```

## Konfiguration

### Umgebungsvariablen (in der Cloud Environment)

| Variable | Wert | Zweck |
|---|---|---|
| `EMAIL_TO` | `antonino0815@outlook.de` | Empfänger der Wochen-Email |
| `SITE_URL` | Adresse der Website, endet mit `/` | Die Email verlinkt auf `<SITE_URL>#/woche/<KW>` |

Ist `SITE_URL` nicht gesetzt, entfallen die Website-Links in der Email ersatzlos, der
Rest läuft normal weiter.

### Connectors

Der **Gmail-Connector** muss verbunden und für die Routine aktiviert sein, darüber
läuft der Versand. Ohne ihn bricht der Lauf in Schritt 6 ab und markiert
`state/last_run.json` als `failed`, damit ein späterer Lauf es erneut versucht, ohne
neu zu recherchieren.

### Routine

Auf [claude.ai/code/routines](https://claude.ai/code/routines):

- **Prompt**: kompletter Inhalt aus `ROUTINE_PROMPT.md` (zwischen den Markierungen)
- **Repository**: dieses Repo
- **Trigger**: Schedule, wöchentlich (Zeitzone Europe/Berlin)

> **Wichtig:** Wird der Prompt in den Routine-Einstellungen geändert, muss
> `ROUTINE_PROMPT.md` mitgezogen werden, und umgekehrt. Sonst setzt ein späteres
> Zurückkopieren die Routine unbemerkt auf einen alten Stand zurück.

## Das Datenformat

Das Format einer Woche ist im Website-Projekt beschrieben (`README.md`, Abschnitt
„Datenformat“). `scripts/publish_week.mjs` erzeugt es aus der Ausgabe des
synthesis-agent und prüft dabei alle Pflichtfelder. Ist etwas ungültig, schreibt das
Skript nichts und nennt die fehlerhaften Felder.

Von Hand, etwa um eine Woche zu reparieren:

```bash
node scripts/publish_week.mjs --week 2026-W38 --date 2026-09-19 --input tmp/synthesis.json
node scripts/publish_week.mjs --index-only
```

Die zweite Zeile baut nur das Verzeichnis neu, zum Beispiel nachdem du eine Woche
gelöscht hast.

## Zustand verstehen (`state/`)

### `state/last_run.json`

Steuert Doppelversand-Sperre und Retry:

```json
{
  "last_sent_iso_week": "2026-W37",
  "last_sent_at": "2026-09-13T09:27:51+02:00",
  "last_status": "success",
  "last_attempted_iso_week": "2026-W37"
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
> stehen weiterhin in `history.json` und werden dedupliziert. Auf der Website zeigt die
> Woche dann die neue Auswahl; die zuvor verschickten Themen erscheinen darunter unter
> „Ebenfalls verschickt“.

### `state/history.json`

Steuert die Deduplizierung:

- `dedupe_window_weeks` (Standard `8`): wie viele Wochen zurück ein Thema als
  „schon behandelt“ gilt
- `max_history_entries` (Standard `30`): ältere Einträge werden aus der JSON entfernt;
  die zugehörigen Dateien unter `data/weeks/` bleiben als Archiv der Website erhalten
- **Pro Kalenderwoche genau ein Eintrag.** Läuft die Routine ausnahmsweise zweimal in
  einer Woche, wird der bestehende Eintrag ergänzt statt ein zweiter angelegt.

## Was du später leicht ändern kannst

- **Dedupe-Fenster**: `dedupe_window_weeks` in `state/history.json`
- **Anzahl History-Einträge**: `max_history_entries` in derselben Datei
- **Fokusbereiche der Recherche**: `.claude/agents/research-agent.md` umformulieren
  oder einen vierten Bereich ergänzen (dann auch in `ROUTINE_PROMPT.md` Schritt 1 einen
  vierten Task-Aufruf hinzufügen)
- **Tag/Uhrzeit**: direkt in der Routine unter „Repeats“
- **Sprache/Ton**: `.claude/agents/email-agent.md` und `synthesis-agent.md`
- **Aussehen der Website**: im Website-Projekt, nicht mehr hier
- **Empfänger**: `EMAIL_TO` in den Environment Variables

## Design-Entscheidungen (warum das lange stabil läuft)

- **Zustand lebt im Git-Repo, nicht in der Session.** Cloud Routines starten jedes Mal
  bei null (frischer Clone); ohne diesen Trick würde jede Woche bei null recherchiert.
- **State wird nur nach bestätigtem Erfolg geschrieben.** Schlägt der Versand fehl,
  bleibt `last_sent_iso_week` unverändert, damit der nächste Lauf sauber erneut
  versucht statt einen halbfertigen Zustand fortzuschreiben.
- **Idempotenz-Check am Anfang** verhindert Doppel-Versand, falls die Routine zweimal
  in derselben Woche feuert (z.B. „Run now“ kurz vor dem planmäßigen Lauf).
- **Retry ohne Neu-Recherche**: Ist nur der Versand gescheitert, wird die bereits
  geprüfte Email einfach erneut verschickt.
- **Website-Daten schreibt ein Skript, kein Agent.** Die Synthese liefert ohnehin
  strukturierte Daten; ein Skript übersetzt sie ohne Tippfehler ins Website-Format und
  lehnt Ungültiges ab, statt eine kaputte Datei zu veröffentlichen.
- **Die Website holt, das Repo schiebt nicht.** Kein Schlüssel für Antons Server liegt
  bei GitHub oder in der Routine; der Push ins Repo ist der einzige Schritt.
- **Verification-Agent als letzte Instanz** fängt kaputte Links, Dubletten und
  unbelegte Behauptungen ab, mit begrenzten Revisionsrunden, damit der Loop nicht
  endlos in einer Korrekturschleife hängt.
- **„send_with_caveat“ statt Blockade**: Ein verlässlicher wöchentlicher Rhythmus ist
  wichtiger als eine perfekte Ausgabe; nach 2 Revisionsrunden wird notfalls trotzdem
  verschickt, statt die Woche ausfallen zu lassen.
