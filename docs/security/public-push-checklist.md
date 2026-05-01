# Public Push Checklist

Use this checklist before pushing changes to the public repository.

## Required Checks

- [ ] Review `git status --short` and confirm every staged file is intentional.
- [ ] Confirm local runtime state is not staged: `.runtime/`, `*.pid`, `*.lock`.
- [ ] Confirm real environment files are not staged: `.env`, `.env.*`.
- [ ] Confirm examples use dummy or local-only values only.
- [ ] Run the tracked-file high-risk secret scan below.
- [ ] Run the tracked-file DSN review below.
- [ ] Review any findings before pushing.

## Tracked-File High-Risk Secret Scan

Run from the repository root through WSL:

```bash
git grep -n -I -E '(AKIA[0-9A-Z]{16}|-----BEGIN (RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})' -- ':(exclude)docs/security/public-push-checklist.md'
```

Expected result:

- Exit `1` with no output means no matches.
- Any output must be reviewed before pushing.

## Tracked-File DSN Review

Run from the repository root through WSL:

```bash
git grep -n -I -E 'postgres(ql)?://|mongodb(\+srv)?://|mysql://|redis://' -- ':(exclude)docs/security/public-push-checklist.md'
```

Expected result:

- Local development PostgreSQL defaults are allowed when they match the local-only defaults below.
- Production DSNs, cloud database URLs, Redis URLs, MongoDB URLs, MySQL URLs, or credentials for non-local services must block the push until removed or rotated.

## Local-Only Defaults

These values may appear in examples or local scripts only when clearly documented as local development defaults:

- PostgreSQL on `localhost:5433`
- User `novel`
- Database `novel`
- Dummy password values such as `novelpass`

Do not commit production DSNs, cloud database URLs, API keys, cookies, tokens, private keys, or real user credentials.

## Runtime Artifacts

Runtime artifacts are machine-local state and must not be tracked:

- `.runtime/`
- `services/**/.runtime/`
- `*.pid`
- `*.lock`

If a runtime file is already tracked, remove it from Git with:

```bash
git rm --cached <path>
```

Do not delete active local runtime files unless the owning process has been stopped or the user explicitly asks for cleanup.
