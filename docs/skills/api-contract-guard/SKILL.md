---
name: api-contract-guard
description: >
  Flag breaking changes to public HTTP routes — renamed paths or params, new
  required inputs, removed or renamed response fields, changed types or status
  codes — unless the change is versioned or backward compatible.
type: rubric
---

# API contract guard

A route's path, inputs and response shape are a contract with every client
(web app, mobile app, partner integrations, CI scripts). Clients ship on their
own schedule, so a breaking change breaks them in production.

For every changed route handler, compare the old and new side of the diff and
flag each of these as a **CRITICAL** finding unless the route is newly added,
versioned (`/v2/...`) or keeps the old shape working:

1. **Path or param renamed** — `/users/:id` → `/users/:userId` changes the URL
   template and every `req.params.<name>` read; old links and SDK calls 404.
2. **New required input** — a query param, header or body field the handler
   now reads without a default. Old clients don't send it; reading a property of
   the missing value (`include.split(',')`) throws → 500.
3. **Response field removed or renamed** — `email` → `emailAddress`; clients
   read `undefined`.
4. **Type or format changed** — ISO date string → epoch number, number →
   string, object → array, nullable → non-null.
5. **Status code changed** — e.g. `404` → `200` with an empty body, `201` →
   `200`.

For each finding name the client-visible break ("GET /users/:id now 404s",
"`email` is undefined for existing clients") and suggest the compatible path:
keep the old field alongside the new one, give the new input a default, or add
a versioned route and deprecate the old one.

Do not flag purely internal renames (local variables, private helpers) that do
not change what goes over the wire.
