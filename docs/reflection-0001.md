# Reflection 0001

## What worked

- a dependency-free CLI was enough to prove the graph and docs pipeline
- fixture-based tests caught a route-detection bug immediately
- storing upgrade advisories as data made it easy to add impact scanning

## What broke

- route inference missed `app/page.tsx` because the initial matcher assumed one nested segment
- dependency advisories without source hits are still broad and need better pattern modeling

## What to harden next

- add parser-backed extraction for exports, imports, and JSX usage
- map advisory patterns to line-level code spans with smarter matching
- separate local symbol resolution from external imports
