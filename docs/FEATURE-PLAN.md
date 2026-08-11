# Feature-Plan — die nächste Ausbaustufe

Stand: 11. August 2026. Grundlage: das Spiel ist von der ersten Eiche bis zum
Enderdrachen durchspielbar. Was jetzt fehlt, ist nicht mehr *Weg*, sondern
*Tiefe*: mehr Gründe, in die Welt hinauszugehen, und mehr, was man mit dem
Gefundenen anstellen kann.

---

## 1. Deine vier Anmerkungen — Bewertung

### a) Rüstungs-Upgrade statt freier Herstellung — **voll umsetzbar, klein**

Genau richtig, und im Original ist es dieselbe Idee (Netherit wird nicht
gecraftet, es wird aufgewertet). Heute erzeugt `recipes.js` die Rüstung für
*alle* Materialien in einer Schleife über `MC.Items.ARMOR` — Zanit und Gravitit
fallen also genauso billig an wie Leder. Das ist der ganze Bug.

Vorschlag exakt nach deiner Beschreibung, als Kreuz im 3×3:

```
 . Z .        . G .
 Z D Z        G Z G          Z = Zanit   D = Diamantteil
 . Z .        . G .          G = Gravitit  (Z = Zanitteil in Stufe 2)
```

Was das kostet, wenn man es durchrechnet — der Sprung ist erheblich:

| Ziel | Diamant | Zanit | Gravitit |
|---|---|---|---|
| Zanitrüstung komplett | 24 | 16 | — |
| Gravititrüstung komplett | 24 | 16 | 16 |
| Detektorhelm (bleibt) | 5 + 8 | 4 | — |

Zwei Punkte, die ich anders machen würde als die naive Umsetzung:

* **Haltbarkeit mitnehmen.** Wer einen halb abgenutzten Diamantpanzer
  aufwertet, sollte kein volles neues Teil bekommen — sonst ist das Upgrade
  eine Reparatur. Das Rezeptsystem gibt bisher nur `{id, count}` zurück; für
  Upgrades braucht es einen Sonderfall, der die Restschäden überträgt. Fällt
  ohnehin für Verzauberungen an (Feature 5), darum dort mit erledigen.
* **Werkzeuge lasse ich frei craftbar.** Du hast nur die Rüstung genannt, und
  eine Zanitspitzhacke ist im Nether Verbrauchsmaterial. Wenn du es
  konsequent willst, geht dieselbe Kreuzform aber auch für Werkzeug.

### b) Weltgenerierung — **umsetzbar, aber der teuerste Punkt**

Deine Diagnose stimmt in allen drei Teilen, und die Ursachen liegen jeweils an
einer anderen Stelle:

* **Keine großen Gebirge.** `heightAt()` addiert ein `Math.abs()`-fBm mit einer
  Maske — das gibt überall etwas Beulen und nirgends einen Kamm. Es fehlt eine
  Erosionsschicht, die entscheidet, *ob* eine Gegend flach oder schroff ist.
* **Wüsten sind Ebenen mit Sand.** Es gibt keine Dünen, keine Sandsteinbänke im
  Relief, keine toten Bäume — nur `dead_bush` und Kakteen als Streugut.
* **Wälder sind Baum-Teppich.** `decorate()` würfelt pro Block mit 8,5 %
  Wahrscheinlichkeit einen Baum. Ohne Mindestabstand stehen sie zwangsläufig
  auf Tuchfühlung, und alle sind 4–7 Blöcke hoch. Große Bäume gibt es gar nicht.

Alles drei ist zu machen (Details in Feature 2 und 3). **Der Haken:**
Gespeichert wird nur der Unterschied zur Generierung (`c.modified` in
`world.js`), nicht der Chunk selbst. Ändert sich der Generator, steht jedes
bestehende Haus in einer anderen Landschaft als beim Bauen. Deshalb gehört in
den Spielstand ein **`genVersion`**: alte Welten laufen weiter über den alten
Codepfad, neue über den neuen. Ohne das ist jeder Spielstand hin.

