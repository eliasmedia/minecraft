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
  js/  util · blocks · potions · items · enchant · recipes · textures
       glcore · mesher · particles · icons · worldgen · village · caves
       map · dimensions · world · redstone · entities · theend
       achievements · player · renderer · audio · ui · main
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
| | | `J` | Musik an/aus |
| `Doppel-Leertaste` | Fliegen (Kreativ) | `R` | Speichern |
| `N` | Karte groß/klein | | |
| `M` / `Esc` | Pause / Menü | | |

`Esc` fängt der Browser oft selbst ab — es gibt den Mauszeiger frei und verlässt
am Mac zusätzlich das Vollbild, sodass die Taste beim Spiel gar nicht ankommt.
Darum tut **`M`** dasselbe und funktioniert überall. Das Vollbild schaltet ein
eigener Knopf im Pausenmenü, damit man nicht auf die Tastenkombination des
Browsers angewiesen ist.

Beim Zeiger springt der Browser gelegentlich: für ein einzelnes Bild kommt ein
absurd großer Ausschlag, und man schaut plötzlich nach hinten. Solche Werte
werden verworfen, ebenso die ersten Millisekunden nach dem Zurückholen des
Zeigers — normale Bewegung bleibt unverändert.

## Was drin ist

**Welt** — prozedurale, praktisch unendliche Voxelwelt mit Seed-Eingabe. 9 Biome
(Ozean, Strand, Ebene, Wald, Wüste, Berge, Taiga, Sumpf, Tundra), Höhlensysteme,
Erzverteilung nach Tiefe, drei Baumarten, Blumen, Kakteen, Zuckerrohr, Kürbisse,
Seen und Lavaseen.

**Geländemodell** — die dritte Klimaachse neben Temperatur und Feuchte ist die
**Erosion**: sie entscheidet, ob eine Gegend alt und abgetragen ist oder jung und
schroff, läuft auf einer gröberen Skala als die Biome und zieht ein Gebirge
darum quer durch mehrere hindurch. Die Berge selbst entstehen aus
**Kammrauschen** — `1 - |n|` faltet das Rauschen an der Null und macht aus
runden Buckeln scharfe Grate. Ergebnis: zusammenhängende Massive mit Gipfeln bis
y 110 statt überall etwas Hügel. Wüsten haben Dünenzüge, sichtbare Sandsteinbänke
an den Abbruchkanten und Baumgerippe. Die Oberfläche richtet sich nach der
Hangneigung: an einer Steilwand hält kein Gras, und die Schneekappe fängt auf
ihrer Höhe an, nicht an einer Biomgrenze.

Weil nur der Unterschied zur Generierung gespeichert wird, trägt jede Welt die
**Version** mit, unter der sie entstanden ist. Ältere Spielstände laufen darum
weiter über das alte Modell — sonst stünde jedes gebaute Haus plötzlich in einer
anderen Landschaft.

**Bäume** — nicht mehr pro Block gewürfelt, sondern höchstens einer je Zelle von
5×5 Blöcken an einer aus der Zellkoordinate gehashten Stelle. Der Mindestabstand
kommt damit von selbst, und Wälder wachsen nicht mehr zu Wänden zusammen. Große
Eichen und Fichten haben einen 2×2-Stamm, Äste und eine Krone aus mehreren
Laubballen; ein grobes Rauschen legt Lichtungen und Dickichte darüber. Auf zu
steilem Hang wächst statt eines großen ein kleiner Baum.

**Welt anpassen** — vor dem Start lässt sich die Generierung einstellen: Welttyp
(Standard, Verstärkt, Große Biome, Flachland), Bergigkeit, Höhlenanteil,
Meeresspiegel, Biomgröße, Bewuchs, Erzhäufigkeit und ob Dörfer entstehen. Die
Werte wandern in den Spielstand; ältere Spielstände laufen mit den Standardwerten
weiter.

