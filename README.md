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
       achievements · player · renderer · audio · herobrine · worlds
       commands · mobile · ui · main
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
| `Strg` / `Doppel-W` | Sprinten | `P` | Modus: Überleben/Kreativ/Zuschauer |
| | | `J` | Musik an/aus |
| `Doppel-Leertaste` | Fliegen (Kreativ/Zuschauer) | `R` | Speichern |
| `T` | Chat / Befehlszeile | `/` | Befehlszeile mit Schrägstrich |
| `N` | Karte groß/klein | `F5` | Ansicht: Ich / hinten / vorne |
| | | `F1` | Hand ein- und ausblenden |
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

**Am Handy** — wird ein Touchgerät erkannt (`pointer: coarse` **und**
Berührungspunkte, kein Raten am User-Agent), legt sich ein Steuerungsoverlay
über das Spiel. Der Knüppel unten links entsteht dort, wo der Daumen aufsetzt;
ganz ausgelenkt heißt sprinten. Rechts liegen **Aktion** und **Benutzen**, dazu
Springen, Ducken und Inventar, in den oberen Ecken Menü, Chat, Karte und Debug.
Das Symbol des Aktionsknopfes folgt dem Ziel — Schwert bei einer Kreatur,
Spitzhacke bei einem Block —, denn beides ist dieselbe Taste. Langes Drücken
auf einen Slot ersetzt den Rechtsklick zum Stapelteilen. Nur im Querformat;
hochkant kommt ein Hinweis.

Halten und dabei wischen dreht auf **allen vier Halteknöpfen** die Kamera mit —
abbauen, setzen, springen, ducken. Und die Empfindlichkeit des Umsehens lässt
sich im Pausenmenü in sieben Stufen einstellen; der Wert vom Rechner passt am
Daumen nicht und ist ohnehin Geschmackssache.

Der Knüppel läuft **stufenlos**: eine kleine Auslenkung geht langsam, eine
große schnell, und ab 86 % springt der Sprint an. Der gestrichelte Ring auf dem
Knüppel zeichnet genau diese Schwelle nach und leuchtet grün, sobald sie
erreicht ist — sonst rät man, wie weit man ziehen muss.

Zwei Gesten, die es am Rechner nicht braucht: **auf dem Aktionsknopf wischen**
dreht die Kamera mit, während er gedrückt bleibt — sonst müsste man zum
Abbauen jedes nächsten Blocks loslassen, sich umsehen und neu drücken. Und der
Knopf oben rechts blättert **im Halten und Wischen durch die Schnellleiste**,
weil neun Plätze am Daumen schlecht einzeln zu treffen sind.

Die Symbole sind als winzige SVG gezeichnet, nicht als Emoji. Emojis sehen auf
jedem Gerät anders aus, bringen eine fremde Schriftart mit und passen nicht zum
Pixelstil — und eine Datei wollten wir auch nicht.

Entscheidend ist, was **nicht** passiert: es gibt keine zweite Spiellogik. Der
Knüppel schreibt in dieselben Tastenflags wie die Tastatur, das Ziehen in
dieselben `dx/dy` wie die Maus. `Player.update` merkt keinen Unterschied.

Zwei Dinge sind dabei heikler, als sie aussehen. **Der Browser hält die Gesten
für seine** — `user-scalable=no` im Viewport-Meta hilft auf iOS seit Version 10
nachweislich nicht mehr, Apple ignoriert die Angabe. Es braucht
`touch-action: none`, `preventDefault` mit `passive: false` und die
iOS-eigenen gesture-Ereignisse, und das alles **nur auf Canvas und Overlay** —
in Inventar und Menü bleibt das Zoomen erlaubt, denn es zu verbieten nimmt es
auch denen, die es zum Lesen brauchen. Und **mehrere Finger**: wer `touches[0]`
liest, baut sich den Fehler ein, dass ein zweiter Finger dem Knüppel die
Bewegung wegnimmt. Darum Pointer Events mit `pointerId` und
`setPointerCapture` — jeder Zeiger gehört ab dem Aufsetzen genau einem
Bedienelement. Geprüft mit vier gleichzeitigen Fingern: laufen, umsehen,
springen und abbauen stören einander nicht.

Am Rechner ändert sich davon nichts. `mobile.js` meldet sich nicht an, die
Klasse am `<html>` fehlt, keine einzige der neuen CSS-Regeln greift. Im
Pausenmenü lässt sich die Touch-Steuerung von Hand ein- und ausschalten.

**Startbildschirm** — kein Standbild und kein schwarzer Kasten: hinter dem Menü
läuft eine **echte Welt**. Beim Aufrufen des Hauptmenüs wird aus einem von fünf
Seeds eine Welt erzeugt, eine Kamera auf eine Kuppe gestellt und langsam
geschwenkt — dieselbe Generierung und derselbe Renderer wie im Spiel. Gesucht
wird dabei nicht der höchste Gipfel (von dort sieht man nur Himmel), sondern ein
mäßig erhöhter Punkt mit Relief ringsum. Kostet einmalig gut 200 ms.

