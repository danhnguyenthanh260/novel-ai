# Migration Policy

Active migrations live directly in this directory.

Fresh personal-project databases apply files in filename order:

```powershell
Get-ChildItem db/migrations/*.sql |
  Sort-Object Name |
  ForEach-Object { psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f $_.FullName }
```

`000_baseline_20260502.sql` is the current schema baseline. Historical migrations before the baseline are archived under `archive/pre_baseline_20260502/` for reference only and are not part of the active replay path.

Future migrations should be added next to the baseline with names that sort after it.
