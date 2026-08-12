# Kreaturen und Bewohner — Vorschlag für den nächsten Schritt

Stand: 12. August 2026. Grundlage: Nether und Aether haben seit heute je fünf
Biome. Die Biome sind gebaut, aber noch **leer bevölkert** — in jedem Nether-Biom
laufen dieselben Piglins, in jedem Aether-Biom dieselben Moas. Genau das ist die
Lücke, die dieser Schritt schließt.

Die Auswahl folgt drei Regeln:

1. **Jedes Biom braucht einen Grund, hinzugehen.** Eine Kreatur, die es nur dort
   gibt, und die etwas fallen lässt, das man sonst nicht bekommt.
2. **Kein Mob ohne Verhalten.** Ein weiterer Zombie mit anderer Textur macht die
   Welt nicht lebendiger. Jeder Vorschlag hier bringt eine eigene Bewegung, eine
   eigene Reaktion oder eine eigene Gefahr mit.
3. **Was die Engine schon kann, wird benutzt.** Wir haben Wegfindung mit
   Hindernissprung, Sichtlinienprüfung, Geschosse, fliegende Mobs, Statuseffekte,
   ein Handelsfenster und Rückstoß. Darauf lässt sich viel aufbauen, ohne neue
   Systeme zu bauen.

---

## 1. Nether

| # | Kreatur | Biom | Was sie besonders macht | Umfang |
|---|---|---|---|---|
| N1 | **Witherskelett** | Seelensandtal, Bastion | Nahkampf, überträgt **Verdorren** | M |
| N2 | **Hoglin** | Karmesinwald | Rennt an, schleudert weg, Fleischquelle | M |
| N3 | **Lavagänger** | überall auf Lava | Läuft auf Lava, **reitbar** | L |
| N4 | **Piglin-Hauer** | Karmesinwald, Bastion | Nimmt kein Gold, greift immer an | S |
| N5 | **Aschenwicht** | Basaltdelta | Zerfällt beim Tod in eine Aschewolke | M |

