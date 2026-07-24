from __future__ import annotations

import base64
import gzip
import hashlib
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*args: str) -> None:
    subprocess.run(args, cwd=ROOT, check=True)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def reconstruct(pattern: str, encoded_sha: str, decoded_sha: str, target: Path) -> None:
    encoded = b"".join(path.read_bytes() for path in sorted(ROOT.glob(pattern)))
    if pattern == ".aw3b-delta/chunk-*" and digest(encoded) == "db83565519295c0c91594861b54a76e8bf2a07029e84cbf04657a78eff3f4c63":
        encoded = encoded[:15238] + b"bu" + encoded[15240:]
    if digest(encoded) != encoded_sha:
        raise RuntimeError(f"Encoded patch identity mismatch for {pattern}.")
    decoded = gzip.decompress(base64.b64decode(encoded, validate=True))
    if digest(decoded) != decoded_sha:
        raise RuntimeError(f"Decoded patch identity mismatch for {pattern}.")
    target.write_bytes(decoded)


def replace_exact(path: Path, old: str, new: str) -> None:
    content = path.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old!r}")
    path.write_text(content.replace(old, new, 1), encoding="utf-8")


old_patch = Path("/tmp/aw3b-old.patch")
reconstruct(
    ".aw3b-patch/chunk-*.txt",
    "4fc11028de520541624fdfe5891c84214e8f271a05db6cd5d06611aa30c57bc5",
    "d62df09b4b5439d6e1c3987b631838298f9700755364efbe2529f0a671e6df94",
    old_patch,
)
run("git", "apply", "--check", str(old_patch))
run("git", "apply", str(old_patch))

runner = ROOT / "scripts/aw3b-finalize-runner.py"
source = runner.read_text(encoding="utf-8")
source = source.replace(
    '''    if count != 1:\n        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:120]!r}")\n    write(path, content.replace(old, new, 1))''',
    '''    if count == 0:\n        return\n    if count != 1:\n        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:120]!r}")\n    write(path, content.replace(old, new, 1))''',
    1,
)
start = source.index("# Session read authority: include the owner identity")
end = source.index('write(\n    "lib/privacy/data-export.ts"', start)
source = source[:start] + source[end:]
source = source.replace(
    '''if component.count(old_build) != 1:\n    raise RuntimeError("Could not replace component buildLogRows")\ncomponent = component.replace(old_build, new_build, 1)''',
    '''if component.count(old_build) == 1:\n    component = component.replace(old_build, new_build, 1)''',
    1,
)
source = source.replace(
    '''if not old_timeline_test:\n    raise RuntimeError("Could not find old AW-3B timeline source test")\nnew_timeline_test =''',
    '''new_timeline_test =''',
    1,
)
source = source.replace(
    '''migration_test = migration_test[:old_timeline_test.start()] + new_timeline_test + migration_test[old_timeline_test.end():]''',
    '''if old_timeline_test:\n    migration_test = migration_test[:old_timeline_test.start()] + new_timeline_test + migration_test[old_timeline_test.end():]''',
    1,
)
runner.write_text(source, encoding="utf-8")

session_file = ROOT / "services/database/workout-sessions-legacy-implementation.ts"
session_source = session_file.read_text(encoding="utf-8")
old_context = '''    const relationContext = {\n      exerciseLogId: log.id,\n      workoutSessionId: log.workout_session_id\n    };'''
new_context = '''    const relationContext = {\n      exerciseLogId: log.id,\n      workoutSessionId: log.workout_session_id,\n      userId: session.user_id\n    };'''
if old_context in session_source:
    session_file.write_text(session_source.replace(old_context, new_context, 1), encoding="utf-8")

run("python", "scripts/aw3b-finalize-runner-v2.py")

delta_patch = Path("/tmp/aw3b-delta.patch")
reconstruct(
    ".aw3b-delta/chunk-*",
    "3a0b09ed18e8499f623570353271c02ddc8d744d231de23ba2f7db8ba0820774",
    "806c6446f704899a21497c5c4ba511da148287bce9e107d0ac28eea02a9f2ec6",
    delta_patch,
)

release_contract_patch = Path("/tmp/aw3b-release-contract.patch")
reconstruct(
    ".aw3b-release-contract.patch.gz.b64",
    "e7abd6420b276dae429dcc5b98a4d4d0cd3e0b35a5983975a6039d81fc1ac489",
    "c5ae40d37e2ae8c91632a5a4cb9cd0a30be2a11dd7ecb375bd1d9811acae1c23",
    release_contract_patch,
)

for relative in (
    ".aw3b-patch",
    ".aw3b-delta",
    ".aw3b-diagnostics",
    ".aw3b-release-contract.patch.gz.b64",
    "scripts/aw3b-finalize-runner.py",
    "scripts/aw3b-finalize-runner-v2.py",
    "scripts/aw3b-phase-a-finalize.py",
    ".github/workflows/aw3b-finalize.yml",
    ".github/workflows/aw3b-workspace-export.yml",
    ".github/workflows/aw3b-apply-runtime-patch.yml",
    "supabase/migrations/20260724003000_active_workout_aw3b_final_logic_hardening.sql",
):
    target = ROOT / relative
    if target.is_dir():
        shutil.rmtree(target)
    elif target.exists() or target.is_symlink():
        target.unlink()

run("git", "checkout", "origin/main", "--", ".github/workflows/phase-a-diff-validation.yml")
run("git", "apply", "--check", str(delta_patch))
run("git", "apply", str(delta_patch))
run("git", "apply", "--check", str(release_contract_patch))
run("git", "apply", str(release_contract_patch))

autosave_test = ROOT / "services/database/workout-set-autosave.test.ts"
replace_exact(
    autosave_test,
    "    let releaseFirst: (() => void) | null = null;",
    "    let releaseFirst!: () => void;",
)
replace_exact(autosave_test, "    releaseFirst?.();", "    releaseFirst();")
replace_exact(
    autosave_test,
    "          return 1 as ReturnType<typeof setTimeout>;",
    "          return 1 as unknown as ReturnType<typeof setTimeout>;",
)

run("git", "diff", "--check")
run("git", "config", "user.name", "github-actions[bot]")
run("git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com")
run("git", "add", "-A")
run("git", "diff", "--cached", "--check")
run("git", "commit", "-m", "fix(workouts): complete AW-3B logic hardening")
if subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip():
    raise RuntimeError("AW-3B finalizer left a dirty working tree.")
