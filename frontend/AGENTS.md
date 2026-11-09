# Project rules

- Every backend call goes through `src/services` (`AppServices` contract in `types.ts`); screens never call storage/APIs directly — keeps the backend swappable.
- `src/services/mock.ts` is the in-memory implementation with all business rules and is covered by `mock.test.ts`; a real backend must implement the same interface.
- Dates are stored as ISO UTC and shown in Colombia time via `src/lib/datetime.ts` — single source of time-zone logic.

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
