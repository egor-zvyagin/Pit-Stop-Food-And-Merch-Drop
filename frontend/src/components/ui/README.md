# UI kit

Shared building blocks for the fan app. Tokens (colours, radii, heights) live in
`src/app/globals.css` and `tailwind.config.ts`; keep the two palettes in sync.

| Piece | File | Use it for |
|---|---|---|
| `Button` | `kit.tsx` | Actions. `tone="primary"` (hi-vis yellow) is for the one next step on a screen; `dark`, `quiet` and `danger` for the rest. |
| `Stepper` | `kit.tsx` | Quantities in the cart and item sheet. |
| `Sheet` | `kit.tsx` | Bottom sheet on phones; centred dialog (`side="bottom"`) or right drawer (`side="right"`) on wide screens. Traps focus and closes on Escape. |
| `Switch` | `kit.tsx` | On/off settings, with an accessible name. |
| `Pill` | `kit.tsx` | Short status labels. Colour carries meaning: go, caution, stop. |
| `Notice` | `kit.tsx` | Errors, warnings and explanations, with an optional action. |
| `money()` | `kit.tsx` | Formats AUD prices. |
| `Icon` | `Icon.tsx` | Old `icon="set:name"` call sites, rendered with bundled lucide icons so they work offline. New code imports from `lucide-react` directly. |

Writing rules: sentence case, plain verbs, no all-caps labels. Buttons say what
happens ("Place order", "Use ticket"). Errors say what went wrong and what to do.
