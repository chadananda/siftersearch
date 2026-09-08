---
id: "0039"
title: Upgrade Astro 5 to 7
state: ready
traces_to: house stack currency
priority: P3
size: M
class: low
lane: maintenance
acceptance:
  - text: astro is on 7.x
    check: "node -e \"const p=require('./package.json');const v=(p.dependencies||{}).astro||(p.devDependencies||{}).astro||'';process.exit(/^\\^?7\\./.test(v)?0:1)\""
  - text: the site builds
    check: "pnpm build"
  - text: tests pass
    check: "pnpm test"
  - text: no visual regression on the pages that matter
---

## Problem
Astro 5, current is 7. Two majors behind.

## Constraints
Maintenance lane: work on a `quality/astro-7` branch, never merge to main
without Chad. Major upgrades carry breaking changes — the acceptance checks
are the gate, and a build that passes but renders wrong is a failure the
checks will not catch, so capture screenshots before and after.

## Wrong if
If this project is pre-launch or its concept is unsettled, upgrading its
framework is effort spent on something that may not ship in this form.
