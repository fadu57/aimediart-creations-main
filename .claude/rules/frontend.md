---
paths:
  - "**/*.{tsx,jsx,vue,svelte}"
  - "**/*.{css,scss,sass,less}"
  - "**/*.html"
  - "src/components/**/*"
  - "src/pages/**/*"
  - "src/styles/**/*"
---

# Frontend — avoid "AI slop"

Versioned product constraint (visual identity, a11y, quality), applicable by any
contributor. Not a personal method.

## Principle

Design like an art director: every palette, type, and layout choice must be
justifiable by the product's subject, its audience, and the page's single job.
Take ONE strong aesthetic bet; keep everything else disciplined.

## Forbidden

- Generic default fonts: Inter, Roboto, Arial, neutral Helvetica.
- Purple gradients and "AI neon" accents.
- The three AI-generated design clichés:
  1. cream background (~#F4F1EA) + high-contrast serif + terracotta accent;
  2. near-black background + a single acid-green or vermilion accent;
  3. "broadsheet" layout with hairline rules, zero border-radius, dense columns.
- Reflexive "big number + small label + gradient accent" hero.
- Numbered markers 01/02/03 when the content is not a real sequence.
- Scattered, gratuitous animations.

## Typography

- 2 to 3 fonts with intent: a characterful display face (sparingly), a readable
  complementary body face, and if needed a utility face for data/captions.
- Set a clear type scale (weights, widths, spacing).
- Type carries personality; it is not a neutral delivery vehicle.

## Color

- Coherent palette of 4 to 6 named hex values, derived from the subject.
- Sufficient contrast (accessibility). One accent, not ten.

## Motion

- Animate deliberately, in service of the subject: a load sequence, a
  scroll-triggered reveal, a hover micro-interaction.
- One orchestrated moment beats scattered effects. Respect
  `prefers-reduced-motion`.

## Copy

- Words are design material. Active voice, sentence case, zero filler.
  "Save changes", not "Submit".
- Name things from the user's side (what they control), not the system's.
- An action keeps the same name across the flow ("Publish" button → "Published"
  toast).
- Errors and empty states: explain what happened and how to act; never vague,
  never decorative.

## Quality floor

- Responsive down to mobile.
- Visible keyboard focus.
- Reduced motion respected.
- Controlled CSS specificity: no selectors that cancel each other out.

## Process

1. Draft a small token system (color, type, layout, signature element).
2. Check it against the brief: if any part looks like the generic default,
   revise it and state what changed and why.
3. Only then write code, deriving every color and type choice from the plan.
4. Before shipping, remove ONE superfluous element (the Chanel rule).