**Dörfer** — deterministisch aus dem Seed, etwa alle 320 Blöcke außerhalb von
Ozean, Strand, Sumpf und Bergen. Brunnen, Wohnhäuser, Schmiede, Bibliothek und
Weizenfelder hinter Zaun und Zauntor; Baumaterial richtet sich nach dem Biom.
Truhen in Häusern und Schmiede sind gefüllt — Brot, Werkzeug, Erz, gelegentlich
ein Smaragd.

Kein Plateau mehr: **Bauplätze werden gesucht, nicht zugeteilt**. Jedes Haus
bekommt seine eigene Höhe und einen Sockel aus Bruch- oder Sandstein bis zum
Boden; zu steile oder nasse Plätze fallen durch. Verbunden wird über eine
Dijkstra-Suche vom Brunnen über das ganze Dorffeld: Steigung kostet,
Hausgrundstücke sind gesperrt, und Kanten über einen Block Höhenunterschied gibt
es gar nicht — jeder gefundene Weg ist damit auch begehbar. Weil alle Wege
denselben Baum benutzen, laufen sie von selbst zusammen; Laternen stehen an den
Verzweigungen. Ein Dorf auf welligem Gelände zieht sich dadurch den Hang
entlang, statt ihn wegzuplanieren, und der Wald wächst bis an die Häuser heran.

**Der Weg nach oben** — die vier Welten bauen aufeinander auf: in der Oberwelt
sucht man Obsidian für das Netherportal, im Nether die Bastionen, weil nur dort
Glowstone liegt und Glowstone der Rahmen für das Aetherportal ist. Der Aether
gibt die beste Rüstung her — und mit ihr den Kompass, der die Festung mit dem
Endportal findet. Aufgeschlossen wird es mit zwölf Enderaugen. Dahinter wartet
der Drache.

**Kompass** — vier Eisenbarren und ein Redstone. In der Hand blendet er oben ein
Band mit den Himmelsrichtungen ein, darunter die eigenen Koordinaten. Norden
liegt wie im Original auf −Z.

**Redstone** — eigener Reiter im Kreativmenü. Redstonestaub wird direkt als Leitung
gelegt und trägt ein Signal 15 Blöcke weit, wobei es pro Block eine Stufe verliert.
Geschaltet wird mit **Hebel**, **Knopf** (springt nach einer Sekunde zurück) und
**Druckplatte** (reagiert auf Spieler und Mobs); der **Redstoneblock** ist eine
Dauerquelle. Der **Verstärker** frischt das Signal wieder auf 15 auf, lässt es nur in
eine Richtung durch und verzögert es um 1 bis 4 Redstoneticks — die Stufe stellt ein
Rechtsklick um, und die beiden Fackelstummel obendrauf zeigen Richtung und
Einstellung an. Als Verbraucher hängen Lampe, Eisentür, Zauntor, Holztür und TNT daran.

**Starke und schwache Aufladung** — der Kern der Verschaltung, wie im Original.
*Stark* aufgeladen kann ein Block eine frische Leitung speisen und eine Fackel
umschalten; das tun Hebel und Knopf mit ihrem Trägerblock, die Druckplatte mit dem
Block darunter, der Verstärker mit dem Block vor sich, die Fackel mit dem Block über
sich und eine Leitung mit dem Block, auf dem sie liegt. *Schwach* aufgeladen schaltet
ein Block nur Mechanismen, die ihn berühren — und schwach lädt eine Leitung die
Blöcke auf, in die sie waagerecht zeigt. Daraus folgt beides, was man erwartet: ein
Hebel an einer Wand speist die Leitung auf der anderen Seite, eine Lampe hinter einem
Block geht an — aber ein Signal läuft nicht endlos von Block zu Block weiter. Eine
**Redstonefackel** erlischt, sobald ihr Trägerblock aufgeladen ist, stark oder
schwach; eine Leitung, die auf dem Block liegt oder nur seitlich in ihn hineinzeigt,
schaltet sie also ab. Das ist das Nicht-Gatter, aus dem sich Und, Oder und Taktgeber
bauen lassen.

