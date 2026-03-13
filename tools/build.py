#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Konvertiert die CSV-Datei aus data/ in eine JSON-Datei für das Web-Frontend.
Robust gegen unterschiedliche Trennzeichen, BOM, optionale Kopfzeile.

Eingangsschema (Zeile 1 = Kopf, Daten ab Zeile 2):
1 Wort Deutsch
2 Wort Pinyin
3 Wortart
4 Satz Pinyin
5 Satz Deutsch
6 Wort Hanzi
7 Satz Hanzi
8 ID
"""

import csv, json, sys
from pathlib import Path
from datetime import datetime

# Standard-Pfade
DEFAULT_CSV = Path("data/Long-Chinesisch_Lektionen.csv")
DEFAULT_JSON = Path("web/cards.json")


def sniff_dialect(sample_bytes):
    """Versucht, CSV-Dialekt zu erkennen (Komma/Semikolon etc.)."""
    sample = sample_bytes.decode("utf-8", errors="ignore")
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except Exception:
        # Fallback: Semikolon ist im DACH-Raum häufig
        class Fallback(csv.Dialect):
            delimiter = ';'
            quotechar = '"'
            doublequote = True
            skipinitialspace = True
            lineterminator = '\n'
            quoting = csv.QUOTE_MINIMAL
        return Fallback


def open_text(path):
    """Öffnet Textdatei robust mit UTF-8 (BOM) und Fallback latin-1."""
    try:
        return open(path, 'r', encoding='utf-8-sig', newline='')
    except UnicodeDecodeError:
        return open(path, 'r', encoding='latin-1', newline='')


def row_to_card(row, rownum):
    """Mappt eine CSV-Zeile (Liste) in unsere Kartenstruktur.
    Erwartet 8 Spalten. Extra-Spalten werden ignoriert, fehlende aufgefüllt.
    """
    # Sicherstellen, dass es mindestens 8 Spalten gibt
    cells = list(row) + [''] * (8 - len(row))

    de_word   = cells[0].strip()
    py_word   = cells[1].strip()
    pos       = cells[2].strip()
    py_sent   = cells[3].strip()
    de_sent   = cells[4].strip()
    hz_word   = cells[5].strip()
    hz_sent   = cells[6].strip()
    id_raw    = cells[7].strip()

    # ID robust parsen, ansonsten eine String-ID verwenden
    card_id = id_raw if id_raw else f"row{rownum}"

    # Mindestens Wort oder Satz muss vorhanden sein
    if not any([de_word, py_word, hz_word, de_sent, py_sent, hz_sent]):
        return None

    zh_lines = [x for x in [hz_word, py_word, pos, hz_sent, py_sent] if x]
    de_lines = [x for x in [de_word, pos, de_sent] if x]

    return {
        "id": card_id,
        "zh": zh_lines,
        "de": de_lines,
        "word": {
            "de": de_word,
            "pinyin": py_word,
            "hanzi": hz_word,
            "pos": pos,
        },
        "sentence": {
            "de": de_sent,
            "pinyin": py_sent,
            "hanzi": hz_sent,
        },
    }


def main(csv_in: Path, json_out: Path):
    if not csv_in.exists():
        print(f"[FEHLT] CSV-Datei nicht gefunden: {csv_in}")
        print("Bitte lege deine Datei ab oder gib den Pfad als Argument an.")
        sys.exit(1)

    with open_text(csv_in) as f:
        sample = f.read(4096)
        f.seek(0)
        dialect = sniff_dialect(sample.encode('utf-8', errors='ignore'))
        reader = csv.reader(f, dialect)

        cards = []
        for i, row in enumerate(reader):
            # Überspringe offensichtliche Kopfzeile
            if i == 0:
                # Falls Zeile 1 Textköpfe enthält, überspringen
                header_join = " ".join(cell.lower() for cell in row)
                if any(k in header_join for k in ["deutsch", "pinyin", "wortart", "hanzi", "satz", "id"]):
                    continue
            # Überspringe komplett leere Zeilen
            if not any(cell.strip() for cell in row):
                continue
            card = row_to_card(row, i+1)
            if card:
                cards.append(card)

    json_out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {
            "source": str(csv_in),
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "count": len(cards)
        },
        "cards": cards
    }
    with open(json_out, 'w', encoding='utf-8') as out:
        json.dump(payload, out, ensure_ascii=False, indent=2)
    print(f"OK: {csv_in} → {json_out} ({len(cards)} Karten)")


if __name__ == "__main__":
    csv_in = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    json_out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_JSON
    main(csv_in, json_out)
