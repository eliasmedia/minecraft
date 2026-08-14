# Pocket-Version — Plan

Das Spiel am Handy spielbar machen: Steuerungsoverlay, angepasste Fenster,
tragbare Leistung. Recherchiert an den Touch-Schemata von
[Bedrock/Pocket Edition](https://minecraft.wiki/w/Controls), der Rest ist am
eigenen Code gemessen.

---

## 1. Ausgangslage

Nachgesehen, nicht geraten:

| Befund | Bedeutung |
|---|---|
| **Kein einziges Touch-Ereignis** im ganzen Projekt (`grep touch` findet nur `silk_touch`) | Die Steuerung ist komplett neu zu bauen, nichts ist halb da |
| Bewegung, Hotbar, Inventar, Chat hängen an **Tastatur** | Jede Taste braucht eine Entsprechung auf dem Schirm |
| Umsehen hängt an **Pointer Lock** | Gibt es auf dem Handy nicht — der ganze Pfad braucht einen zweiten Zweig |
| Die 30 Fenster-Handler in `ui.js` hören auf **`mousedown`** | Browser erzeugen das aus Tippen mit — das meiste funktioniert also bereits, aber ohne Rechtsklick |
| `ev.button === 2` teilt Stapel im Inventar | Braucht ein langes Drücken als Ersatz |
| Viewport-Meta ist schon richtig gesetzt | Ein Problem weniger |
| Das ganze UI skaliert aus **zwei CSS-Variablen** (`--slot: 46px`, `--icon: 36px`) | Eine Medienabfrage stellt die gesamte Oberfläche um |
| Texturatlas: 502 Ebenen à 16×16 = **rund 500 kB** | Auf keinem Telefon ein Problem |
| Chunkzahl je Sichtweite: **4 → 81, 7 → 197, 12 → 529** | Der Hebel für die Leistung |
| Chunkerzeugung Oberwelt **rund 8 ms** (Rechner) | Auf dem Telefon eher 20–40 ms — der eigentliche Engpass |

**Was ich nicht weiß:** wie schnell das auf einem echten Telefon läuft. Das
lässt sich von hier aus nicht messen, und ich will es nicht schätzen und dann
so tun, als wäre es gemessen. Darum ist Schritt 0 eine Messung auf deinem
Gerät, bevor irgendetwas an der Leistung gedreht wird.

---

## 2. Was „Pocket-Version" heißen soll

**Kein zweites Spiel, kein Fork.** Dieselbe `Minecraft.html`, dieselbe Welt,
derselbe Spielstand. Am Telefon legt sich ein Overlay darüber und die Eingabe
kommt aus einer zweiten Quelle. Alles andere bleibt, wie es ist.

Der Grund ist einfach: jede Trennung müsste ab morgen doppelt gepflegt werden,
und bei einem Projekt, das in einer Datei aus dem Ordner startet, wäre das der
Anfang vom Ende.

Neue Datei `mobile.js`, geladen wie alle anderen. Sie tut nichts, solange kein
Touchgerät erkannt wird — auf dem Rechner ändert sich damit nachweislich nichts.

---

## 3. Erkennung

Kein Raten am User-Agent. Drei Signale, in dieser Reihenfolge:

```js
var grob   = matchMedia('(pointer: coarse)').matches;   // Finger statt Maus
var touch  = navigator.maxTouchPoints > 0;
var schmal = Math.min(innerWidth, innerHeight) < 820;
```

Overlay an, wenn `grob && touch`. Dazu ein **Schalter im Pausenmenü**
(„Touch-Steuerung: an/aus"), der die Erkennung überschreibt und die Wahl
merkt — ein iPad mit Tastatur oder ein Laptop mit Touchscreen soll selbst
entscheiden dürfen, und beim Ausprobieren am Rechner will man das Overlay
sehen können, ohne ein Telefon zu holen.

---

## 4. Die Steuerung

Bedrock hat drei Schemata. Für uns ist die Frage nicht, welches das beste ist,
sondern welches am wenigsten gegen unsere Engine arbeitet.

Unser Zielsystem ist ein **Strahl aus der Bildmitte** (`updateTarget` →
`world.raycast`). Das ist genau das, was Bedrock „Joystick & aim crosshair"
nennt. Damit fangen wir an, weil es ohne einen zweiten Zielpfad auskommt.

### Aufteilung des Schirms

```
┌──────────────────────────────────────────────────────┐
│ [☰]                                            [👁] │   Menü · Chat
│                                                      │
│                          ✛                           │   Fadenkreuz bleibt
│                                                      │
│      ╭───╮                              [⤒]  [⛏]     │   springen · abbauen
│      │ ◉ │   ← Knüppel      Umsehen →   [⤓]  [✋]     │   ducken · setzen
│      ╰───╯                                           │
│  ▣▣▣▣▣▣▣▣▣                                    [▤]   │   Hotbar · Inventar
└──────────────────────────────────────────────────────┘
```

* **Links unten: Knüppel.** Wo der Finger zuerst aufsetzt, entsteht die Mitte —
  ein Knüppel, den man erst treffen muss, ist am Telefon eine Zumutung.
  Auslenkung steuert Richtung *und* Tempo; ganz außen und kurz gehalten heißt
  sprinten, wie in Bedrock mit „Sprint using the joystick".
* **Rechts: Umsehen.** Ziehen irgendwo in der freien Fläche dreht die Kamera.
  Empfindlichkeit als eigener Regler, weil die vom Rechner am Telefon nicht
  passt.
* **Abbauen und Setzen als Knöpfe.** Abbauen ist Halten mit Fortschrittsanzeige
  (wir haben `handleMining` schon als Halte-Logik), Setzen ist Tippen.
* **Springen und Ducken** rechts, Ducken mit Doppeltipp zum Feststellen. Im
  Kreativ- und Zuschauermodus werden daraus Steigen und Sinken.
* **Hotbar** unten: die Steine sind schon da, sie brauchen nur größere
  Trefferflächen und ein Tippen statt der Zifferntasten. Wischen quer über die
  Hotbar blättert durch.
* **Vier Ecken:** Menü, Chat/Befehle, Inventar, Karte.

### Was das im Code heißt

| Heute | Am Telefon |
|---|---|
| `input.key('KeyW')` … | Knüppel schreibt in dieselben Tastenflags — der Spieler merkt nichts |
| `pointerlockchange` → `input.dx/dy` | Ziehen schreibt in dieselben `dx/dy` |
| Mausklick auf Canvas fordert Pointer Lock an | Am Telefon übersprungen, sonst pausiert das Spiel beim ersten Tippen |
| `onMouseDown(0/2)` | Die beiden Knöpfe rufen dieselben Funktionen |

Das ist der entscheidende Punkt: **die Eingabe wird umgeleitet, nicht
nachgebaut.** `Player.update` liest weiter `input.key(...)`, und ob dahinter
eine Tastatur oder ein Daumen steckt, muss es nicht wissen. Damit bleibt genau
eine Spiellogik, die auch nur einmal kaputtgehen kann.

### Später: Tippen auf den Block

Bedrocks Vorgabe ist „tap to interact" — man tippt den Block an, statt ihn
anzuvisieren. Das braucht einen Strahl vom Berührungspunkt statt aus der
Bildmitte: Projektionsmatrix invertieren, entprojizieren, in denselben
`world.raycast` schicken. Machbar, aber ein zweiter Zielpfad, der überall
mitgepflegt werden muss. Darum als Umschalter in einem späteren Schritt und
nicht im ersten.

---

## 5. Fenster und Menüs

Der Fund aus der Bestandsaufnahme macht das billig: die gesamte Oberfläche
hängt an `--slot` und `--icon`. Eine Medienabfrage genügt für die Grundlast.

* **Nur Querformat.** Neun Hotbarplätze à 46 px sind 414 px plus Rand; im
  Hochformat bleibt daneben nichts. Statt alles zu verkleinern, bis es
  unbedienbar ist, kommt im Hochformat ein „Dreh das Gerät"-Hinweis. Bedrock
  macht es genauso.
* **Slots je nach Breite:** unter 700 px `--slot: 34px`, darüber 40 px. Das
  Kreativmenü mit seinen Reitern braucht zusätzlich scrollbare Reiterleisten.
* **Langes Drücken ersetzt den Rechtsklick.** Ein Helfer (`langesDruecken`),
  der die 30 Aufrufstellen in `ui.js` gemeinsam bedient, statt jede einzeln
  anzufassen: 400 ms halten = `button 2`, kürzer = `button 0`.
* **Tastenfelder.** Chat und Weltname brauchen die Bildschirmtastatur; die
  schiebt in iOS Safari das Layout hoch. Eingabefelder darum in einem eigenen,
  zentrierten Feld statt am unteren Rand.

---

## 6. Leistung — der eigentliche Punkt

Hier entscheidet sich, ob das Ding Spaß macht. Drei Stellschrauben, in der
Reihenfolge ihrer Wirkung:

1. **Sichtweite.** 4 statt 7 heißt 81 statt 197 Chunks — weniger als die
   Hälfte an Geometrie und an Erzeugung. Vorgabe am Telefon: 4, mit Regler.
2. **Chunkerzeugung häppchenweise.** Auf dem Rechner kostet ein Oberwelt-Chunk
   rund 8 ms; 81 Chunks am Stück wären dort schon 650 ms, am Telefon leicht das
   Drei- bis Fünffache. Es braucht ein Zeitbudget je Bild (etwa 6 ms) statt
   „so viele wie möglich", sonst ruckelt jeder Schritt über eine Chunkgrenze.
3. **Auflösung.** Der Renderer begrenzt die Pixeldichte bereits auf einen
   ganzzahligen Teiler. Am Telefon zusätzlich auf höchstens 1,5 deckeln — bei
   einem Pixellook fällt das kaum auf und spart je nach Gerät die Hälfte der
   Füllrate.

Dazu Kleinigkeiten mit sicherer Wirkung: Wolken und Partikel reduzieren,
Sichtweite beim Fallen nicht neu berechnen, `powerPreference: 'low-power'`
nicht setzen (wir wollen die schnelle GPU).

**Schritt 0 bleibt die Messung.** Ein Debugfeld mit Bildzeit, Chunkzeit und
Zeichenaufrufen auf deinem Telefon, ein Rundgang durch Wald, Dorf und Höhle —
und danach wird getunt. Alles andere wäre geraten.

---

## 7. Was sonst noch am Spiel hängt

* **Vollbild.** iOS Safari kennt `requestFullscreen` für Elemente nicht. Die
  Adressleiste frisst Höhe und taucht beim Scrollen wieder auf. Gegenmittel:
  `100dvh` statt `100vh`, Scrollen auf `body` unterbinden, und ein Hinweis
  „Zum Startbildschirm hinzufügen" — als installierte Seite läuft es ohne
  Leiste. Dafür genügt ein winziges Manifest, das zur Offline-Vorgabe passt.
* **Ton.** Braucht eine Nutzergeste. `audio.init()` hängt heute an Knöpfen im
  Menü; der erste Griff ans Overlay muss ihn ebenfalls anstoßen.
* **Spielstände.** Der Ordner über die File-System-Access-Schnittstelle gibt es
  auf iOS nicht und auf Android nur in Chrome. Am Telefon bleibt es beim
  Browserspeicher — und der wird in iOS Safari nach sieben Tagen ohne Besuch
  gelöscht. Das gehört sichtbar ins Weltenmenü, zusammen mit dem Verweis auf
  „Welt exportieren".
* **Bildschirm aus.** `navigator.wakeLock`, wo es sie gibt.
* **Versehentliches Wischen.** Zurück-Geste und Pull-to-Refresh mit
  `overscroll-behavior: none` und `touch-action: none` auf dem Canvas abstellen.

---

## 8. Reihenfolge

**Schritt 0 — messen.** Debugfeld, auf deinem Telefon öffnen, Bildzeit und
Chunkzeit in Wald, Dorf, Höhle und am Meer notieren. Ergebnis entscheidet über
die Vorgaben in Schritt 4.

**Schritt 1 — Eingabe umleiten.** `mobile.js` mit Erkennung, Knüppel,
Umsehen-Fläche und den nötigsten Knöpfen; Pointer Lock am Telefon aushängen.
Ziel: man kann sich bewegen, umsehen, abbauen und setzen. Sonst nichts.

**Schritt 2 — Oberfläche.** Querformat-Hinweis, Slotgrößen, langes Drücken
statt Rechtsklick, Hotbar antippbar, die vier Eckknöpfe.

**Schritt 3 — Feinschliff.** Ducken mit Doppeltipp, Sprinten über den Knüppel,
Fliegen im Kreativmodus, Empfindlichkeitsregler, Knopfgrößen einstellbar.

**Schritt 4 — Leistung.** Zeitbudget für die Chunkerzeugung, Vorgaben aus den
Messungen von Schritt 0, Auflösungsdeckel.

**Schritt 5 — Umgebung.** Manifest und „Zum Startbildschirm hinzufügen",
`dvh`-Layout, Wake Lock, Hinweis zum Browserspeicher im Weltenmenü.

**Später, wenn das steht:** Tippen auf den Block als zweites Zielschema,
Knopfanordnung frei verschiebbar, Gamepad über die Gamepad-API.

---

## 9. Bewusst nicht dabei

* **Eine eigene App.** Cordova, Capacitor, ein Store-Eintrag — das ist ein
  anderes Projekt mit Signaturen, Zertifikaten und Freigaben. Eine zum
  Startbildschirm hinzugefügte Seite ist auf beiden Systemen praktisch
  ununterscheidbar und kostet ein Manifest.
* **Ein eigenes UI-Gerüst.** Die Oberfläche skaliert aus zwei CSS-Variablen;
  das wäre mit Kanonen auf Spatzen.
* **Getrennte Spielstände.** Dieselbe Welt am Rechner und am Telefon ist der
  halbe Reiz — dank Export/Import geht das schon heute.
* **Toucheingabe für den Befehlsblock.** Befehle tippt man am Telefon nicht
  gern; die Chatzeile reicht, das Fenster bleibt bedienbar, mehr braucht es
  nicht.
