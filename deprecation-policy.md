---
name: deprecation-policy
description: >
  Flag public elements that are removed without a prior deprecation, and check
  that a deprecation is visible to consumers — @deprecated / deprecated: true,
  a replacement, a removal version or date — while the old element keeps working.
type: convention
---

# Deprecation policy

Removal is the last step of a lifecycle, not the first: mark deprecated → keep
it working for at least one release (or the stated sunset period) → remove in a
MAJOR. A silent removal skips the window in which consumers could migrate.

## A correct deprecation has all four parts
1. **Marker the consumer's tooling sees** — `@deprecated` JSDoc on exported
   symbols and types, `deprecated: true` in OpenAPI / route schema,
   `Deprecation` and `Sunset` response headers on HTTP routes, a runtime
   warning for CLI flags and env vars.
2. **Replacement** — what to use instead (`@deprecated use fetchUser()`).
3. **Removal target** — version or date (`removed in v3`, `Sunset: <date>`).
4. **Old behaviour still works** — the deprecated element returns the same data
   as before, not a stub, empty value or 410.

## Flag
1. A public element removed in this PR with no sign it was deprecated before
   (no `@deprecated` / `deprecated: true` on the removed side). Severity follows
   `breaking-change`; this skill adds "deprecate first" as the suggestion.
2. A deprecation missing the replacement or the removal target — WARNING.
3. A "deprecated" element whose behaviour already changed (returns null, empty,
   throws, 410) — that is a removal, report it as CRITICAL.
4. A deprecated element removed in a non-MAJOR release — see `semver-discipline`.
5. New code in the same PR that still calls a deprecated element it could
   migrate off — SUGGESTION.

## Do not flag
- Removal of an element that was deprecated earlier AND whose removal target
  has been reached in this MAJOR release.
- Internal code with no external consumers.

## Example

Bad — the field silently disappears; the comment is not a marker any tool sees:
```ts
export interface User {
  id: number;
  // email removed, use emailAddress
  emailAddress: string;
}
```

Good — marked, with a replacement and a removal target, still populated:
```ts
export interface User {
  id: number;
  emailAddress: string;
  /** @deprecated Use `emailAddress`. Removed in v3.0.0. */
  email: string;
}
// route
reply
  .header('Deprecation', '@1767225600')               // RFC 9745
  .header('Sunset', 'Wed, 01 Jul 2026 00:00:00 GMT')  // RFC 8594
  .header('Link', '</v2/users>; rel="successor-version"');
return { ...user, email: user.emailAddress };
```
