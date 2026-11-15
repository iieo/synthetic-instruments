# Gestrichene Saiten: Cello und Violine

Beide Instrumente entstehen ohne Samples aus einem physikalischen Modell: eine gestrichene
Saite als digitaler Wellenleiter, eine nichtlineare Reibungskopplung am Bogen und ein modaler
Korpus. Der Code liegt in `instruments/strings-bowed/`, die Instrumente in
`instruments/cello.mjs` und `instruments/violin.mjs`, die Demos in `demos/`.

```
node demos/cello.mjs    # schreibt out/cello.wav
node demos/violin.mjs   # schreibt out/violin.wav
```

## Schnittstelle

```js
import { render, renderPhrase, meta } from './instruments/violin.mjs';

render({ midi: 69, velocity: 0.8, duration: 2, seed: 1, vibrato: true }); // Float64Array, mono, 48 kHz

renderPhrase({
  seed: 1,
  notes: [
    { midi: 69, dur: 1.5, vel: 0.4, velEnd: 0.8 },    // Crescendo im selben Bogenstrich
    { midi: 74, dur: 1.0, vel: 0.8, slur: true },     // gebunden: nur der Finger wechselt
    { midi: 73, dur: 0.5, vel: 0.6 },                 // Bogenwechsel
    { midi: null, dur: 0.3 },                         // Pause, Bogen abgehoben
  ],
});
```

`render` ist ein Sonderfall von `renderPhrase` mit einer Note. Eine Phrase läuft auf einer
einzigen, durchgehend schwingenden Saite. Legato und Bogenwechsel passieren also im Modell
selbst: Beim Legato ändert sich nur die Saitenlänge, beim Bogenwechsel läuft die
Bogengeschwindigkeit durch null und die Saite muss die Helmholtz-Bewegung in der neuen Richtung
neu aufbauen. Am Ende hebt der Bogen ab, die Saite klingt kurz frei weiter und wird dann
gedämpft. Alles ist deterministisch über `seed`.

Tonumfang: Cello MIDI 36 bis 84 (C2 bis C6), Violine MIDI 55 bis 96 (G3 bis C7).

## Saite: Wellenleiter mit Bogenpunkt

Die Saite ist in zwei Abschnitte geteilt, Steg bis Bogen und Bogen bis Griffstelle
(McIntyre, Schumacher, Woodhouse 1983; Smith 2010). Jeder Abschnitt führt Geschwindigkeitswellen
in beide Richtungen.

* Stegseite: zwei ganzzahlige Verzögerungen der Länge `Lb = round(β · P / 2)` mit der Periode
  `P = SR / f0` und der relativen Bogenposition `β = 0,15`. Für eine Phrase gilt die tiefste Note
  als Bezug, die Bogenposition ist also ein fester Abstand vom Steg wie beim Spieler.
* Reflexion am Steg: `−g · Tiefpass₁(w)`. `g` folgt aus der gewünschten Nachklingzeit der freien
  Saite (`t60`), der Tiefpass erster Ordnung macht die Dämpfung frequenzabhängig und rundet die
  Helmholtz-Ecke.
* Griffseite: eine Rundlaufverzögerung mit Lagrange-Interpolation dritter Ordnung, deren Länge
  sich jede Probe ändern darf. Darüber laufen Vibrato, Glissando beim Legato und Intonation.
  Die Phasenlaufzeiten beider Tiefpässe bei `f0` werden von der Verzögerung abgezogen, damit die
  Stimmung stimmt.
* Kraft auf den Steg: Differenz aus ankommender und reflektierter Welle. Sie treibt den Korpus.

## Reibung am Bogen

Die Reibungskennlinie ist hyperbolisch:

```
μ(Δv) = sign(Δv) · (μd + (μs − μd) · v0 / (v0 + |Δv|)),   μs = 0,8, μd = 0,3
```

`Δv` ist die Relativgeschwindigkeit von Bogen und Saitenoberfläche. Pro Probe wird die Gleichung
`a − x = k · μ(x)` gelöst, wobei `a` die Relativgeschwindigkeit ohne Bogenkraft ist und `k` die
Bogenkraft geteilt durch die doppelte Wellenimpedanz. Für Gleiten in einer Richtung ist das eine
quadratische Gleichung mit geschlossener Lösung. Wo Haften und Gleiten beide möglich sind, bleibt
die Saite im bisherigen Zustand (Hysterese nach Friedlander 1953). Daraus entsteht die
Stick-Slip-Bewegung und von selbst die Helmholtz-Bewegung mit genau einem Gleiten pro Periode.

