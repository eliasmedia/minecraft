# ART-REDESIGN-PLAN.md

**Umsetzungsplan für die visuelle Neugestaltung.**
Stand: 2026-08-10 · Fassung **2** · Status: **Vorschlag, wartet auf Freigabe** · Am Spiel wurde nichts geändert.

Regelwerk: [`ART-DIRECTION.md`](ART-DIRECTION.md) · Vorschau: `art-preview/index.html`

> **Was sich gegenüber Fassung 1 geändert hat.** Fassung 1 wurde verworfen: sie
> ersetzte das Pixelrauschen durch großflächige Klumpen und verschob Schatten im
> Farbton. Das Ergebnis war flauer als der Bestand. Fassung 2 beruht auf
> Messungen am Vanilla-Resource-Pack (Bedrock) statt auf Annahmen. Kern der
> Korrektur: **Pixelrauschen ist richtig, es muss nur auf 4–8 feste Töne
> quantisiert sein**, und Rampen bleiben multiplikativ bei konstantem Farbton.
>
> Prüfbar gemacht: `ART.kennzahlen()` misst Tonanzahl, Kontrast und Sättigung
> jeder Kachel; die Messtabelle im Stilblatt stellt Vanilla, Bestand und
> Vorschlag nebeneinander. **Vorschlag 27/27, Bestand 3/27.**

---

## 1. Befund

Das Projekt ist ein WebGL2-Voxelspiel mit **rein prozeduralen Texturen** —
keine einzige Bilddatei. 366 Kacheln zu 16 × 16 werden beim Start in
`textures.js` gezeichnet und als `TEXTURE_2D_ARRAY` hochgeladen. Das ist eine
gute Grundlage: die Erzeugung ist deterministisch, versionierbar und liegt
vollständig im Code.

Was fehlt, ist keine Technik, sondern **Gestaltungsabsicht**.

### 1.1 Was tatsächlich schiefläuft, nach Gewicht

| # | Befund | Wirkung | Anteil am Gesamteindruck |
|---|---|---|---|
| **1** | **Rauschen ist stufenlos statt quantisiert.** `noise(amt)` multipliziert jeden Pixel mit einem zufälligen Faktor. Ergebnis: 28–77 dicht beieinander liegende Töne je Kachel, wo Vanilla mit 4–10 auskommt. | Die Töne mitteln sich beim Verkleinern gegenseitig weg. Materialien sind auf Entfernung nicht unterscheidbar. | **sehr hoch** |
| **2** | **Kontrast durchgehend zu niedrig.** Gemessen: Erde 23 statt 76, Laub 24 statt 87, Bretter 38 statt 78, Kohleerz 29 statt 89. | Alles wirkt flau und wie mit einem Grauschleier. Direkte Folge von Befund 1. | **sehr hoch** |
| **3** | **Mipmapkette läuft bis 1 × 1**, kombiniert mit `NEAREST_MIPMAP_LINEAR` und Anisotropie fest auf 4. | Ab etwa zehn Blöcken sieht man die Überblendung zweier Matschstufen. Das ist die technische Hälfte der Unschärfe. | **hoch** |
| **4** | **Beleuchtung rechnet im Gammaraum** (`c.rgb *= vLight * vShade`, kein sRGB). | Verdeckung und Flächenschattierung lesen sich als Dreck, nicht als Licht. | **hoch** |
| **5** | **Flächenschattierung ist symmetrisch** (+X = −X = 0,62; +Z = −Z = 0,80). | Die Welt hat keine Lichtrichtung. Gebäude und Gelände wirken flach. | **hoch** |
| **6** | **Kreaturenkörper sind einfarbig**, das Gesicht liegt nur auf einer Fläche. | Tiere wirken wie bemalte Kisten. | **hoch** |
| **7** | **UV 0–1 auf jede Fläche jedes Kreaturenquaders.** | Pixeldichte schwankt über ein Modell um das Vierfache. | **mittel–hoch** |
| **8** | **Zwei unvereinbare Gegenstandsstile.** Vorlagen (`TOOL_ART`, `GEM_ART`, `ARMOR_ART`) neben `blob()`-Klumpen (`nugget`, `meat`, Obst). | Werkzeuge sehen gezeichnet aus, Rohstoffe wie Farbkleckse. | **mittel** |
| **9** | **Erze sind auf Entfernung unsichtbar.** 5 Tupfen à 1–2 px. | Man findet sie nur beim Danebenstehen. | **mittel** |
| **10** | **Symbole werden krumm skaliert.** Maßstab 64⁄36 = 1,777, Anzeige mit `background-size: 88 %` in 46 px (= 40,5 px). | Ungleich breite Pixel, ausgefranste Kanten im Inventar. | **mittel** |
| **11** | **Keine Kantenglättung** (`antialias: false`). | Kanten kriechen bei Bewegung. | **mittel** |
| **12** | **Laub ist gleichverteiltes Zufallsrauschen** mit 8,5 % Löchern. | Kronen sehen aus wie Bildstörung. Zusätzlich Alphaerosion durch Mipmaps. | **mittel** |
| **13** | **Partikel mit konstanter Größe und Deckkraft.** | Effekte enden schlagartig, wirken wie ein Fehler. | **niedrig–mittel** |
| **14** | **Bruchstadien sind zufällige Diagonalstriche.** | Der Abbaufortschritt ist nicht ablesbar. | **niedrig** |

