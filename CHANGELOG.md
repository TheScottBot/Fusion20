# Changelog

Changes to each product, newest first. Versions follow semantic versioning once the first release is made. Until then everything is listed under Unreleased.

## Unreleased

### Roll20 Mod

- Reads Beyond20 attack rolls from chat, with D&D Beyond's digital dice on or off, and starts a chain on a qualifying critical.
- Whispers the nominator a button to pick the target on the map, then the eligible partners as buttons and other allies with the reasons they can't join.
- Checks reach in squares and, when the page's lighting is on, sight through walls, doors, windows and light.
- Ends a chain when an attack doesn't crit, nobody eligible is left, the nominator or GM ends it, or the turn moves on.
- Asks which token rolled when a character has more than one on the page.
- Sets a character's attack ranges with `!fusion20 range`.
- Logs a startup line, refused commands and adapter failures to the Mod Output Console.

### Browser extension

- Manifest for the Roll20 editor only, with no permissions.
- The message envelope between the page and the extension, posting through the chat box, and the overlay's prompts. It doesn't run in a game yet.
