#!/usr/bin/env python3
"""Repository-owned local-first gate; full security checks stay off hosted CI."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(args: list[str], *, version: bool = False) -> str:
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f'{args[0]} failed ({result.returncode}): {detail}')
    return (result.stdout or result.stderr).strip() if version else ''


def main(ci: bool = False) -> int:
    try:
        if not list((ROOT / 'server/src').rglob('*.test.ts')):
            raise RuntimeError('server/src/*.test.ts missing: no unit suite to execute')
        run(['npm', 'test'])
        run(['npm', 'run', 'build'])
        if ci:
            print('check-ci: PASS unit and build')
            return 0
        run(['semgrep', 'scan', '--config', 'p/owasp-top-ten', '--error', '--quiet', '--exclude', 'node_modules', '--exclude', 'dist', '.'])
        run(['gitleaks', 'git', '--no-banner', '--exit-code', '1', '.'])
        run(['npm', 'audit', '--audit-level=high', '--omit=dev'])
        versions = {
            'semgrep': run(['semgrep', '--version'], version=True),
            'gitleaks': run(['gitleaks', 'version'], version=True),
            'npm-audit': run(['npm', '--version'], version=True),
            'bandit': 'not applicable: Node/TypeScript repository',
            'pip-audit': 'not applicable: npm audit used instead',
        }
        commit = run(['git', 'rev-parse', 'HEAD'], version=True)
    except (RuntimeError, OSError) as exc:
        print(f'check: FAIL: {exc}', file=sys.stderr)
        return 1
    receipt = ROOT / '.checks/last_run.json'
    receipt.parent.mkdir(exist_ok=True)
    receipt.write_text(json.dumps({'commit': commit, 'exit_code': 0, 'tool_versions': versions}, sort_keys=True) + '\n')
    print('check: PASS unit, build, Semgrep, gitleaks, npm audit; receipt bound to ' + commit)
    return 0


if __name__ == '__main__':
    sys.exit(main('--ci' in sys.argv[1:]))