**Taktgeber** — die Verzögerung des Verstärkers ist ein echter Zeitgeber, kein
Zufallswert, und darum lässt sich der klassische Fackeltaktgeber bauen: ein
Trägerblock, eine Redstonefackel an seiner Seite, und eine Staubschleife, die von der
Fackel über einen Verstärker zurück in den Trägerblock führt. Die Fackel schaltet sich
darüber selbst ab und wieder an; die Periode ist 2 × (2 + 2 × Stufe) Ticks, also 0,4 s
bis 1,0 s. Wichtig ist nur, dass die Schleife dem Trägerblock nicht zu nahe kommt —
liegt Staub direkt neben ihm, hält sich das Signal selbst und der Takt bleibt stehen.

**Rezeptbuch** — zwei Knöpfe in jedem Inventarfenster. Das Buch listet alle 196
Rezepte mit Zutatengitter und Ergebnis, blätterbar und nach Ergebnis durchsuchbar;
Sammelbegriffe wie „jede Brettersorte" zeigen einen Vertreter.

**Erfolge** — 27 Stück als Baum, aufgebaut wie im Original: die Oberweltkette von
„Ein Anfang" bis zum Diamanten ist die aus Minecraft, ab dem Nether folgt der Baum
unserer eigenen Weltenfolge — Glowstone öffnet den Aether, Gravitit führt zum
Helmkompass, der Kompass zur Festung, Lohenrute und Enderperle zum Auge, das Auge
ins Ende. Wer einen Erfolg überspringt, bekommt seine Vorgeschichte rückwirkend
angerechnet.

**Nether** — Portal aus einem Obsidianrahmen (4×5, zehn Blöcke), gezündet mit dem
Feuerzeug. Dahinter liegt eine geschlossene Höhlenwelt zwischen zwei
Grundgesteinsdecken: Netherrack, Seelensand (bremst), Magmablöcke (die brennen),
Netherquarz und Zaniterz in Adern, Lavaseen im Untergeschoss. Die Bänke und
Pfeiler in der Halle sind massiver Fels — im Mittel ein halbes Dutzend Blöcke
dick, damit man darauf gehen und darin graben kann, ohne durchzubrechen. Kein
Tageslicht, roter Dunst, kurze Sicht. Bewohnt ausschließlich von den Kreaturen
der Dimension: überwiegend Piglins, dazu Ghasts, die Feuerbälle werfen, und
Magmawürfel — Lava macht ihnen allen nichts aus. Ein Block im Nether entspricht
acht in der Oberwelt, ein Portal dort spart also Wege.

**Lohen** — schwebende Köpfe, umkreist von zwei gegenläufigen Ringen brennender
Ruten. Sie schießen Flammen, die wehtun, aber kein Loch ins Gelände reißen. Es
gibt sie nur rund um eine Bastion, höchstens vier auf einmal, und sie sind die
einzige Quelle für **Lohenruten** — damit auch der Schlüssel zu den Enderaugen.

**Bastionen** — kleine Festungen aus Netherziegeln, etwa alle 160 Blöcke, an
ihren vier Glowstone-Leuchtfeuern schon von weitem zu erkennen. Sie sind die
**einzige** Glowstonequelle im Spiel. Eine Bastion bringt vierzehn Blöcke, das
sind nach dem Zerlegen und Neuzusammensetzen genau die zehn für einen
Aetherrahmen; die Truhe im Inneren ist der Puffer.

**Zanitrüstung** — im Nether zu Hause und dort auch das einzige Rüstungsmetall.
Jedes getragene Teil nimmt ein Viertel des Hitzeschadens weg, alle vier machen
gegen Lava, Feuer und Magma vollständig immun. Gegen einen Kaktus hilft sie
nicht.

**Aufwertung statt Herstellung** — die beiden besten Rüstungen fallen nicht mehr
aus dem Nichts an. Ein **Diamantteil**, in der Werkbank ringsum mit vier Zaniten
belegt, wird zum Zanitteil; ein Zanitteil mit vier Gravititen zum Gravititteil.
Der Zustand des eingesetzten Stücks geht anteilig mit über — wer einen halb
durchgeschlagenen Panzer aufwertet, bekommt keinen fabrikneuen zurück. Ein
vollständiger Gravititsatz kostet damit 24 Diamanten, 16 Zanit und 16 Gravitit.

