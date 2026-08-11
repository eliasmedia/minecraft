# ART-DIRECTION.md

**Verbindliches Regelwerk für alle sichtbaren Spielinhalte.**
Stand: 2026-08-10 · Fassung **2** · Status: **Entwurf, wartet auf Freigabe**

> **Fassung 2 korrigiert Fassung 1 an drei Stellen.** Fassung 1 beruhte auf
> Annahmen, Fassung 2 auf Messungen am Vanilla-Resource-Pack (Bedrock). Die
> Messwerte stehen in `art-preview/js/art.js → ART.MESS` und werden auf dem
> Stilblatt angezeigt. Was sich geändert hat:
>
> | | Fassung 1 (falsch) | Fassung 2 (gemessen) |
> |---|---|---|
> | Frequenz | „Struktur nur bei 2–5 px, Pixelrauschen ist der Fehler" | Pixelrauschen ist richtig — es muss nur **hart auf 4–7 Töne quantisiert** sein. `grass_top` hat 66 Graustufen, `dirt` ist reines Pixelrauschen. |
> | Rampen | „Schatten wandern im Farbton ins Kühle" | Rampen sind **rein multiplikativ bei konstantem Farbton**. `dirt` bleibt über die ganze Rampe bei 25°. |
> | Steinfamilie | „blaugrau" | **Neutralgrau.** `stone.png` = 104/116/127/143 bei Sättigung 0,00. |
>
> Zur Herkunft: Das Pack hat keine Lizenz und sagt selbst „All assets belong to
> Mojang & Microsoft". Die Bilddateien werden deshalb **nicht** übernommen.
> Übernommen sind Regeln und Messwerte; die Pixel erzeugt `art.js` neu.

Dieses Dokument ist die visuelle Wahrheit des Projekts. Wer ein neues Bild
erzeugt — Mensch oder Modell — hält sich daran, ohne einen eigenen Stil zu
erfinden. Wenn eine Regel im Weg steht, wird die Regel geändert, nicht umgangen.

Es geht **ausschließlich** um Spielgrafik: Blöcke, Gelände, Gegenstände,
Bewuchs, Kreaturen, Effekte. Bedienoberfläche, Spielregeln und Abläufe bleiben
unberührt.

---

## 1. Leitbild

> **Eine handgesetzte Welt bei Vormittagssonne.**
> Wenige Farben, klare Formen, harte Kanten, weiches Licht.
> Jede Fläche sagt in einem Blick, woraus sie besteht.

Drei Sätze, aus denen sich alles Weitere ableitet:

1. **Lesbarkeit vor Detail.** Ein Block muss aus zwanzig Blöcken Entfernung
   erkennbar bleiben. Was das nicht überlebt, gehört nicht in die Textur.
2. **Absicht vor Zufall.** Jedes Pixel liegt dort, weil jemand es dorthin
   gesetzt hat. Zufallsrauschen ist kein Detail, sondern dessen Abwesenheit.
3. **Eine Welt, nicht hundert Materialien.** Alles stammt aus derselben
   Palette und demselben Licht. Erst diese Beschränkung erzeugt den Eindruck
   eines gestalteten Ortes.

**Nicht das Ziel:** Minecraft nachbauen. Nicht das Ziel: Fotorealismus, mehr
Rauschen, mehr Farben, mehr Auflösung.

---

## 2. Auflösung und Pixeldichte

### 2.1 Feste Werte

| Bereich | Auflösung | Begründung |
|---|---|---|
| Blocktexturen | **16 × 16** | An die Engine gebunden (siehe unten) und ausreichend, wenn die Struktur stimmt |
| Gegenstände | **16 × 16** | `renderer.js → itemMesh()` extrudiert jedes deckende Pixel zu einem Quader |
| Kreaturenteile | **16 × 16** pro Teil | wie oben, plus UV-Ausschnitte je Fläche (Abschnitt 9.2) |
| Bruch- und Effektkacheln | **16 × 16** | teilen sich den Texturstapel mit allem anderen |
| Inventarsymbole | erzeugt aus 16 × 16, Anzeige **ganzzahlig** | siehe Abschnitt 11.4 |

**16 × 16 ist nicht verhandelbar**, solange folgende Stellen unverändert bleiben:

- `textures.js` → `TILE = 16`, ein `TEXTURE_2D_ARRAY` mit fester Kantenlänge
- `mesher.js` → UV-Ausschnitte in Sechzehnteln (`var U16 = 1/16`, Fackel
  benutzt Spalten 7–8, Verstärkerstummel ebenso)
- `renderer.js` → `itemMesh()` läuft fest über `px, py < 16`
- `particles.js` → Bruchpartikel greifen 0,25-UV-Fenster ab (= 4 × 4 Texel)
- `icons.js` → `drawImage(tile, 0, 0, 16, 16, …)`

