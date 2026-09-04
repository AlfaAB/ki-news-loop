# KI-News-Loop — Starter-Kit für eine Claude Code Routine

Dieses Kit richtet einen wöchentlichen, unbeaufsichtigten Claude-Code-Loop ein, der:

1. mit 3 parallelen Research-Subagenten aktuelle KI-Entwicklungen recherchiert
   (Tools, Studium, Alltag/Automatisierung),
2. daraus die 3 wichtigsten Neuigkeiten der Woche auswählt (ohne Wiederholungen aus
   den letzten Wochen — dafür sorgt eine State-Datei),
3. daraus eine saubere HTML-Email baut,
4. die Auswahl vor dem Versand nochmal gegenprüft (Quellen, Dubletten, Plausibilität),
5. die Email per SMTP verschickt,
6. und den State im Repo committet, damit die nächste Woche weiß, was schon dran war.

## Warum eine Claude Code Cloud Routine (und nicht `/loop` oder lokaler Cron)

Du hast dich für die **Cloud Routine** entschieden — die richtige Wahl für "läuft
jedes Wochenende zuverlässig", weil sie unabhängig von deinem Rechner läuft (der muss
nicht an sein) und nicht an eine offene Session gebunden ist wie `/loop`. Der Preis
dafür: Jeder Lauf startet mit einem frischen Git-Clone deines Repos — es gibt also
keinen lokalen Zustand zwischen den Läufen. Deshalb lebt der gesamte Zustand
(`state/history.json`, `state/last_run.json`) im Git-Repo selbst und wird nach jedem
erfolgreichen Lauf zurückcommittet.

## Enthaltene Dateien

```
.claude/agents/research-agent.md      Subagent: Recherche (3x parallel, je ein Fokus)
.claude/agents/synthesis-agent.md     Subagent: Auswahl der Top 3 + Dedupe
.claude/agents/email-agent.md         Subagent: HTML-Email bauen
.claude/agents/verification-agent.md  Subagent: Qualitätsprüfung vor Versand
ROUTINE_PROMPT.md                     Der Prompt fürs "Instructions"-Feld der Routine
scripts/send_email.py                 SMTP-Versand-Skript
state/history.json                    Verlauf bereits behandelter Themen (Dedupe)
state/last_run.json                   Schutz vor Doppel-Versand in derselben Woche
.env.example                          Vorlage für die Environment-Variablen
email/output/                         Hier landen die erzeugten HTML-Emails
```

## Setup — Schritt für Schritt

### 1. Repository anlegen

Erstelle ein **privates** GitHub-Repo (z.B. `ki-news-loop`) und push alle Dateien
aus diesem Kit hinein:

```bash
cd ki-news-loop
git init
git add .
git commit -m "init: KI-News-Loop starter kit"
git branch -M main
git remote add origin https://github.com/<dein-user>/ki-news-loop.git
git push -u origin main
```

Privat, weil `email/output/` mit der Zeit deine wöchentlichen Reports sammelt und das
niemanden sonst etwas angeht.

### 2. App-Passwort für den Email-Versand erstellen

Da du dein Outlook-Konto (`antonino0815@outlook.de`) nutzen willst, brauchst du ein
**App-Passwort**:

1. Zwei-Faktor-Authentifizierung für dein Microsoft-Konto aktivieren (Voraussetzung
   für App-Passwörter).