`v0` wird mit der Bogengeschwindigkeit skaliert (`v0 = 0,25 · v_Bogen`). Weil die Bogenkraft
ebenfalls proportional zur Bogengeschwindigkeit geführt wird, bleibt das Modell über die Dynamik
im selben Bereich des Schelleng-Diagramms. Lautstärke kommt aus der Bogengeschwindigkeit, wie
beim echten Instrument (Schelleng 1973). Ohne diese Skalierung wurden leise Noten bis zu 15 Cent
zu hoch.

### Torsion

Der Bogen greift an der Oberfläche der Saite an, die sich dabei auch verdreht. Torsionswellen
laufen etwa fünfmal schneller als Transversalwellen und sind stark gedämpft (Woodhouse und
Galluzzo 2004; Woodhouse 2014). Im Modell ist das ein zweiter, kurzer und verlustreicher
Wellenleiter am Bogenpunkt mit dem Impedanzverhältnis `ε = 0,4`. Die Kontaktgeschwindigkeit ist
die Summe aus Transversal- und Torsionsanteil, die Reibungsgleichung bekommt dadurch die
effektive Kraft `(1 + ε) · k`.

Das war die wichtigste Änderung für die Stabilität. Ohne Torsion fielen tiefe Cellonoten in
Phrasen mit Bogenwechseln oft in Bewegungen mit zwei bis zehn Gleitphasen pro Periode (in der
Messung nur 68 % der Zeitfenster mit sauberer Helmholtz-Bewegung). Mit Torsion sind es in
denselben Phrasen 100 %, und zwischen dem 0,5- und 0,9-fachen der Nennkraft bleiben es über 94 %.

### Ansatz und Ausdruck

* Ansatz: Die Bogenkraft steigt schneller als die Geschwindigkeit, mit kurzer Kraftbetonung am
  Anfang. Die Beschleunigungszeit beträgt mindestens 12 Perioden (bei Détaché 5), damit tiefe
  Saiten die Helmholtz-Bewegung sauber aufbauen (Guettler 2002). Lange Noten setzen in etwa
  80 bis 150 ms ein, Détaché in etwa 30 bis 60 ms.
* Hohe Noten bekommen relativ weniger Bogenkraft (bis 45 % weniger oberhalb von 350 Hz).
  Kurze Saiten laufen sonst aus dem stabilen Bereich und werden unsauber in der Tonhöhe.
* Vibrato: setzt nach etwa 0,3 s ein (zufällig ±20 %), blendet über 0,45 s ein, Rate um 5,6 Hz
  (Violine) bzw. 5,2 Hz (Cello) mit langsamem Wandern, Tiefe etwa ±17 bis 18 Cent, ebenfalls
  schwankend. Ab Notenlänge 0,4 s.
* Bogenrauschen: tiefpassgefilterte Schwankung der Reibungskraft.
* Intonation: kurze Saiten werden durch die Reibung leicht zu hoch. Ein kleiner, fester
  Ausgleich (bis −4 Cent bei hohen Noten) spielt die Rolle des Gehörs.

## Korpus

Der Korpus ist eine Parallelbank aus Zwei-Pol-Resonatoren, angeregt von der Stegkraft.

Violine: tiefe Signaturmoden nach veröffentlichten Messungen: A0 (Helmholtz-Luftmode der
F-Löcher) bei 275 Hz, CBR bei 405 Hz, B1− bei 470 Hz, B1+ bei 545 Hz (Bissinger 2008;
Woodhouse 2014; Jansson 2002), dazu vier schwächere Moden zwischen 650 Hz und 1 kHz.

Cello: A0 bei etwa 100 Hz und die Hauptmoden des Korpus zwischen 150 und 230 Hz, dazu
schwächere Moden bis 760 Hz. Die Werte sind Größenordnungen aus der Literatur (Fletcher und
Rossing 1998), keine Messung an einem bestimmten Instrument.

Oberhalb von etwa 1 kHz (Cello 700 Hz) ist die Modendichte so hoch, dass einzelne Moden nicht
mehr sinnvoll aus Messungen übernommen werden können. Dort liegen 24 bis 28 Moden
logarithmisch verteilt mit festem Zufallsversatz, zufälliger Polarität und einer glatten
Hüllkurve. Sie bildet den „Bridge Hill“ nach: bei der Violine um 2,9 kHz, beim Cello um 2 kHz.
Die zufällige Polarität ist wichtig. Mit gleichem Vorzeichen erzeugt die Summe systematische
Einbrüche zwischen den Moden, im Spektrogramm als harte Kante sichtbar.