| Ziel | Diamant | Zanit | Gravitit |
|---|---|---|---|
| Zanitrüstung komplett | 24 | 16 | — |
| Gravititrüstung komplett | 24 | 16 | 16 |

**Detektorhelm** — ein Zanithelm, in der Werkbank rundum mit acht Diamanten
belegt. Er schützt wie sein Vorgänger und meldet alle dreißig Sekunden, wenn im
Umkreis von zwanzig Blöcken etwas Lohnendes im Gestein steckt: Diamant, Smaragd,
Gold, Lapis, Redstone, Netherquarz, Ambrosium, Zanit oder Gravitit. Kohle und
Eisen zählen nicht — die liegen ohnehin überall. Das Signal ist ein kurzer
Schimmer am Rand des Sichtfelds, kräftiger je näher der Fund; in der Bildmitte
bleibt es frei, damit es beim Graben nicht stört. Er sagt nur, dass etwas da ist,
nicht wo — die Richtung muss man selbst suchen.

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
Endportalrahmen: zwölf Blöcke im 5×5-Quadrat ohne Ecken, genau wie im Original,
und wie dort steckt in jedem zehnten schon ein Auge.

**Enderaugen** — der Weg dorthin ist der aus dem Original: eine **Lohe** an einer
Netherbastion lässt Lohenruten fallen, eine Rute wird zu zwei Lohenstaub, Staub
plus **Enderperle** vom Enderman gibt ein Enderauge. Eine Perle lässt sich auch
werfen — man landet dort, wo sie aufschlägt, und das kostet wie im Original
etwas Leben. Zwölf davon in die Rahmen,
dann reißt die Fläche auf. Gefunden wird die Festung aber nicht mit geworfenen
Augen, sondern über den Kompass im HUD des Gravitithelms.

**Das Ende** — eine Insel aus Endstein in der violetten Leere, zehn
Obsidiantürme im Kreis darum, auf jedem ein Enderkristall auf einem Sockel aus
Grundgestein. In der Mitte eine Schale aus Grundgestein mit einem Pfeiler und
vier Fackeln: der erloschene Sockel des Ausgangsportals. Darüber kreist der
**Enderdrache**: 200 Leben, er stürzt sich auf den Spieler, fegt ihn mit dem
Flügelschlag weg und spuckt Feuerbälle. Solange ein Kristall steht, heilt er
sich — wer gewinnen will, sprengt erst die Türme leer. Fällt er, füllt sich die
Schale mit Portalfläche, das Drachenei erscheint auf dem Pfeiler, und wer
hindurchgeht, sieht den Abspann und steht wieder an seinem Spawnpunkt — im Bett,
falls eines gesetzt ist. Dazu streifen Endermen über die Insel.

**Dorfbewohner & Handel** — fünf Berufe (Bauer, Bibliothekar, Schmied, Metzger,
Steinmetz) mit eigener Robe und je drei bis vier Angeboten. Rechtsklick öffnet das
Handelsfenster: Waren gegen Smaragde und umgekehrt, mit begrenztem Vorrat je
Angebot. Beruf und Angebote hängen an Dorf und Platznummer — ein Bewohner, der
nach dem Entladen neu erscheint, bietet wieder dasselbe an. Bei Einbruch der
Nacht oder wenn ein Monster in die Nähe kommt, geht jeder in sein Haus und macht
die Tür hinter sich zu; Zombies haben es auf sie abgesehen.

**Blöcke & Items** — rund 170 Blöcke inklusive Treppen, Stufen, Zäunen, Zauntoren,
Türen, Leitern, Fackeln (auch an Wänden), Glas, 16 Wollfarben, Werkbank, Ofen,
Truhe, Bett, TNT, Ackerboden, Zaubertisch, Amboss, Braustand, Kolben und
Beobachter. Rund 300 Items: Werkzeuge und Waffen in 8 Materialstufen, Rüstung in
6 Stufen, Nahrung, Rohstoffe, Kompass, Karte, neun Tränke.

