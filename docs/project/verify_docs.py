"""IT22638168 — documentation invariant checks.

Run from anywhere:  python docs/project/verify_docs.py

Checks the mechanical invariants the project depends on. It cannot check approvals,
spike results or measurements — those remain human items in PHASE_1_CLOSURE.md.
"""
import os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
D = os.path.join(ROOT, "docs")
ARCHIVE = os.path.join(D, "archive")

md = []
for dp, _, fs in os.walk(ROOT):
    for f in fs:
        if f.endswith(".md"):
            md.append(os.path.join(dp, f))
active = [p for p in md if not p.startswith(ARCHIVE)]

fail = 0

# 1. No generated citation artifacts (private-use-area characters).
pua = re.compile("[-]")
hits = [os.path.relpath(p, ROOT) for p in md if pua.search(open(p, encoding="utf-8").read())]
print(f"[{'FAIL' if hits else 'PASS'}] no citation artifacts: {hits or 'clean'}")
fail += bool(hits)

# 2. Mood spec Part A carries no numeric threshold/weight/accuracy.
spec = os.path.join(D, "system", "MOOD_STATE_SPEC.md")
text = open(spec, encoding="utf-8").read()
partA = text.split("# PART B")[0]
nums = [n for n in re.findall(r"(?<![\w§.])\d+\.\d+|\d+\s?%", partA) if n not in ("0.0", "1.0")]
print(f"[{'FAIL' if nums else 'PASS'}] mood spec Part A free of values: {nums or 'clean'}")
fail += bool(nums)

# 3. Every parameter symbol present and still TBD.
reg = text.split("## B1")[1].split("## B2")[0]
syms = ["τ_face_min", "τ_text_min", "τ_fusion_min", "τ_distress", "W_face", "W_text", "N_smooth"]
missing = [s for s in syms if s not in reg]
rows = [l for l in reg.splitlines() if l.strip().startswith("| `")]
untbd = [l.split("|")[1].strip() for l in rows if "**TBD**" not in l]
print(f"[{'FAIL' if missing or untbd else 'PASS'}] parameter register: "
      f"missing={missing or 'none'} non-TBD={untbd or 'none'}")
fail += bool(missing or untbd)

# 4. Behavioural fusion absent from the ACTIVE SPECIFICATIONS.
# Scope note: research mirrors (literature review, proposal) legitimately discuss and cite
# the keystroke/response-delay literature — that discussion is the evidence base for the
# exclusion decision, and the decision memo necessarily summarises it. The invariant is
# "no specification reintroduces behavioural fusion", not "no document says keystroke".
MIRRORS = {"LITERATURE_REVIEW.md", "PROPOSAL.md", "BEHAVIOURAL_SIGNAL_DECISION.md",
           "PROPOSAL_CHANGE_LOG.md", "RESEARCH_GAPS.md", "EXISTING_SYSTEMS.md"}
ALLOW = ("not", "never", "remov", "exclud", "telemetry", "ablation",
         "optional", "behavioural", "behaviour", "cannot", "no ", "superseded")
bad = []
for p in [x for x in active if os.path.basename(x) not in MIRRORS]:
    flat = re.sub(r"\s+", " ", open(p, encoding="utf-8").read().lower())
    for kw in ("typing speed", "response delay", "keystroke"):
        for m in re.finditer(re.escape(kw), flat):
            s = flat.rfind(".", 0, m.start()) + 1
            e = flat.find(".", m.end())
            sent = flat[s: e if e != -1 else len(flat)]
            if not any(w in sent for w in ALLOW):
                bad.append((os.path.basename(p), kw, sent.strip()[:80]))
print(f"[{'FAIL' if bad else 'PASS'}] behavioural fusion absent: {bad or 'clean'}")
fail += bool(bad)

# 5. Required documents exist.
expect = [
    "README.md",
    "docs/README.md", "docs/archive/README.md",
    "docs/project/PROJECT_CONTROL.md", "docs/project/BUILD_PLAN.md",
    "docs/project/REQUIREMENTS.md", "docs/project/PHASE_1_CLOSURE.md",
    "docs/project/DOCUMENT_REGISTER.md",
    "docs/system/SYSTEM_DESIGN.md", "docs/system/MOOD_STATE_SPEC.md",
    "docs/system/SAFETY_POLICY.md", "docs/system/PERFORMANCE_BENCHMARK_PLAN.md",
    "docs/decisions/TEXT_MODEL_PLACEMENT_DECISION.md",
    "docs/decisions/LOCAL_STORAGE_DECISION.md",
    "docs/research/LITERATURE_REVIEW.md",
    "ml/README.md", "ml/fer/README.md", "ml/sentiment/README.md",
    "dev/README.md", "experiments/README.md",
]
gone = [e for e in expect if not os.path.exists(os.path.join(ROOT, e.replace("/", os.sep)))]
print(f"[{'FAIL' if gone else 'PASS'}] required documents present: {gone or f'all {len(expect)}'}")
fail += bool(gone)

# 6. Benchmark plan free of measured values (the quoted Proposal target is permitted).
bp = open(os.path.join(D, "system", "PERFORMANCE_BENCHMARK_PLAN.md"), encoding="utf-8").read()
lines = [l for l in bp.splitlines() if "Proposal §5.3" not in l]
ms = re.findall(r"\d+\s?(?:ms|MB|seconds?)\b", "\n".join(lines))
print(f"[{'FAIL' if ms else 'PASS'}] benchmark plan free of values: {ms or 'clean'}")
fail += bool(ms)

# 7. No references to the pre-2026-08-19 folder structure outside the archive.
# Match old *paths* (folder followed by a separator), not archived filenames that merely
# contain the old folder name, e.g. `00_PROJECT_CONTROL_README.md` in docs/archive/.
OLD = re.compile(r"(00_PROJECT_CONTROL|01_PROPOSAL|02_LITERATURE_REVIEW|03_SYSTEM_DESIGN"
                 r"|99_ARCHIVE|04_DATA|05_ML_MODELS|06_MOBILE_APP|07_BACKEND|08_INTEGRATION"
                 r"|09_RESEARCH_EXPERIMENTS|10_TESTING|11_FINAL_DOCUMENTATION)/")
stale = []
for p in active:
    for i, line in enumerate(open(p, encoding="utf-8").read().splitlines(), 1):
        if OLD.search(line):
            stale.append(f"{os.path.relpath(p, ROOT)}:{i}")
print(f"[{'FAIL' if stale else 'PASS'}] no stale folder refs: {stale or 'clean'}")
fail += bool(stale)

# 8. Every main folder has a README.
mains = ["docs", "ml", "dev", "experiments", "ml/fer", "ml/sentiment", "docs/archive"]
noreadme = [m for m in mains
            if not os.path.exists(os.path.join(ROOT, m.replace("/", os.sep), "README.md"))]
print(f"[{'FAIL' if noreadme else 'PASS'}] folder READMEs: {noreadme or 'all present'}")
fail += bool(noreadme)

# 9. Exactly four top-level working folders.
tops = sorted(d for d in os.listdir(ROOT)
              if os.path.isdir(os.path.join(ROOT, d)) and not d.startswith("."))
ok = tops == ["dev", "docs", "experiments", "ml"]
print(f"[{'PASS' if ok else 'FAIL'}] four top-level folders: {tops}")
fail += (not ok)

print("\nRESULT:", "ALL CHECKS PASSED" if not fail else f"{fail} CHECK(S) FAILED")
sys.exit(1 if fail else 0)