Darüber liegt das Menü im Stil des Originals: der Schriftzug ist mit der
**Grasblock-Textur gefüllt** — die liegt ohnehin prozedural im Speicher —, hat
einen versetzten Schatten und eine dunkle Kante, damit er vor der Landschaft
stehen bleibt. Rechts unten am Logo hängt schräg der gelbe **Spruch**, der bei
jedem Aufruf aus zwei Dutzend wechselt und im Takt wippt. Die Knöpfe haben den
hellen Rand oben links und den dunklen unten rechts, unten stehen in den beiden
Ecken Fassung und Hinweis. Hotbar, Lebensbalken und Fadenkreuz sind auf dem
Startbildschirm ausgeblendet.

**Außenansicht** — `F5` schaltet der Reihe nach auf **Ich**, **hinter dir** und
**von vorne**; am Handy sitzt der Knopf dafür oben links neben Menü und Chat.

Das Bemerkenswerte daran ist, wie wenig sich dafür ändern musste: **es wandert
nur die Kamera**. Gezielt, geschlagen und gesetzt wird weiterhin vom Auge aus —
jeder Raycast im Spiel geht von `p.eyeY()` aus, keiner von der Kamera. Ein
Block bricht also genau dort, wo er in der Ich-Ansicht auch gebrochen wäre.

Die Kamera weicht bis zu vier Blöcke zurück und wird dabei **an Wänden
gekürzt**: sie tastet den Weg nach hinten ab und bleibt einen guten Drittelblock
vor dem ersten undurchsichtigen Block stehen — gemessen 4,0 im Freien und 0,35
mit einer Wand direkt daneben. Ohne das schaut die Nahebene durch die Mauer, und
man sieht das Innere des Berges.

Die Figur ist **keine Entität in der Welt**, sondern wird jedes Bild aus dem
Spielerzustand zusammengesetzt: dasselbe Modell und dieselbe Animationsmaschine,
die jede Kreatur benutzt. Der Kopf dreht und neigt sich getrennt vom Körper, die
Beine schwingen beim Laufen, der rechte Arm holt beim Schlag aus, geduckt sinkt
die Figur ab. Das gehaltene Werkzeug hängt dabei wirklich in der rechten Hand —
sein Griffpunkt kommt aus derselben Rechnung wie das Armmodell, also kippt es
beim Ausholen mit. Rüstung trägt die Figur noch nicht; dafür bräuchte jedes Teil
eine eigene Textur.

In der Ich-Ansicht ändert sich nichts, in der Außenansicht bleibt die Hand vor
der Kamera weg. `F1` blendet sie unabhängig davon aus — das lag vorher auf `F5`.

**Herobrine** — die alte Legende, die auf die Anfangszeit von Minecraft
zurückgeht: ein Screenshot, ein Forenbeitrag, eine Geschichte, die nie stimmte
und trotzdem nie wegging. Er war nie im Spiel. Hier ist er es — aber **nicht als
Gegner**. Er greift nicht an, lässt sich nicht schlagen, gibt nichts her und
sagt nichts. Er steht nur da, wo keiner stehen sollte.

Zwei Auftritte, beide selten (im Mittel gut eine Stunde Spielzeit, danach zehn
Minuten Ruhe):

*In der Ferne* steht er plötzlich am Rand der Sicht, vierzig bis sechzig Blöcke
weit weg, immer mit freier Sichtlinie — hinter einer Wand wäre er keiner. Geht
man auf ihn zu, ist er nach zweieinhalb Blöcken weg. Sieht man stattdessen weg,
rückt er genau in diesem Augenblick näher, wie ein Weinender Engel: 43 → 29 → 21
→ 13 → 10 Blöcke. Näher als zehn kommt er nie; dort verschwindet er beim
nächsten Blickwechsel oder Schritt. Ab dem zweiten Sprung hört man ihn dabei ganz
leise — gerade so, dass man sich hinterher nicht sicher ist.

*Direkt hinter einem* erscheint er, wenn man länger als eine halbe Minute
stillsteht: erst ein tiefes, kurzes Wehen, dann steht er zwei Blöcke im Rücken.
Dreht man sich um, ist er eine halbe Sekunde später weg.

Er **rührt sich nie**: keine Schritte, keine Arme, kein Kopfdrehen. Das Modell
trägt dafür ein eigenes Feld `starr`, das der Renderer vor jeder Gliedrotation
prüft — auch mit erzwungener Laufanimation steht er reglos da. Jede Regung
machte ihn zu einer Figur, die etwas vorhat; genau das soll er nicht sein.

Ob er überhaupt auftaucht, hängt an `/gamerule herobrine`. Ein Spawn-Ei gibt es
für ihn nicht, und **`/summon herobrine` stellt ihn nicht vor die Füße, sondern
löst den Auftritt in der Ferne aus** — hingesetzt wäre er nur eine Figur, der
Auftritt ist die ganze Kreatur.

**Welten** — mehrere Spielstände nebeneinander, jeder mit **Namen**. Die Liste
zeigt Modus, Seed, Weltversion, letztes Spieldatum und Größe; spielen,
umbenennen, kopieren und löschen geht je Zeile. Ein Name, den es schon gibt,
bekommt automatisch eine Nummer. Vorher gab es genau einen Spielstand unter
einem festen Schlüssel — eine neue Welt überschrieb die alte. Ein solcher alter
Spielstand wandert beim ersten Öffnen der Liste automatisch hinein.

