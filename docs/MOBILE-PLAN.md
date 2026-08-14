# Pocket-Version — Plan

> **Stand August 2026: Schritt 1 und 2 sind umgesetzt** — Eingabe umgeleitet,
> Gestensperre, Zeigerverwaltung über `pointerId`, neun Knöpfe, Knüppel,
> Blickfläche, Querformat-Hinweis und langes Drücken statt Rechtsklick. Offen
> sind Schritt 0 (Messung auf einem echten Gerät), 3 (Feinschliff), 4
> (Leistung) und 5 (Manifest, Wake Lock).

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
┌────────────────────────────────────────────────────────────┐
│ [☰]  [💬]                                      [🗺]  [F3] │  Menü·Chat   Karte·Debug
│                                                            │
│                             ✛                              │  Fadenkreuz bleibt
│                                          ╭───╮   ╭───╮     │
│      ╭─────╮                             │ ⛏ │   │ ✋ │     │  Aktion · Benutzen
│      │  ◉  │  ← Knüppel     Umsehen →    ╰───╯   ╰───╯     │
│      ╰─────╯                             ╭───╮   ╭───╮     │
│                                          │ ⤒ │   │ ⤓ │     │  Springen · Ducken
│  ▣▣▣▣▣▣▣▣▣                                          [▤]   │  Hotbar · Inventar
└────────────────────────────────────────────────────────────┘
```

### Der vollständige Knopfsatz

Aus dem Code gezogen, damit nichts durchrutscht. Zwanzig Belegungen — aber
längst nicht jede braucht eine Fläche auf dem Schirm.

**Ein Befund vorweg:** Angriff und Abbauen sind schon heute **derselbe Knopf**.
`onMouseDown(0)` schlägt zu, wenn eine Kreatur anvisiert ist, und baut sonst ab.
Ein eigener Angriffsknopf wäre also ein zweiter Schalter für dieselbe Leitung —
und einer, bei dem man im Ernstfall den falschen drückt. Stattdessen **wechselt
das Symbol mit dem Ziel**: Schwert, wenn eine Kreatur im Fadenkreuz steht,
Spitzhacke bei einem Block, ausgegraut bei nichts. Man sieht damit sogar mehr
als am Rechner, wo dieselbe Taste stumm beides tut.

| Heute | Am Telefon | Wo |
|---|---|---|
| Linksklick — angreifen **oder** abbauen | **Aktionsknopf**, Halten baut ab, Symbol wechselt mit dem Ziel | rechts, groß |
| Rechtsklick — setzen, benutzen, essen, handeln, schießen | **Benutzen-Knopf**, Halten spannt den Bogen | rechts, groß |
| `W A S D` | Knüppel | links unten |
| Maus | Ziehfläche | rechte Hälfte |
| Leertaste — springen, auftauchen, steigen | **Springen** | rechts |
| Shift — schleichen, sinken | **Ducken**, Doppeltipp stellt fest | rechts |
| Strg / Doppel-W — sprinten | Knüppel ganz außen | — |
| Doppel-Leertaste — fliegen | Doppeltipp auf Springen | — |
| `1`–`9` — Hotbar | Platz antippen, quer wischen blättert | unten |
| Mausrad — Hotbar | dito | — |
| Mausrad-Klick — Block aufnehmen | **langes Drücken auf den Aktionsknopf** | — |
| `E` / `I` — Inventar | **Inventarknopf** | unten rechts |
| `Q` — wegwerfen (mit Shift der Stapel) | langes Drücken auf den Hotbarplatz | — |
| `T` / `/` — Chat und Befehle | **Chatknopf** | oben links |
| `N` — Karte | **Kartenknopf** | oben rechts |
| `M` / `Esc` — Pause | **Menüknopf** | oben links |
| `F` Sichtweite, `P` Modus, `J` Musik, `R` Speichern, `F5` Hand | nur im Pausenmenü | — |
| `F3` — Debug | kleiner Knopf, abschaltbar | oben rechts |

Macht **neun Flächen** plus Knüppel, Ziehfläche und Hotbar. Das ist die Grenze
dessen, was auf ein Telefon passt, ohne dass man mehr Knöpfe als Welt sieht —
darum wandert alles Seltene ins Pausenmenü und nicht auf den Schirm.

Größe und Lage gehören später einstellbar (Bedrock kann das auch), aber erst,
wenn die Vorgabe steht. Ein Konfigurator für eine Anordnung, die noch niemand
gespielt hat, ist verfrüht.

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

## 5. Der Browser frisst die Gesten

Der Punkt, an dem solche Overlays üblicherweise scheitern: zwei Finger
gleichzeitig — laufen und springen, laufen und abbauen — und plötzlich zoomt
die Seite oder die Ansicht verrutscht. Das hat **zwei verschiedene Ursachen**,
und beide muss man einzeln erschlagen.

### Ursache 1: Der Browser hält die Geste für seine

Unser `user-scalable=no` im Viewport-Meta hilft dabei **nicht**. iOS Safari
ignoriert die Angabe seit iOS 10 bewusst — Apple hat sich für die
Bedienbarkeit gegen die Angabe entschieden, und daran führt kein Weg vorbei
([Hintergrund](https://medium.com/@johan_ronsse/re-apple-disabling-maximum-scale-behavior-on-responsive-websites-in-ios10-17bc7b0f27c0)).
Das Meta steht also da und tut auf dem wichtigsten Zielgerät gar nichts.

Was wirklich hilft, sind vier Dinge zusammen:

1. **`touch-action: none`** auf Canvas und Overlay. Das schaltet die
   Browsergesten für diese Elemente vollständig ab — Wischen, Zoomen,
   Doppeltipp-Zoom. Seit September 2019 überall verfügbar, in Safari ab 13
   ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)).
2. **`preventDefault()`** auf den Berührungsereignissen, zwingend mit
   `{ passive: false }`. MDN ist da deutlich: man braucht **beides**.
   `touch-action` sagt dem Browser *vorher*, dass er sich heraushalten soll,
   `preventDefault` stoppt ihn *nachher* — ohne das erste wartet der Browser
   erst ab, ob wir abbrechen, und das kostet Reaktionszeit.
3. **`gesturestart` / `gesturechange` / `gestureend` abfangen.** Die feuert nur
   iOS, und dort greift sie auch auf älteren Fassungen, wo `touch-action` noch
   nicht zog. Kostet drei Zeilen und schließt die letzte Lücke.
4. **`overscroll-behavior: none`** gegen Ziehen-zum-Neuladen, dazu
   `-webkit-touch-callout: none` und `user-select: none` gegen Lupe und
   Auswahlmenü beim langen Drücken — und genau das brauchen wir ja als Geste.

**Eine Einschränkung, die ich nicht verschweigen will:** `touch-action: none`
nimmt auch Leuten das Zoomen, die es zum Lesen brauchen. Deshalb kommt es
**nur auf Canvas und Steuerungsoverlay**, nicht auf die Seite. Inventar,
Weltenliste und Pausenmenü bleiben zoombar. Das ist kein Verzicht: dort will
niemand mit zwei Fingern durch die Welt laufen.

Die Wischgeste vom Bildschirmrand für Zurück/Vorwärts lässt sich in Safari
gar nicht abfangen. Dagegen hilft nur der **Start vom Startbildschirm** — als
installierte Seite gibt es diese Geste nicht. Ein weiteres Argument für das
Manifest aus Schritt 5.

### Ursache 2: Wir verwalten die Finger falsch

Die häufigere Ursache, und die eigentlich ärgerliche. Wer `touches[0]` liest,
baut sich den Fehler selbst ein: setzt ein zweiter Finger auf, verschieben
sich die Einträge, und der Knüppel bekommt plötzlich die Bewegung des Daumens,
der auf „Springen" liegt. Genau das fühlt sich an wie „die Ansicht verrutscht".

Der Ausweg heißt **Besitz statt Reihenfolge**:

* **Pointer Events statt Touch Events.** Sie vereinheitlichen Maus, Finger und
  Stift, jeder Zeiger trägt eine `pointerId`, und `setPointerCapture` heftet
  ihn an das Element, auf dem er angefangen hat. Ein Daumen, der beim Laufen
  über den Rand des Knüppels rutscht, bleibt damit beim Knüppel — ohne eigene
  Buchhaltung.
* **Beim Aufsetzen wird der Besitzer bestimmt**, danach nie wieder. Knüppel,
  Ziehfläche oder ein bestimmter Knopf — und nur dieser Besitzer verarbeitet
  die Bewegungen dieses Zeigers.
* **Jeder Besitzer hält seinen eigenen Zustand.** Der Knüppel merkt sich seinen
  Mittelpunkt, die Ziehfläche ihre letzte Position für das Delta. Nichts davon
  liegt in einer gemeinsamen Liste, die durcheinandergeraten könnte.

Damit funktionieren beliebig viele Finger gleichzeitig: laufen, umsehen,
springen und abbauen zu viert sind dann kein Sonderfall, sondern der Normalfall.

**Prüfbar machen:** ein Debugfeld, das die offenen Zeiger mit ihrer `pointerId`
und ihrem Besitzer anzeigt. Ohne das sucht man solche Fehler blind, weil sie
sich nur mit mehreren Fingern auf einem echten Gerät zeigen.

---

## 6. Fenster und Menüs

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

## 7. Leistung — der eigentliche Punkt

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

## 8. Was sonst noch am Spiel hängt

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

## 9. Reihenfolge

**Schritt 0 — messen.** Debugfeld, auf deinem Telefon öffnen, Bildzeit und
Chunkzeit in Wald, Dorf, Höhle und am Meer notieren. Ergebnis entscheidet über
die Vorgaben in Schritt 4.

**Schritt 1 — Eingabe umleiten, mit Gestensperre von Anfang an.** `mobile.js`
mit Erkennung, Zeigerverwaltung über `pointerId`, Knüppel, Umsehen-Fläche und
den nötigsten Knöpfen; Pointer Lock am Telefon aushängen. Die vier Maßnahmen
gegen die Browsergesten gehören in denselben Schritt — ein Overlay, bei dem der
zweite Finger die Seite zoomt, ist nicht „fast fertig", sondern unbenutzbar.
Ziel: bewegen, umsehen, abbauen und setzen, auch mit vier Fingern gleichzeitig.

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

## 10. Bewusst nicht dabei

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