### c) Dörfer aufs Gelände setzen — **umsetzbar, der kniffligste Punkt**

Auch hier stimmt die Beobachtung. `village.js` planiert heute ein Plateau von
29×29 Blöcken auf eine einzige Höhe (`plateau()`, `levelAt()`) und stellt ein
starres 5×5-Parzellenraster darauf. Deshalb sieht jedes Dorf gleich aus und
liegt wie ein Briefmarkenblock in der Landschaft.

Der Umbau ist machbar, muss aber zwei harte Bedingungen einhalten:

1. **Determinismus.** Jeder Chunk entsteht für sich, ohne seine Nachbarn zu
   kennen. Layout *und* Wegenetz müssen also vollständig in `layout()` fallen
   und dürfen nur aus Seed + Regionskoordinate abgeleitet sein.
2. **Rechenzeit.** Ein Weg, der dem Gelände folgt, braucht die Höhenkarte.
   `heightAt()` ist nicht billig, und ein 120×120-Feld pro Dorf wäre spürbar.
   Lösung: Wegsuche auf einem groben 2er-Raster, Ergebnis am Dorfobjekt cachen
   (`gen._vil` tut das bereits für das Layout).

Also: ja, aber es ist mehr Arbeit als es klingt. Details in Feature 4.

### d) Verzauberung — **voll umsetzbar, das größte Einzelfeature**

Passt technisch gut, weil die halbe Grundlage schon liegt: Erfahrungsstufen mit
der Original-Formel (`xpNeeded()` in `player.js`), XP-Kugeln als Entities, Lapis
als Item, Obsidian, Buch und Bücherregal alle vorhanden. Was fehlt, ist der
Tisch, das Verzauberungsmodell auf dem Item-Stack und die etwa zehn Stellen im
Code, an denen eine Verzauberung dann wirken muss.

Die recherchierten Originalformeln stehen unten in Abschnitt 3 — die würde ich
1:1 übernehmen, so wie wir es beim Redstone auch gemacht haben. Der Amboss
gehört fest dazu (Feature 6), sonst sind Verzauberungsbücher wertlos und
verzauberte Werkzeuge unreparierbar.

---

## 2. Die zehn Features

Bewertung: **Umfang** grob in Arbeitspaketen, **Wirkung** = wie sehr man es beim
Spielen merkt.

| # | Feature | Umfang | Wirkung | Quelle |
|---|---|---|---|---|
| 1 | Rüstungs-Upgrade-Kette | S | mittel | deine Anmerkung |
| 2 | Relief: Gebirge, Erosion, echte Wüsten | L | sehr hoch | deine Anmerkung |
| 3 | Wälder: große Bäume, Blue-Noise-Verteilung | M | hoch | deine Anmerkung |
| 4 | Dörfer: geländetreu + Wegenetz | L | hoch | deine Anmerkung |
| 5 | Verzauberungstisch & Verzauberungen | XL | sehr hoch | deine Anmerkung |
| 6 | Amboss & Verzauberungsbücher | M | hoch | ergänzt 5 |
| 7 | Monsterräume, Spawner & verlassene Minen | M | hoch | — |
| 8 | Kolben & Redstone-Ausbau | M | mittel | — |
| 9 | Statuseffekte & Brauen | L | mittel | — |
| 10 | Karten & Bilderrahmen | M | mittel | README |

### 1 — Rüstungs-Upgrade-Kette

*Dateien: `recipes.js`, `ui.js` (Rezeptbuch zeigt es automatisch)*

* Die Auto-Schleife über `MC.Items.ARMOR` überspringt `zanite` und `gravitite`.
* Vier Upgrade-Rezepte je Stufe (Helm, Panzer, Hose, Stiefel), Kreuzform wie oben.
* Haltbarkeit des Einsatzteils wird anteilig übernommen (gemeinsam mit Feature 5).
* Der Detektorhelm-Pfad bleibt, rückt aber automatisch weiter nach hinten.
* Erfolgsbaum prüfen: „Gravitit" hängt bisher am Abbau, nicht am Tragen — passt.

