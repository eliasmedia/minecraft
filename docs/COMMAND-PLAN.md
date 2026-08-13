# Befehle und Befehlsblock — Plan

> **Stand August 2026: umgesetzt.** Die Punkte 1 bis 6 der Reihenfolge unten
> stehen im Spiel, samt Befehlsblock und dem abgespeckten `execute`. Was hier
> als „bewusst weggelassen" steht, ist weiterhin weggelassen.

Recherchiert am [Minecraft Wiki](https://minecraft.wiki/w/Commands) und
[Command Block](https://minecraft.wiki/w/Command_Block). Dieses Papier hält fest,
was aus dem Original sinnvoll übertragbar ist und was nicht — und warum.

---

## 1. Die Chatzeile

`T` öffnet eine einzeilige Eingabe am unteren Bildrand, `/` öffnet sie ebenfalls
und setzt den Schrägstrich gleich mit. `Esc` bricht ab, `Enter` führt aus. Solange
sie offen ist, ruht die Spielsteuerung — sonst läuft man beim Tippen von `W` los.

Drei Dinge, die das Original hat und die den Unterschied ausmachen:

* **Verlauf** mit Pfeil hoch/runter. Ohne ihn tippt man jeden Befehl neu.
* **Vervollständigung** mit Tab: erst der Befehlsname, dann je nach Stelle
  Itemname, Blockname, Kreaturenart oder Verzauberung. Unsere Registries können
  das direkt beantworten — `MC.Items`, `MC.Blocks`, `MC.MOB_TYPES`, `MC.Ench.LISTE`.
* **Rückmeldung** als Zeile über der Hotbar, grün bei Erfolg, rot bei Fehler, mit
  der Stelle im Text, an der es klemmte.

Dazu ein **Chatprotokoll** der letzten Zeilen, das nach ein paar Sekunden
ausblendet und beim Öffnen der Zeile wieder erscheint.

---

## 2. Zielauswahl

Der eigentliche Hebel des Befehlssystems, und er kostet wenig, weil wir ohnehin
eine Entitätenliste haben.

| Auswahl | Bedeutung |
|---|---|
| `@s` | der Ausführende — bei uns immer der Spieler |
| `@p` | nächster Spieler (bei einem Spieler dasselbe wie `@s`) |
| `@a` | alle Spieler |
| `@r` | zufällige Kreatur/Spieler |
| `@e` | alle Entitäten |

Argumente in eckigen Klammern, kommagetrennt:

`type=zombie` · `distance=..10` · `limit=3` · `sort=nearest` · `name=Hans` ·
`x=`/`y=`/`z=`/`dx=`/`dy=`/`dz=` für einen Quader.

Kein Mehrspieler heißt: `@a`, `@p` und `@s` fallen praktisch zusammen. Sie
trotzdem alle zu unterstützen kostet fünf Zeilen und macht jedes Rezept aus dem
Netz lauffähig — das ist es wert. **Weglassen:** `scores=`, `team=`, `nbt=`,
`advancements=` — dafür fehlt der Unterbau.

Koordinaten mit `~` relativ zum Ausführenden (`~ ~5 ~`) und `^` relativ zur
Blickrichtung müssen beide da sein; ohne Tilde ist die Hälfte der Befehle
unbrauchbar.

---

## 3. Befehle, die wir umsetzen

Ausgewählt danach, ob im Spiel etwas dahintersteht. Alles hier hat bereits eine
Gegenstelle im Code.

### Sofort, weil die Mechanik schon existiert

| Befehl | Syntax | Gegenstelle bei uns |
|---|---|---|
| `/gamemode` | `<survival\|creative\|spectator> [ziel]` | `Game.setMode` — seit dieser Runde alle drei |
| `/give` | `<ziel> <item> [anzahl]` | `MC.Items`, `Inventory.add` |
| `/tp` \| `/teleport` | `<ziel> <x y z>` oder `<ziel> <entität>` | direkte Positionszuweisung |
| `/time` | `set day\|night\|noon\|midnight`, `add <n>`, `query` | `game.time` |
| `/kill` | `[ziel]` | `Entity.hurt` mit 9999 |
| `/summon` | `<art> [x y z]` | `new MC.Mob(...)`, 26 Arten inkl. Spawn-Eier |
| `/setblock` | `<x y z> <block>` | `world.setBlock` |
| `/fill` | `<x1 y1 z1> <x2 y2 z2> <block>` | Schleife über `setBlock`, mit Deckel |
| `/effect` | `give <ziel> <effekt> [dauer] [stufe]`, `clear` | `MC.Effekte` — zehn Effekte |
| `/enchant` | `<ziel> <verzauberung> [stufe]` | `MC.Ench.anwenden` — 23 Stück |
| `/xp` | `add\|set\|query <ziel> <n> [levels\|points]` | Erfahrungssystem |
| `/difficulty` | `<peaceful\|easy\|normal\|hard>` | `game.difficulty` |
| `/seed` | — | `world.gen.seed` |
| `/spawnpoint` | `[ziel] [x y z]` | Bettspawn |
| `/clear` | `[ziel] [item]` | Inventar |
| `/say` \| `/me` | `<text>` | Chatprotokoll |
| `/help` | `[befehl]` | aus der Befehlstabelle erzeugt |

### Mit etwas Arbeit, aber lohnend

| Befehl | Warum es sich lohnt |
|---|---|
| `/locate <struktur>` | Wir haben Dörfer, Bastionen, Wracks, Tempel, Minen, Verliese und die Festung — alle deterministisch aus dem Seed. Der Befehl ist fast geschenkt und macht die Welt begehbar. |
| `/gamerule` | `keepInventory` gibt es schon; dazu `doDaylightCycle`, `doMobSpawning`, `mobGriefing`, `doFireTick`, `doTileDrops`. Jede Regel ist ein Schalter an einer Stelle, an der wir ohnehin abfragen. |
| `/clone` | Baut auf `fill` auf, braucht einen Zwischenpuffer. Für den Befehlsblock der halbe Reiz. |
| `/weather` | Es gibt noch **kein Wetter** — der Befehl wäre der Anlass, Regen und Gewitter einzuführen. Eigener Schritt, nicht Teil dieser Runde. |
| `/execute` | Nur die zwei nützlichen Zweige: `as <ziel> run <befehl>` und `at <ziel> run <befehl>`. Die volle Fassung mit `if`, `store`, `positioned`, `facing`, `align` ist ein eigenes Projekt und ohne Punktestand halb wirkungslos. |

### Bewusst weggelassen

* `/kick`, `/list`, `/op`, `/ban`, `/whitelist`, `/tell` — brauchen Mehrspieler.
* `/data`, `/tag`, `/scoreboard`, `/team`, `/attribute` — setzen NBT und einen
  Punktestand voraus. Beides haben wir nicht, und beides nachzubauen kostet mehr
  als alle anderen Befehle zusammen.
* `/particle`, `/playsound`, `/title` — machbar, aber ohne Kartenbau kaum
  gebraucht. Kandidaten für später, wenn der Befehlsblock steht.
* `/worldborder`, `/defaultgamemode`, `/advancement`, `/recipe`, `/loot`.

---

## 4. Der Befehlsblock

Drei Sorten wie im Original, unterscheidbar an der Farbe:

| Sorte | Farbe | Verhalten |
|---|---|---|
| **Impuls** | orange | führt einmal aus, wenn das Signal ankommt |
| **Wiederholend** | violett | führt in jedem Tick aus, solange es anliegt |
| **Kette** | türkis | führt aus, wenn der Block davor erfolgreich war |

Dazu zwei Schalter, beide im Original vorhanden und beide bei uns billig:

* **Braucht Redstone** / **Immer aktiv** — Vorgabe: Impuls und Wiederholend
  brauchen ein Signal, Kette ist immer aktiv.
* **Bedingt** / **Unbedingt** — bedingt heißt: nur ausführen, wenn der Block
  dahinter erfolgreich war.

Das Fenster zeigt die Befehlszeile, darunter die letzte Ausgabe. Der
Erfolgszähler treibt einen Komparator — das haben wir mit dem Redstonesystem
bereits, es fehlt nur die Anbindung.

Beschafft wird der Block ausschließlich im Kreativmenü, in einem eigenen Reiter
**Werkzeuge des Betreibers**, und er ist unzerstörbar wie Grundgestein.

**Wichtig für uns:** eine Obergrenze für Befehle je Tick. Ein wiederholender
Block mit `/fill` über eine große Region legt das Spiel sonst still. Vorschlag:
höchstens 32 768 Blöcke je `fill`/`clone` und ein Deckel auf die Zahl der
Kettenglieder, wie im Original bei 65 536.

---

## 5. Reihenfolge

1. **Chatzeile mit Protokoll und Verlauf** — ohne sie ist nichts sichtbar.
2. **Zerleger und Zielauswahl** samt `~`/`^`-Koordinaten. Das ist das Gerüst;
   jeder Befehl danach ist ein Tabelleneintrag.
3. **Die vierzehn Befehle aus der ersten Tabelle.** Zusammen kaum mehr Arbeit
   als einer von ihnen, weil sie sich das Gerüst teilen.
4. **`/locate` und `/gamerule`** — der erste macht die Welt begehbar, der zweite
   räumt die Schalter auf, die heute in `game` verstreut sind.
5. **Befehlsblock** mit den drei Sorten und beiden Schaltern.
6. **`/execute as|at` und `/clone`** — erst hiermit lässt sich mit dem
   Befehlsblock wirklich etwas bauen.

Wetter (`/weather`) ist ein eigener Schritt, weil dahinter Regen, Gewitter,
Blitzeinschlag und die Auswirkung auf das Kreaturenaufkommen stecken — das ist
ein Feature, kein Befehl.
