"""Stage offline NLTK assets as private container-owned files, then verify them."""
import os, shutil, tempfile


def prepare(source='/opt/models/nltk_data'):
    # NLTK rejects bind mounts owned by a different uid, even when read-only.
    # A private copy keeps that trust check intact without altering host permissions.
    root = tempfile.mkdtemp(prefix='sifter-nltk-', dir='/root' if os.path.isdir('/root') and os.access('/root', os.W_OK) else None)
    target = os.path.join(root, 'data')
    shutil.copytree(source, target)
    os.environ['NLTK_DATA'] = target
    import nltk
    nltk.data.path.insert(0, target)
    nltk.sent_tokenize('Dependency check. English sentence splitting works.', language='english')
    return target