### 2 — Relief: Gebirge, Erosion, echte Wüsten

*Dateien: `worldgen.js` (`heightAt`, `biomeAt`, `decorate`), `world.js` (genVersion)*

* **Erosionsrauschen** als dritte Klimaachse neben Temperatur und Feuchte. Es
  entscheidet, ob eine Region flach (Ebene, Steppe) oder zerklüftet ist. Das ist
  der Hebel, der Gebirge zu *Ketten* macht statt zu Streubeulen.
* **Kammrauschen** `1 - |noise|` statt `|noise|` für die Bergform: gibt scharfe
  Grate und Täler statt runder Buckel. Höhen bis ~y 110 in Gebirgsregionen,
  dafür seltener — große, zusammenhängende Massive statt Dauerhügel.
* **Steilwände & Fels:** ab einer Hangneigung Stein statt Gras, Geröllhalden am
  Fuß, Schneekappe ab Höhe (nicht ab Biom).
* **Wüste als eigenes Relief:** Dünenrauschen mit kurzer Wellenlänge, Sandstein
  in Bänken sichtbar an Abbruchkanten, gelegentlich eine Oase (Wasserloch +
  Zuckerrohr + Palmen-Ersatz aus Eiche).
* **Tote Bäume** als eigene Struktur: 4–6 Blöcke Stamm ohne Laub, zwei bis vier
  abstehende Äste, deterministisch aus der Position. Dazu mehr `dead_bush` und
  Kakteen in Gruppen statt gleichverteilt.
* **Biomgrößen hoch**, damit eine Wüste auch nach Wüste aussieht und nicht nach
  einer Sandinsel zwischen zwei Wäldern.
* **`genVersion` im Spielstand.** Der alte Generator bleibt als Codepfad
  erhalten. Neue Welten bekommen Version 2.

### 3 — Wälder: große Bäume, Blue-Noise-Verteilung

*Dateien: `worldgen.js` (`decorate`, `tree`), evtl. `blocks.js` für neue Holzart*

* **Verteilung:** Statt Würfeln pro Block ein Poisson-artiges Verfahren — die
  Welt in 5×5-Zellen teilen, je Zelle höchstens ein Baum an einer aus der
  Zellkoordinate gehashten Stelle. Ergebnis: natürlicher Abstand, keine
  Baumwände mehr, und es bleibt deterministisch und billig.
* **Große Bäume:** 2×2-Stamm, 12–18 Blöcke hoch, Äste, kugelige Krone. Für
  Eiche und Fichte je eine Variante. Im dichten Wald 60 % groß / 40 % klein, in
  der Ebene nur kleine Einzelbäume.
* **Krone über Chunkgrenzen:** Der Dekorationsrand in `decorate()` muss von ±4
  auf ±10 wachsen. Das kostet Generierungszeit — messen und ggf. nur für Biome
  mit großen Bäumen ausweiten.
* **Waldboden:** Farne/hohes Gras dichter, Pilze im Schatten, gefallene Stämme,
  Lichtungen (Baumdichte über ein sehr grobes Rauschen moduliert).

### 4 — Dörfer: geländetreu + Wegenetz

*Dateien: `village.js` (größerer Umbau), `worldgen.js` (Aufruf bleibt)*

* **Kein Plateau mehr.** Jedes Gebäude bekommt seine eigene Höhe: Median der
  Geländehöhe unter seiner Grundfläche, dazu ein Fundamentsockel, der bis zum
  Boden hinunterreicht (Bruchstein bei Holzhäusern, Sandstein in der Wüste).
* **Parzellenwahl mit Ablehnung:** Kandidatenplätze auf einem verrauschten
  Raster, verworfen wird alles mit mehr als ~3 Blöcken Höhenunterschied über der
  Grundfläche, im Wasser oder zu nah am Nachbarn. Dörfer werden dadurch
  unterschiedlich groß und folgen der Landschaft — auf einem Grat wird es eine
  Zeile, im Talkessel ein Nest.
