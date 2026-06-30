"""Extract START_CARDS and REPLY_CARDS from the New Phone Who Dis PDF."""
import fitz
import json
import re
import sys
from pathlib import Path

PDF = Path(r"C:\Users\calle\Downloads\New Phone Who Dis.pdf")
OUT_JSON = Path(__file__).resolve().parent.parent / "js" / "data" / "newphone_extracted.json"
OUT_JS = Path(__file__).resolve().parent.parent / "js" / "data" / "newphone.js"

MARKER = r"\n(INBOX|REPLY)\nNEW PHONE WHO DIS\?\n"


def clean(text: str) -> str:
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    return " ".join(lines)


def parse_pdf(path: Path) -> tuple[list[str], list[str]]:
    doc = fitz.open(path)
    full = "".join(page.get_text() + "\n" for page in doc)
    segments = re.split(MARKER, full)

    inbox: list[str] = []
    reply: list[str] = []
    for i in range(0, len(segments), 2):
        card_text = clean(segments[i])
        if not card_text:
            continue
        card_type = segments[i + 1] if i + 1 < len(segments) else "REPLY"
        (inbox if card_type == "INBOX" else reply).append(card_text)
    return inbox, reply


def js_string(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def write_js(inbox: list[str], reply: list[str], path: Path) -> None:
    header = """// ============================================================================
//  NEW PHONE WHO DIS? — card content
// ============================================================================
//
//  HOW TO EDIT THE CARDS (this is the only file you need to touch):
//
//  • START_CARDS  → the incoming texts shown at the top of each round.
//                   Add/remove/reword freely. One string per line, in quotes,
//                   each ending with a comma. Aim for open-ended setups that
//                   any reply could riff on.
//
//  • REPLY_CARDS  → the funny / absurd cards dealt to players' hands (5 each).
//                   Add/remove/reword freely, same format. Keep them short,
//                   weird, and reply-shaped. The more, the better — players are
//                   dealt random hands from this whole list.
//
//  Rules of thumb:
//    - Keep each line wrapped in "double quotes" and end it with a comma.
//    - Emojis are fine. 😏
//    - Duplicates are harmless but pointless.
//    - You need at least  (players × 5)  reply cards for everyone to get a hand;
//      a few hundred keeps rounds fresh.
//
//  Card text extracted from the official New Phone Who Dis? PDF.
//
// ============================================================================

"""
    lines = [
        header,
        f"// --- {len(inbox)} incoming texts -------------------------------------------------------\n",
        "export const START_CARDS = [\n",
    ]
    for card in inbox:
        lines.append(f"  {js_string(card)},\n")
    lines.append("];\n\n")
    lines.append(
        f"// --- {len(reply)} reply cards ---------------------------------------------------------\n"
    )
    lines.append("export const REPLY_CARDS = [\n")
    for card in reply:
        lines.append(f"  {js_string(card)},\n")
    lines.append("];\n")
    path.write_text("".join(lines), encoding="utf-8")


def main() -> None:
    pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else PDF
    inbox, reply = parse_pdf(pdf)
    print(f"INBOX: {len(inbox)}, REPLY: {len(reply)}")
    OUT_JSON.write_text(
        json.dumps({"START_CARDS": inbox, "REPLY_CARDS": reply}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    write_js(inbox, reply, OUT_JS)
    print(f"Wrote {OUT_JS}")


if __name__ == "__main__":
    main()