Ein Wechsel auf 32 × 32 wäre kein Texturtausch, sondern ein Umbau dieser fünf
Dateien — und würde das eigentliche Problem nicht lösen. Das Problem ist nicht
zu wenig Auflösung, sondern falsch verteiltes Detail (Abschnitt 5).

### 2.2 Pixeldichte

Ein Texel entspricht **immer** ¹⁄₁₆ Block. Keine Ausnahme.

Daraus folgt zwingend:

- Ein Kreaturenteil von 4 × 12 Modellpixeln bekommt einen **UV-Ausschnitt von
  4 × 12 Texeln**, nicht die ganze Kachel gestreckt.
  *Heute wird auf jede Fläche jedes Quaders die volle 0–1-UV gelegt. Ein
  Schweinebein (4 × 6 px) und ein Schweinerumpf (10 × 16 px) tragen dadurch
  dieselbe Textur in völlig verschiedener Dichte. Das ist der Hauptgrund,
  warum die Tiere wie bemalte Kisten wirken.*
- Ein halber Block (Stufe) benutzt den halben UV-Bereich — das tut
  `mesher.js` bereits richtig.
- Gegenstände in der Hand und als Fallobjekt behalten ihre Pixelgröße.

---

## 3. Farbe

### 3.1 Tonlisten statt Farbfamilien

Jedes Material hat eine **feste, kurze Liste von Tönen**, dunkel nach hell.
Nicht eine Grundfarbe, aus der zur Laufzeit gerechnet wird. Die Listen stehen
in `art.js → ART.P`.

Die drei Gruppen und was sie unterscheidet:

| Gruppe | Regel | Beispiele |
|---|---|---|
| **Steinfamilie** | **strikt neutralgrau**, Sättigung 0,00 | Stein `102/114/127/142`, Bruchstein `80/96/110/136/165/182`, Grundgestein, Ziegel |
| **Erde und Holz** | **konstanter Farbton**, multiplikative Stufen | Erde `86,60,40 → 182,132,92`, alle bei Farbton ~25° |
| **Bewuchs** | **Graustufe, dann Tönung** | Laub `84/108/168/216` × `rgb(104,178,52)` |

Die Tönungswerte stammen aus den Colormaps des Vanilla-Packs
(Ebene/Wald): Gras `rgb(146,188,88)`, Laub `rgb(104,178,52)`.

Warum Graustufe plus Tönung: die Farbe entsteht dann für Grasblock, hohes Gras
und Setzling aus **derselben Quelle**. Boden und Bewuchs können gar nicht
auseinanderlaufen. Das ist auch der Weg, auf dem später Biomfärbung möglich
wäre, ohne die Texturen anzufassen.

### 3.2 Die Rampenregel — korrigiert

Rampen sind **rein multiplikativ bei konstantem Farbton**. Gemessen an `dirt`:

```
 89,61,41  →  121,85,58  →  150,108,74  →  185,133,92
 Farbton    25°           25°           26°          27°
```

Der Farbton bleibt stehen, die Sättigung bleibt stehen, nur die Helligkeit
läuft. Schrittweite etwa **×1,24**.

Das ist genau das, was `dark(c, f)` im Bestand bereits tut. **Der Ansatz war
richtig** — falsch war nur, wie viele Zwischenstufen entstehen (siehe 5.1).

`art.js → ramp(base, spread)` liefert fünf Stufen mit den Faktoren
`0,48 / 0,72 / 1,00 / 1,20 / 1,42`.

### 3.3 Verbote

- **Kein stufenloses Rauschen.** Jeder Ton muss aus der Tonliste des Materials
  stammen. Das ist die zentrale Regel — siehe 5.1.
- Höchstens **4–8 Töne** je Blocktextur, **4–11** je Gegenstand. Gemessene
  Vanilla-Werte: Stein 4, Laub 4, Bruchstein 6, Erde 7, Bretter 7, Erze 9–10.
- Keine Farbtonverschiebung in der Rampe.
- Kein blaugrauer Stein. Die Steinfamilie ist neutral.
- Voll gesättigte Farben nur bei Selbstleuchtern (Lava, Glut, Portal).

---

## 4. Licht

### 4.1 Die Lichtrichtung der Welt

**Eine** Sonne, hoch, leicht von vorn rechts. Sie steht in jeder Textur und in
jeder Flächenschattierung an derselben Stelle.

- In Texturen: **Licht oben links, Schatten unten rechts.** Jede Fase, jeder
  Stein, jede Kante folgt dem.
- In der Geometrie: die Flächenwerte in `mesher.js → FACES[].shade` werden
  **asymmetrisch**:

| Fläche | heute | Vorschlag |
|---|---|---|
| `+Y` oben | 1,00 | **1,00** |
| `+X` | 0,62 | **0,86** |
| `−X` | 0,62 | **0,58** |
| `+Z` | 0,80 | **0,74** |
| `−Z` | 0,80 | **0,64** |
| `−Y` unten | 0,50 | **0,46** |