* **Wege als Graph:** Vom Brunnen zu jeder Haustür ein Pfad, gesucht auf einem
  groben Höhenraster mit Kosten = Strecke + Gewicht × Höhenunterschied. Dadurch
  laufen Wege um Hügel herum statt hindurch. Belag 1–3 Blöcke breit, bei einem
  Höhenschritt eine Stufe, über Wasser eine kurze Bohlenbrücke.
* **Laternen** an den Wegknoten statt auf Rasterpositionen.
* **Determinismus & Cache** wie oben beschrieben; `built`-Maske entsteht aus
  Grundflächen + Wegfeldern.
* **Nebeneffekt:** Der bekannte Fehler „Bewohner laufen geradeaus und bleiben an
  der Hausecke hängen" wird kleiner, wenn es echte Wege gibt, an denen sie sich
  entlanghangeln können. Ganz weg ist er erst mit richtiger Wegfindung.

### 5 — Verzauberungstisch & Verzauberungen

*Dateien: neu `enchant.js`; dazu `blocks.js`, `items.js`, `recipes.js`,
`textures.js`, `ui.js`, `main.js`, `player.js`*

* **Block & Rezept** wie im Original: Buch oben, zwei Diamanten und Obsidian.
* **Bücherregale** nach Originalregel gezählt (siehe Abschnitt 3), maximal 15,
  Sichtlinie muss frei sein — das macht den Regalkreis zum Bauprojekt.
* **Datenmodell:** `stack.ench = { sharpness: 3, unbreaking: 2 }`. Weil
  Spielstände die Stacks direkt als JSON schreiben (`Inventory.serialize`),
  wird das ohne weiteres Zutun mitgespeichert. Verzauberte Sachen stapeln
  ohnehin nicht (`I.sameItem` schließt alles mit Haltbarkeit aus).
* **Oberfläche:** neuer Bildschirm `enchant` neben `furnace` und `chest` — ein
  Slot für das Item, einer für Lapis, drei Angebote mit Stufenkosten,
  Fantasieschrift und einer angedeuteten Verzauberung als Vorschau.
* **XP-Wirtschaft ergänzen:** Erfahrung gibt es heute aus Mobs und fünf Erzen.
  Dazu kommen Netherquarz, das Herausnehmen aus dem Ofen und (mit Feature 9)
  das Brauen. Ohne das ist Stufe 30 eine Zumutung.
* **Verzauberungen, erste Ausbaustufe** — alles, was unsere Engine hergibt:

  | Bereich | Verzauberung |
  |---|---|
  | Werkzeug | Effizienz I–V, Behutsamkeit, Glück I–III, Haltbarkeit I–III |
  | Waffe | Schärfe I–V, Verbrennung I–II, Rückstoß I–II, Plünderung I–III |
  | Bogen | Stärke I–V, Schlag I–II, Flamme, Unendlichkeit |
  | Rüstung | Schutz I–IV, Feuerschutz I–IV, Federfall I–IV, Explosionsschutz I–IV, Wasseratmung I–III, Wasseraffinität, Dornen I–III |
  | überall | Reparatur (Mending) |

* **Wirkstellen im Code** (das ist die eigentliche Arbeit, nicht der Tisch):
  `I.breakTime`/`breakSpeed` für Effizienz, der Drop-Zweig in `main.js` für
  Behutsamkeit und Glück, `Inventory.damageSelected` für Haltbarkeit,
  `Game.attack` für Schärfe/Rückstoß/Verbrennung, der Mob-Drop für Plünderung,
  `Player.damage` für die vier Schutzarten, der Fallschaden für Federfall.
* **Optik:** verzauberte Items bekommen einen violetten Schimmer im Inventar und
  ihre Verzauberungen als Zeile darunter. Ein Item-Tooltip existiert noch nicht
  und muss mitgebaut werden.

### 6 — Amboss & Verzauberungsbücher

*Dateien: `enchant.js`, `ui.js`, `blocks.js`, `items.js`, `village.js`*

* **Verzauberungsbuch** als Item: ein Buch auf dem Tisch bekommt die
  Verzauberung ins Buch statt aufs Werkzeug (Verzauberbarkeit 1, und wie im
  Original wird bei mehreren eine wieder entfernt).