Zwei Ablagen mit derselben Bedienung: der **Browserspeicher** läuft überall,
auch beim Start per Doppelklick, hängt aber am Browserprofil. Wer will, wählt
stattdessen einen **echten Ordner** — dann liegen die Welten dort als lesbare
`.json`-Dateien, überstehen das Leeren des Browsers und lassen sich kopieren wie
jede andere Datei. Das geht nur in Chrome und Edge und nur von einer Webseite
aus; beim Start aus dem Dateisystem verweigert der Browser den Zugriff, und
dann steht das im Menü auch so da. `Welt exportieren` und `Welt einlesen` gibt
es unabhängig davon.

**Befehle** — `T` öffnet die Chatzeile, `/` öffnet sie und setzt den Schrägstrich
gleich mit. Solange sie offen ist, ruht die Steuerung — sonst liefe man beim
Tippen von `W` los. **Tab** vervollständigt, **Pfeil hoch/runter** blättert durch
den Verlauf, Erfolg steht grün im Protokoll, ein Fehler rot mit der Stelle, an
der es klemmte.

Die Arbeit steckt im Gerüst, nicht in den einzelnen Befehlen: ein Zerleger, der
`~` (relativ zu dir) und `^` (relativ zu deiner Blickrichtung) versteht, und eine
**Zielauswahl** `@s @p @a @r @e` mit `type=`, `distance=..10`, `limit=`, `sort=`,
`name=` und einem Quader aus `x/y/z` und `dx/dy/dz`. Damit ist jeder Befehl nur
noch ein Tabelleneintrag.

Dabei sind: `gamemode`, `give`, `tp`, `time`, `kill`, `summon`, `setblock`,
`fill`, `clone`, `effect`, `enchant`, `xp`, `difficulty`, `seed`, `spawnpoint`,
`clear`, `say`, `me`, `help`, dazu `locate` und `gamerule` und ein
abgespecktes `execute` mit `as` und `at`. `locate` findet Dorf, Wrack, Tempel,
Mine, Wurmloch und Festung — alle unsere Strukturen kommen deterministisch aus
dem Seed, die Suche ist darum eine Schleife über Regionen und kein
Weltdurchlauf. `fill` und `clone` haben einen Deckel bei 32768 Blöcken.

Sechs **Spielregeln** liegen jetzt an einer Stelle statt verstreut im Code:
`keepInventory`, `doDaylightCycle`, `doMobSpawning`, `mobGriefing`,
`doTileDrops`, `doFireTick`. Sie wandern mit in den Spielstand.

Weggelassen ist alles, was Mehrspieler, NBT oder einen Punktestand braucht —
`/data`, `/scoreboard`, `/tag`, `/kick`. Die kosten mehr als alle anderen
Befehle zusammen und wirken ohne Unterbau kaum.

**Befehlsblöcke** — drei Sorten wie im Original, an der Farbe zu unterscheiden:
**Impuls** (orange) führt einmal aus, wenn das Signal ankommt, **Wiederholend**
(violett) in jedem Takt, solange es anliegt, **Kette** (türkis) hängt am Block
darüber und läuft, wenn der Erfolg hatte. Dazu die beiden Schalter *braucht
Redstone / immer aktiv* und *bedingt / unbedingt*. Rechtsklick öffnet das
Fenster mit Befehlszeile, Vervollständigung und der letzten Ausgabe. Sie sind
unzerstörbar wie Grundgestein und nur im Kreativmenü zu haben. Ein Deckel von
128 Ausführungen je Takt und 64 Kettengliedern hält einen wiederholenden Block
mit einem großen `fill` davon ab, das Spiel stillzulegen.

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

**Meer** — Ozean und Strand waren bis auf etwas Zuckerrohr leer. Weit draußen
sinkt der Grund jetzt in eigene **Becken bis vierzig Blöcke unter den
Meeresspiegel**; nah am Ufer bleibt es flach wie bisher. Der Meeresgrund hat
vier Arten: **Sandgrund**, **Seetangwald** mit Tangsäulen bis fast zur
Oberfläche, **Korallenriff** in fünf Farben mit Fächern und selten einem
**Schwamm**, und **kalte Tiefsee** aus Kies. Ein Riff entsteht nur, wo mindestens
fünf Blöcke Wasser darüber stehen, und endet zwei Blöcke unter der Oberfläche —
sonst ragte es aus dem Meer. An den Ufern liegen Lehm- und Kiesnester statt
reinem Sand. Fische ziehen in Schwärmen von vier bis zwölf durchs offene Wasser,
in der Tiefe in größeren; an Land zappeln sie und ersticken.

**Fluten** — Tang, Seegras und Korallenfächer verdrängen kein Wasser, sie nehmen
es auf. Entscheidend ist, dass das ein **Zustand** ist und keine Eigenschaft: ob
eine Pflanze Wasser hält, steht in ihrem Meta, nicht in ihrer Blockdefinition.
Ein Seegras an Land ist trocken, eines im Meer geflutet, und dieselbe Pflanze
wechselt den Zustand, wenn Wasser zu ihr fließt oder abläuft.