**Spielschleife** — 196 Rezepte (2×2 und 3×3, geformt und ungeformt);
Holzrezepte akzeptieren jede Brettersorte. Ofen mit Brennstoffverwaltung, Truhen
als Lager, Ackerbau vom Pflügen bis zur Ernte, Feuer per Feuerzeug, TNT mit
Kettenreaktion.

**Überleben** — Leben, Hunger mit Sättigung und Erschöpfung, Rüstungsschutz, Fall-,
Ertrinkungs-, Lava- und Kaktusschaden, Regeneration, Tod mit Item-Drop und Respawn,
Erfahrungsstufen, Schlafen im Bett zum Setzen des Spawnpunkts.

**Mobs** — Schwein, Kuh, Schaf (16 Wollfarben, scherbar), Huhn, Zombie, Skelett
(schießt Pfeile), Creeper (zündet und explodiert), Dorfbewohner; im Nether
Piglin, Ghast, Magmawürfel und die Lohe an den Bastionen, im Aether Moa, Phyg,
Sheepuff, Cockatrice und Zephyr, im Ende der Enderdrache samt Enderkristallen.
Jeder Mob braucht **freie Sicht**, um jemanden aufzunehmen: durch eine Wand wird
niemand wütend, egal wie nah man steht. Undurchsichtige Blöcke halten den Blick
auf, Gras, Fackeln und Glas nicht.
Der **Enderman** läuft in allen Welten herum, friedlich, bis man ihn wirklich
anvisiert: gewertet wird, wie weit der Blickstrahl an seinem Kopf vorbeigeht, und
nach anderthalb Sekunden wird er wütend — auf halbem Weg dorthin zuckt er
sichtbar und hörbar, das ist die Vorwarnung. Solange er ruhig ist, springt er nur
umher und macht dabei einen weiten Bogen um den Spieler. Wütend setzt er über
größere Entfernung nach, aber nur mit freier Sicht und nie näher als acht Blöcke —
und wer ihn zwanzig Sekunden aus den Augen hält, ist ihn los. Er meidet Wasser.
In der Oberwelt ist er eine Seltenheit: eine von vierundzwanzig nächtlichen
Erscheinungen, höchstens zwei gleichzeitig.
Spawn nach Lichtlevel und Tageszeit, Wegfindung mit Hindernissprung, Rückstoß,
Drops, XP-Kugeln.

**Physik & Simulation** — fließendes Wasser und Lava mit 8 Fließstufen,
Lava + Wasser → Obsidian/Bruchstein, fallender Sand und Kies, Pflanzenwachstum,
Grasausbreitung, Blattzerfall, Explosionen mit Blockschaden und Rückstoß.

**Unendliches Wasser** — liegen zwei Quellblöcke mit einem Feld Abstand, wird das
Feld dazwischen selbst zur Quelle. Damit lässt sich ein Becken bauen, aus dem man
beliebig oft schöpfen kann. Für Lava gilt das wie im Original *nicht*.

**Verzauberung** — Zaubertisch aus einem Buch, zwei Diamanten und vier Obsidian.
**Bücherregale** zählen nach der Originalregel: genau zwei Blöcke entfernt auf
einer Waagerechten, bis zu zwei auf der anderen, auf Tischhöhe oder einen
darüber, und dazwischen muss Luft sein. Fünfzehn davon heben den unteren Platz
verlässlich auf Stufe 30 — der Regalkreis ist damit ein Bauprojekt, kein Detail.

Gewürfelt wird wie im Original: eine Grundzahl aus Regalen und Zufall, daraus die
drei Plätze, dann der Verzauberungswert aus der **Verzauberbarkeit** des
Materials mit dreieckigem Streufaktor, Auswahl nach Gewicht, Halbieren und
Nachziehen mit `(Wert+1)/50`. Bezahlt werden nur **1 bis 3 Stufen und ebenso viel
Lapis** — die angezeigte Stufe ist bloß die Voraussetzung. (Das überrascht viele
und ist genau deshalb wichtig, es richtig zu machen.) Für Heiligstein, Zanit und
Gravitit, die es im Original nicht gibt, sind eigene Werte gesetzt: Zanit ist das
magischere Material, Gravitit hart wie Diamant.