### 1.2 Die wichtigste Unterscheidung

**Was Technik ist:** Punkte 3, 4, 5, 7, 10, 11, 12 (Alphaerosion).
Diese lassen sich **ohne einen einzigen neuen Pixel** beheben und verbessern
sofort auch den heutigen Bestand.

**Was Kunst ist:** Punkte 1, 2, 6, 8, 9, 12 (Gestaltung), 13, 14.
Diese bleiben bestehen, egal wie sauber gerendert wird.

**Der Kern des Problems ist Punkt 1 und 2 — also Kunst.** Die Technik
verstärkt ihn, verursacht ihn aber nicht. Wer nur die Filter repariert, bekommt
scharfe einfarbige Flächen. Deshalb braucht es beides, und deshalb ist die
Reihenfolge unten so gewählt: erst Technik (billig, sofort sichtbar), dann
Kunst (teuer, entscheidend).

Der Schalterblock in der Testszene der Vorschau macht genau diese Trennung
vorführbar: Texturen auf *jetzt* stellen, dann Mipmaps und sRGB umschalten.
Was sich ändert, ist Technik. Was gleich bleibt, ist Kunst.

---

## 2. Technische Befunde im Detail

| Stelle | Ist | Soll | Datei |
|---|---|---|---|
| `MIN_FILTER` | `NEAREST_MIPMAP_LINEAR`, Kette bis 1² | dazu `TEXTURE_MAX_LOD = 2.0` | `renderer.js:191` |
| `MAG_FILTER` | `NEAREST` | unverändert — ist richtig | `renderer.js:192` |
| Anisotropie | fest `4` | Gerätemaximum | `renderer.js:197` |
| LOD-Verschiebung | keine | `texture(uTex, vUVW, -0.5)` | `renderer.js` FS_MAIN |
| Farbraum | `RGBA8`, Beleuchtung im Gammaraum | `SRGB8_ALPHA8` oder Linearisierung im Shader | `renderer.js:190`, FS_MAIN |
| Kantenglättung | `antialias: false` | `true`, als Einstellung abschaltbar | `renderer.js:126` |
| Gerätepixel | `min(dpr, 2)` | unverändert — ist richtig | `renderer.js:284` |
| Zeichenflächen-CSS | `image-rendering: pixelated` | `auto` (nur für `canvas#gl`) | `style.css:29` |
| Flächenwerte | symmetrisch | asymmetrisch aus Sonnenrichtung | `mesher.js:18-23` |
| Verdeckung | `[0.60, 0.74, 0.88, 1.0]` | `[0.58, 0.74, 0.88, 1.0]` | `mesher.js:48` |
| Kreaturen-UV | immer 0–1 | optionaler UV-Ausschnitt je Teil | `renderer.js:775` |
| Symbolmaßstab | `S = 64/36` | `S = 2`, Kachel 72 px | `icons.js:13` |
| Symbolanzeige | `background-size: 88 %` | feste Pixelangabe | `style.css:108` |
| Partikellauf | Größe/Deckkraft konstant | über Lebensdauer auslaufend | `particles.js`, `renderer.js:836` |
| Nachbearbeitung | keine | bleibt bewusst keine | — |