Daran hängt einiges: eine geflutete Pflanze zählt fürs Fließen als Quelle und
gibt das Wasser weiter, statt es aufzuhalten. Bricht man sie ab, bleibt das
Wasser stehen — sie hatte es ja nur aufgenommen. Setzt man sie ins Wasser, füllt
sie sich; setzt man sie an Land, bleibt sie trocken. Der Schwamm saugt auch das
Wasser aus ihr heraus, die Pflanze selbst bleibt stehen.

Ohne Wasser in der Zelle selbst fehlt dort die Oberfläche. In tiefem Wasser
fällt das nicht auf, bei einem Block Tiefe klafft genau dort ein Loch: in einem
Testbecken von 49 Feldern mit drei Pflanzen waren nur 24 Felder von einer
Wasseroberfläche bedeckt, jetzt alle 49 — und ein trockenes Seegras rendert
umgekehrt gar kein Wasser mehr.

**Was Wasser wegreißt** — alles ohne Masse, das kein Wasser aufnehmen kann:
Blumen, Fackeln, Setzlinge, Pilze, Getreide, Spinnweben. Sie werden zerstört und
halten das Wasser nicht auf. Vorher stand eine Blume dem Wasser im Weg wie eine
Mauer. Abgegrenzt wird über die Blockform, nicht über die Kollision — die Leiter
ist ebenfalls ohne Masse, trägt aber ihre Richtung im Meta.

**Schiffswracks** liegen halb im Sand: ein Rumpf, der zum Bug und zum Heck hin
schmaler wird, der Kiel schräg im Grund, Reling mit Lücken, eine Kajüte am Heck
und ein oft geknickter Mast. Etwa jede sechste Planke fehlt, und innen steht
Wasser. Die ein bis zwei Truhen halten Smaragde, Diamanten, Rüstung, Karten und
verzauberte Bücher. Der **Unterwassertempel** ist ein Stufenbau aus Prismarin
über drei Ebenen, innen trocken, an den Ecken Seelaternen, ganz oben eine
Schatzkammer mit acht Schwammblöcken. Bewacht wird er von **Wächtern**, die nur
in seiner Nähe erscheinen. Ihre Scherben ergeben Prismarin, Ziegel, dunklen
Prismarin und Seelaternen.

Ein gesetzter **Schwamm** saugt das Wasser im Umkreis von fünf Blöcken weg und
wird dabei nass; getrocknet wird er im Ofen.

**Welt anpassen** — vor dem Start lässt sich die Generierung einstellen: Welttyp
(Standard, Verstärkt, Große Biome, Flachland), Bergigkeit, Höhlenanteil,
Meeresspiegel, Biomgröße, Bewuchs, Erzhäufigkeit und ob Dörfer entstehen. Die
Werte wandern in den Spielstand; ältere Spielstände laufen mit den Standardwerten
weiter.

**Höhlen** — die alten Höhlen entstanden, indem drei Rauschfelder dort ausgehöhlt
wurden, wo sie nahe null lagen, und die Ergebnisse *vereinigt* wurden. Die
Nullfläche eines 3D-Rauschens hängt aber zusammen, und die Vereinigung dreier
solcher Flächen erst recht: gemessen lagen **99,8 % aller Höhlenluft in einer
einzigen Komponente**, die in einem Ausschnitt von 416 Blöcken 415 Blöcke weit
reichte. Wer runtergrub, landete zu 100 % in genau diesem einen weltumspannenden
Gerüst — Sackgassen gab es nicht.

Seit Version 7 werden zwei Felder stattdessen **geschnitten**: zwei Flächen
schneiden sich in einer Kurve, und daraus werden Röhren statt Hallen. Dazu kommt
eine flache **Gebietsmaske**, die entscheidet, wo es überhaupt Höhlen gibt. Dass
sie flach ist, ist der Trick — eine ebene Niveaumenge hängt genau ab der halben
Fläche zusammen, darüber zerfällt sie in getrennte Inseln, während dieselbe Maske
in drei Dimensionen längst durchgehend wäre. Sie ist so gesetzt, dass rund 35 %
der Karte Höhlengebiet sind, und am Gebietsrand laufen die Gänge aus. Ein drittes
Feld lässt die Gangweite entlang des Wegs wandern, damit sich ein Gang mal auf
einen Kriechgang zusammenzieht und mal etwas öffnet.

Der **Höhlenregler steht seit Version 8 auf 50 %** statt auf 100 %. Bei 100 %
waren die Gänge so weit, dass sich zu viel zu Sälen öffnete: gemessen lagen 26 %
der Höhlenluft dort, wo eine Kugel mit Radius 3 hineinpasst. Bei 50 % sind es
**8 %**, der Hohlraum unter Tage fällt von 25 % (Version 6) über 11 % auf **3,8 %**,
und die Weiten liegen zu drei Vierteln bei Radius 0 bis 1 — enge, begehbare
Röhren mit gelegentlicher Kammer. Ein Schacht nach unten trifft in gut einem
Viertel der Fälle etwas, statt wie früher immer. Alte Welten behalten ihren
alten Wert, sonst stünde jedes gebaute Haus plötzlich über anderen Höhlen.

Weil die Gänge enger sind, setzen sich **Monsterräume** gezielt auf eine Höhle
statt auf eine gewürfelte Tiefe — sonst wären sie von achtundzwanzig auf sieben
je 768 Chunks eingebrochen.

