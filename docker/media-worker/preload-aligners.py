# Bake the whisperx alignment models for the given language codes into HF_HOME (build time only).
import sys, whisperx
for lang in sys.argv[1:]:
    whisperx.load_align_model(language_code=lang, device='cpu')
    print('aligner', lang, 'ok')
