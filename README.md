# Fusion20

A fusion critical tracker for D&D 5e on Roll20.

When a player rolls a natural critical, they pick a target and nominate an ally who can legally attack it. That ally gets a free attack, and if it also crits, they nominate the next ally. The chain runs until an attack doesn't crit, nobody eligible is left, or someone ends it. Fusion20 works out who can reach and see the target, and keeps track of the chain.

It reads attack rolls posted by [Beyond20](https://beyond20.here-for-more.info/).

## Status

- **Roll20 Mod:** built and tested against a stand in for the Roll20 sandbox. Not yet tried in a real game, so expect rough edges.
- **Browser extension:** early. The parts that don't depend on how Roll20 holds its data in the page are built. The rest waits on experiments in a real game.

## How it will ship

- **Roll20 Mod:** runs in the game creator's sandbox. Needs a Pro subscription, and players install nothing.
- **Browser extension:** for Chrome and Firefox, for games without Pro. Each player who wants it installs it.

Both are thin layers over one shared core, so the rules live in exactly one place.

## Using the Mod

### What it needs

- A Roll20 Pro subscription for the game's creator, who installs Mods.
- Players rolling attacks with Beyond20 into Roll20, with D&D Beyond's digital dice on or off.
- The D&D 5e 2014 character sheet. The 2024 sheet isn't supported yet.
- A square grid measured in feet. Hex grids and other units are refused, and the Mod log says why.

### Installing

1. Build it, as in Development below, or take a released `fusion20.js`.
2. In the game's settings, open **Mod (API) Scripts**, add a new script, paste in `products/roll20-mod/dist/fusion20.js` and save.
3. The Mod Output Console shows two lines starting `Fusion20`. The first names the version, whether each page has lighting on, the ally marker, and how many player characters have no range set.

### Who counts as an ally

- Any token a player controls, directly or through the character it represents.
- Any other token the GM marks with the green status marker, for allied non player characters. To use a different marker, change `defaultAllyMarker` near the end of the script.

### Setting attack ranges

Each character needs an attribute named `fusion20_range` saying how far its attacks reach, in feet:

```
melee=5,ranged=150,cantrip=120
```

Include only what the character has. `melee` is reach, `ranged` is a weapon's long range, and `cantrip` is an attack cantrip's range. Spaces are fine. A character with no range, or one Fusion20 can't read, is never offered as a partner, and the prompt says why.

Set it on the character sheet's Attributes & Abilities tab, or select the character's token and type:

```
!fusion20 range character=@{selected|character_id} value=melee=10,ranged=60
```

Players can set ranges for characters they control. The GM can set any.

### A chain at the table

1. A player rolls a natural critical with Beyond20. Fusion20 announces it, and whispers that player a **Pick a target** button.
2. They press it and click the target on the map. Fusion20 announces the target and whispers the allies who can reach and see it as buttons, with everyone else listed beside the reason they can't.
3. They press a partner's name. Fusion20 announces the nomination, and the partner makes their attack.
4. If that attack is also a critical, the partner picks the next partner the same way. If not, the chain ends.

Anyone being prompted also gets an **End the chain** button, and the GM can act for anyone. A chain also ends when the turn moves on in the turn tracker. If a character has more than one token on the page, the player who rolled is asked to click the one that made the roll.

Sight is checked only when the page's lighting is on. With it off, Fusion20 checks range alone.

### Things to know

- Fusion20 uses the page the player ribbon is on. Players split onto their own pages aren't followed.
- Announcements use token names. If a monster's name is hidden from players, it still appears in the announcement.
- Chains live in memory, so a sandbox restart ends them all, and says so in the Mod log.
- A roll whispered to the GM is never tracked, so a secret roll is never announced.
- Prompts for a token every player controls go to public chat, since anyone may act for it.
- A one entry turn order never looks like the turn moving on. Sorting the turn order, or removing whoever is on top, does.

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

The chat commands and announcement tags are described in [shared/protocol/PROTOCOL.md](shared/protocol/PROTOCOL.md).

## Development

Needs Node 26.13.0 and pnpm 12.18.0.

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm verify
```

`pnpm verify` runs formatting, linting, type checks, tests, the product builds and the repository checks, which cover import rules, copied code and prose. It's what CI runs. `pnpm build` alone writes the Mod to `products/roll20-mod/dist/fusion20.js`.