**Wurmlöcher** sind keine Höhlen, sondern eine eigene Struktur — etwa alle 440
Blöcke eine, also seltener als eine verlassene Mine. Was sie unheimlich macht,
ist ihre Gleichförmigkeit: der Querschnitt bleibt über die ganze Strecke exakt
derselbe, als hätte etwas sie gebohrt. Sie winden sich fast waagerecht **300 bis
700 Blöcke** durch den Fels und enden entweder oben an der Oberfläche — dann
findet man den Eingang als Loch im Boden — oder unten am Grundgestein, wo sie
einfach aufhören. Vom Höhlenregler bleiben sie unberührt.

Jeder Spielstand merkt sich zusätzlich die **Generatorversion**, mit der er
angelegt wurde, denn gespeichert wird nur der Unterschied zur Generierung. Ein
alter Spielstand läuft darum weiter über den alten Codepfad und sieht aus wie
vorher; die neuen Landschaften gibt es nur in einer neu angelegten Welt. Version
1 war der ursprüngliche Generator, 2 brachte Erosion, Bergkämme und große Bäume,
3 die Biome in Nether und Aether, 4 die Hochgebirgsgegenden, Erdrisse und
geglätteten Wüstenkanten, 5 die großen Bastionen samt Meeresgrund und Stränden,
6 die tiefen Meeresbecken, die Schiffswracks mit echtem Rumpf und die Riffe in
tieferem Wasser, 7 die getrennten Höhlensysteme, 8 die engeren Gänge und die
Wurmlöcher, 9 die Wasserpflanzen mit ihrem Flutzustand.

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

**Das Dorf merkt sich, was war** — Beruf und Angebote kommen deterministisch aus
Dorf-Id und Platznummer; das ist gut, denn ein Bewohner, der nach dem Entladen
neu erscheint, bietet wieder dasselbe an. Verlorengegangen ist dabei bisher
alles, was der *Spieler* getan hat: ein leergekauftes Angebot füllte sich beim
Wiederkommen von selbst auf.

Neben der Erzeugung liegt jetzt ein **Zustand in der Welt**, und der enthält nur
den Unterschied zu ihr — genau wie bei den Chunks: verbrauchte Angebote je
Platznummer, der Tag des letzten Nachschubs und der Ruf des Dorfes. Er wandert
mit in den Spielstand.

**Nachschub** gibt es einmal am Tag. Im Original arbeitet der Bewohner dafür an
seinem Arbeitsblock; den gibt es hier nicht, also zählt schlicht der
Tageswechsel — dafür führt die Welt jetzt einen Tageszähler neben der Tageszeit,
die ja immer wieder von vorn läuft.

**Ruf** hat jedes Dorf einen, von −15 bis +15: handeln hebt ihn um eins,
einen Bewohner schlagen senkt ihn um vier. Er hängt am Dorf und nicht am
Getroffenen — sonst nähme man sich einen nach dem anderen vor. Ab +8 kostet
jedes Angebot einen Smaragd weniger, ab −8 einen mehr, nie weniger als einen.

Dabei steckte ein Fehler, den man erst beim Nachrechnen sieht: die Zutatenliste
eines Angebots zeigte auf **dieselbe Liste in der Berufstabelle**. Ein
Preisnachlass für einen Bewohner änderte damit den Preis für alle — dauerhaft,
denn die Tabelle liegt im Modul und nicht in der Welt. Sie wird jetzt kopiert.

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

**Rezeptbuch** — zwei Knöpfe in jedem Inventarfenster. Das Buch listet alle 208
Rezepte mit Zutatengitter und Ergebnis, blätterbar und nach Ergebnis durchsuchbar;
Sammelbegriffe wie „jede Brettersorte" zeigen einen Vertreter.

**Erfolge** — 27 Stück als Baum, aufgebaut wie im Original: die Oberweltkette von
„Ein Anfang" bis zum Diamanten ist die aus Minecraft, ab dem Nether folgt der Baum
unserer eigenen Weltenfolge — Glowstone öffnet den Aether, Gravitit führt zum
Helmkompass, der Kompass zur Festung, Lohenrute und Enderperle zum Auge, das Auge
ins Ende. Wer einen Erfolg überspringt, bekommt seine Vorgeschichte rückwirkend
angerechnet.

**Netherbiome** — fünf Stück, auf einer viel kürzeren Skala als oben: ein Block
im Nether sind acht in der Oberwelt, sonst liefe man eine halbe Stunde durch
dasselbe. **Netherödland** ist der bekannte rote Fels. Das **Seelensandtal** ist
eine weite, kalte Senke aus Seelenerde, in der Knochenrippen stehen und
Nethergewächs von selbst wächst. **Karmesin-** und **Wirrwald** sind Pilzwälder
auf Nylium, mit dicken Stämmen, breiten Warzenkappen und Leuchtpilzen als
einziger Lichtquelle — der Wirrwald glimmt türkis, im Karmesinwald ist es dunkel
und rot. Das **Basaltdelta** ist Bruchgelände aus Basaltsäulen, Schwarzstein und
Magma.

Der Belag liegt dabei auf der *begehbaren* Oberfläche, nicht auf der nominalen
Bodenhöhe: die Netherrackbänke wachsen über den Boden hinaus, und ein Belag an
der Bodenhöhe verschwände unter ihnen.

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