*Heute sind +X und −X beide 0,62 und +Z und −Z beide 0,80. Die Welt hat
dadurch keine Lichtrichtung: ein Würfel sieht von jeder Seite gleich aus,
Gebäude wirken flach. Die Asymmetrie kostet nichts und ist die billigste
sichtbare Verbesserung im ganzen Projekt.*

### 4.2 Umgebungsverdeckung

Der Mesher berechnet bereits Eckverdeckung mit vier Stufen
(`AO_SHADE = [0.60, 0.74, 0.88, 1.0]`). Das ist gut und bleibt.
Neuer Wert: `[0.58, 0.74, 0.88, 1.0]` — die dunkelste Stufe leicht tiefer,
damit Innenecken sitzen.

**Wichtig:** Verdeckung wirkt erst dann wie Licht statt wie Schmutz, wenn sie
im linearen Farbraum multipliziert wird. Siehe Abschnitt 11.2.

### 4.3 Eingebackenes Licht in Texturen

Texturen enthalten **Formlicht**, nicht **Szenenlicht**.

- Erlaubt: Fase an einem Stein, Glanz auf einem Kristall, Eigenschatten unter
  einem Pilzhut, dunkle Unterkante eines Kreaturenquaders.
- Verboten: ein Schlagschatten quer über die Kachel, ein Lichtkegel, eine
  Verlaufsecke. Solche Sachen kacheln nicht und kämpfen mit dem Engine-Licht.

---

## 5. Texturstil

### 5.1 Die Quantisierungsregel

> **Rausche je Pixel — aber nur auf einer kurzen Tonliste.**

Das ist die zentrale Regel dieses Dokuments, und sie ersetzt die
Frequenzregel aus Fassung 1.

Pixelrauschen ist **nicht** der Fehler. Vanilla benutzt es durchgehend:
`dirt` ist reines Pixelrauschen, `grass_top` hat 66 Graustufen, `sand`
und `stone` ebenso. Der Fehler des Bestands ist, dass `noise(amt)` jeden Pixel
mit einem **stufenlosen** Zufallsfaktor multipliziert. Das erzeugt Dutzende bis
Hunderte dicht beieinander liegender Töne.

Warum das den Unterschied macht:

- **Viele dichte Töne** mitteln sich beim Verkleinern gegenseitig weg. Aus 68
  Brauntönen im Abstand von je zwei Helligkeitsstufen wird auf Entfernung eine
  Fläche.
- **Wenige weit auseinander liegende Töne** behalten ihren Kontrast. Vier
  Brauntöne mit je 25 Stufen Abstand bleiben auch nach zwei Mipmapstufen
  unterscheidbar.

Gemessen am Bestand gegen Vanilla:

| | Bestand | Vanilla | Vorschlag |
|---|---|---|---|
| Stein | 28 Töne, Kontrast 22 | 4 Töne, Kontrast 27 | 4 Töne, Kontrast 28 |
| Erde | 68 Töne, Kontrast 23 | 7 Töne, Kontrast 76 | 6 Töne, Kontrast 76 |
| Laub | 62 Töne, Kontrast 24 | 4 Töne, Kontrast 87 | 4 Töne, Kontrast 84 |
| Bretter | 42 Töne, Kontrast 38 | 7 Töne, Kontrast 78 | 6 Töne, Kontrast 74 |

Der Bestand hat also gleichzeitig **zu viele Töne und zu wenig Kontrast** —
beides Folgen desselben stufenlosen Rauschens.

### 5.2 Kontrast ist materialabhängig

Es gibt keinen globalen Kontrastwert. Er wird je Material aus der Messung
übernommen:

| Kontrast (Leuchtdichte p10→p90) | Material |
|---|---|
| 5–27 — **bewusst flach** | Schnee 5, Ton 14, Sand 21, Eis 21, Stein 27 |
| 30–60 — mittel | Netherrack 30, Obsidian 34, Kies 43, Eisenerz 43, Ziegel 55, Stamm 54 |
| 67–100 — **kräftig** | Bruchstein 69, Erde 76, Bretter 78, Laub 87, Kohleerz 89, Grundgestein 100 |
| 75–192 — Gegenstände | Kohle 34, Stock 75, Brot 94, Knochen 131, Diamant 178, Werkzeuge 192 |

Sand ein Muster zu geben oder Stein Risse aufzuzwingen ist ein Fehler: beide
sind gemessen die flachsten Blöcke überhaupt.

### 5.3 Erlaubte Werkzeuge

