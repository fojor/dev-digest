import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (SCR-01). Thin route entry — the view and its logic
   live in _components/ConventionsView. */
export default function ConventionsPage() {
  return <ConventionsView />;
}
