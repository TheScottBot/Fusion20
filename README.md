# Fusion20

A fusion critical tracker for D&D 5e on Roll20.

When a player rolls a natural critical, they pick a target and nominate an ally who can legally attack it. That ally gets a free attack, and if it also crits, they nominate the next ally. The chain runs until an attack doesn't crit, nobody eligible is left, or someone ends it. Fusion20 works out who can reach and see the target, and keeps track of the chain.

It reads attack rolls posted by [Beyond20](https://beyond20.here-for-more.info/).

## Status

Early and not usable yet. The rules, grid distance and line of sight are built and tested, but neither product exists so far.

## How it will ship

- **Roll20 Mod:** runs in the game creator's sandbox. Needs a Pro subscription, and players install nothing.
- **Browser extension:** for Chrome and Firefox, for games without Pro. Each player who wants it installs it.

Both are thin layers over one shared core, so the rules live in exactly one place.

## Layout

| Path                         | What's there                           |
| ---------------------------- | -------------------------------------- |
| `shared/domain`              | The rules, chains, geometry and sight  |
| `shared/protocol`            | Chat commands and messages             |
| `shared/roll20`              | Turning Roll20 data into domain values |
| `shared/application`         | Ports and the coordinator              |
| `shared/testing`             | Shared test doubles and fixtures       |
| `products/roll20-mod`        | The Mod                                |
| `products/browser-extension` | The extension                          |
| `tools`                      | The build and the repository checks    |

## Development

Needs Node 26.13.0 and pnpm 12.18.0.

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm verify
```

`pnpm verify` runs formatting, linting, type checks, tests, the product builds and the repository checks, which cover import rules, copied code and prose. It's what CI runs.