23 Verzauberungen, und jede wirkt wirklich:

| Bereich | Verzauberung |
|---|---|
| Werkzeug | Effizienz I–V, Behutsamkeit, Glück I–III |
| Waffe | Schärfe I–V, Bann I–V, Nemesis I–V, Rückstoß I–II, Verbrennung I–II, Plünderung I–III |
| Bogen | Stärke I–V, Schlag I–II, Flamme, Unendlichkeit |
| Rüstung | Schutz I–IV, Feuerschutz, Explosionsschutz, Geschossschutz, Federfall, Atmung I–III, Wasseraffinität, Dornen I–III |
| überall | Haltbarkeit I–III, Reparatur |

**Amboss** — drei Eisenblöcke auf vier Barren. Er macht aus der Verzauberung erst
einen Kreislauf: reparieren mit Material oder mit einem zweiten Stück
(Resthaltbarkeit plus zwölf Prozent), Bücher übertragen, gleiche Verzauberungen
zu einer höheren Stufe verschmelzen, umbenennen. Die Preise hängen an der
Seltenheit und sind aus einem Buch halb so hoch; die **Vorarbeitsstrafe**
verdoppelt sich mit jedem Vorgang und läuft bei vierzig Stufen in *Zu teuer!*.
Der Amboss nutzt sich in drei Stufen ab und fällt wie Sand, wenn ihm der Boden
fehlt.

**Verzauberungsbücher** kommen aus dem Zaubertisch — ein leeres Buch statt eines
Werkzeugs hineingelegt, und alle 23 Verzauberungen sind erreichbar, die seltenen
entsprechend selten (Unendlichkeit, Behutsamkeit, Flamme und Reparatur zusammen
unter drei Prozent der Angebote). Dazu vom **Bibliothekar**, dessen Angebot fest
an Dorf und Platznummer hängt, sodass derselbe Bewohner nach dem Entladen wieder
dasselbe Buch anbietet, und aus den Truhen in Monsterräumen und Minen.

Das Angebot am Tisch hängt an einer **Saat**, die am Tisch klebt: dasselbe
Angebot beim Zumachen und Wiederöffnen, ein neues nach jedem Verzaubern.

**Monsterräume** — höchstens einer je Chunk, und nur dort, wo er eine Höhle
anschneidet: ein Verlies, das man nur durch Zufall angräbt, ist keins. Sieben mal
sieben aus Bruch- und Moosstein, ein **Spawner** in der Mitte, ein bis zwei
Truhen. Welcher Mob aus dem Käfig kommt, steckt in seiner Position statt in einem
Blockzustand und übersteht damit jedes Speichern von selbst. Er speit nur im
Dunkeln und hört bei sechs Mobs in der Nähe auf — mit Fackeln legt man ihn still.

**Verlassene Minen** — ein Gangnetz als Irrfahrt aus geraden Stücken über acht
mal acht Chunks: drei Blöcke breit, Stützgerüst aus Zaun und Planken alle fünf
Schritt, Fackeln, Spinnweben und gelegentlich eine Truhe. Wer in einer Spinnwebe
steckt, kommt kaum vorwärts.

**Kolben** — in sechs Richtungen, geschoben werden bis zu zwölf Blöcke. Obsidian,
Truhen, Öfen und alles mit eigenem Inhalt bleiben stehen, Pflanzen und Fackeln
geben nach. Der ausgefahrene Kopf ist kein zweiter Block, sondern **Schubplatte
und Stange**: vorne vier Sechzehntel Platte über die volle Fläche, dahinter eine
4×4-Stange zurück zum Körper. Der **Klebkolben** zieht beim Einfahren wieder mit
und trägt die grüne Klebefläche auch auf dem Kopf; klebrig wird er mit einem
Schleimball vom Magmawürfel. Die Bewegung selbst läuft ohne Zwischenbild — das
Original schiebt sichtbar in zwei Ticks hinaus, dafür bräuchte jeder Block eine
eigene Entität.

