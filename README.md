# Minecraft — HTML Edition

Ein Minecraft-Nachbau, der **komplett offline als einzelne `.html`-Datei aus dem Ordner** läuft.
Kein Server, kein Build-Schritt, keine Abhängigkeiten, keine externen Assets.

**Starten:** `Minecraft.html` doppelklicken. Fertig.

![Voxelwelt](https://img.shields.io/badge/Engine-eigenes%20WebGL2-blue) ![Assets](https://img.shields.io/badge/Texturen-prozedural%20erzeugt-green) ![Offline](https://img.shields.io/badge/Netzwerk-nicht%20nötig-lightgrey)

---

## Ordnerstruktur

```
Minecraft.html            <- Einstiegspunkt (doppelklicken)
Minecraft_files/
  css/style.css
  js/  util · blocks · items · recipes · textures · glcore · mesher
       particles · icons · worldgen · village · dimensions · world
       entities · theend · player · renderer · audio · ui · main
```

## Steuerung

| Taste | Funktion | Taste | Funktion |
|---|---|---|---|
| `W A S D` | Bewegen | `E` / `I` | Inventar |
| `Maus` | Umsehen | `Q` | Item wegwerfen |
| `Linksklick` | Abbauen / Angreifen | `1–9`, `Mausrad` | Hotbar |
| `Rechtsklick` | Platzieren / Benutzen / Handeln | `Mausrad-Klick` | Block aufnehmen |
| `Leertaste` | Springen / Auftauchen | `F3` | Debug-Overlay |
| `Shift` | Schleichen (kantensicher) | `F` | Sichtweite |
| `Strg` / `Doppel-W` | Sprinten | `P` | Spielmodus wechseln |
| | | `M` | Musik an/aus |
| `Doppel-Leertaste` | Fliegen (Kreativ) | `R` | Speichern |
| `Esc` | Pause / Menü | | |

## Was drin ist

**Welt** — prozedurale, praktisch unendliche Voxelwelt mit Seed-Eingabe. 9 Biome
(Ozean, Strand, Ebene, Wald, Wüste, Berge, Taiga, Sumpf, Tundra), Höhlensysteme,
Erzverteilung nach Tiefe, drei Baumarten, Blumen, Kakteen, Zuckerrohr, Kürbisse,
Seen und Lavaseen.

**Welt anpassen** — vor dem Start lässt sich die Generierung einstellen: Welttyp
(Standard, Verstärkt, Große Biome, Flachland), Bergigkeit, Höhlenanteil,
Meeresspiegel, Biomgröße, Bewuchs, Erzhäufigkeit und ob Dörfer entstehen. Die
Werte wandern in den Spielstand; ältere Spielstände laufen mit den Standardwerten
weiter.

**Dörfer** — deterministisch aus dem Seed, etwa alle 700 Blöcke auf ebenem Grund
außerhalb von Ozean, Strand, Sumpf und Bergen. Wegkreuz mit Laternen, Brunnen,
Wohnhäuser, Schmiede, Bibliothek und Weizenfelder hinter Zaun und Zauntor;
Baumaterial richtet sich nach dem Biom. Truhen in Häusern und Schmiede sind
gefüllt — Brot, Werkzeug, Erz, gelegentlich ein Smaragd. Das Dorf steht auf einem
eingeebneten Plateau, dessen Rand ins Gelände ausläuft.

**Der Weg nach oben** — die vier Welten bauen aufeinander auf: in der Oberwelt
sucht man Obsidian für das Netherportal, im Nether die Bastionen, weil nur dort
Glowstone liegt und Glowstone der Rahmen für das Aetherportal ist. Der Aether
gibt die beste Rüstung her — und den Gravitit, mit dem sich in der Oberwelt das
Endportal öffnen lässt. Dahinter wartet der Drache.

**Kompass** — vier Eisenbarren und ein Redstone. In der Hand blendet er oben ein
Band mit den Himmelsrichtungen ein, darunter die eigenen Koordinaten. Norden
liegt wie im Original auf −Z.

**Nether** — Portal aus einem Obsidianrahmen (4×5, zehn Blöcke), gezündet mit dem
Feuerzeug. Dahinter liegt eine geschlossene Höhlenwelt zwischen zwei
Grundgesteinsdecken: Netherrack, Seelensand (bremst), Magmablöcke (die brennen),
Netherquarz und Zaniterz in Adern, Lavaseen im Untergeschoss. Kein Tageslicht,
roter Dunst, kurze Sicht. Bewohnt von Piglins, Magmawürfeln und Ghasts, die
Feuerbälle werfen — Lava macht ihnen nichts aus. Ein Block im Nether entspricht
acht in der Oberwelt, ein Portal dort spart also Wege.

**Bastionen** — kleine Festungen aus Netherziegeln, etwa alle 160 Blöcke, an
ihren vier Glowstone-Leuchtfeuern schon von weitem zu erkennen. Sie sind die
**einzige** Glowstonequelle im Spiel. Eine Bastion bringt vierzehn Blöcke, das
sind nach dem Zerlegen und Neuzusammensetzen genau die zehn für einen
Aetherrahmen; die Truhe im Inneren ist der Puffer.

**Zanitrüstung** — im Nether zu Hause und dort auch das einzige Rüstungsmetall.
Jedes getragene Teil nimmt ein Viertel des Hitzeschadens weg, alle vier machen
gegen Lava, Feuer und Magma vollständig immun. Gegen einen Kaktus hilft sie
nicht.

**Aether** — dieselbe Rahmenform, aber aus Glowstone und mit einem Eimer Wasser
geflutet statt angezündet. Dahinter schweben Inseln über der Leere: Aethergras
auf Heiligstein, Flugsand (spiegelglatt), Eisstein, Himmelswurzel- und
Goldeichenwälder, Blaubeersträucher. Die Inseln sind durchlöchert — wer nicht
aufpasst, fällt hindurch. Ambrosium leuchtet und heilt beim Essen; Gravitit
fällt nach oben statt nach unten und sitzt tief im unteren Drittel der Inseln,
immer mit Abstand zur Außenschale — von unten ablesen lässt es sich also nicht,
man muss graben. Wolkenblöcke sind begehbar: blaue
schleudern nach oben, goldene fangen jeden Sturz ab. Dazu Moas, Phygs und
Sheepuffs als friedliche Bewohner, Cockatrices und Zephyre als Plage — letztere
schießen Schneebälle, die einen von der Insel fegen. Wer durch die Leere fällt,
kommt in der Oberwelt vom Himmel herunter.

**Gravititrüstung** — jedes Teil bringt still eine eigene Eigenschaft mit, ohne
dass es irgendwo draufsteht:

| Teil | Wirkung |
|---|---|
| Helm | HUD: Lebensbalken über allem, was lebt, und ein Kompass zum Endportal |
| Brustpanzer | Sprunghöhe von 1,2 auf 2,7 Blöcke |
| Hose | knapp 30 % schneller zu Fuß |
| Stiefel | kein Fallschaden mehr |
| alle vier | zusätzlich ein Sprung mitten in der Luft |

**Festung** — genau eine je Welt, dreißig Blöcke unter der Oberfläche und ein
paar hundert Blöcke vom Ursprung entfernt. Portalsaal mit zwei Lavabecken und
zwei Truhen, ein Gang zur Bibliothek, ein Leiterschacht, der drei Blöcke unter
dem Gras endet — den Rest gräbt man selbst. In der Mitte des Saals liegt der
Endportalrahmen: zwölf Blöcke im 5×5-Quadrat ohne Ecken, genau wie im Original.
Gefunden wird die Festung nicht mit Enderaugen, sondern über den Kompass im HUD
des Gravitithelms; geöffnet wird das Portal mit einem **Gravitit** aus dem
Aether statt mit zwölf Augen.

**Das Ende** — eine Insel aus Endstein in der violetten Leere, zehn
Obsidiantürme im Kreis darum, auf jedem ein Enderkristall auf einem Sockel aus
Grundgestein. In der Mitte der erloschene Sockel des Ausgangsportals. Darüber
kreist der **Enderdrache**: 200 Leben, er stürzt sich auf den Spieler, fegt ihn
mit dem Flügelschlag weg und spuckt Feuerbälle. Solange ein Kristall steht,
heilt er sich — wer gewinnen will, sprengt erst die Türme leer. Fällt er, zündet
das Ausgangsportal, das Drachenei erscheint auf seiner Säule, und wer hindurch
geht, sieht den Abspann und steht wieder an seinem Spawnpunkt.

**Dorfbewohner & Handel** — fünf Berufe (Bauer, Bibliothekar, Schmied, Metzger,
Steinmetz) mit eigener Robe und je drei bis vier Angeboten. Rechtsklick öffnet das
Handelsfenster: Waren gegen Smaragde und umgekehrt, mit begrenztem Vorrat je
Angebot. Beruf und Angebote hängen an Dorf und Platznummer — ein Bewohner, der
nach dem Entladen neu erscheint, bietet wieder dasselbe an. Bei Einbruch der
Nacht oder wenn ein Monster in die Nähe kommt, geht jeder in sein Haus und macht
die Tür hinter sich zu; Zombies haben es auf sie abgesehen.

**Blöcke & Items** — rund 145 Blöcke inklusive Treppen, Stufen, Zäunen, Zauntoren,
Türen, Leitern, Fackeln (auch an Wänden), Glas, 16 Wollfarben, Werkbank, Ofen,
Truhe, Bett, TNT und Ackerboden. Rund 250 Items: Werkzeuge und Waffen in 8
Materialstufen, Rüstung in 6 Stufen, Nahrung, Rohstoffe, Kompass.

**Spielschleife** — 155 Crafting-Rezepte (2×2 und 3×3, geformt und ungeformt);
Holzrezepte akzeptieren jede Brettersorte. Ofen mit Brennstoffverwaltung, Truhen
als Lager, Ackerbau vom Pflügen bis zur Ernte, Feuer per Feuerzeug, TNT mit
Kettenreaktion.

**Überleben** — Leben, Hunger mit Sättigung und Erschöpfung, Rüstungsschutz, Fall-,
Ertrinkungs-, Lava- und Kaktusschaden, Regeneration, Tod mit Item-Drop und Respawn,
Erfahrungsstufen, Schlafen im Bett zum Setzen des Spawnpunkts.

**Mobs** — Schwein, Kuh, Schaf (16 Wollfarben, scherbar), Huhn, Zombie, Skelett
(schießt Pfeile), Creeper (zündet und explodiert), Dorfbewohner; im Nether
Piglin, Ghast und Magmawürfel, im Aether Moa, Phyg, Sheepuff, Cockatrice und
Zephyr, im Ende der Enderdrache samt Enderkristallen. Spawn nach Lichtlevel und
Tageszeit, Wegfindung mit Hindernissprung, Rückstoß, Drops, XP-Kugeln.

**Physik & Simulation** — fließendes Wasser und Lava mit 8 Fließstufen,
Lava + Wasser → Obsidian/Bruchstein, fallender Sand und Kies, Pflanzenwachstum,
Grasausbreitung, Blattzerfall, Explosionen mit Blockschaden und Rückstoß.

**Technik** — eigener WebGL2-Renderer mit Texture-Array, Chunk-Meshing mit Ambient
Occlusion und weichem Licht, Flood-Fill-Lichtengine für Sonnen- und Blocklicht,
Frustum-Culling, Tag/Nacht-Zyklus mit Sonne, Mond, Sternen und Wolken, Partikel,
prozeduraler Sound über WebAudio, Speichern in `localStorage` plus Export/Import
als JSON-Datei.

## Warum kein Framework?

Die Vorgabe war „läuft per Doppelklick aus dem Ordner". Unter `file://` blockiert die
Same-Origin-Policy ES-Module, `fetch`, Web-Worker und externe Bibliotheken. Deshalb:

* klassische `<script>`-Tags statt ES-Module
* eigener WebGL2-Renderer statt three.js
* alle Texturen zur Laufzeit per Canvas erzeugt (345 Stück) statt Bilddateien
* alle Klänge per WebAudio synthetisiert statt Audiodateien
* Chunk-Meshing zeitbudgetiert im Main-Thread statt in Workern

## Noch offen

**Als Nächstes:** Karten — ein Item, das das erkundete Gelände von oben zeigt und
sich in einem Rahmen an die Wand hängen lässt. Der Kompass ist die Vorstufe davon.

Redstone, Loren, Verzauberung, Brauen, Mehrspieler. Im Ende fehlen Endermen, die
äußeren Inseln und das Wiederbeleben des Drachen. Im Nether fehlen
Festungen und Blazes, im Aether die drei Dungeons und reitbare Moas. Dorfbewohner
laufen geradlinig auf ihr Ziel zu statt einen Weg zu suchen; ein Haus hinter einer
Mauer erreichen sie nicht. Ihre schon getätigten Handelszüge überleben das
Entladen des Dorfes nicht — der Vorrat eines Angebots füllt sich dann wieder auf.

## Voraussetzungen

Ein Browser mit WebGL2 — Chrome, Edge oder Firefox in aktueller Version.

## Lizenz

Privates Lernprojekt. Minecraft ist eine Marke von Mojang Studios; dieses Projekt
steht in keiner Verbindung zu Mojang oder Microsoft.
