# Phrase (clause) units for Arabic and Persian, read from the languages' OWN markers — not Western punctuation (Chad
# 2026-10-01: "classical Persian and Arabic did not really have sentences, certainly no punctuation… why are we
# requiring that Arabic have western punctuation?"). Editorial punctuation is only supporting evidence.
#   Arabic  — a clause OPENS at و/ف + clause-starter (particle or verb form), ثمّ, إنّ/إنّا, قل, يا/أيّها, oaths
#             (تالله, لعمري, لعمر); a run of the same rhyme ending (saj') CLOSES units.
#   Persian — a clause CLOSES at a verb ending (است, بود, شد, نمود, کرد, فرمود, …ند/…د as last word before an opener);
#             که, تا, چون, اگر, و + verb/particle OPEN the next.
# Units shorter than SHORT words join their neighbour; nothing is ever cut by length.
import re

SHORT = 4
# Folding mirrors api/lib/arabic-script.js foldArabic (the ONE definition): vowels, Qur'anic marks, tatweel, invisible
# controls (ZWNJ, bidi), NFKC presentation forms, letter variants, digits. Decisions only — offsets stay on raw text.
import unicodedata
MARKS = re.compile('[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]')
LETTERS = str.maketrans({'ي': 'ی', 'ى': 'ی', 'ئ': 'ی', 'ې': 'ی', 'ك': 'ک', 'ڪ': 'ک', 'ة': 'ه', 'ۀ': 'ه', 'ە': 'ه', 'أ': 'ا', 'إ': 'ا',
                         'آ': 'ا', 'ٱ': 'ا', 'ٲ': 'ا', 'ٳ': 'ا', 'ؤ': 'و', **{chr(0x660 + i): str(i) for i in range(10)}, **{chr(0x6F0 + i): str(i) for i in range(10)}})
def bare(w): return MARKS.sub('', unicodedata.normalize('NFKC', w)).translate(LETTERS)

FA_WORDS = {'است', 'را', 'که', 'این', 'آن', 'از', 'با', 'بود', 'شود', 'شد', 'نمود', 'نماید', 'نمایند', 'گردد', 'باید', 'هستند', 'هست',
            'میشود', 'میفرمایند', 'فرمودند', 'چه', 'تا', 'شما', 'ایشان', 'اگر', 'نیز', 'بسیار', 'بلکه', 'ولی', 'چون', 'هر', 'کرد', 'دارد',
            'بر', 'میباشد', 'نمیشود', 'خواهد'}
AR_WORDS = {'الذی', 'التی', 'الذین', 'فی', 'علی', 'الی', 'کان', 'هذا', 'هذه', 'قد', 'ثم', 'عن', 'لم', 'لن', 'اذا', 'کل', 'ما', 'لا', 'هو',
            'انه', 'یا', 'به', 'لمن'}
def ar_or_fa(text, label=None):
    """Persian or Arabic for one passage, from grammar words (mirrors arabic-script.js arOrFa)."""
    fa = ar = 0
    for w in re.split(r'[\s،.:؛!؟()«»"]+', bare(text or '')):
        if w in FA_WORDS: fa += 1
        elif w in AR_WORDS: ar += 1
    if fa + ar >= 5: return 'fa' if fa / (fa + ar) >= 0.25 else 'ar'
    if label in ('ar', 'fa'): return label
    return 'fa' if re.search('[پچژگ]', text or '') else 'ar'

AR_PARTICLES = {'قد', 'لا', 'لم', 'لن', 'ان', 'انا', 'انه', 'انها', 'انهم', 'اذا', 'اذ', 'لو', 'ما', 'لما', 'لئن', 'لعل', 'کذلک',
                'هذا', 'هذه', 'هو', 'هی', 'هم', 'انت', 'انتم', 'نحن', 'من', 'الذی', 'الذین', 'کان', 'کانت', 'لیس', 'سوف', 'کم', 'هل', 'ا'}
AR_OPENERS = {'ثم', 'قل', 'یا', 'ایها', 'تالله', 'لعمری', 'لعمر', 'بلی', 'کلا', 'الا', 'اما', 'فلما', 'ولما', 'اذا', 'طوبی', 'ویل'}
FA_OPENERS = {'که', 'تا', 'چون', 'اگر', 'زیرا', 'ولی', 'ولکن', 'لکن', 'پس', 'باری', 'حال', 'امروز', 'ای', 'یا'}
FA_VERB_END = re.compile(r'(است|اند|شود|امد|امدند|داد|دادند|گفت|گفتند|یافت|گشته|گردند|بود|بودند|شد|شده|شدند|نمود|نمودند|نماید|نمایند|کرد|کردند|کند|کنند|فرمود|فرمودند|فرماید|میشود|میگردد|گشت|گردید|گردد|دارد|دارند|نیست|هست|باشد|باشند|خواهد|ید)$')
AR_VERB = re.compile(r'^(ی|ت|ن)[^\s]{2,6}$')   # imperfect verb shape (yaf'al / taf'al / naf'al)
PRON_SUFFIX = re.compile(r'(ها|هم|هن|کم|کن|نا|ه)$')   # noun + pronoun ("its leaves") — a list item, not a clause

