#!/usr/bin/env python3
# Rollup for the Bahá'í Sacred Writings selections sheet: batch-csv.mjs results (first sentence of each selection) → one row
# per selection with the proposed column V (Original-Language Source) and a source check against the sheet's own columns.
#   python3 rollup-bsw.py selections.csv first.jsonl out.csv
import csv, json, re, sys, unicodedata
sel_csv, res_jsonl, out_csv = sys.argv[1:4]
fold = lambda s: re.sub(r"[^a-z0-9 ]", "", "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").lower().replace("’", "").replace("'", ""))
res = {}
for l in open(res_jsonl):
    x = json.loads(l); res[x["id"]] = x
w = csv.writer(open(out_csv, "w", newline=""))
w.writerow(["#", "Opening Line", "Sheet: Identified Source", "API: published source", "Source check", "Original-Language Source (proposed V)",
            "Original confidence", "Check", "Original opening (matched)", "Ocean of Lights", "Phelps Inventory", "API source link"])
stats = {}
for s in csv.DictReader(open(sel_csv)):
    x = res.get(s["#"]) or {}; r = x.get("r") or {}
    src = (r.get("source") or {}); o = r.get("original"); poss = r.get("possibleOriginals") or []
    sheet = s["Identified Source"]
    if not src: check = "no source found"
    elif not sheet: check = "sheet empty"
    else: check = "agree" if fold(sheet)[:25] in fold(src.get("title")) or fold(src.get("title"))[:25] in fold(sheet) else "DIFFERS"
    t, conf = (o, "linked translation") if o else ((poss[0], "possible — verify") if poss else (None, "none found"))
    if t:
        title = t.get("title") or ""; pin = t.get("pin"); quoted = " … ".join(t.get("quotedText") or [])[:160]
        links = t.get("links") or {}; ool = links.get("oceanOfLights") or ""; inv = links.get("phelpsInventory") or ""
        v = f"{title}{f' ({pin})' if pin else ''}" + (f" — «{quoted}»" if quoted else "") + (f" — {ool}" if ool else "")
        if not o: v = "Possibly: " + v
    else:
        v, quoted, ool, inv = "", "", "", ""
    # the tablet's author (from its links) against the sheet's Author: a mismatch is either a quotation inside the selection
    # (‘Abdu’l-Bahá citing the Hidden Words) or a wrong match — either way a person decides
    flag = ""
    if t:
        u = " ".join(filter(None, [t.get("url") or "", ool]))
        who = "bh" if "bahaullah" in u else "ab" if ("abdul-baha" in u or "abdulbaha" in u) else None
        want = "bh" if s["Author"].startswith("Bah") else "ab"
        if who and who != want: flag = "REVIEW: tablet is by the other author"
        elif not quoted: flag = "REVIEW: no matching stretch found in the original"
    stats[flag or "ok"] = stats.get(flag or "ok", 0) + 1
    stats[check] = stats.get(check, 0) + 1; stats[conf] = stats.get(conf, 0) + 1
    w.writerow([s["#"], s["Opening Line"], sheet, src.get("title") or "", check, v, conf, flag, quoted, ool, inv, src.get("url") or ""])
print(json.dumps(stats, ensure_ascii=False))