**Bewusst nicht vorgeschlagen:** Bloom, Tiefenunschärfe, Farbgradierung,
bildschirmbezogene Verdeckung. Ein Voxelspiel gewinnt daraus nichts und
verliert Schärfe — also genau das, was hier repariert werden soll.

---

## 3. Vorgeschlagene Kunstrichtung — Kurzfassung

Vollständig in [`ART-DIRECTION.md`](ART-DIRECTION.md). Die fünf tragenden Sätze:

1. **Rausche je Pixel — aber nur auf einer kurzen Tonliste.** 4–8 feste Töne je
   Block, mit unsymmetrischer Verteilung wie im Original. Das ist die
   wirksamste Einzeländerung im ganzen Vorhaben.
2. **Kontrast je Material aus der Messung.** Sand 21 und Stein 27 bleiben
   bewusst flach; Erde 76, Bretter 78, Laub 87 werden kräftig. Es gibt keinen
   globalen Wert.
3. **Rampen multiplikativ bei konstantem Farbton.** Die Steinfamilie bleibt
   neutralgrau.
4. **Bewuchs als Graustufe plus Tönung.** Grasblock, hohes Gras und Setzling
   beziehen ihre Farbe aus derselben Quelle und können nicht auseinanderlaufen.
5. **Eine Lichtrichtung, überall.** Licht oben links, Schatten unten rechts —
   in jeder Textur und in jeder Flächenschattierung.

---

## 4. Auflösungen

| Bereich | Auflösung | Anmerkung |
|---|---|---|
| Blöcke | **16 × 16** | unverändert |
| Gegenstände | **16 × 16** | unverändert |
| Kreaturenteile | **16 × 16** | plus UV-Ausschnitte je Teilfläche |
| Effekte | **16 × 16** | unverändert |
| Symbole | erzeugt aus 16 × 16, Kachel **72 px** | statt 64 px, damit der Maßstab ganzzahlig wird |

**16 × 16 bleibt.** Nicht aus Bequemlichkeit, sondern weil fünf Stellen der
Engine darauf festgelegt sind (`mesher.js` UV-Ausschnitte in Sechzehnteln,
`renderer.js → itemMesh()`, `particles.js` 0,25-UV-Fenster, `icons.js`,
`textures.js`) — und weil das Problem nicht die Auflösung ist. Eine 32 × 32-Kachel
mit Zufallsrauschen sieht aus zehn Blöcken Entfernung genauso einfarbig aus.

---

## 5. Bereiche und Umfang

| Bereich | Kacheln | Aufwand | Bewertung |
|---|---|---|---|
| Grundgelände (Gras, Erde, Stein, Sand, Kies, Ton) | 10 | mittel | größter sichtbarer Gewinn je Aufwand |
| Erze (Oberwelt, Nether, Aether) | 10 | gering | Vorlage `crystal()` einmal, dann Rampentausch |
| Holz (Stämme, Bretter, Laub, 6 Arten) | 18 | mittel | Motiv einmal, dann Rampentausch |
| Bausteine (Bruchstein, Ziegel, Sandstein, Quarz, Netherziegel) | 14 | mittel | Fasenlogik einmal |
| Funktionsblöcke (Ofen, Truhe, Werkbank, Tür, Leiter, TNT, Bett, Regal) | 22 | hoch | jede Kachel ist ein Einzelstück |
| Wolle, 16 Farben | 16 | sehr gering | ein Motiv, 16 Rampen |
| Bewuchs (Gras, Blumen, Pilze, Setzlinge, Weizen, Zuckerrohr, Kaktus) | 20 | mittel | jede braucht eine Vorlage |
| Flüssigkeiten und Selbstleuchter | 8 | gering | |
| Gegenstände: Werkzeuge und Rüstung | 45 | gering | Vorlagen existieren, nur Rampen und Feinschliff |
| Gegenstände: Rohstoffe, Nahrung, Gerät | 40 | **hoch** | alle `blob()`-Klumpen brauchen neue Vorlagen |
| Kreaturen: Oberwelt | 20 | hoch | plus UV-Umstellung |
| Kreaturen: Nether, Aether, Ende | 30 | hoch | |
| Dorfbewohner (Roben, Berufe) | 8 | mittel | |
| Effekte (Bruch, Partikel, Feuer) | 20 | gering | |
| Andere Dimensionen (Nether, Aether, Ende) | 45 | mittel | folgt derselben Palette in verschobenen Familien |
| **Summe** | **≈ 326** | | |