| Werkzeug | Wofür |
|---|---|
| **`qnoise(töne, gewichte)`** | Das Arbeitspferd. Pixelrauschen auf einer Tonliste, mit unsymmetrischer Verteilung wie im Original (Stein: 7/28/46/20 %). |
| **`qnoiseRun(töne, gew, max)`** | Wie oben, aber mit waagerechten Läufen von 1–3 px. Vanilla-Stein zeigt genau das. |
| **Bänder** | Bretter, Rinde, Sandstein: je Zeile bzw. Spalte eine eigene Tonliste, dazu die dunkle Fuge. |
| **Adern** | Bruchstein, Ziegel: unregelmäßige dunkle Polylinien über der Rauschfläche. |
| **`nest(x, y, r, farben)`** | Erze, Leuchtstein: unregelmäßiger Klumpen mit dunklem Saum und Glanz auf der Lichtseite. Ziel-Flächenanteil ~13 %. |
| **`tint(farbe)`** | Bewuchs: Graustufe mal Tönungsfarbe. |
| **`art(zeilen, palette)`** | Alles mit Silhouette: Werkzeuge, Blumen, Pilze, Nahrung. |

Umsetzung: `art-preview/js/art.js`.

### 5.4 Verbote

- **`noise(amt)` auf einer gefüllten Fläche.** Ersatzlos gestrichen — durch
  `qnoise` ersetzt.
- `speck(n, farbe)` mit Zufallspositionen als einzige Struktur.
- `blob(cx, cy, r)` mit Zufallsradius als Silhouette — die Kontur wabert.
- Struktur, die das Material nicht hat (Dünen im Sand, Risse im Stein).
- Ein durchgehender 1-px-Rahmen auf allen vier Seiten. Er erzeugt beim Kacheln
  ein Gitter.

### 5.4 Kachelprüfung

Jede Blocktextur wird als **4 × 4-Feld** geprüft. Bestanden, wenn:

- keine Naht sichtbar ist,
- kein Ankerpunkt das Auge fängt (kein Merkmal, das das Raster verrät),
- die Fläche aus zehn Blöcken Entfernung noch Struktur zeigt, aber nicht
  flimmert.

Der Abschnitt „Kachelprobe" im Stilblatt macht genau diesen Test.

---

## 6. Blockbau

Für jeden Blocktyp ist das **Motiv** festgelegt. Das Motiv ist der Satz, der
beschreibt, was man sieht. Wer eine neue Variante baut, hält das Motiv ein und
tauscht nur die Rampe.

| Block | Töne | Kontrast | Motiv |
|---|---|---|---|
| **Stein** | 4 grau | 27 | `qnoiseRun` mit Verteilung 7/28/46/20, Läufe bis 3 px. **Keine Risse, keine Zellen.** |
| **Erde** | 4 braun | 76 | `qnoise` mit 13/42/27/15, dazu ~3 % helle Steinchen |
| **Gras oben** | 8 grau → Tönung | 45 | `qnoise` mit Glockenverteilung, dann `tint(146,188,88)` |
| **Gras Seite** | Erde + Narbe | — | Erdtextur, darauf getönte Narbe mit fest gesetzter Zackenkante (16 Werte, kachelnd, Höhe 3–6 px) |
| **Bruchstein** | 6 grau | 69 | `qnoise` mit 4/24/19/29/14/9, darüber 4 unregelmäßige dunkle Adern mit gelegentlicher Lichtkante. **Keine gezeichneten Fasen** — die Zellen entstehen aus der Tonverteilung. |
| **Steinziegel** | 5 grau | 55 | `qnoise`, darauf Verband 8 × 8 mit dunkler Fuge und Lichtkante unter jeder waagerechten Fuge |
| **Sand** | 5 | 21 | `qnoise` mit 4/26/42/23/5. **Kein Muster, keine Richtung.** Sand ist der flachste Block der Welt. |
| **Sandstein** | 4 | 51 | `qnoise` plus Sedimentbänder im 5-px-Takt |
| **Kies** | 6 | 43 | `qnoise` plus 8 Kiesel mit dunklem Fuß |
| **Bretter** | 6 | 78 | Je Brett **drei Helligkeitsbänder** mit eigener Tonliste (hell / mittel / dunkel), dazu die dunkle Fuge in Zeile 4. 2 Astlöcher. |
| **Stamm Seite** | 6 | 54 | Drei Helligkeitsbänder im 3-px-Takt, darüber durchgehende dunkle Furchen mit Lichtkante rechts |
| **Stamm oben** | 9 | 76 | Jahresringe als Abstandsfunktion, äußere 1 px Rinde in **mittleren** Rindentönen (die dunkelsten sprengen den Kontrast) |
| **Laub** | 4 grau → Tönung | 87 | `qnoise` mit 46/14/22/18, ~12 % Lücken in kleinen Gruppen, dann `tint(104,178,52)`. Die Graustufen sind weiter gespreizt als der Zielwert, weil die Tönung die Leuchtdichte danach auf ~60 % senkt. |
| **Erze** | 7–10 | 43–89 | Steintextur als Grund, darauf **4 unregelmäßige Nester** (`nest`) mit dunklem Saum und Glanz auf der Lichtseite, zusammen ~13 % der Fläche, plus 1 Streusplitter |
| **Schnee / Ton** | 3–4 | 5–14 | `qnoise`, sehr enge Tonliste. Fast flach. |
| **Eis / Wasser** | 4 | 21 | Halbtransparent, Wellenbänder bzw. Sprungrisse **nur eine Tonstufe** über dem Grund |
| **Selbstleuchter** | 5 | — | `nest` in den hellen Stufen plus Kern nahe Weiß |