**Beobachter** — hängt nicht an der Aufladung, sondern an der Veränderung: er
merkt sich den Block vor sich und gibt nach hinten einen kurzen Impuls ab, sobald
der wechselt. Damit lässt sich automatisieren, ohne einen Fackeltaktgeber
danebenzustellen. Er zeigt beim Setzen in Blickrichtung, der Kolben umgekehrt zum
Spieler — beides wie im Original.

**Statuseffekte** — acht Stück mit Stufe und Restzeit, angezeigt am rechten Rand
und im Spielstand gespeichert: Regeneration, Stärke, Schnelligkeit,
Feuerresistenz, Nachtsicht, Sprungkraft, Heilung und Schaden. Der goldene Apfel
gibt seitdem Regeneration statt vier Herzen pauschal.

**Brauen** — der Weg beginnt am Wasser: drei Glas ergeben drei **Glasflaschen**,
ein Rechtsklick auf eine Wasserfläche füllt eine davon. **Nethergewächs** wächst
im Nether auf den Seelensandnestern; das ist endlich ein Grund, dort nach etwas
anderem als Glowstone zu suchen. Der
**Braustand** entsteht aus einer Lohenrute auf drei Bruchsteinen, brennt mit
Lohenstaub und füllt drei Gläser auf einmal. Neun Tränke, jeder streckbar mit
Redstone und verstärkbar mit Glowstone. Drei Zutaten weichen vom Original ab,
weil es Glitzermelone, Magmacreme und goldene Karotte bei uns nicht gibt — dafür
haben wir Ambrosium, Magmablöcke und Blaubeeren, die dasselbe erzählen. Die
Ghastträne für die Regeneration lässt der Ghast fallen.

**Karte** — Papier um einen Kompass. Der Ausschnitt wird beim ersten Tragen
festgelegt und rastet auf ein Vielfaches von 128 Blöcken ein; zwei Karten aus
derselben Gegend zeigen also denselben Ausschnitt. Erkundet wird, worüber man
gelaufen ist, der Rest bleibt dunkel. Gezeichnet wird aus geladenen Chunks, wo es
sie gibt — so tauchen gebaute Häuser auf — und sonst aus dem Generator; die Höhe
der Nachbarspalte gibt die Schattierung. In der Hand liegt sie klein unten
rechts, **N** macht sie groß.

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
* alle Texturen zur Laufzeit per Canvas erzeugt (365 Stück) statt Bilddateien
* alle Klänge per WebAudio synthetisiert statt Audiodateien
* Chunk-Meshing zeitbudgetiert im Main-Thread statt in Workern

## Noch offen

**Als Nächstes:** der Bilderrahmen zur Karte. Er bräuchte eine Textur, die sich
zur Laufzeit ändert, und dafür eine eigene Ebene im Texturarray — das ist ein
Umbau am Renderer, kein Nachmittag.

Loren, Werfer und Trichter, Wurftränke, Tierzucht, Angeln, Mehrspieler. Im Ende
fehlen die äußeren Inseln und das Wiederbeleben des Drachen. Im Aether fehlen die
drei Dungeons und reitbare Moas. Dorfbewohner laufen geradlinig auf ihr Ziel zu
statt einen Weg zu suchen; mit dem neuen Wegenetz kommen sie zwar meist an, ein
Haus hinter einer Mauer erreichen sie aber weiterhin nicht. Ihre schon getätigten
Handelszüge überleben das Entladen des Dorfes nicht — der Vorrat eines Angebots
füllt sich dann wieder auf.

## Voraussetzungen

Ein Browser mit WebGL2 — Chrome, Edge oder Firefox in aktueller Version.

## Lizenz

Privates Lernprojekt. Minecraft ist eine Marke von Mojang Studios; dieses Projekt
steht in keiner Verbindung zu Mojang oder Microsoft.
