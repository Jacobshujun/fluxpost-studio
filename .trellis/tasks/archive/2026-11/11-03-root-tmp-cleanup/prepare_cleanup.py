"""One-off local recovery archive; does not delete anything or call providers."""

import datetime
import hashlib
import json
import pathlib
import re
import urllib.request
import zipfile

root = pathlib.Path(__file__).resolve().parents[3]
assert (root / 'AGENTS.md').is_file()
out = root / 'test-artifacts' / 'tmp-cleanup-20261103'
out.mkdir(parents=True, exist_ok=False)
cutoff = datetime.datetime(2026, 10, 27)
keep = re.compile(
    r'^\.tmp-(?:oss|tos|storage|migration|trial|video|layer|gemini|qwen|text)(?:[-.]|$)',
    re.I,
)
entries = sorted(root.glob('.tmp-*'))
selected, retained, members = [], [], []
for item in entries:
    if keep.match(item.name) or datetime.datetime.fromtimestamp(item.stat().st_mtime) >= cutoff:
        retained.append(item.name)
        continue
    assert item.resolve().parent == root and item.name.startswith('.tmp-')
    descendants = list(item.rglob('*')) if item.is_dir() else []
    for candidate in [item, *descendants]:
        assert not candidate.is_symlink()
        assert not (getattr(candidate.lstat(), 'st_file_attributes', 0) & 0x400)
    files = [p for p in descendants if p.is_file()] if item.is_dir() else [item]
    selected.append({
        'name': item.name,
        'directory': item.is_dir(),
        'bytes': sum(p.stat().st_size for p in files),
        'fileCount': len(files),
    })
    for candidate in files:
        parts = candidate.relative_to(item).parts if item.is_dir() else ()
        if any(x in ('node_modules', '.next', '__pycache__') for x in parts):
            continue
        if candidate.name.endswith('.tsbuildinfo'):
            continue
        members.append(candidate)

archive = out / 'recovery.zip'
digests = {}
with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
    for candidate in members:
        name = candidate.relative_to(root).as_posix()
        content = candidate.read_bytes()
        digests[name] = hashlib.sha256(content).hexdigest()
        zipped.writestr(name, content)
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None
    for name, digest in digests.items():
        assert hashlib.sha256(zipped.read(name)).hexdigest() == digest
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest

with urllib.request.urlopen('http://127.0.0.1:3001/api/version', timeout=15) as response:
    version = json.load(response)
manifest = {
    'root': str(root),
    'archive': str(archive),
    'archiveSHA256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'archiveBytes': archive.stat().st_size,
    'selected': selected,
    'retained': retained,
    'digests': digests,
    'versionBefore': version,
    'beforeRootItems': len(entries),
}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps({
    'selectedRootItems': len(selected),
    'retainedRootItems': len(retained),
    'selectedMiB': round(sum(item['bytes'] for item in selected) / 1048576, 2),
    'archivedFiles': len(members),
    'archiveMiB': round(archive.stat().st_size / 1048576, 2),
    'selectedDirectories': [item['name'] for item in selected if item['directory']],
}, indent=2))
