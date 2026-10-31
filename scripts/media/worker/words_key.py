# wordsKey twin of api/lib/media/words-key.js: sha256 of JSON [[n, lang, [w...]] per paragraph] — timings never change it.
# Both sides must match tests/fixtures/words-key.json (tests/api/media-words-key.test.js runs this file).
import hashlib, json, sys


def _n(v):
    return int(v) if isinstance(v, float) and v.is_integer() else v


def canon(work):
    paras = (work or {}).get('paragraphs') or []
    return json.dumps([[_n(p.get('n')), p.get('lang'), [w.get('w') for w in (p.get('words') or [])]] for p in paras],
                      ensure_ascii=False, separators=(',', ':'))


def words_key(work):
    return hashlib.sha256(canon(work).encode('utf-8')).hexdigest()


def words_key_file(path):
    with open(path, encoding='utf-8') as f:
        return words_key(json.load(f))


if __name__ == '__main__':   # words_key.py <work.json>…  → one key per line
    for p in sys.argv[1:]:
        print(words_key_file(p))