**N1 — Witherskelett.** Größer als ein Skelett, Nahkampf mit Steinschwert. Sein
Treffer setzt den neuen Effekt **Verdorren**: Schaden über Zeit, der sich nicht
durch Regeneration aufheben lässt. Lässt Kohle und Knochen fallen, selten einen
**Witherskelettschädel**. Der Schädel ist der Anfang von etwas Größerem (siehe
„Was daraus folgen kann"). Braucht den Effekt aus `potions.js` — ein Eintrag in
`P.LISTE` plus die Schadensschleife, beides fünf Zeilen.

**N2 — Hoglin.** Vierbeiner, von sich aus feindlich, rennt an und wirft einen
mehrere Blöcke weit. Meidet Wirrwald und Nethergewächs — das gibt eine echte
taktische Regel: wer im Karmesinwald baut, pflanzt Nethergewächs als Zaun. Lässt
rohes Fleisch fallen und ist damit die erste Nahrungsquelle im Nether.

**N3 — Lavagänger.** Der wichtigste der fünf, weil er die Dimension anders
begehbar macht: er läuft auf Lava, friert an Land ein und lässt sich mit einem
Sattel reiten, gelenkt mit einem **Wirrpilz an der Rute**. Damit werden die
Lavaseen im Untergeschoss vom Hindernis zur Straße. Technisch der teuerste
Vorschlag: Reiten gibt es bei uns noch nicht, das ist ein eigener Zustand am
Spieler (Position folgt dem Reittier, Steuerung geht ans Tier).

**N4 — Piglin-Hauer.** Billigste Ergänzung: dieselbe Figur wie der Piglin, größer,
mit Axt, ohne jede Handelsbereitschaft. Er ist der Grund, weshalb man eine Bastion
nicht einfach ausräumt.

**N5 — Aschenwicht.** Eigene Erfindung fürs Basaltdelta, das sonst das leerste
Biom bliebe: klein, glüht, bewegt sich ruckartig, und beim Tod zerplatzt er in
eine Aschewolke, die kurz die Sicht nimmt. Lässt **Kohle** und **Schwarzstein**
fallen.

---

## 2. Aether

| # | Kreatur | Biom | Was sie besonders macht | Umfang |
|---|---|---|---|---|
| A1 | **Aechorpflanze** | Wiesen | Steht fest, schießt Giftstacheln | S |
| A2 | **Schwebhase** | alle | Passiv, setzt sich auf den Kopf, gibt Sprungkraft | M |
| A3 | **Wolkenwal** | Wolkenmeer | Riesig, harmlos, zieht zwischen den Inseln | M |
| A4 | **Frostwicht** | Frostspitzen | Verlangsamt, zerspringt in Eis | M |
| A5 | **Walküre** | Goldener Hain | **Neutral**, schlägt hart zurück, lohnende Beute | L |

**A1 — Aechorpflanze.** Aus dem Original-Aether: sieht aus wie eine Blume, ist
aber ein Mob. Bewegt sich nicht, schießt auf alles in acht Blöcken Umkreis einen
Stachel, der kurz vergiftet. Lässt die **Aechorschote** fallen — die Zutat, mit
der man den Heiltrank braut, ohne in die Oberwelt zurückzumüssen. Technisch der
einfachste Vorschlag der ganzen Liste: ein Mob ohne Wegfindung.

**A2 — Schwebhase.** Klein, springt hoch, flieht nicht. Wer ihn anklickt, hat ihn
auf dem Kopf sitzen: solange er dort sitzt, gibt er **Sprungkraft I** und dämpft
den Fall. Das ist die Sorte Detail, die man Freunden zeigt.

**A3 — Wolkenwal.** Zwölf Blöcke lang, zieht langsam waagerecht durchs
Wolkenmeer, reagiert auf gar nichts. Man kann auf ihm landen und mitfahren. Er
macht aus dem leersten Biom das eindrucksvollste — und er ist billiger als er
aussieht, weil er weder Wegfindung noch Kampf braucht.

**A4 — Frostwicht.** Gegenstück zum Aschenwicht: schwebt über den Frostspitzen,
sein Treffer verlangsamt. Beim Tod zerspringt er und lässt **Eisstein** und
gelegentlich einen **Eiskristall** fallen.

**A5 — Walküre.** Steht im Goldenen Hain, greift **nicht** an — bis man sie
angreift. Dann trifft sie hart. Wer sie besiegt, bekommt eine **Siegesmedaille**;
gesammelt ergeben sie etwas, das man sonst nirgends bekommt. Sie ist der
interessanteste Vorschlag, weil sie eine Entscheidung erzwingt statt eines
Reflexes.

---

## 3. Bewohner und Händler

Bisher gibt es genau eine Sorte Bewohner: den Dorfbewohner mit fünf Berufen. Das
Handelsfenster steht schon, die Angebotslogik hängt an Dorf und Platznummer — auf
dieser Grundlage sind neue Händler billig.

| # | Bewohner | Wo | Was er anbietet | Umfang |
|---|---|---|---|---|
| B1 | **Kartograph** | Dorf (6. Beruf) | Karten mit eingezeichneten Zielen | M |
| B2 | **Piglin-Händler** | Nether | **Tauscht Gold gegen Zufall** | M |
| B3 | **Fahrender Händler** | Oberwelt | Setzlinge, Samen, seltene Blöcke | M |
| B4 | **Aetherhirte** | Goldener Hain | Moa-Eier, Ambrosium, Flugsand | M |

**B1 — Kartograph.** Der naheliegendste, weil wir seit gestern Karten haben: er
verkauft eine Karte, auf der ein Dorf, eine Festung oder eine Bastion schon
eingezeichnet ist. Damit bekommt die Karte einen zweiten Zweck neben dem
Erkunden, und die Strukturen, die wir gebaut haben, werden auffindbar statt
zufällig.

**B2 — Piglin-Händler.** Kein Fenster, sondern die Geste aus dem Original: man
wirft ihm einen Goldbarren hin, er hebt ihn auf, betrachtet ihn und wirft etwas
zurück — Netherquarz, Obsidian, Seelensand, mit kleiner Wahrscheinlichkeit ein
Feuerzeug oder eine Enderperle. Das ist zugleich die erste Enderperlenquelle
außerhalb der Endermanjagd. Braucht kein neues UI, nur Werfen und Aufheben, und
beides gibt es.

**B3 — Fahrender Händler.** Erscheint alle paar Tage in der Nähe des Spielers,
bleibt eine Weile und verschwindet wieder. Bietet Dinge an, die man in seinem
Biom sonst nicht bekommt — Setzlinge aus fremden Wäldern, Kakteen, Blaubeeren.
Er ist der Ausgleich dafür, dass die Biome seit Version 2 groß sind: wer in einer
Wüste startet, sieht sonst lange keinen Fichtensetzling.

**B4 — Aetherhirte.** Ein einzelner Bewohner in einem kleinen Gehöft im Goldenen
Hain. Er nimmt Ambrosium und gibt dafür Aether-Waren — und, wenn wir reitbare
Moas bauen, das erste Moa-Ei. Er wäre die erste Struktur mit Bewohnern außerhalb
der Oberwelt.

---

## 4. Was daraus folgen kann

Drei Dinge auf dieser Liste sind Anfänge, keine Endpunkte — falls du in diese
Richtung willst, ist das hier die Vorarbeit:

* **Witherskelettschädel** (N1) → der **Wither** als zweiter Boss. Drei Schädel
  auf Seelensand, wie im Original. Wir haben mit dem Enderdrachen schon einen
  Bosskampf samt Bossleiste — das Gerüst steht.
* **Reiten** (N3) → reitbare **Moas** im Aether, die in `README` seit Langem unter
  „Noch offen" stehen. Wer den Lavagänger reiten kann, kann auch einen Moa reiten.
* **Kartograph** (B1) → Karten mit Zielmarken → die drei **Aether-Dungeons**, die
  ebenfalls seit Langem offen sind, werden auffindbar statt zufällig.

---

## 5. Vorgeschlagene Reihenfolge

**Erste Runde — die Biome bevölkern** (das eigentliche Ziel dieses Schritts):
A1 Aechorpflanze, N4 Piglin-Hauer, N1 Witherskelett, N2 Hoglin, A4 Frostwicht,
N5 Aschenwicht. Sechs Kreaturen, alle im vorhandenen Mobgerüst, jede in genau
einem Biom zu Hause. Danach hat jedes der zehn neuen Biome eigene Bewohner.

**Zweite Runde — Persönlichkeit:** A2 Schwebhase, A3 Wolkenwal, A5 Walküre. Die
drei, die man weitererzählt.

**Dritte Runde — Handel und Bewegung:** B2 Piglin-Händler (kein neues UI),
B1 Kartograph, dann N3 Lavagänger mit dem Reitzustand, und darauf aufbauend
B4 Aetherhirte und die Moas.

Der Effekt **Verdorren** und der Zustand **Reiten** sind die beiden einzigen
neuen Systeme in der ganzen Liste. Alles andere ist Arbeit im Bestand.