---

## 6. Reihenfolge der Umsetzung

Absteigend nach *sichtbarer Wirkung geteilt durch Aufwand*.

### Stufe 0 — Technik, ohne einen neuen Pixel
*Aufwand: klein. Wirkung: sofort sichtbar, auch am heutigen Bestand.*

1. `TEXTURE_MAX_LOD = 2.0`, Anisotropie auf Gerätemaximum
2. LOD-Verschiebung `-0.5` im Fragmentshader
3. sRGB: linearisieren → beleuchten → gammakodieren; `pow(f, 0.82)` entfällt
4. Flächenwerte asymmetrisch
5. `antialias: true` (mit Einstellung)
6. `canvas#gl { image-rendering: auto }`

> **Nach Stufe 0 innehalten und beurteilen.** Diese sechs Punkte kosten
> zusammen unter hundert Zeilen und verändern den Gesamteindruck erheblich.
> Erst danach lässt sich sinnvoll entscheiden, wie weit die Kunst gehen soll.

### Stufe 1 — Palette und Zeichenwerkzeuge
*Aufwand: klein. Nichts sichtbar, alles Weitere hängt daran.*

7. `ramp()`, `PAL`, `tileNoise()`, `clump()`, `bevel()`, `crystal()`, `dither()`
   aus `art-preview/js/art.js` nach `textures.js` übernehmen
8. `noise()`, `speck()`, `dark()` als überholt kennzeichnen — nicht löschen,
   solange noch Kacheln sie benutzen

### Stufe 2 — Grundgelände
*Aufwand: mittel. Wirkung: sehr hoch — das sieht man in jedem Bild.*

9. Gras oben, Gras Seite, Erde, Stein, Bruchstein, Sand, Kies, Ton
10. Alle Erze über `crystal()` mit fester Anordnung
11. Holz: Stamm Seite, Stamm oben, Bretter, Laub

### Stufe 3 — Bewuchs
*Aufwand: mittel. Wirkung: hoch — Pflanzen stehen im Bildvordergrund.*

12. Grasbüschel, drei Blumen, zwei Pilze, Setzlinge, dürrer Busch
13. Laubmaske mit gestalteten Lücken, Alphaerosion beheben

### Stufe 4 — Gegenstände
*Aufwand: hoch. Wirkung: hoch — jeder Gegenstand ist ständig im Inventar sichtbar.*

14. Symbolmaßstab auf 2 stellen, Anzeigegrößen in Pixel festschreiben
15. Werkzeugvorlagen verfeinern, Rampen austauschen
16. Alle `blob()`-Gegenstände auf Vorlagen umstellen (der größte Einzelposten)

### Stufe 5 — Kreaturen
*Aufwand: hoch. Wirkung: hoch, aber lokal.*

17. UV-Ausschnitte je Teilfläche in `drawMob()` (abwärtskompatibel)
18. Körpertexturen mit Materialstruktur und Bodenschatten
19. Gesichtsgrammatik über alle Arten vereinheitlichen

### Stufe 6 — Effekte und Bausteine
*Aufwand: mittel. Wirkung: mittel.*

20. Bruchstadien als Sternfraktur
21. Partikel mit auslaufender Größe und Deckkraft
22. Bausteine, Funktionsblöcke, Wolle

### Stufe 7 — Andere Dimensionen
*Aufwand: mittel. Wirkung: lokal, aber notwendig für Geschlossenheit.*

23. Nether, Aether, Das Ende in verschobenen Familien derselben Palette

---

## 7. Was bleibt, was geht

### 7.1 Bleibt unverändert — ist bereits richtig

| Sache | Warum |
|---|---|
| Das gesamte Erzeugungsverfahren | prozedural, deterministisch, im Code versionierbar — genau richtig |
| `TEXTURE_2D_ARRAY` statt Atlas | keine Randbluten, kein UV-Padding, sauberes Kacheln |
| `MAG_FILTER = NEAREST` | Nahaufnahmen sind bereits scharf |
| Eckverdeckung im Mesher | gut umgesetzt, nur ein Wert wird nachgezogen |
| Quaddrehung gegen Anisotropie (`mesher.js:168`) | sauberer Trick, bleibt |
| Gegenstände als extrudierte Pixelmodelle (`itemMesh`) | der richtige Ansatz, keine Pappscheiben |
| Vorlagensystem `TOOL_ART` / `ARMOR_ART` / `GEM_ART` / `INGOT_ART` | **das ist bereits die Kunstrichtung** — wird ausgebaut, nicht ersetzt |
| `kristall()` bei den Aether-Erzen | wird zum Standard für alle Erze erhoben |
| UV-Ausschnitte für Fackel und Verstärkerstummel | genau der Mechanismus, den die Kreaturen brauchen |
| Himmel, Sonne, Mond, Sterne, Wolken | funktioniert und passt |
| Nebel je Dimension | funktioniert und passt |
| Gerätepixelbegrenzung auf 2 | richtig |