**Erzregel im Klartext:** Ein Erz muss aus zwanzig Blöcken Entfernung als Erz
erkennbar sein. Fünf einzeln gesetzte 1–2-px-Tupfen (heutiger Stand) sind ab
acht Blöcken unsichtbar. Gemessen belegen die Erzeinschlüsse im Original etwa
**13 % der Kachelfläche** in vier zusammenhängenden Nestern — das ist die
Zielgröße.

---

## 7. Gegenstände

### 7.1 Aufbau

- **Kontur:** 1 px, blauschwarz `rgb(26, 24, 32)`, geschlossen um die ganze
  Silhouette.
- **Füllung:** genau drei Materialtöne aus der Rampe (`hi`/`lt` oben links,
  `bs` in der Mitte, `dk`/`sh` unten rechts).
- **Rand:** mindestens 1 px frei zu allen vier Seiten der Kachel.
- **Belegung:** Der Gegenstand füllt 12–14 der 16 px in seiner Hauptrichtung.
- **Lage:** Werkzeuge und Waffen liegen auf der **Diagonalen von unten links
  nach oben rechts**. Der Stiel läuft in sauberen 1:1-Treppenstufen.
- **Griffe:** Holz in drei Tönen (`W`/`w`/`v`), damit der Stiel Rundung bekommt.

### 7.2 Vorlagensystem

Ein Gegenstandstyp hat **eine** Vorlage als Pixelbild in Textzeilen. Materialien
entstehen nur durch Austausch der Rampe. Das ist im Bestand bereits so gelöst
(`TOOL_ART`, `ARMOR_ART`, `INGOT_ART`, `GEM_ART`) und ist **richtig** — es wird
ausgebaut, nicht ersetzt.

Zeichenbelegung (verbindlich):

```
O  Kontur (blauschwarz)      H  Glanz (hi)       L  Licht (lt)
M  Grundton (bs)             h  Schatten (dk)    S  Kernschatten (sh)
W  Holz hell   w  Holz mittel   v  Holz dunkel
N  Sehne       K  Stein/Feuerstein   R  Rot   Y  Gelb
```

### 7.3 Was ersetzt werden muss

Alle Gegenstände, die heute über `nugget()`, `meat()` oder direktes `blob()`
gebaut werden, bekommen eine Vorlage. Ein `blob()` mit Zufallsradius erzeugt
eine wabernde Silhouette, die im 46-px-Inventarfeld nicht mehr erkennbar ist.

Betroffen: `coal`, `charcoal`, `clay_ball`, `flint`, `gunpowder`, `sugar`,
`lapis`, `glowstone_dust`, `quartz`, `blueberries`, `apple`, `golden_apple`,
alle acht Fleischsorten, `leather`, `feather`, `ender_pearl`, `ender_eye`.

### 7.4 Silhouettenprobe

Jeder Gegenstand wird als **schwarze Silhouette** geprüft. Zwei Gegenstände
derselben Kategorie dürfen sich in der Silhouette nicht gleichen. Wenn doch,
bekommt einer ein Formmerkmal (Apfel: Stiel und Blatt; Brot: Kerben; Eimer:
Henkel).

---

## 8. Bewuchs

Kreuzflächen (`SHAPE_CROSS`) stehen vor beliebigem Untergrund. Deshalb:

- **Jede Pflanze bekommt eine dunkle Basiskante.** Ohne sie verschwimmt Grün
  auf Grün.
- **Halme haben Fuß, Mitte und Spitze** in drei Tönen — nicht eine
  Zufallshöhe in einer Farbe.
- **Blüten sind mindestens 5 × 5 px** mit geschlossener Kontur, sonst sind sie
  auf Spielentfernung ein Farbfleck.
- **Blätter am Stängel** sitzen an festen Positionen (links tief, rechts hoch)
  und geben der Pflanze eine unverwechselbare Silhouette.
- **Pilze** haben Hut mit Eigenschatten, Stiel mit Ring, klare Trennung.
- **Setzlinge** zeigen Krone *und* Stamm — sie müssen sich von hohem Gras
  unterscheiden.

**Bäume** entstehen aus Blockformen, nicht aus Texturen. Regeln für die Krone:

- Die Silhouette ist gestaffelt, nicht würfelig: unterste Lage am breitesten,
  oberste Lage ein Kreuz.
- Ein Stamm ist immer mindestens 1 Block über der Krone sichtbar frei —
  der Baum bekommt dadurch einen Hals und liest sich als Baum.

---

## 9. Kreaturen

### 9.1 Grundregeln

- **Kein Körperteil bleibt einfarbig.** Jedes Teil bekommt Materialstruktur bei
  2–4 px: Fellrichtung, Stofffalten, Rippen, Tarnflecken.
- **Eingebackener Bodenschatten:** die unterste Pixelzeile jedes Teils ist
  `sh`, die vorletzte `dk`. Das trennt Beine vom Boden und Kopf vom Rumpf.
- **Silhouettenprobe wie bei Gegenständen.** Jede Kreatur muss als schwarze
  Silhouette identifizierbar sein.

### 9.2 Gesichtsgrammatik

Alle Kreaturen benutzen dieselbe Sprache. Das macht sie zu einem Ensemble
statt zu einer Sammlung.

| Element | Form |
|---|---|
| Auge | 3 × 3 px: Weiß außen, Iris 2 × 2, Pupille 1 px, **Glanzpunkt fest oben rechts** |
| Augenabstand | Symmetrisch um die Kachelmitte, Ränder bei x = 3 und x = 10 |
| Mund | 1-px-Linie, bei Bedarf 1 px Zähne darunter |
| Untote / Skelette | Statt Auge ein 4 × 4-Loch mit 1 px Innenglanz |
| Merkmal | Genau **ein** unverwechselbares Merkmal je Art (Zombiewunde, Kuhblesse, Schweinerüssel, Creeperöffnungen) — an fester Stelle, nicht zufällig |

### 9.3 UV-Ausschnitte (Pflicht für die Umsetzung)

`renderer.js → drawMob()` legt heute auf **jede Fläche jedes Quaders** die
volle UV 0–1. Damit ist die Pixeldichte über ein Modell hinweg beliebig.

Die Teildefinition wird um optionale UV-Rechtecke erweitert:

```js
part('leg0', { all: 'pig_body', uv: { side: [0, 0, 0.25, 0.375] } }, …)
```

Fehlt `uv`, gilt weiter 0–1 (abwärtskompatibel). Der Mechanismus existiert im
Mesher bereits (`emitBoxUV`, Fackel-Ausschnitte) und wird nur übertragen.

---

## 10. Effekte

- **Bruchstadien:** eine **Sternfraktur, die aus der Blockmitte wächst**.
  Acht Arme, Länge steigt mit der Stufe, ab Stufe 5 ein Kern, ab Stufe 8 vier
  Nebenrisse. Jeder Riss hat eine helle Kante. Der Fortschritt muss ablesbar
  sein — zufällig gestreute Diagonalstriche (heutiger Stand) sind es nicht.
- **Partikel:** Kern in `hi`, Mantel in `bs`, Saum in `dk`. Ein hartes
  einfarbiges Quadrat wird beim Verkleinern zum Pixelklotz.
- **Partikelverhalten (Pflicht):** Größe und Deckkraft laufen über die
  Lebensdauer aus (`size × life/maxLife`). Heute bleiben beide konstant und
  Partikel verschwinden schlagartig — das liest sich als Fehler, nicht als Effekt.
- **Trefferfunke:** Sternform mit warmem Kern. Muss vor jedem Untergrund lesen.
- **Aufsammeln:** ein heller Ring, der nach außen läuft.
- **Blockbruchpartikel** übernehmen weiterhin ein 4 × 4-Texelfenster der
  Blocktextur. Das funktioniert erst dann gut, wenn die Blocktextur bei 2–5 px
  Struktur hat — bei reinem Rauschen sind alle Krümel gleich.

---

## 11. Technische Anforderungen an das Rendering

Ohne diese Punkte wirkt auch die beste Textur weich. Sie sind **Teil der
Kunstrichtung**, nicht optionale Feinarbeit.

### 11.1 Texturfilterung

```js
gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
gl.texParameterf(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LOD, 2.0);
// KEINE anisotrope Filterung - Begründung unten
```

Und im Fragmentshader eine leichte Schärfeverschiebung:

```glsl
vec4 c = texture(uTex, vUVW, -0.5);
```

**Begründung:** Die Mipmapkette einer 16 × 16-Kachel läuft über 8², 4², 2² bis
1². Ab Stufe 3 ist nichts mehr da als eine Mischfarbe. `TEXTURE_MAX_LOD = 2`
kappt die Kette bei 4 × 4 — flimmerfrei, aber nicht matschig.
`MAG_FILTER = NEAREST` ist bereits richtig und bleibt.