**Bastionen** — Festungen aus Netherziegeln, etwa alle 160 Blöcke, an ihren vier
Glowstone-Leuchtfeuern schon von weitem zu erkennen. Auf einer Plattform von
27×27 Blöcken steht ein dreistöckiger Bergfried, an den Ecken vier Türme bis
achtzehn Blöcke hoch, darunter ein Kellergewölbe mit **zwei eigenen
Lohenspawnern**. Sie sind die **einzige** Glowstonequelle im Spiel; eine Bastion
bringt vierzehn Blöcke, das sind nach dem Zerlegen und Neuzusammensetzen genau
die zehn für einen Aetherrahmen. Die Truhen stehen über die ganze Anlage
verteilt und tragen Quarz, Gold, Diamanten, Lohenruten, Nethergewächs, Rüstung
und verzauberte Bücher.

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

**Aetherbiome** — ebenfalls fünf, auf Inselgröße: **Aetherwiesen** wie bisher,
der **Goldene Hain** mit dichten Goldeichen, viel Ambrosium und blühendem Boden,
die **Frostspitzen** mit Frostgras über Eisstein und Kristalllaub an den Bäumen,
die **Flugsandwüste**, die fast leer und spiegelglatt ist, und das
**Wolkenmeer**, in dem die Bänke so dicht hängen, dass man kaum ohne sie von
Insel zu Insel kommt.

**Stimmung** — jedes Biom in beiden Dimensionen färbt den Dunst, und der
Übergang wird geglättet, damit die Farbe an der Grenze nicht springt. Dazu liegt
etwas in der Luft: Asche im Basaltdelta, Sporen in den Pilzwäldern, Flirren über
den Frostspitzen. Auch die Bewohner richten sich nach dem Biom — das Seelensandtal
gehört den Ghasts, das Basaltdelta den Magmawürfeln, der Wirrwald den Endermen,
und im Goldenen Hain grasen Phygs.

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

**Dorfbewohner finden ihren Weg** — sie liefen bisher geradeaus auf ihr Ziel zu
und blieben an allem hängen, was dazwischenstand. Dabei liegt das Wegenetz längst
da: `wegenetz()` zieht es beim Bauen aus einer Dijkstra-Suche vom Brunnen, und
`v.wege` ist die fertige Maske. Wer darauf läuft, kommt überall hin, wo ein Weg
hinführt.

Gesucht wird mit einer Breitensuche über diese Maske — sie hängt zusammen, weil
alle Wege denselben Baum benutzen, und ein paar tausend Felder sind billiger als
jede Suche über echte Blöcke. Der gefundene Weg wird **begradigt**: übrig bleiben
nur die Stellen, an denen die Richtung wechselt, sonst zuckelt ein Bewohner von
Blockmitte zu Blockmitte statt eine Gerade zu laufen.

Zwei Regeln halten den Weg davon ab, mehr zu schaden als zu nützen. **Unter sechs
Blöcken zum Ziel gilt er nicht** — die Tür liegt neben dem Netz, und wer dort noch
einen Wegpunkt anläuft, dreht wieder von ihr weg. Und ist das Ziel selbst näher
als der nächste Wegpunkt, wird der Weg weggeworfen; er hat dann seinen Zweck
erfüllt. Wer zwei Sekunden lang nicht vorankommt, geht ebenfalls wieder gerade.

Gemessen an einem Dorf mit vierzehn Häusern, alle Bewohner vom Brunnen aus bei
Einbruch der Nacht: **mit Wegfindung kommen fünf von fünf zu Hause an**
(4 bis 20 Sekunden), ohne sie nur vier — einer fand sein Haus in zwei Minuten
nicht. Langsamer wurde dabei keiner.

Weil sie jetzt ankommen, haben sie auch tagsüber etwas davon: alle 15 bis 30
Sekunden sucht sich jeder ein **Ziel auf dem Wegenetz** und geht hin, statt um
seine eigene Tür herumzustehen.

**Dorfbewohner & Handel** — fünf Berufe (Bauer, Bibliothekar, Schmied, Metzger,
Steinmetz) mit eigener Robe und je drei bis vier Angeboten. Rechtsklick öffnet das
Handelsfenster: Waren gegen Smaragde und umgekehrt, mit begrenztem Vorrat je
Angebot. Beruf und Angebote hängen an Dorf und Platznummer — ein Bewohner, der
nach dem Entladen neu erscheint, bietet wieder dasselbe an. Bei Einbruch der
Nacht oder wenn ein Monster in die Nähe kommt, geht jeder in sein Haus und macht
die Tür hinter sich zu; Zombies haben es auf sie abgesehen.

**Blöcke & Items** — rund 220 Blöcke inklusive Treppen, Stufen, Zäunen, Zauntoren,
Türen, Leitern, Fackeln (auch an Wänden), Glas, 16 Wollfarben, Werkbank, Ofen,
Truhe, Bett, TNT, Ackerboden, Zaubertisch, Amboss, Braustand, Kolben und
Beobachter. Rund 370 Items: Werkzeuge und Waffen in 8 Materialstufen, Rüstung in
6 Stufen, Nahrung, Rohstoffe, Kompass, Karte, neun Tränke.