2. Unter [account.microsoft.com/security](https://account.microsoft.com/security) →
   "Erweiterte Sicherheitsoptionen" → "App-Passwort erstellen".
3. Das erzeugte Passwort notieren (wird nur einmal angezeigt).

SMTP-Daten für Outlook: `smtp.office365.com`, Port `587` (STARTTLS) — bereits so in
`.env.example` hinterlegt.

### 3. Cloud Environment auf claude.ai/code einrichten

Auf [claude.ai/code](https://claude.ai/code) → Environments → neue Environment
anlegen (z.B. `ki-news-loop-env`):

- **Environment variables**: Inhalt von `.env.example` mit deinen echten Werten
  einfügen (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_TO, EMAIL_FROM_NAME).
  Hinweis: Diese Variablen sind für jede Session sichtbar, die diese Environment
  nutzt — bei einer rein privaten Environment (nur du) ist das unkritisch, aber lege
  aus diesem Grund keine gemeinsam genutzte/Team-Environment dafür an.
- **Network access**: Standardmäßig ist nur eine feste Allowlist an
  Domains/Paketregistries erlaubt — SMTP auf Port 587 ist ein anderes Protokoll als
  HTTPS und läuft möglicherweise nicht über die domainbasierte Allowlist. Stelle
  Network access probeweise auf **Full**. Falls dir das zu offen ist: teste zuerst mit
  Full, ob der Versand klappt (siehe Testlauf unten), und schränke danach über
  **Custom** so weit wie möglich ein (mindestens `smtp.office365.com` muss erlaubt
  sein). Schlägt der SMTP-Versand mit Custom/Trusted grundsätzlich fehl (reines
  HTTPS-Proxy-Limit), bleib bei Full für diese Environment — sie hat ohnehin keinen
  Zugriff auf andere Repos oder sensible Daten.
- **Setup script**: leer lassen, es wird nur Python (bereits vorinstalliert) benötigt.

### 4. Routine erstellen

Auf [claude.ai/code/routines](https://claude.ai/code/routines) → **New routine**:

- **Name**: z.B. "KI-News-Radar (wöchentlich)"
- **Prompt**: kompletten Inhalt aus `ROUTINE_PROMPT.md` (zwischen den Markierungen)
  einfügen
- **Repositories**: dein `ki-news-loop`-Repo auswählen
- **Environment**: die in Schritt 3 erstellte Environment auswählen
- **Trigger**: Schedule → wöchentlich, z.B. **Samstag, 09:00** (deine Zeitzone
  Europe/Berlin wird automatisch berücksichtigt). Frei anpassbar — "jedes Wochenende"
  lässt sich auch als Sonntagabend o.ä. einstellen.
- **Connectors**: keine nötig, kannst du alle entfernen/deaktivieren

Danach **Create** klicken.

### 5. Testlauf

Auf der Detailseite der Routine auf **Run now** klicken (nicht auf den nächsten
planmäßigen Termin warten). Öffne den Run und verfolge live, was die Subagenten tun.
Prüfe danach:

- Ist die Email angekommen (auch Spam-Ordner checken)?
- Wurden `state/history.json` und `state/last_run.json` im Repo aktualisiert
  (neuer Commit)?
- Falls der SMTP-Versand fehlschlägt: meist liegt es an der Network-Access-Einstellung
  (siehe Schritt 3) oder einem falschen App-Passwort.

### 6. Laufen lassen

Ab jetzt läuft die Routine automatisch jedes Wochenende. Du bekommst in
claude.ai/code/routines eine Historie aller Läufe und kannst jeden einzeln nachlesen.

## Anpassungen, die du später leicht ändern kannst

- **Dedupe-Fenster** (wie lange ein Thema als "schon behandelt" gilt): Zahl in
  `state/history.json` → `dedupe_window_weeks` (Standard: 8 Wochen).
- **Anzahl History-Einträge**: `max_history_entries` in derselben Datei.
- **Fokusbereiche der Recherche**: in `.claude/agents/research-agent.md` die drei
  Bereiche (tools/studium/alltag) umformulieren oder einen vierten ergänzen (dann auch
  in `ROUTINE_PROMPT.md` Schritt 1 einen vierten Task-Aufruf hinzufügen).
- **Tag/Uhrzeit**: direkt in der Routine unter "Repeats" ändern.
- **Sprache/Ton der Email**: in `.claude/agents/email-agent.md` und
  `synthesis-agent.md` anpassen.
- **Empfänger wechseln oder mehrere Empfänger**: `EMAIL_TO` in den Environment
  Variables anpassen (für mehrere Adressen `send_email.py` minimal erweitern, aktuell
  ist ein Empfänger vorgesehen).

## Warum dieser Loop lange stabil funktioniert (Design-Entscheidungen)

- **Zustand lebt im Git-Repo, nicht in der Session**: Cloud Routines starten jedes Mal
  bei null (frischer Clone) — ohne diesen Trick würde jede Woche bei null recherchiert
  und Themen könnten sich wiederholen.
- **State wird nur nach bestätigtem Erfolg geschrieben**: Schlägt der Versand fehl,
  bleibt der alte State unverändert, sodass der nächste Lauf sauber neu versuchen kann
  statt einen halb-fertigen Zustand fortzuschreiben.
- **Idempotenz-Check am Anfang**: verhindert Doppel-Versand, falls die Routine
  versehentlich zweimal in derselben Woche feuert (z.B. manueller Testlauf kurz vor dem
  planmäßigen Lauf).
- **History wird begrenzt** (`max_history_entries`): die Datei wächst nicht unbegrenzt.
- **Verification-Agent als letzte Instanz**: fängt kaputte Links, Dubletten und
  offensichtlich erfundene Inhalte ab, bevor sie in deinem Postfach landen — mit
  begrenzten Revisionsrunden, damit der Loop nicht endlos in einer Korrekturschleife
  hängen bleibt.
- **"send_with_caveat" statt Blockade**: ein verlässlicher wöchentlicher Rhythmus ist
  wichtiger als eine perfekte Ausgabe — nach 2 Revisionsrunden wird notfalls trotzdem
  verschickt statt die Woche ganz ausfallen zu lassen.
