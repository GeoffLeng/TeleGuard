# AGENTS.md - Project-Scoped Rules for TeleGuard

## Strict Database Safety & Zero-Data-Loss Rule
1. **Zero Dangerous Database Operations**:
   - Never perform destructive SQL queries (`DROP TABLE`, `DELETE FROM`, `TRUNCATE`, `ALTER TABLE DROP COLUMN`) without explicit user permission.
   - Never alter, overwrite, reset, or clear SQLite database files (`teleguard.db`, `drawbot.db`) during code updates or deployments.
2. **Schema Migration Protection**:
   - All database schema updates MUST use non-destructive migration methods (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`).
3. **Data Volume Persistence**:
   - Database files MUST sit in local persistent storage (`./teleguard.db`, `./drawbot.db`).
4. **Strict Zero Real Database / Backup File Commits**:
   - Absolutely NEVER commit, stage, or push any real database files, SQLite databases (`*.db`, `*.sqlite`), runtime journal/cache files (`*-wal`, `*-shm`), SQL dumps (`*.sql`), or database backups to Git.

## Strict Zero AWS / Paid Cloud Service APIs Rule
1. **No AWS API Calls Allowed**:
   - Absolutely NO invocation of AWS APIs or SDKs.
   - Use Node.js built-in `crypto` module and local file storage for all cryptography and asset management.

## Continuous Documentation Sync
1. Whenever a feature is updated, synchronize `tasks/project_feature_checklist.md`.
2. Whenever an important bug is resolved, record into `tasks/project_resolution_log.md`.

## Strict Zero Secrets / API Keys / Bot Tokens Exposure Rule
1. **Strict Secrets Isolation**:
   - Absolutely NEVER commit, stage, or push any `.env`, secret files, API keys, bot tokens, passwords, session tokens (`*.session`), or private credentials to Git.
   - All sensitive files must be strictly maintained in `.gitignore` (`.env*`, `*.session`, `*.key`, `*.pem`).
2. **Zero Real Credentials Generation**:
   - Never write real production tokens/keys into tracked codebase files or templates.
   - All code examples, tests, and documentation must use non-functional placeholder values (e.g., `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).