**Spielschleife** — 208 Rezepte (2×2 und 3×3, geformt und ungeformt);
Holzrezepte akzeptieren jede Brettersorte. Ofen mit Brennstoffverwaltung, Truhen
als Lager, Ackerbau vom Pflügen bis zur Ernte, Feuer per Feuerzeug, TNT mit
Kettenreaktion.

**Überleben** — Leben, Hunger mit Sättigung und Erschöpfung, Rüstungsschutz, Fall-,
Ertrinkungs-, Lava- und Kaktusschaden, Regeneration, Tod mit Item-Drop und Respawn,
Erfahrungsstufen, Schlafen im Bett zum Setzen des Spawnpunkts.

**Kein Hochspringen an der Wand** — wer an einer Mauer stand und die
Leertaste hielt, kam bis zu dreizehn Blöcke hoch: gemessen von y 65 auf y 78 in
zehn Sekunden. Schuld war die Prüfung, ob unter den Füßen fester Boden liegt.
Sie sucht in einem Kasten von der Breite des Körpers — und die Kollision setzt
den Körper *exakt* an die Blockkante, wenn er an einer Wand steht. Damit lag die
Wandzelle genau auf dem Rand des Kastens und zählte als Boden unter den Füßen,
in jeder Höhe. Der Rand wird jetzt um ein Tausendstel eingezogen; auf einer Kante
zu stehen, wo der Fuß halb über dem Abgrund hängt, geht weiterhin.

**Drei Spielmodi**, mit `P` der Reihe nach durchzuschalten oder im Pausenmenü zu
wählen: **Überleben**, **Kreativ** und **Zuschauer**. Der Zuschauer fliegt durch
jede Wand, nimmt keinen Schaden, baut nichts ab und setzt nichts, hat kein
Inventar und wird von keiner Kreatur beachtet; die Grundhelligkeit steigt so weit,
dass man auch tief im Fels noch etwas sieht. Gedacht zum Ansehen der Welt — der
schnellste Weg, sich ein Höhlensystem oder eine Bastion von innen anzuschauen.

**Kreaturen der Biome** — jedes neue Biom hat seinen eigenen Bewohner. Im
**Seelensandtal** steht das **Witherskelett**: sein Treffer überträgt
*Verdorren*, und Verdorren hebt die Regeneration auf — mit einem Regenerationstrank
im Bauch verliert man trotzdem Leben. Im **Karmesinwald** rennt der **Hoglin** an
und schleudert einen mehrere Blöcke weit; er scheut Nethergewächs, womit sich ein
Gehöft dort einzäunen lässt. An den Bastionen und im Karmesinwald steht der
**Piglin-Hauer**, der kein Gold nimmt und nicht handelt. Im **Basaltdelta**
zerplatzt der **Aschenwicht** beim Tod in eine Aschewolke. Über den
**Frostspitzen** schwebt der **Frostwicht**, dessen Treffer bremst. Auf den
**Aetherwiesen** wurzelt die **Aechorpflanze**: sie bewegt sich nicht, schießt
aber auf alles in neun Blöcken — ihre **Aechorschote** ist die Heiltrankzutat, mit
der man den Aether nicht mehr verlassen muss.

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

**Fallende Blöcke sind Entitäten** — Sand, Kies, Amboss und Gravitit sprangen
bisher Feld um Feld: ein `setBlock` löschte oben, ein zweites setzte unten. Für
die Dauer des Falls sind sie jetzt eine **eigene Entität mit Flugbahn**, und
daran hängt alles, was einen Fall überhaupt interessant macht. Eine Explosion
schleudert den fallenden Block fort — gemessen drei Blöcke weit bei einer
Ladung fünf Felder daneben. Ein fallender Amboss trifft, was unter ihm steht,
und zwar nach Fallhöhe.

Und der alte Trick funktioniert wieder: **eine Fackel hält einen Sandfall auf**.
Der Sand kommt dort nicht unter, also landet er als Gegenstand statt als Block,
und die Fackel steht noch. Entscheidend dafür ist, was als Landeplatz durchgeht:
Luft, Wasser und Gewächs geben nach, eine Fackel, eine Treppe oder eine Truhe
nicht. Gewächs wird dabei zerdrückt und fällt ordentlich als Beute an.

Gravitit steigt weiterhin auf, benutzt aber **dieselbe Klasse mit umgedrehtem
Vorzeichen**. Angekommen ist ein Block, sobald er weniger weit gekommen ist, als
er wollte — das gilt nach oben wie nach unten und spart die zweite
Landeprüfung.

Ein Deckel von 96 gleichzeitig fliegenden Blöcken hält eine einstürzende
Sandwand davon ab, tausend Entitäten auf einmal zu erzeugen; darüber hinaus
springt der Rest wie früher. Geprüft mit 256 auf einmal ausgelösten
Sandblöcken: höchstens 96 gleichzeitig unterwegs, danach liegen alle 256 in der
Welt — es geht keiner verloren. Und was beim Speichern noch in der Luft hängt,
wird vorher abgesetzt, denn Entitäten wandern nicht in den Spielstand.

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
Im Käfig brennt ein **Flämmchen**, solange er scharf ist; das ist von außen das
einzige Zeichen, dass er arbeitet. Sein Umkreis ist vier Blöcke wie im Vorbild —
mit den früheren acht landeten fast alle Versuche in der Wand des sieben mal
sieben Blöcke großen Raums, und es kam so gut wie nie etwas heraus. Jetzt steht
die erste Kreatur nach knapp zwei Sekunden da, der Käfig ist nach zehn voll.

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