* **Amboss:** zwei Eingabeslots, Umbenennen, Stufenkosten, Vorarbeitsstrafe und
  die „Zu teuer!"-Grenze bei 40 — alles wie im Original.
  Reparieren mit Material, Zusammenlegen zweier gleicher Werkzeuge,
  Buch auf Werkzeug übertragen.
* Der Amboss fällt wie Sand und nimmt beim Benutzen Schaden.
* **Bibliothekar** verkauft Verzauberungsbücher — damit hat der Beruf endlich
  einen Sinn jenseits von Glas, und die Bibliothek im Dorf wird ein Ziel.

### 7 — Monsterräume, Spawner & verlassene Minen

*Dateien: neu `caves.js`, dazu `worldgen.js`, `entities.js`, `blocks.js`*

Unsere Höhlen sind groß und komplett leer — es gibt keinen Grund hinabzusteigen
außer Erz. Das ändert:

* **Monsterraum:** 7×7 aus Bruchstein und bemoostem Bruchstein an einer
  Höhlenwand, ein Spawner in der Mitte, ein bis zwei Truhen. Loot mit
  Verzauberungsbuch, Goldbarren, Brot, Redstone — die klassische Belohnung.
* **Spawner** als Block mit Käfiglogik: erzeugt Mobs im Umkreis, solange ein
  Spieler in 16 Blöcken ist und Platz da ist. Mit Fackeln stilllegbar.
* **Verlassene Mine:** Gangsystem mit Holzstützen, Fackeln, Spinnweben,
  gelegentlich eine Truhe. Ohne Loren — die kommen frühestens mit Feature 8.
* Zusammen mit Feature 5 schließt das den Kreis: Höhle → Buch → Tisch → Werkzeug.

### 8 — Kolben & Redstone-Ausbau

*Dateien: `redstone.js`, `blocks.js`, `recipes.js`, `mesher.js`*

Der Redstone-Teil ist der technisch sauberste im ganzen Projekt (starke/schwache
Aufladung, echte Taktgeber) — und endet dann bei Lampe und Tür. Fehlt:

* **Kolben und Klebekolben:** Block schieben bzw. ziehen, Schiebegrenze 12,
  unbewegliche Blöcke (Obsidian, Truhe, Ofen). Ohne Zwischenanimation
  umgesetzt — direkt umsetzen ist ehrlich und spart den halben Aufwand.
* **Beobachter (Observer):** feuert bei Blockänderung davor. Das ist die
  Komponente, mit der man ohne Fackeltakt automatisieren kann.
* **Werfer/Spender und Trichter**, falls der Aufwand bis dahin trägt — beide
  brauchen Inventarlogik, die es bei Truhe und Ofen schon gibt.

### 9 — Statuseffekte & Brauen

*Dateien: neu `potions.js`, dazu `player.js`, `dimensions.js`, `ui.js`*

* **Statuseffekt-System** zuerst — eine Liste `{id, stufe, restTicks}` am
  Spieler, angezeigt neben der Hotbar. Das braucht ohnehin schon der goldene
  Apfel, und Feature 5 nutzt es für Verbrennung.
* **Nethergewächs** als neue Pflanze auf Seelensand — endlich ein Grund, im
  Nether etwas anderes zu suchen als Glowstone.
* **Braustand** mit Lohenstaub als Brennstoff (Lohenruten haben wir schon),
  Glasflasche, Wasserflasche, seltsamer Trank.
* **Tränke:** Heilung, Regeneration, Stärke, Schnelligkeit, Feuerresistenz,
  Nachtsicht, Sprungkraft — plus die gestreckten und verstärkten Varianten.
  Wurftränke später.
* Feuerresistenz ist der ehrliche Ersatz für die Zanitrüstung als Lava-Freibrief,
  wenn diese durch Feature 1 teurer wird.

### 10 — Karten & Bilderrahmen

*Dateien: neu `map.js`, dazu `items.js`, `textures.js`, `ui.js`, `renderer.js`*