> ### ⚠ Anisotrope Filterung ist verboten
>
> `EXT_texture_filter_anisotropic` darf **nicht** benutzt werden, auch nicht
> mit kleinen Werten.
>
> Direct3D 11 kennt keinen „anisotropen Nearest"-Filter. Es gibt nur
> `D3D11_FILTER_ANISOTROPIC`, und der ist in min, mag **und** mip immer
> linear. Sobald `TEXTURE_MAX_ANISOTROPY > 1` gesetzt wird, verwirft ANGLE
> auf Windows das `NEAREST` und filtert bilinear.
>
> Folge: auf Windows (Chrome/Edge → ANGLE → D3D11) sind alle Texturen weich
> und die Blockkanten rund, auf macOS (ANGLE Metal) und Linux bleibt alles
> scharf. Dasselbe Spiel sieht auf zwei Rechnern unterschiedlich aus — und
> der Fehler ist auf einem Mac nicht zu sehen.
>
> Der Schärfegewinn kommt aus `TEXTURE_MAX_LOD` und der LOD-Verschiebung,
> nicht aus der Anisotropie. Sie wird nicht gebraucht.

### 11.2 Farbraum

Der Shader rechnet heute im Gammaraum:

```glsl
c.rgb *= vLight * vShade;      // falsch
```

Richtig ist eines von beiden:

- Atlas als `gl.SRGB8_ALPHA8` hochladen (dann liefert `texture()` lineare
  Werte) und am Ende gammakodieren, **oder**
- im Shader: `pow(c.rgb, 2.2)` → beleuchten → `pow(·, 1/2.2)`.

**Begründung:** Multiplikation gammakodierter Werte drückt Mitteltöne zu weit
nach unten. Verdeckung und Flächenschattierung sehen dadurch aus wie Schmutz
statt wie Licht. Der Ausgleichsversuch `pow(f, 0.82)` in der Lichtformel ist
ein Symptom davon und kann danach entfallen.

### 11.3 Kantenglättung und Auflösung

- `antialias: true` beim Kontext. Ein Voxelspiel besteht aus harten Kanten;
  ohne Mehrfachabtastung kriechen sie bei jeder Bewegung. Als Einstellung
  abschaltbar machen.
- Gerätepixelverhältnis wird begrenzt, aber **nur auf einen ganzzahligen
  Teiler** (`dpr / ceil(dpr / 2)`). Bei dpr 3 wird also mit 1,5 gerendert und
  exakt verdoppelt. Ein krummer Faktor würde einzelne Pixelreihen doppelt so
  breit machen wie ihre Nachbarn.
- Größe der Zeichenfläche mit **`Math.round`**, nicht `Math.floor`. Bei
  Windows-Skalierung (125 %, 150 %) verfehlt `floor` die physische Pixelzahl
  fast immer um ein Pixel — und dann rechnet der Browser das **gesamte** Bild
  neu.
- `canvas#gl { image-rendering: pixelated; }` **bleibt**. Mit `auto` wäre eine
  solche Neuberechnung bilinear, also das ganze Bild weich und alle Kanten
  rund. Genau dieser Fehler ist am 2026-08-11 auf Windows aufgefallen,
  während er auf dem Mac (dpr genau 2, kein Neurechnen) unsichtbar war.

### 11.4 Symbolerzeugung

Heute: Maßstab `64/36 = 1,777`, Anzeige mit `background-size: 88 %` in einem
46-px-Feld, also bei 40,5 px. Beide Schritte nicht ganzzahlig → ungleich breite
Pixel und ausgefranste Kanten.

**Sofortlösung:** Maßstab `S = 2`, Kachelgröße 72 px. Ein Texel ist damit exakt
2 px waagerecht und 1 px senkrecht auf der Deckfläche — das klassische
2:1-Isometrieraster. Anzeige mit fester Pixelangabe (`background-size: 36px`),
nie mit Prozent.

**Zielbild:** Symbole im 3D-Renderer in ein Offscreen-Ziel bei vierfacher
Größe rendern und ganzzahlig herunterrechnen. Dann stimmen Licht und Material
im Inventar exakt mit der Welt überein.

### 11.5 Alphatest und Mipmaps

Blätter und Pflanzen laufen über `discard` bei `alpha < 0.5`. Gemittelte
Mipmapstufen senken den Alphawert an Rändern unter die Schwelle — Laub löst
sich mit der Entfernung auf und flimmert.

Abhilfe, in dieser Reihenfolge zu prüfen:

1. Alphaschwelle mit dem LOD absenken, oder
2. für den Ausschnittdurchgang `textureLod(…, 0.0)` für den Alphavergleich, oder
3. Alpha-zu-Deckung zusammen mit Mehrfachabtestung.

---

## 12. Richtig und falsch