### 7.2 Wird überarbeitet, Grundgerüst bleibt

- Alle Blocktexturen: Motiv neu, Erzeugungsweg gleich
- Werkzeuge und Rüstung: Vorlage bleibt, Rampe und Feinschliff neu
- Kreaturen: Modelle bleiben unangetastet, nur Texturen und UV

### 7.3 Wird vollständig ersetzt

- `noise()` als Strukturmittel — ersatzlos
- `speck()` als einzige Struktur — durch Nester und Zellen
- `dark(c, f)` — durch `ramp()`
- Alle `blob()`-Gegenstände — durch Vorlagen
- Laubmaske — durch gestaltete Lücken
- Bruchstadien — durch Sternfraktur
- Einfarbige Kreaturenkörper — durch Materialstruktur
- Symbolmaßstab 1,777 — durch 2

---

## 8. Werkzeugkette

Es ändert sich **nichts** am Ablauf:

```
art.js  →  Uint8ClampedArray je Kachel (16×16 RGBA)
        →  T.buildBuffer()  →  gl.texImage3D(TEXTURE_2D_ARRAY)
        →  mesher.js legt Ebenenindex je Fläche in den Vertexpuffer
        →  icons.js liest dieselben Daten für die Inventarsymbole
```

Keine Bilddateien, kein Bauschritt, kein Werkzeug von außen, keine Abhängigkeit.
Das Spiel läuft weiterhin durch reines Öffnen der HTML-Datei.

Die Schnittstelle von `MC.Textures` bleibt Zeichen für Zeichen erhalten
(`layer`, `data`, `has`, `count`, `buildBuffer`, `tileCanvas`, `names`, `add`).
Renderer, Mesher, Partikel und Symbolerzeugung merken vom Austausch nichts.

**Ein neuer Prüfschritt** wird empfohlen: das Stilblatt unter `art-preview/`
bleibt bestehen und wird auf den echten Atlas umgestellt. Es dient dann als
laufende Sichtprüfung — Kachelprobe, Farbanzahl, Silhouette, Mipmapstufen —
und fängt Rückschritte ab.

---

## 9. Aufwand

| Stufe | Umfang | Einschätzung |
|---|---|---|
| 0 — Technik | ~100 Zeilen in 3 Dateien | **sehr gering** |
| 1 — Palette und Werkzeuge | ~250 Zeilen, keine Sichtwirkung | **gering** |
| 2 — Grundgelände | 21 Kacheln | **mittel** |
| 3 — Bewuchs | 20 Kacheln | **mittel** |
| 4 — Gegenstände | 85 Kacheln, davon 40 neue Vorlagen | **hoch** |
| 5 — Kreaturen | 58 Kacheln + UV-Umstellung im Renderer | **hoch** |
| 6 — Effekte und Bausteine | 56 Kacheln | **mittel** |
| 7 — Dimensionen | 45 Kacheln | **mittel** |

Der Aufwand steckt fast vollständig in den Stufen 4 und 5. Stufen 0 bis 3
liefern den größten Teil der sichtbaren Verbesserung.

---

## 10. Risiken und Grenzen

