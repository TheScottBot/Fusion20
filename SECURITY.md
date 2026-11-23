# Security

## Reporting a problem

Please report a security problem privately through the Security tab of this repository on GitHub, rather than in a public issue. Include what you did, what happened, and which product and version you used.

## What Fusion20 trusts, and what it doesn't

Fusion20 runs inside Roll20 games, where anyone at the table can type anything into chat and edit their own characters. It treats all of this as untrusted:

- **Chat messages.** Rolls, commands and announcements are read through bounded parsers built from one table each. Anything longer than the longest legal form, or that doesn't match, is refused before it is acted on.
- **Roll20 objects.** Token names, character names and attributes are read as text and never run. Names are written into chat as character references, so a name can't become a button, a command, a sheet lookup or a roll.
- **The extension's page messages.** Messages between the page and the extension carry a version, exact fields and a size limit, and anything else is refused.

## Who may do what

Every command that changes a chain is checked against Roll20's own control settings:

- **Pick a target, nominate a partner or end a chain:** a player who controls the chain's current nominator, or the GM.
- **Set a character's range:** a player who controls that character, or the GM.
- **Say which token made a roll:** the player who posted the roll, or the GM.

A roll counts only for a character its poster controls, so naming someone else's character in chat doesn't start a chain for them. A roll whispered to the GM is announced to the GM alone.

## What each product can reach

- **The Roll20 Mod** runs in Roll20's sandbox. It reads the campaign's tokens, characters, pages and turn order, writes only the `fusion20_range` attribute when asked, and posts to the game's chat. It makes no network requests and keeps chains in memory only.
- **The browser extension** runs only on the Roll20 editor. It asks for no browser permissions, makes no network requests, loads no remote code and stores nothing beyond per browser settings. It collects no personal data.

## Known limits

- The extension's page side shares its window with Roll20's own scripts, so it can check the shape of a message but cannot prove which script sent it.
- Whispers are addressed by display name, as Roll20 does it. A character named exactly like another player might receive that player's prompts. Every command is still checked against control settings, so this could reveal a prompt but not hand over a chain.
- Announcements use token names, so a name the GM has hidden from players still appears in them.

## Accepted risks

To be written in the maintainer's own words before release. Two topics belong here:

- The browser extension reads Roll20's internal page state, which Roll20 doesn't document and can change without notice, so it can break at any time.
- Roll20's terms of service don't mention browser extensions, and the position taken on reading the client's internals.
