# Phase 2 bundle report

Before: fresh build of `2b1c9e9`. After: fresh build of `current tree`. Sizes in bytes.

| Figure | Before | After | Before gzip | After gzip | Growth | Ceiling |
|---|---|---|---|---|---|---|
| Main bundle | 548766 | 598063 | 155641 | 168834 | 8.98% | within 10% |
| Largest route | 548766 | 598063 | 155641 | 168834 | 8.98% | within 10% |
| Illustration set (20 files, reported separately) | 0 | 5030 | 0 | 3440 | n/a | no ceiling |

Illustration set: 5030 bytes after (0 before). It is lazy-loaded per image and is not counted in the main or largest route figures.

The app has no route-level code splitting, so the main bundle and the largest route are the same entry chunk.

Result: both within the 10% ceiling.
