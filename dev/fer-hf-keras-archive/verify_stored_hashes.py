"""Read back the Hub's OWN stored hash for each archived .keras file and compare
to the local SHA-256. Proves what is STORED, not merely what was sent.

Tries metadata first (LFS sha256 / Xet). Falls back to downloading the stored
bytes and hashing them locally — the definitive end-to-end check.
"""

from __future__ import annotations
import hashlib, os
from huggingface_hub import HfApi, hf_hub_download, get_hf_file_metadata, hf_hub_url

REPO_ID = "mykkularathne/maternalink-fer-keras-archive"
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "ml", "fer", "models"))

FILES = {
    "fer_mobilenetv2_finetuned_96.keras": "226467016084be4df6f38fe8e756233062f7d7a5cdc567e39d2788b6a02cdc2f",
    "fer_mobilenetv2_finetuned_96_calibrated.keras": "f6182a630a0e93c375354cad08bbb2baf3eb903d1da3b1ff7ef581e4f0bd993a",
    "fer_mobilenetv2_frozen_96.keras": "8275774ff51eb230430a0c5d59bdd91b7c9b5307827e301dc928522283058513",
}


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for c in iter(lambda: fh.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


api = HfApi()
info = api.repo_info(repo_id=REPO_ID, repo_type="model", files_metadata=True)
print("repo private:", info.private)
print("repo files  :", sorted(f.rfilename for f in info.siblings))
meta = {s.rfilename: s for s in info.siblings}

print()
rows = []
for name, local in FILES.items():
    s = meta.get(name)
    stored = None
    if s is not None and getattr(s, "lfs", None):
        stored = s.lfs.get("sha256")
    if not stored:
        # download the stored bytes and hash them (definitive)
        path = hf_hub_download(repo_id=REPO_ID, repo_type="model", filename=name,
                               local_dir=os.path.join(HERE, "_verify_dl"))
        stored = sha256_file(path)
    match = (stored == local)
    rows.append((name, local, stored, match))

w = max(len(n) for n in FILES)
print(f"{'file':<{w}}  {'local sha256':<64}  {'hub-stored sha256':<64}  MATCH")
allok = True
for n, l, h, m in rows:
    allok &= m
    print(f"{n:<{w}}  {l:<64}  {h:<64}  {'YES' if m else 'NO'}")

print()
print("RESULT:", "PASS - all three stored hashes == local" if allok else "FAIL")
