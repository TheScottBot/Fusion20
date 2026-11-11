# Fusion20 chat protocol

Version 1. This is how Fusion20 talks through Roll20 chat: the commands its buttons send, and the tags at the end of its public announcements. The Mod writes both. The browser extension reads the tags, so it can follow a chain the Mod is running, and sends the same commands from its overlay.

The tables in `command_table.ts` and `chain_message_table.ts` are the source of truth. Their parsers and encoders are derived from them, and a test checks that every command and message they hold appears in this document.

Everything here travels through chat, which anyone in a game can write to. A reader treats every command and tag as untrusted. A tag says what Fusion20 announced, not who announced it.

## Identifiers

Chain ids, roll ids, token ids and character ids are all 1 to 32 characters from `A` to `Z`, `a` to `z`, `0` to `9`, `_` and `-`. Roll20's own ids fit. Anything else is refused.

## Commands

A command is one line:

```
!fusion20 <verb> <name>=<value> <name>=<value>
```

Words are separated by single spaces. Arguments may come in any order. Each must appear exactly once, and no others are allowed. The longest legal command sets the length bound, and anything longer is refused before it is read.

| Verb       | Arguments            | What it does                                                                           |
| ---------- | -------------------- | -------------------------------------------------------------------------------------- |
| `target`   | `chain`, `token`     | Picks the target of a chain waiting for one                                            |
| `nominate` | `chain`, `partner`   | Nominates a partner for a chain waiting for one                                        |
| `end`      | `chain`              | Ends a chain                                                                           |
| `range`    | `character`, `value` | Sets a character's `fusion20_range` attribute                                          |
| `roller`   | `roll`, `token`      | Says which token made a roll held because its character has several tokens on the page |

Who may send each:

- `target`, `nominate` and `end`: a player who controls the chain's current nominator, or the GM. While a partner's attack is pending there is no nominator, so the original roller may end the chain.
- `range`: a player who controls the character, or the GM.
- `roller`: the player who posted the roll, or the GM.

A refused command changes nothing. The Mod counts it and writes the reason to its log, and refused `range` and `roller` commands are explained to the sender in a whisper.

### Range values

The `range` value and the `fusion20_range` attribute share one grammar: entries joined by commas, each a kind, `=` and a whole number of feet from 1 to 9999. Each kind appears at most once.

| Kind      | Meaning                      |
| --------- | ---------------------------- |
| `melee`   | Melee reach                  |
| `ranged`  | A ranged weapon's long range |
| `cantrip` | An attack cantrip's range    |

For example `melee=5,ranged=150,cantrip=120`. Spaces are forgiven when the attribute is read from a sheet, but not inside a command.

## Announcements

Each announcement is a sentence for people, a space, and a tag for software:

```
Niamh nominates FighterMan to attack the Goblin. [f20:1:nominated:c7:-Nroller:-Nfighter:-Ngoblin]
```

Only the last word is read. A character named like a tag stays part of the sentence, because it is never last. The sentence is at most 500 characters, and a reader never interprets it.

The tag is `[f20:` followed by fields joined by colons, then `]`:

```
[f20:<version>:<message>:<chain id>:<field>:<field>]
```

| Message     | Fields after the chain id  | Meaning                               |
| ----------- | -------------------------- | ------------------------------------- |
| `started`   | original roller            | A qualifying critical started a chain |
| `target`    | target                     | The target was picked                 |
| `nominated` | nominator, partner, target | A partner was nominated               |
| `qualified` | partner, next nominator    | The partner's attack also qualified   |
| `ended`     | origin                     | The chain ended                       |

The fields are token ids, except an end's origin, which is one of these:

| Origin                | When                                      |
| --------------------- | ----------------------------------------- |
| `partner-attack`      | The partner's attack did not qualify      |
| `no-eligible-partner` | Nobody left can reach and see the target  |
| `nominator`           | The nominator ended it                    |
| `game-master`         | The GM ended it                           |
| `turn-order`          | The turn moved on                         |
| `sandbox-restart`     | The Mod restarted, which ends every chain |

A tag with another version, an unknown message, the wrong number of fields or an invalid identifier is refused as a whole.

### Chain ids

The Mod starts each chain id with `c`, the time its sandbox started in base 36, a hyphen and a count, such as `cmh7x1k2a-3`. A restarted sandbox never reuses an id, so an old tag in chat cannot be mistaken for a new chain. Readers should treat the id as opaque.

## Versions

The version is the second field of every tag. A reader refuses a version it does not know, rather than guess. A change that a version 1 reader would misread gets a new version.