| | ✗ falsch | ✓ richtig |
|---|---|---|
| **Rauschen** | `fill(braun); noise(0.13)` — stufenloser Faktor je Pixel, 68 Töne | `qnoise(P.dirt, [13,42,27,15])` — 4 feste Töne, gemessene Verteilung |
| **Farbanzahl** | Was das Rauschen eben erzeugt (28–77) | 4–8 je Block, 4–11 je Gegenstand |
| **Kontrast** | überall gleich flach (22–46) | je Material aus der Messung: Sand 21, Erde 76, Laub 87, Werkzeug 192 |
| **Schatten** | Farbtonverschiebung ins Kühle | multiplikativ bei konstantem Farbton — `dark(c, f)` war richtig |
| **Stein** | blaugrau getönt | neutralgrau, Sättigung 0,00 |
| **Sand** | Dünenkräusel, Leserichtung | reines flaches Rauschen, Kontrast 21, kein Muster |
| **Bruchstein** | 8 Steine mit gezeichneter Fase | Tonverteilung plus unregelmäßige Adern |
| **Bewuchs** | Grün direkt in die Textur zeichnen | Graustufe zeichnen, dann `tint()` — Boden und Bewuchs teilen sich die Quelle |
| **Erz** | 5 Tupfen à 1–2 px, zufällig | 4 Nester, zusammen ~13 % der Fläche, dunkler Saum, Glanz auf der Lichtseite |
| **Gegenstandskontur** | überall Neutralschwarz | Metall ja; Organisches umrandet sich mit einem dunklen Ton des eigenen Materials |
| **Silhouette** | `blob(8, 8, 4)` mit Zufallsradius | Pixelvorlage mit geschlossener Kontur |
| **Kreatur** | Rumpf einfarbig, Gesicht nur auf einer Fläche | `qnoise` wie bei den Blöcken, Bodenschatten unten, feste Gesichtsgrammatik |
| **Pixeldichte** | UV 0–1 auf jede Fläche jedes Quaders | UV-Ausschnitt passend zur Teilgröße, 1 Texel = ¹⁄₁₆ Block |
| **Licht** | +X und −X beide 0,62 | asymmetrisch aus einer festen Sonnenrichtung |
| **Beleuchtung** | `c.rgb *= licht` im Gammaraum | linearisieren, beleuchten, gammakodieren |
| **Symbol** | Maßstab 1,777, Anzeige bei 88 % | Maßstab 2, Anzeige bei fester Pixelzahl |
| **Partikel** | konstante Größe, schlagartiges Ende | Größe und Deckkraft laufen aus |

---

## 13. Abnahmeprüfung für neue Bilder

Eine neue Textur ist fertig, wenn sie alle acht Punkte besteht. Die Punkte 1
und 2 sind **messbar** — `ART.kennzahlen()` liefert sie, das Stilblatt zeigt
sie in der Messtabelle:

1. **Tonanzahl** — im Zielband des Materials (Block 4–8, Gegenstand 4–11).
2. **Kontrast** — höchstens 35 % neben dem Zielwert aus der Messtabelle.
3. **Tonliste** — jeder Ton stammt aus `ART.P`, keine freie RGB-Angabe.
4. **Licht** — Lichtkanten oben links, Schattenkanten unten rechts.
5. **Kachel** — 4 × 4-Feld ohne Naht und ohne Ankerpunkt (Blöcke).
6. **Entfernung** — bei 4 × 4 px Anzeigegröße noch als Material erkennbar.
7. **Silhouette** — als schwarze Fläche eindeutig (Gegenstände, Pflanzen, Kreaturen).
8. **Motiv** — lässt sich in einem Satz sagen, was man sieht.

Stand des Vorschlags: **27 von 27** geprüften Kacheln liegen in beiden
messbaren Bändern. Der heutige Bestand erreicht **3 von 27**.

---

## 14. Wo was liegt

| Zweck | Datei |
|---|---|
| Referenzumsetzung aller Regeln | `art-preview/js/art.js` |
| Stilblatt und Testszene | `art-preview/index.html` |
| Umsetzungsplan | `docs/ART-REDESIGN-PLAN.md` |
| Heutiger Texturkern (unverändert) | `Minecraft_files/js/textures.js` |
| Vernetzung, Flächenwerte, Verdeckung | `Minecraft_files/js/mesher.js` |
| Filter, Shader, Kreaturen, Handmodell | `Minecraft_files/js/renderer.js` |
| Inventarsymbole | `Minecraft_files/js/icons.js` |
| Partikel | `Minecraft_files/js/particles.js` |

Bei der Umsetzung ersetzt `art.js` den Zeichenteil von `textures.js`. Die
Schnittstelle nach außen (`T.layer`, `T.data`, `T.has`, `T.count`,
`T.buildBuffer`, `T.tileCanvas`) bleibt Zeichen für Zeichen gleich — Renderer,
Mesher und Symbolerzeugung merken davon nichts.
