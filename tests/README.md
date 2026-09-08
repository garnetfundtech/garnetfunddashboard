# Acceptance checks

`acceptance.ts` is Section 10 of the Wave 1 specification written as executable
assertions — the checklist Cooper accepts the build against. Every check is a
sentence from that list, and it runs against the shipped modules through the
`@/` alias rather than against copies.

```bash
npm run test:acceptance
```

Boundary conventions are the point of most of it: whether a cap is breached
*at* the limit or only above it, whether a band is inclusive at both ends, and
whether an unset limit scores or declines to. Those are the decisions easiest
to get quietly wrong in a refactor, and each one traces to an IPS clause.

Not covered here, because they need a live broker account rather than fixtures:
a stop order actually resting at Schwab, and a stop that has actually filled.
