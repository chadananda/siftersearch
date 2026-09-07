#!/usr/bin/env python3
# survey-translations — classify every library FILE as original-language, translated, or unknown.
# Files are the source of truth (Chad, 2026-09-06); SQLite is derived and must not be surveyed instead.
# Answers backlog 0029: how big is the original-text project, per tradition and per tier.
# Deps: stdlib only. Read-only. Emits a table + tmp/translation-survey.json
import json, os, re, sys, collections

LIB = os.environ.get("OCEAN_LIBRARY") or os.path.expanduser(
    "~/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library")

# An English document by one of these is BY DEFINITION a translation, whoever rendered it.
ORIG_LANG_AUTHOR = re.compile(
    r"(bah[áa].?u.?ll[áa]h|abdu.?l.?bah[áa]|the b[áa]b|b[áa]b\b|shoghi"
    r"|muhammad|imam .?al[íi]|ibn |al-[a-z]|confucius|laozi|lao.?tzu|vy[áa]sa|zarathushtra)", re.I)
# The PATH is evidence the metadata often omits: a file under "Tablet Translations/" is a translation
# whatever its front matter says. Cheapest signal in the corpus and the one the first pass ignored.
TRANSLATED_PATH = re.compile(r"(tablet translations|unpublished translations|/pali canon/|provisional translation)", re.I)
# Genres written in English about the Faith, rather than scripture rendered into it. These have no
# original and need none — keeping them in "unknown" hid the real gaps behind a 59% noise floor.
SECONDARY_PATH = re.compile(r"^[^/]+/(Books|Papers|News|Pilgrim Notes|Administrative|Baha'i Books|Reference|Baha'i Talks)/", re.I)
# Explicit translator marks seen in the corpus: "tr. Thanissaro Bhikkhu", "trans.", "translated by".
TRANSLATOR_MARK = re.compile(r"\b(tr\.|trans\.|translated by|translator)", re.I)
# Works recorded as having NO authored original — talks taken down by others (Chad, 2026-08-26).
NO_ORIGINAL = re.compile(r"(promulgation of universal peace|paris talks|abdu.?l.?bah[áa] in london)", re.I)

def frontmatter(path):
    """Tolerant front-matter reader. The corpus mixes YAML with Python reprs
    ({'reconvert': True}), so a strict parser throws on real files. Only flat
    scalar keys are needed here."""
    out = {}
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            if fh.readline().strip() != "---":
                return out
            for _ in range(60):
                line = fh.readline()
                if not line or line.strip() == "---":
                    break
                m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$', line)
                if m:
                    out[m.group(1)] = m.group(2).strip().strip('"\'')
    except Exception:
        pass
    return out

def classify(fm, tradition, rel=""):
    lang = (fm.get("language") or "").lower()[:2]
    author = fm.get("author") or ""
    title = fm.get("title") or ""
    coll = fm.get("collectionTitle") or ""
    if lang and lang != "en":
        return "original-language", "non-English text"
    if TRANSLATED_PATH.search(rel):
        return "translated", "path declares it a translation"
    if NO_ORIGINAL.search(title):
        return "no-original", "recorded as having no authored original"
    if ORIG_LANG_AUTHOR.search(author):
        return "translated", "author wrote in Arabic/Persian"
    if TRANSLATOR_MARK.search(author) or TRANSLATOR_MARK.search(coll):
        return "translated", "explicit translator credit"
    if "," in author or author.startswith("["):
        return "translated?", "multiple authors — likely author + translator"
    if tradition in ("Buddhist", "Hindu", "Tao", "Confucian", "Zoroastrian",
                     "Sikh", "Jain", "Judaism", "Islam"):
        return "translated?", "scripture of a non-English tradition"
    if SECONDARY_PATH.search(rel):
        return "english-original", "secondary literature, written in English"
    return "unknown", "no signal"

rows, counts = [], collections.defaultdict(collections.Counter)
for root, dirs, files in os.walk(LIB):
    dirs[:] = [d for d in dirs if d not in ("_retired-duplicates",)]
    for name in files:
        if not name.endswith(".md"):
            continue
        path = os.path.join(root, name)
        rel = os.path.relpath(path, LIB)
        tradition = rel.split(os.sep)[0]
        fm = frontmatter(path)
        cls, why = classify(fm, tradition, rel)
        counts[tradition][cls] += 1
        rows.append({"path": rel, "tradition": tradition, "class": cls,
                     "why": why, "language": fm.get("language", ""),
                     "author": fm.get("author", "")[:80], "title": fm.get("title", "")[:80]})

ORDER = ["translated", "translated?", "original-language", "english-original", "no-original", "unknown"]
print(f"{'tradition':<20}" + "".join(f"{c:>13}" for c in ORDER) + f"{'total':>9}")
print("-" * (20 + 13 * len(ORDER) + 9))
tot = collections.Counter()
for trad in sorted(counts, key=lambda t: -sum(counts[t].values())):
    c = counts[trad]; tot.update(c)
    print(f"{trad:<20}" + "".join(f"{c[k]:>13,}" for k in ORDER) + f"{sum(c.values()):>9,}")
print("-" * (20 + 13 * len(ORDER) + 9))
print(f"{'TOTAL':<20}" + "".join(f"{tot[k]:>13,}" for k in ORDER) + f"{sum(tot.values()):>9,}")

os.makedirs("tmp", exist_ok=True)
json.dump(rows, open("tmp/translation-survey.json", "w"), indent=1)
print(f"\nper-file detail -> tmp/translation-survey.json ({len(rows):,} rows)")
