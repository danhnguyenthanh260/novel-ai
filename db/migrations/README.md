# Migration Policy

Active migrations live directly in this directory.

Fresh personal-project databases apply files in filename order. Local Docker
startup does this through the `db-migrate` service in `infra/docker-compose.yml`.
For non-Docker local setup, run the same active replay manually:

```powershell
Get-ChildItem db/migrations/*.sql |
  Sort-Object Name |
  ForEach-Object { psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f $_.FullName }
```

`000_baseline_20260502.sql` is the current schema baseline. Historical migrations before the baseline are archived under `archive/pre_baseline_20260502/` for reference only and are not part of the active replay path.

Future migrations should be added next to the baseline with names that sort after it.

Do not include `archive/pre_baseline_20260502/` in fresh setup commands. Those
files preserve schema provenance only; they are not active migrations.
