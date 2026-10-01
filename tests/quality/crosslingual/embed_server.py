# Local embedding server for the battery (run with the scratchpad venv: torch + sentence-transformers, Apple MPS).
# POST /embed {"model": "BAAI/bge-m3" | "Qwen/Qwen3-Embedding-0.6B", "texts": [...], "kind": "query"|"document"}
#   → {"vectors": [[...], ...]}  (L2-normalised). Qwen3 queries get its retrieval instruction (per its model card).
import json, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from sentence_transformers import SentenceTransformer

MODELS, LOCK = {}, threading.Lock()
QWEN_QUERY = 'Instruct: Given a passage in English, find the passage in any language (often Arabic or Persian) that it translates or quotes\nQuery: '

def model(name):
    with LOCK:
        if name not in MODELS:
            m = SentenceTransformer(name, device='mps')
            m.max_seq_length = 512      # phrase + ~30 words of neighbours fits easily; avoids 8k-token padding
            MODELS[name] = m.half()     # fp16 on the GPU: ~2× throughput, retrieval quality unchanged in practice
        return MODELS[name]

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        texts = req['texts']
        if 'Qwen3' in req['model'] and req.get('kind') == 'query':
            texts = [QWEN_QUERY + t for t in texts]
        m = model(req['model'])
        with LOCK:
            v = m.encode(texts, batch_size=32, normalize_embeddings=True, convert_to_numpy=True)
        body = json.dumps({'vectors': v.tolist()}).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 7711), H).serve_forever()
