# Fixture repo

Small synthetic repository used by `repo-architecture-analyzer`'s own test
suite. Not a real project — `src/a.ts` and `src/b.ts` deliberately import
each other to exercise cycle detection, and `src/utils/c.ts` is imported by
both to exercise fan-in. This directory intentionally has no `.git` — git
history analyzer tests build their own ephemeral repos instead (Task 4).
