#!/usr/bin/env python3
"""Restore OceanLibrary books that the Feb-2026 MD export carried but the conversion dropped (2026-10-08).

The conversion (Ocean2.0 Supplemental/ocean-library-markdown: remove-junk.js + reorganize.js) deleted the editor folders
_Alexandra_test / _Aliona_Remez_test wholesale, taking 40 published books with the real tests, and two over-broad rules
took 2 more. This copies exactly those books (planning/ocean-export-missing-20261008.csv, rows with a zip_path) from the
zip into -sites/oceanlibrary.com, placed and stamped the way the conversion placed the books it kept: collection books
under their collection folder (reorganize.js COLLECTION_NAME_MAP), others as <religion>/<author>/<title>.md, a lone book
flattened to <religion>/<author>, <title>.md (flatten-singles.js), and source_url = https://oceanlibrary.com/<slug>
(add-source-url.js). Blocks are renumbered as the conversion did: `{… id="bl30" …}` → `{… id="para_9" ilm_id="bl30" …}`,
para_N counting every attribute block in order (checked: reproduces the kept Peace.md byte for byte). para_N is the
site's own paragraph id and <bookid>-<ilm_id> its data-ilmid, the two halves of an OceanLibrary range link.
Never overwrites. Dry run unless --apply.
    python3 scripts/sites/restore-from-ol-zip.py <zip> [--apply]
"""
import csv, os, re, sys, unicodedata, zipfile

ZIP = sys.argv[1]
APPLY = '--apply' in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITES = os.path.expanduser('~/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library/-sites/oceanlibrary.com')
COLLECTIONS = {
    '076cdb817d5f0e7b7f0a2ccaae745935': 'Research Department Compilations', '4dbc02ab4fcf3c8608115bdf96ca6a11': 'The Bible (KJV)',
    '15bfd1ba2454eaf5318f7bdedc88d779': 'Deuterocanonical Books', '5094b0ebb62648ca6eece8fdcad0dce4': 'Mormon Texts',
    'f113b356e0100619b4261dfd6d9d9116': 'The Quran (Rodwell)', '01709f9831ef22e92bbb2a3559775f7b': 'The Tanakh (JPS 1917)',
    '3a46b824c4e05c6752b2feba386bb1dc': 'Hadith Collections', '172bb702782e8bf084624212b0e01e16': 'The Upanishads',
    '6c2e5afe32db171ef93b5b701d0cadab': 'Rig Veda', '2629bcc94f698c4d89bbc029babb6bb2': 'The Mahabharata',
    '3a10175837ffa565573aab044c4b2345': 'Khorda Avesta', '312f73e112125a37ef6d10145786001d': 'Avesta',
    '49c0b5d9fa3d118a79036db7d557914b': 'The Gospels (Greek-titled)',
}
fm = lambda h, k: (re.search(rf'^{k}:\s*(.*)$', h, re.M) or [None, ''])[1].strip().strip("'\"")
# fold apostrophes BEFORE dropping non-ASCII: 'Bahá’í' and "Bahá'í" are one folder (the curly one was lost, 10-08)
fold = lambda s: unicodedata.normalize('NFD', s.replace('’', "'")).encode('ascii', 'ignore').decode().lower()
ATTR = re.compile(r'(\{[^{}\n]*?)\bid="([^"]+)"(?=[^{}\n]*\})')
def renumber(md):
    n = 0
    def sub(m):
        nonlocal n; n += 1
        return f'{m.group(1)}id="para_{n}" ilm_id="{m.group(2)}"'
    return (md if 'ilm_id="' in md else ATTR.sub(sub, md)), n
def sanitize(s):
    s = re.sub(r'\s+', ' ', (s or 'Unknown').strip())
    s = re.sub(r'[<>:"|?*]', '', s).replace('/', '-').replace('\\', '-')
    return s.rstrip('.').strip()
religions = {fold(d): d for d in os.listdir(SITES) if os.path.isdir(os.path.join(SITES, d))}

z = zipfile.ZipFile(ZIP)
rows = [r for r in csv.DictReader(open(os.path.join(ROOT, 'planning', 'ocean-export-missing-20261008.csv'))) if r['zip_path']]
plan = []
for r in rows:
    raw = z.read(r['zip_path']).decode('utf-8')
    head = raw[:6000]
    religion = religions.get(fold(sanitize(fm(head, 'ocean_category'))), sanitize(fm(head, 'ocean_category')))
    title, author, cid, num = sanitize(fm(head, 'title')), sanitize(fm(head, 'author')), fm(head, 'collection_id'), fm(head, 'display_number')
    if cid in COLLECTIONS:
        dest = os.path.join(SITES, religion, COLLECTIONS[cid], f"{num + '-' if num else ''}{title}.md")
    else:
        author_dir = os.path.join(SITES, religion, author)
        dest = os.path.join(author_dir, f'{title}.md') if os.path.isdir(author_dir) else os.path.join(SITES, religion, f'{author}, {title}.md')
    slug = fm(head, 'slug')
    if slug and not re.search(r'^source_url:', head, re.M):
        raw = raw.replace('\n---\n', f"\nsource_url: 'https://oceanlibrary.com/{slug}'\n---\n", 1) if raw.startswith('---\n') else raw
    raw, blocks = renumber(raw)
    if raw.startswith('---\n') and not re.search(r'^para_count:', head, re.M):
        raw = raw.replace('\n---\n', f'\npublished: true\npara_count: {blocks}\n---\n', 1)
    plan.append((dest, raw, r['oceanlibrary_url']))

clash = [d for d, _, _ in plan if os.path.exists(d)]
for dest, _, url in plan: print(('EXISTS ' if os.path.exists(dest) else 'new    ') + os.path.relpath(dest, SITES), ' ←', url)
print(f'\n{len(plan)} books · {len(clash)} destinations already exist (skipped)')
if APPLY:
    n = 0
    for dest, raw, _ in plan:
        if os.path.exists(dest): continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, 'w', encoding='utf-8').write(raw); n += 1
    print(f'wrote {n}')