Steht schon als „Als Nächstes" im README, und der Kompass ist die Vorstufe.

* **Karte** als Item: zeichnet beim Tragen das erkundete Gelände in ein Canvas
  (Biomfarbe + Höhenschattierung aus `columnInfo`), in der Hand als kleines
  Overlay, im Vollbild größer. Spielerpunkt und Blickrichtung darauf.
* **Bilderrahmen** als Block, um sie an die Wand zu hängen — und nebenbei um
  jedes beliebige Item auszustellen.
* Kartenausschnitt wird beim Erstellen fixiert, wie im Original.

---

## 3. Recherche: Verzauberung im Original

Die Zahlen sind aus dem Minecraft-Wiki und gelten unverändert seit 1.8. Wenn wir
sie 1:1 übernehmen, fühlt sich der Tisch für jeden richtig an, der Minecraft
kennt — dasselbe Prinzip wie bei den Redstone-Regeln.

### Tisch und Regale

* **Rezept:** oben Mitte Buch, Mitte Diamant–Obsidian–Diamant, unten drei Obsidian.
* **Bücherregale:** wirksam ist ein Regal, das **genau zwei Blöcke** entfernt auf
  einer Waagerechten steht, bis zu zwei auf der anderen, auf Tischhöhe oder einen
  Block höher. Zwischen Tisch und Regal muss Luft sein. Mehr als **15** zählen nicht.

### Die drei Angebote

```
xpBasis = 1 + zufall(0..7) + floor(min(15, regale) / 2) + zufall(0..min(15, regale))

oben   = floor(max(1, xpBasis / 3))
mitte  = floor(2 * xpBasis / 3) + 1
unten  = floor(max(xpBasis, 2 * regale))
```

Mit 15 Regalen ergibt der untere Slot also immer mindestens 30.

### Kosten

Lapis und Stufen kosten **1 / 2 / 3** je nach Slot — unabhängig davon, welche
Stufe angezeigt wird. Die angezeigte Stufe ist nur die **Voraussetzung**: wer
Stufe 30 sehen will, braucht Stufe 30, zahlt aber nur drei Stufen und drei Lapis.
(Das überrascht viele und ist genau deshalb wichtig, es richtig zu machen.)

### Von der Stufe zur Verzauberung

```
eKosten = round( (slotKosten + 1 + zufall(0..floor(V/4)) + zufall(0..floor(V/4)))
                 * (1 + dreieck(0.15)) )

dreieck(n) = (zufall() + zufall() - 1) * n        // Dreiecksverteilung um 0
```

`V` ist die **Verzauberbarkeit** des Materials:

| Material | Werkzeug | Rüstung |
|---|---|---|
| Holz / Leder | 15 | 15 |
| Stein | 5 | — |
| Eisen | 14 | 9 |
| Gold | 22 | 25 |
| Diamant | 10 | 10 |
| Buch, Bogen | 1 | — |

Für unsere eigenen Stufen schlage ich vor — Zanit als das etwas „magischere"
Material, Gravitit hart wie Diamant:

| Material | Werkzeug | Rüstung | Begründung |
|---|---|---|---|
| Heiligstein | 8 | — | mürbe, aber aetherisch |
| Zanit | 16 | 12 | zwischen Eisen und Gold |
| Gravitit | 10 | 10 | wie Diamant |

### Auswahl der Verzauberung

1. Alle Verzauberungen sammeln, die auf das Item passen **und** deren
   Stufenfenster `eKosten` enthält (die Fenster stehen in der Tabelle unten).
2. Eine davon nach **Gewicht** ziehen: häufig 10, ungewöhnlich 5, selten 2,
   sehr selten 1.
3. Danach wiederholt: `eKosten` halbieren (abrunden); mit Wahrscheinlichkeit
   `(eKosten + 1) / 50` kommt eine weitere Verzauberung dazu, unverträgliche
   fallen vorher raus (Behutsamkeit ↔ Glück, die vier Schutzarten untereinander,
   Schärfe ↔ Bann ↔ Nemesis).
