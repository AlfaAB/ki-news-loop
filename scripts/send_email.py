#!/usr/bin/env python3
"""
Verschickt eine HTML-Email per SMTP (App-Passwort).
Aufruf:  python3 scripts/send_email.py --html email/output/2026-W36.html --subject "KI-Update KW36"

Erwartet folgende Umgebungsvariablen (in der Claude Code Cloud Environment gesetzt):
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_TO
Optional:
  EMAIL_FROM_NAME (Anzeigename des Absenders, Default: "KI-News-Radar")

Exit code 0 = erfolgreich versendet. Exit code != 0 = Fehler (State darf dann NICHT
als "gesendet" markiert werden -> siehe ROUTINE_PROMPT.md).
"""
import argparse
import os
import smtplib
import socket
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

# Manche Cloud-Sandboxes haben kein funktionierendes IPv6, obwohl die DNS-Antwort
# eine IPv6-Adresse enthaelt. Python versucht dann zuerst IPv6 und scheitert mit
# "Address family not supported by protocol" (errno 97), noch bevor IPv4 probiert
# wird. Fix: getaddrinfo global auf IPv4-Ergebnisse beschraenken.
_orig_getaddrinfo = socket.getaddrinfo


def _ipv4_only_getaddrinfo(*args, **kwargs):
    results = _orig_getaddrinfo(*args, **kwargs)
    ipv4_results = [r for r in results if r[0] == socket.AF_INET]
    return ipv4_results or results


socket.getaddrinfo = _ipv4_only_getaddrinfo


def env_or_die(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"FEHLER: Umgebungsvariable {name} ist nicht gesetzt.", file=sys.stderr)
        sys.exit(2)
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--html", required=True, help="Pfad zur HTML-Datei mit dem Email-Inhalt")
    parser.add_argument("--subject", required=True, help="Betreff der Email")
    args = parser.parse_args()

    if not os.path.isfile(args.html):
        print(f"FEHLER: HTML-Datei nicht gefunden: {args.html}", file=sys.stderr)
        return 2

    with open(args.html, "r", encoding="utf-8") as f:
        html_body = f.read()

    smtp_host = env_or_die("SMTP_HOST")
    smtp_port = int(env_or_die("SMTP_PORT"))
    smtp_user = env_or_die("SMTP_USER")
    smtp_pass = env_or_die("SMTP_PASS")
    email_to = env_or_die("EMAIL_TO")
    from_name = os.environ.get("EMAIL_FROM_NAME", "KI-News-Radar").strip() or "KI-News-Radar"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = args.subject
    msg["From"] = formataddr((from_name, smtp_user))
    msg["To"] = email_to

    plain_fallback = (
        "Dein KI-Update ist als HTML formatiert. "
        "Falls dein Email-Programm kein HTML anzeigt, oeffne die angehaengte HTML-Datei "
        "oder wechsle die Ansicht auf 'HTML anzeigen'."
    )
    msg.attach(MIMEText(plain_fallback, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [email_to], msg.as_string())
    except Exception as exc:  # noqa: BLE001
        print(f"FEHLER beim SMTP-Versand: {exc}", file=sys.stderr)
        return 1

    print(f"OK: Email erfolgreich an {email_to} versendet.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
