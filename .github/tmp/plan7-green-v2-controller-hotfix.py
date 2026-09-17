from pathlib import Path

p = Path('/tmp/plan7-green-v2.py')
s = p.read_text()
old = "            | grep '^t$' ''',"
new = "            | grep '^t$'\n''',"
count = s.count(old)
if count != 2:
    raise SystemExit(f'expected two stale workflow grep replacement endings, found {count}')
p.write_text(s.replace(old, new))