| Risiko | Bewertung | Umgang |
|---|---|---|
| **sRGB verändert alle Helligkeiten** | hoch, sicher eintretend | Nach der Umstellung müssen Nebelfarben, Himmelsfarben und die Grundhelligkeit je Dimension nachgezogen werden. In einem Durchgang zusammen mit Stufe 0 erledigen, nicht später. |
| **Kantenglättung kostet Leistung** | mittel | Als Einstellung abschaltbar; auf schwacher Hardware aus. |
| **`TEXTURE_MAX_LOD` erhöht Flimmern in der Ferne** | mittel | Wird durch maximale Anisotropie ausgeglichen. In der Vorschau beide Schalter gemeinsam prüfen. |
| **Alphaerosion bei Laub** | mittel | Drei Lösungswege in `ART-DIRECTION.md` §11.5; erst nach Stufe 3 entscheidbar. |
| **UV-Umstellung bei Kreaturen bricht Modelle** | mittel | Abwärtskompatibel bauen: fehlt `uv`, gilt weiter 0–1. Art für Art umstellen. |
| **16 × 16 ist knapp für Gesichter** | gering–mittel | Mit UV-Ausschnitten bekommt ein 8 × 8-Kopf 8 × 8 Texel — mehr als heute effektiv nutzbar ist. |
| **Startzeit steigt** | gering | 366 Kacheln zu 256 Pixeln = 94 k Pixel. Das aufwendigere Zeichnen bleibt weit unter einer Zehntelsekunde. |
| **Speicher** | gering | Der Texturstapel bleibt unverändert groß (366 × 1 KB + Mipmaps). |
| **Wagenreparatur unterwegs** | mittel | Solange nur ein Teil der Kacheln umgestellt ist, stehen alter und neuer Stil nebeneinander. Deshalb die Reihenfolge nach Bereichen, nicht nach Dateireihenfolge — ein fertiger Bereich sieht geschlossen aus. |
| **Kein Rückwärtsgang bei Weltständen** | keins | Texturen sind nicht Teil des Spielstands. Jederzeit umkehrbar. |

---

## 11. Warum das besser aussehen wird

Nicht, weil mehr Detail hineinkommt — sondern weniger, dafür deutlicheres.
Und diesmal ist die Behauptung **nachprüfbar**: `ART.kennzahlen()` misst
dieselben Größen, die am Vanilla-Pack gemessen wurden.

1. **Der Kontrast bleibt erhalten.** Vier Brauntöne mit je 25 Helligkeitsstufen
   Abstand überstehen zwei Mipmapstufen. 68 Brauntöne im Abstand von je zwei
   Stufen mitteln sich zu einer Fläche. Gleiche Auflösung, gleiche Technik —
   nur ohne die Zwischenstufen, die nichts tragen.

2. **Materialien werden auseinandergehalten.** Nicht durch mehr Struktur,
   sondern durch den richtigen Kontrast: Sand flach (21), Erde kräftig (76),
   Laub sehr kräftig (87). Heute liegen alle drei zwischen 23 und 26 — deshalb
   sehen sie aus wie dieselbe Fläche in anderer Farbe.

3. **Bewuchs und Boden gehören zusammen.** Graustufe plus Tönung heißt: Gras,
   hohes Gras und Setzling beziehen ihr Grün aus einem einzigen Wert. Sie
   können gar nicht auseinanderlaufen.

4. **Die Welt bekommt eine Richtung.** Eine Sonne, überall dieselbe. Aus
   flachen Würfeln werden Körper — heute sind +X und −X gleich hell.

5. **Schatten werden zu Licht statt zu Schmutz.** Die sRGB-Korrektur nimmt das
   Braungrau aus allen abgeschatteten Flächen.

6. **Silhouetten werden lesbar.** Pixelvorlagen statt Zufallsklumpen, und der
   Kontrast je Gegenstand aus der Messung: Werkzeuge 192, Knochen 131, Stock 75.
   Heute liegen die meisten Rohstoffe darunter und verschwimmen im Inventarfeld.

7. **Es bleibt prüfbar.** Jede neue Kachel wird gegen dieselben zwei Zahlen
   geprüft. Das ist der eigentliche Unterschied zu Fassung 1: dort standen
   Behauptungen, hier stehen Zielwerte.

---

## 12. Nächster Schritt

`art-preview/index.html` öffnen und die Richtung annehmen oder verwerfen.
Vorher wird am Spiel nichts geändert.

Sinnvolle Prüfreihenfolge auf der Seite:

1. **Testszene** — Texturen zwischen *jetzt* und *Vorschlag* umschalten.
2. **Testszene, Schalter** — auf *jetzt* stellen, dann Mipmaps und sRGB
   umschalten. Das trennt Technik von Kunst.
3. **Vorher / Nachher** — Kachel für Kachel im Detail.
4. **Palette** — den Rampenvergleich unten ansehen. Das ist der Kern.
