# Testing

## Running the tests

```bash
pnpm verify
```

This is what CI runs. It checks formatting, lints with warnings as errors, type checks, runs every test, builds both products, and runs the repository checks. Those checks cover the import rules between layers, copied code, test code reaching a product, and the prose rules for tracked text.

To run part of the suite:

```bash
pnpm exec vitest run shared/domain
```

## How the tests are arranged

- **The rules** (`shared/domain`): every rule from the specification has named tests here and nowhere else. Geometry, sight and chain tests include property tests that try thousands of generated cases.
- **Reading Roll20** (`shared/roll20`): tests use synthetic copies of shapes captured from a real game, with invented names and ids. The fixtures live once, in `shared/testing`.
- **Chat protocol** (`shared/protocol`): round trips for every command and message, refusals for every malformed form, and a check that `PROTOCOL.md` still describes every table row.
- **The coordinator** (`shared/application`): whole chains run through in memory test doubles.
- **Port contracts** (`shared/testing/port_contracts.ts`): one suite per kind of port. The in memory double and every real adapter run the same suite, so a double cannot quietly differ from the real thing.
- **The Mod** (`products/roll20-mod/test`): every adapter runs against a stand in for the Roll20 sandbox, and the bundle harness builds the real `fusion20.js` and runs a chain in a context that holds only the Mod globals.
- **The extension** (`products/browser-extension/test`): the manifest, the bridge envelope, posting through the chat box and the overlay's prompts, all without a browser.

Products test translation only. No product test checks a rule.

## Mutation testing

Each phase is checked by breaking the code on purpose, one change at a time on a throwaway copy, and confirming a test fails for each break. A break no test notices either gets a new test or is shown to change nothing. The results are recorded per phase in the project's working notes.

## In a real game

Some things only a real game shows. Before the Mod is called finished, the author runs these in a Roll20 Pro game:

1. A chain with lighting on, and one with it off.
2. A chain of four participants.
3. Two chains open at once.
4. A chain ended by the turn order moving on.
5. A chain ended by the GM.
6. A roll from a character with two tokens on the page.

Also worth seeing: the target button's click to pick, line breaks in the whispers, and `!fusion20 range`.