4. Bei **Büchern** wird am Ende eine zufällige der gewürfelten Verzauberungen
   wieder entfernt.

### Stufenfenster (Auszug, das was wir umsetzen)

| Verzauberung | Max | I | II | III | IV | V |
|---|---|---|---|---|---|---|
| Schutz | IV | 1–12 | 12–23 | 23–34 | 34–45 | — |
| Feuerschutz | IV | 10–18 | 18–26 | 26–34 | 34–42 | — |
| Federfall | IV | 5–11 | 11–17 | 17–23 | 23–29 | — |
| Explosionsschutz | IV | 5–13 | 13–21 | 21–29 | 29–37 | — |
| Wasseratmung | III | 10–40 | 20–50 | 30–60 | — | — |
| Wasseraffinität | I | 1–41 | — | — | — | — |
| Dornen | III | 10–60 | 30–80 | 50–100 | — | — |
| Schärfe | V | 1–21 | 12–32 | 23–43 | 34–54 | 45–65 |
| Rückstoß | II | 5–55 | 25–75 | — | — | — |
| Verbrennung | II | 10–60 | 30–80 | — | — | — |
| Plünderung | III | 15–65 | 24–74 | 33–83 | — | — |
| Effizienz | V | 1–51 | 11–61 | 21–71 | 31–81 | 41–91 |
| Behutsamkeit | I | 15–65 | — | — | — | — |
| Haltbarkeit | III | 5–55 | 13–63 | 21–71 | — | — |
| Glück | III | 15–65 | 24–74 | 33–83 | — | — |
| Stärke (Bogen) | V | 1–16 | 11–26 | 21–36 | 31–46 | 41–56 |
| Schlag | II | 12–37 | 32–57 | — | — | — |
| Flamme | I | 20–50 | — | — | — | — |
| Unendlichkeit | I | 20–50 | — | — | — | — |
| Reparatur | I | 25–75 | — | — | — | — |

Quellen: [Enchanting](https://minecraft.wiki/w/Enchanting),
[Enchanting mechanics](https://minecraft.wiki/w/Enchanting_mechanics),
[Enchanting/Levels](https://minecraft.wiki/w/Enchanting/Levels),
[Enchanting Table](https://minecraft.wiki/w/Enchanting_Table).

---

## 4. Vorgeschlagene Reihenfolge

**Stufe 1 — schnelle Wirkung, kein Risiko**
Feature 1 (Rüstungs-Upgrade). Ein Nachmittag, sofort spürbar, und es macht den
ganzen hinteren Fortschritt wieder wertvoll.

**Stufe 2 — das Weltbild**
Feature 2 → 3 → 4, in dieser Reihenfolge. Erst das Relief, dann der Bewuchs
darauf, dann die Dörfer, die sich beidem anpassen müssen. Umgekehrt macht man
die Arbeit zweimal. Vorher `genVersion` einbauen — das ist die Bedingung dafür,
dass bestehende Spielstände die Umstellung überleben.

**Stufe 3 — Verzauberung**
Feature 5 → 6, dazu Feature 7 als Quelle für Bücher und Erfahrung. Der Amboss
darf nicht auf später rutschen; ohne ihn ist die Verzauberung eine Sackgasse.

**Stufe 4 — Kür**
Feature 8, 9, 10 in beliebiger Reihenfolge, je nach Lust.

### Bewusst nicht auf der Liste

* **Mehrspieler** — sprengt die „läuft per Doppelklick"-Vorgabe.
* **Loren und Schienen** — großes Physikpaket, geringer Ertrag ohne Mehrspieler.
* **Aether-Dungeons, äußere Endinseln, Drachen-Wiederbelebung** — Inhalt für
  Spieler, die schon durch sind; kommt nach der Verzauberung.
* **Kleinkram, der sich unterwegs mitnehmen lässt:** Tierzucht mit Weizen und
  Jungtiere, Angeln, Schilder, Blumentöpfe, Amboss-Umbenennung. Jeweils unter
  einem halben Tag, jederzeit einschiebbar.