**Eine Textur, die sich ändert** — alle Blocktexturen liegen in einem
Texturarray aus 16×16-Kacheln. Das ist genau richtig für einen Block, der immer
gleich aussieht, und genau falsch für alles, was erst im Spiel entsteht: eine
Karte hat 128×128 Bildpunkte, und ein Schild trägt Text, den es beim Erzeugen
der Texturen noch gar nicht gab. Genau daran ist der Bilderrahmen bisher
gescheitert.

Deshalb liegt jetzt ein **zweiter Atlas** daneben: 8×8 Kacheln zu je 128×128
Bildpunkten als eigene 2D-Textur, gezeichnet mit dem gewöhnlichen
Canvas-Werkzeugkasten, hochgeladen wird immer nur die eine geänderte Kachel.
Umgeschaltet wird im Shader über eine Uniform statt über ein zweites Programm —
Nebel, Licht und Alphatest sind dieselben, es kommt kein zweiter Rechenweg
dazu.

Die 64 Plätze reichen, weil ein Platz **keinem Schild gehört, sondern einem
Inhalt**: vergeben wird über einen Schlüssel aus dem Text selbst, verdrängt wird
der am längsten unbenutzte. Hundert Schilder mit demselben Text teilen sich eine
Kachel, und ein Schild am anderen Ende der Welt hält keine besetzt.

**Schilder** — sechs Bretter und ein Stock ergeben drei Stück. Auf den Boden
gesetzt stehen sie auf einem Pfosten und blicken den an, der sie hinstellt; an
eine Wand geklebt hängen sie. Rechtsklick öffnet vier Zeilen zu je fünfzehn
Zeichen. Nimmt man ihnen den Boden oder die Wand weg, fallen sie als Gegenstand.

Der Text steht nicht im Chunkmesh, sondern liegt als einzelnes Viereck knapp
davor — eine Ebene, die der Mesher gar nicht kennen muss. Der Text selbst wandert
in die Blockentität an dieser Stelle, und die geht ohnehin schon in den
Spielstand; es kommt kein neues Speicherformat dazu.

**Bilderrahmen** — acht Stöcke um ein Leder. Rechtsklick hängt hinein, was man in
der Hand hält, ein zweiter nimmt es wieder heraus; beim Abbauen fällt es zurück.
Drin liegt ein ganz gewöhnlicher Gegenstand — **auch eine Karte**, und dann zeigt
der Rahmen sie in voller Auflösung an der Wand, mit dem erkundeten Teil und dem
Dunkel drumherum. Das ist der Grund, warum es den Atlas gibt.

**Gemälde** — acht Stöcke um eine Wolle. Sechs Motive, die aus der eigenen Welt
stammen statt aus dem Original: Sonnenuntergang, Bergsee, Creeper, Fackel im
Stollen, Portal und Weizenfeld. Welches man bekommt, hängt am Ort — zwei
nebeneinander zeigen also nie dasselbe Bild —, und ein Rechtsklick blättert
weiter, bis das passende dabei ist. Das Motiv liegt auf der Vorderseite und
kommt aus dem gewöhnlichen Texturarray; ein Gemälde ändert sich ja nicht.

Vier Dinge waren beim ersten Anlauf falsch und sind es nicht mehr: Die
Item-Grafik des Rahmens hieß wie die **Blocktextur** des Rahmens, und `tex()`
überschreibt eine Textur, die es schon gibt — der gesetzte Rahmen bekam damit die
durchsichtigen Stellen der Item-Grafik, und man sah durch ihn hindurch. Schild,
Rahmen und Gemälde lagen nicht in der Liste der Dinge, die **in der Hand flach**
sind, und sahen dort aus wie ein Würfel. Der Schildtext trug einen
**Schlagschatten** von zwei Bildpunkten — bei acht Punkten Buchstabenbreite ist
das ein Viertel davon, und der Text las sich doppelt; dunkle Schrift auf hellem
Holz braucht ihn nicht. Und Rahmen und Gemälde haben jetzt **Härte 0**: ein
Schlag, und alles fällt zusammen heraus, statt dass ein kurzer Klick nur die
Hälfte erledigt.

Banner fehlen noch. Sie sind keine Frage der Textur mehr, sondern ein
Entwurfssystem für sich — sechzehn Farben mal knapp vierzig Mustern, die sich
übereinanderlegen lassen.

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

**Als Nächstes:** Runde B — Dorfbewohner mit echter Wegfindung, Dorf-Zustand im
Spielstand, Tierzucht und Reiten, Wetter ohne Welteingriff. Danach Runde C mit
Trichtern, Loren, farbigem Licht, Fern-LOD, Bauwerkzeugen, Schild und
Klangkulisse. Dazu die zweite Runde aus `docs/MOB-PLAN.md` — Schwebhase,
Wolkenwal, Walküre — und die Händler.

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