Danach folgen ein Tiefpass für die Abstrahlung (Violine 8 kHz, Cello 3,8 kHz, je zweiter
Ordnung) und ein Hochpass vierter Ordnung knapp unterhalb von A0 (Violine 215 Hz, Cello 78 Hz).
Unterhalb der Luftmode strahlt der Korpus kaum ab, deshalb ist der Grundton der leeren
G-Saite der Violine und der C-Saite des Cellos schwach, wie beim echten Instrument.

## Messungen

Hören war nicht möglich, alles ist gemessen. Referenz sind Renderings von FluidR3_GM
(GM 41 Violine, GM 43 Cello) mit FluidSynth ohne Hall und Chorus, gleiche Noten, je 2,5 s.
Die Referenzdateien liegen nur lokal in `reference/` und gehören nicht ins Repository.

* Helmholtz-Bewegung: Zählung der Übergänge von Haften zu Gleiten pro Periode. Für jede
  Note im Tonumfang bei drei Dynamikstufen, mit und ohne Vibrato: überall 1,0 im eingeschwungenen
  Teil. In den Demo-Phrasen 100 % der 100-ms-Fenster mit genau einem Gleiten pro Periode.
* Stimmung (Autokorrelation über mehrere Perioden, ohne Vibrato): Cello überall innerhalb von
  ±3 Cent. Violine bis E6 innerhalb von ±4 Cent, darüber vereinzelt bis ±6 Cent. Die
  Abweichung hängt nicht mehr von der Dynamik ab.
* Spektrale Hüllkurve (Terzbänder, über sechs Noten gemittelt): Violine und Cello liegen
  zwischen 300 Hz und 5 kHz meist innerhalb von 3 bis 6 dB der Referenz, einschließlich des
  Bridge Hill der Violine um 2,5 kHz und des Bereichs 1,6 bis 2,5 kHz beim Cello. Oberhalb von
  6 kHz ist das Modell dunkler als die Referenz.
* Ansatz (10 % bis 90 % der Hüllkurve): Modell 50 bis 130 ms, Referenz 300 bis 750 ms. Die
  Samples der Referenz setzen sehr weich ein, das Modell eher wie ein normaler Bogenansatz.
* Demos: Spitze −3 dBFS, erste und letzte Probe exakt null, keine NaN. Größter Sprung von Probe
  zu Probe etwa 0,10 bis 0,11 bei Spitzenwert 0,71. Das entspricht dem normalen Anteil hoher
  Teiltöne, in Blöcken von 10 ms gibt es keine Ausreißer gegenüber dem Median. Lautheit etwa
  −18 LUFS. Jede Demo rendert in etwa einer Sekunde.

## Bekannte Schwächen

* Ein Ton entsteht auf einer Saite. Saitenwechsel, Doppelgriffe und mitschwingende Nachbarsaiten
  fehlen.
* Die Bogenbreite ist punktförmig, die Reibung ist eine feste Kennlinie statt eines thermischen
  Modells.
* Die hohen Korpusmoden sind statistisch gesetzt, nicht gemessen.
* Über C7 (Violine) wird die Tonhöhe instabil, weil die Stegseite nur noch ein bis zwei Proben
  lang ist.
* Kein Raum. Das Signal ist trocken und mono.

## Quellen

* F. G. Friedlander: On the oscillations of a bowed string. Proc. Cambridge Philos. Soc. 49
  (1953), 516-530.
* J. C. Schelleng: The bowed string and the player. J. Acoust. Soc. Am. 53 (1973), 26-41.
* M. E. McIntyre, R. T. Schumacher, J. Woodhouse: On the oscillations of musical instruments.
  J. Acoust. Soc. Am. 74 (1983), 1325-1345.
* N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments, 2. Aufl., Springer 1998,
  Kapitel zur Violinfamilie.
* K. Guettler: On the creation of the Helmholtz motion in bowed strings. Acta Acustica united
  with Acustica 88 (2002), 970-985.
* E. V. Jansson: Acoustics for violin and guitar makers. KTH Stockholm, 2002 (online).
* J. Woodhouse, P. M. Galluzzo: The bowed string as we know it today. Acta Acustica united with
  Acustica 90 (2004), 579-589.
* G. Bissinger: Structural acoustics of good and bad violins. J. Acoust. Soc. Am. 124 (2008),
  1764-1773.
* J. O. Smith III: Physical Audio Signal Processing. CCRMA, Stanford, 2010 (online).
* J. Woodhouse: The acoustics of the violin: a review. Rep. Prog. Phys. 77 (2014), 115901.

Der gesamte Code ist eigenständig geschrieben. Es wurde kein Code aus Bibliotheken oder
Veröffentlichungen übernommen, und es sind keine Samples, Impulsantworten oder SoundFont-Daten
enthalten.