def _verbish(b): return bool(AR_VERB.match(b)) and not PRON_SUFFIX.search(b)

def _is_ar_clause_start(w, nxt):
    b = bare(w)
    if b in AR_OPENERS: return True
    if 'ّ' in w and b in ('ان', 'انا', 'انه', 'انها', 'انهم'): return True      # inna (with shadda), not an/in
    if len(b) > 1 and b[0] in 'وف':                       # wa-/fa- proclitic
        rest = b[1:]
        if rest in AR_PARTICLES or rest in AR_OPENERS or _verbish(rest): return True
    if b in ('و', 'ف') and nxt and (bare(nxt) in AR_PARTICLES or bare(nxt) in AR_OPENERS or _verbish(bare(nxt))): return True
    return False

def _rhyme(w):
    b = bare(w)
    return b[-2:] if len(b) >= 3 else None

# English (and other punctuated languages): a clause ENDS at . ! ? ; : and at a comma that is followed by a clause
# opener (coordinating/subordinating conjunction or relative). The language's own punctuation, not length.
EN_OPENERS = {'and', 'but', 'or', 'nor', 'for', 'yet', 'so', 'that', 'which', 'who', 'whom', 'whose', 'while',
              'whereas', 'although', 'though', 'because', 'if', 'when', 'whereby', 'wherein', 'lest', 'until',
              'unless', 'since', 'as', 'even', 'inasmuch', 'whilst', 'whereupon', 'wherefore'}

def phrases_en(text):
    words = re.sub(r'⁅/?s\d+⁆|<!--.*?-->|<pb[^>]*/>', ' ', text or '').split()
    units, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1].lower().strip('"“‘(') if i + 1 < len(words) else None
        if re.search(r'[.!?;:]["”’)]*$', w) or (w.endswith(',') and nxt in EN_OPENERS):
            units.append(cur); cur = []
    if cur: units.append(cur)
    out = []
    for u in units:
        if out and len(u) < SHORT: out[-1] = out[-1] + u
        else: out.append(u)
    if len(out) > 1 and len(out[0]) < SHORT: out[1] = out[0] + out[1]; out = out[1:]
    return [' '.join(u) for u in out]

def phrases(text, lang='ar'):
    if lang not in ('ar', 'fa'): return phrases_en(text)
    lang = ar_or_fa(text, lang)          # per paragraph, from its grammar — not the document label
    words = re.sub(r'⁅/?s\d+⁆|<!--.*?-->|<pb[^>]*/>', ' ', text or '').split()
    if not words: return []
    units, cur = [], []
    for i, w in enumerate(words):
        nxt = words[i + 1] if i + 1 < len(words) else None
        start = False
        if cur:
            if lang == 'fa':
                b = bare(w)
                lb = bare(cur[-1]).rstrip('*')
                after_verb = bool(FA_VERB_END.search(lb) and not lb.startswith('ال') and len(cur) >= SHORT)   # ال…: Arabic noun
                start = b in FA_OPENERS or after_verb or (b == 'و' and nxt is not None and (FA_VERB_END.search(bare(cur[-1])) is not None))
                start = start or _is_ar_clause_start(w, nxt)      # Persian texts quote Arabic
            else:
                start = _is_ar_clause_start(w, nxt)
            if re.search(r'[.!?؟؛*]$', cur[-1]): start = True      # editorial punctuation: supporting evidence
        if start:
            units.append(cur); cur = []
        cur.append(w)
    if cur: units.append(cur)
    # saj': a unit whose last word rhymes with the previous unit's last word is a closed unit — keep; join short ones
    out = []
    for u in units:
        if out and len(u) < SHORT and not (_rhyme(u[-1]) and _rhyme(u[-1]) == _rhyme(out[-1][-1])):
            out[-1] = out[-1] + u
        else:
            out.append(u)
    if len(out) > 1 and len(out[0]) < SHORT: out[1] = out[0] + out[1]; out = out[1:]
    return [' '.join(u) for u in out]

def anchored(units, i, ctx_words=30):
    """Embedding text for unit i: the phrase with its neighbouring phrases, up to ~ctx_words — context for the vector,
    while the hit still returns phrase i."""
    left, right, n = i, i, len(units[i].split())
    while n < ctx_words and (left > 0 or right < len(units) - 1):
        if right < len(units) - 1: right += 1; n += len(units[right].split())
        if n < ctx_words and left > 0: left -= 1; n += len(units[left].split())
    return ' '.join(units[left:right + 1])
