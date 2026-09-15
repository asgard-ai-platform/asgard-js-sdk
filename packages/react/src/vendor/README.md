# Vendored third-party source

## `guacamole-keyboard.js`

- **Upstream**: Apache Guacamole's `guacamole-common-js` keyboard (`Guacamole.Keyboard`), Apache-2.0.
  The license header is intact at the top of the file.
- **Carried verbatim.** It is exempted from ESLint (`packages/react/eslint.config.cjs`) and Prettier
  (`.prettierignore`) so it stays byte-identical to upstream and can be diffed against a newer release.
  Those exemptions cover this one file and nothing else.
- **Types** are hand-written in `guacamole-keyboard.d.ts` — upstream ships none, and the field this
  package most depends on (`modifiers`) is missing from the third-party declarations that do exist.
- **Use it through `./index.ts`**, never by importing the `.js` directly.

Why this is vendored instead of installed from npm, and why we do not hand-roll keysym translation, is
explained at the top of `index.ts`.
