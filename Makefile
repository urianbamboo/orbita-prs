.PHONY: setup check check-ci deps-update check-heavy

setup:
	@command -v npm >/dev/null && command -v semgrep >/dev/null && command -v gitleaks >/dev/null

check:
	@python3 tools/check.py

check-ci:
	@python3 tools/check.py --ci

deps-update:
	@python3 tools/deps_update.py

check-heavy:
	@npm test
