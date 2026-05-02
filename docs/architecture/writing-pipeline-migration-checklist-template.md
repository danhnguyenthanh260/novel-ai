# Writing Pipeline Migration Checklist Template

Use this template for every writing surface classified as `merge`, `compatibility-only`, `deprecate`, or `delete` in `writing-pipeline-canonical-map.md`.

## Header

```text
Source path:
Current owner:
Implementation owner:
Classification label:
Canonical replacement path:
Decision issue:
Removal/review date:
Maintainer sign-off:
```

## Usage Evidence

```text
Route or task call-site search:
UI entry-point search:
Worker/task enqueue source:
Database persistence dependency:
Runtime/manual usage note:
```

## Migration Requirements

```text
Data migration required: yes/no
Data migration details:
API compatibility required: yes/no
UI compatibility required: yes/no
Backward compatibility window:
```

## Rollout Plan

```text
1. Add canonical replacement or adapter.
2. Route new feature work to canonical path.
3. Keep old path compatibility-only if required.
4. Add enforcement marker or follow-up gate.
5. Remove or archive old path after review date.
```

## Rollback Plan

```text
Rollback trigger:
Rollback action:
Data rollback requirement:
Owner to approve rollback:
```

## Verification Gates

```text
- [ ] Existing supported user flow still works.
- [ ] New canonical flow works.
- [ ] No new writes occur through deprecated path.
- [ ] Data written by old path is readable by canonical path or migration adapter.
- [ ] Logs/metrics identify old-path usage during compatibility window.
- [ ] Follow-up deletion issue exists if final removal is not done in this task.
```

## Notes

```text
Implementation notes:
Known unknowns:
Reviewer focus:
```
