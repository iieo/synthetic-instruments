# Acid-Bass

`instruments/acid.mjs` erzeugt den quietschenden, resonanten Monobass aus Acid House und Hard
Techno. Es gibt keine Samples. Das Modell bildet die Schaltung nach: Sägezahn-Oszillator mit
Transistor-Rechteck, Diodenleiter-Tiefpass mit Rückkopplung, VCA, Filterhüllkurve, Akzent-Schaltung
mit Glättungskondensator und Portamento über ein RC-Glied. Dazu kommt auf Wunsch eine
Dioden-Verzerrung.

Weil dieser Klang vom Sequenzer lebt, ist die Haupt-Schnittstelle ein Sequenz-Renderer:

```js
import { renderSequence, render } from './instruments/acid.mjs';
const steps = [
  { midi: 36, gate: true, accent: true },
  { midi: 48, gate: true, slide: true },   // gleitet in den nächsten Schritt
  { midi: 39, gate: true },
  null,                                    // Pause
];
const x = renderSequence({ steps, bpm: 140, waveform: 'saw', cutoff: 0.3, resonance: 0.8,
  envMod: 0.6, decay: 0.4, accentAmount: 0.8, drive: 0, seed: 1 }); // Float64Array, mono, 48 kHz
const y = render({ midi: 36, velocity: 0.9, duration: 0.5, seed: 1 });
```

Jeder Schritt ist eine Sechzehntel. `slide: true` an einem Schritt heißt: Das Gate bleibt bis zum
nächsten Schritt offen, dessen Tonhöhe gleitet heran und die Hüllkurven starten nicht neu. So
arbeitet auch der klassische Sequenzer. Ein Akzent auf einer hineingeglittenen Note wird ignoriert.
`render()` spielt eine einzelne Note. Ab `velocity` 0,85 ist sie akzentuiert, darunter skaliert die
Velocity nur die Lautstärke.

## Parameter

Alle Regler laufen von 0 bis 1. Jeder kann eine Zahl sein, eine Funktion der Zeit in Sekunden oder
ein Array mit einem Wert pro Schritt (dazwischen linear interpoliert). So lassen sich lange
Cutoff- und Resonanzfahrten automatisieren.

| Parameter | Bedeutung | Standard |
|---|---|---|
| `waveform` | `'saw'` oder `'square'` | `'saw'` |
| `cutoff` | 40 Hz · 2^(7 · Wert), also 40 Hz bis 5,1 kHz. Werte über 1 gelten als Hz | 0,3 |
| `resonance` | Rückkopplung, ab etwa 0,97 Selbstoszillation | 0,75 |
| `envMod` | Hub der Filterhüllkurve, bis 5 Oktaven | 0,6 |
| `decay` | Abklingzeit der Filterhüllkurve auf −20 dB: 0,2 s · 10^Wert | 0,35 |
| `accentAmount` | Stärke des Akzents auf Cutoff und Lautstärke | 0,75 |
| `drive` | Dioden-Verzerrung, 0 ist aus | 0 |
| `gateLength` | Gate-Länge in Schritten (ohne Slide) | 0,55 |
| `slideTime` | Zeit, bis das Portamento 95 % erreicht | 0,06 s |
| `level` | linearer Ausgangspegel | 0,4 |

## Modell

Alles bis zur Verzerrung läuft mit vierfacher Abtastrate (192 kHz). Danach senkt ein
Kaiser-Fenster-FIR mit 255 Taps (Grenze 21 kHz, Sperrdämpfung etwa 90 dB) auf 48 kHz. Ein
Hochpass bei 12 Hz steht für die Koppelkondensatoren am Ausgang und hält den Gleichanteil bei null.

### 1. Oszillator

Der Sägezahn ist ein Phasenakkumulator mit PolyBLEP-Korrektur an der Rücksprungflanke (Välimäki und
Huovilainen 2007). Bei vierfacher Überabtastung liegen die Restspiegelungen unter −100 dB.

Das Rechteck ist kein zweiter Oszillator. In der Originalschaltung treibt der Sägezahn einen
einzelnen Transistor, der auf halber Höhe der Rampe umschaltet. Im Modell entstehen die
Schaltflanken als Differenz zweier um eine halbe Periode versetzter bandbegrenzter Sägezähne. Ein
Rest der Rampe bleibt als schräges Dach stehen (der Kollektor sackt ab), und eine weiche
tanh-Kennlinie bildet das Knie des Transistors nach.

Die Tonhöhe driftet langsam um etwa ±3 Cent: drei langsame, nicht kommensurable Sinusschwankungen
am Exponentialwandler. Der Seed legt sie fest, gleiche Parameter ergeben exakt dasselbe Signal.

### 2. Diodenleiter-Filter

Der Tiefpass ist eine Leiter aus vier Kondensatoren, die über Diodenpaare verbunden sind. Anders als
beim gepufferten Transistorleiter belastet jede Stufe die vorige. Der Strom durch ein Diodenpaar
ist näherungsweise tanh der Spannung darüber. Normiert auf eine Kreisfrequenz von 1:

```
v1' = T(x − k·v4 − v1) − T(v1 − v2)
v2' = T(v1 − v2) − T(v2 − v3)
v3' = T(v2 − v3) − T(v3 − v4)
v4' = 2 · T(v3 − v4)          T = tanh, oberster Kondensator mit halbem Wert
```

Diskretisiert wird mit der Trapezregel in TPT-Form ohne Verzögerung in der Rückkopplung
(Zavalishin 2018). Das implizite System wird pro Abtastwert mit dem Newton-Verfahren gelöst. Die
Jacobi-Matrix ist tridiagonal plus ein Eckelement aus der Rückkopplung, sie wird direkt eliminiert.
Meist reichen zwei bis drei Iterationen.

Die Lage der Resonanz und die Schwelle der Selbstoszillation rechnet das Modul beim Laden aus dem
linearisierten System aus: Die Schleifenphase erreicht −180° bei ω = √2, die kritische
Rückkopplung ist k = 17. Das deckt sich mit der Analyse des Diodenleiters bei Stinchcombe (2008).
Der Cutoff-Regler meint die Resonanzfrequenz, intern wird durch √2 geteilt.
`resonance` setzt k = 17 · 1,04 · Wert. Ab etwa 0,97 schwingt das Filter selbst, die tanh-Stufen
begrenzen die Amplitude.

Wie im Original fällt der Bass ab, wenn die Resonanz steigt, denn die Gleichspannungsverstärkung
des Leiters ist 1 / (1 + k). Ein fester Ausgleich (1 + 0,35 k) gleicht das nur zum Teil aus.
Gemessen bei 800 Hz Cutoff sinkt der Grundton von Resonanz 0 bis 0,9 um 6 dB.

### 3. Hüllkurven, Akzent und Slide

- **VCA:** Anstieg mit 1,5 ms, solange das Gate offen ist ein langsames Absinken (τ 4 s) auf
  35 %, nach dem Gate Ausklingen mit τ 5 ms. Die Noten beginnen und enden ohne Knacken.
- **Filterhüllkurve:** springt in unter 1 ms auf den Maximalwert und klingt exponentiell ab.
  Akzentuierte Noten nutzen wie im Original immer die kürzeste Abklingzeit (0,2 s), unabhängig vom
  Decay-Regler.
- **Akzent:** Ein eigener Akzent-Puls (0,2 s) hebt die Lautstärke um bis zu +7 dB. Derselbe Puls lädt
  über eine Diode einen Kondensator (Laden τ 30 ms, Entladen τ 0,25 s). Weil der Kondensator
  zwischen zwei schnellen Akzenten nicht leer wird, steigt die Spannung von Akzent zu Akzent. Der
  Resonanzregler blendet zwischen direktem Puls und geglätteter Spannung über, so wie im Original
  der Resonanzregler mit dem Akzent-Glätter gekoppelt ist. Beides verschiebt den Cutoff um bis zu
  `3 · accentAmount` Oktaven nach oben.
- **Slide:** Die Steuerspannung folgt einem RC-Glied mit τ = `slideTime` / 3, also 95 % nach
  60 ms. Ohne Slide springt die Tonhöhe sofort.

### 4. Verzerrung

Ein Vorwiderstand speist einen Kondensator, parallel dazu liegt ein antiparalleles Diodenpaar
(Yeh, Abel und Smith 2007):

```
C·v' = (x − v)/R − 2·Is·sinh(v / (n·Vt))
```

Auch diese Gleichung wird mit Trapezregel und Newton gelöst, bei 192 kHz. Die Newton-Schritte sind
auf wenige Temperaturspannungen begrenzt, sonst läuft sinh aus großer Entfernung über. Ein kleiner
Gleichspannungs-Offset vor dem Clipper macht die Kennlinie unsymmetrisch und erzeugt gerade
Obertöne. `drive` stellt die Vorverstärkung von +4 dB bis +38 dB ein. Die Sättigung gehört zum
Instrument, die Ausgangsverstärkung ist linear.

## Demo

`node demos/acid.mjs` schreibt `out/acid.wav` (30,6 s, etwa 4 s Rechenzeit):

1. 4 Takte klassische Linie bei 140 BPM mit Akzenten, Slides und einer Pause.
2. 8 Takte derselben Linie mit langer Fahrt: Cutoff von 0,26 auf 0,72 und Resonanz von 0,72 auf
   0,97 über 6 Takte, dann in 2 Takten zurück.
3. 6 Takte verzerrte Hard-Techno-Linie bei 150 BPM, Drive 0,75, steigender Cutoff.

Die Lautheit von Teil 3 wird linear an Teil 1 angeglichen (+3 dB im RMS), dann wird das Ganze
linear auf −1 dBFS normiert.

## Messungen

| Prüfung | Ergebnis |
|---|---|
| Spitzenpegel / True Peak (ebur128) | −1,0 dBFS / −0,9 dBTP |
| Integrierte Lautheit | −19,9 LUFS |
| Tonhöhe (MIDI 28 bis 60, Säge und Rechteck) | +2,2 Cent, das ist die Drift im Messfenster |
| Gleichanteil | unter 1e−11 |
| Selbstoszillation bei 200 Hz bis 4 kHz | 2 % unter dem Sollwert, stabil, kein NaN |
| Extremwerte (alle Regler auf 1, Rechteck) | stabil, kein NaN |
| Knacken an Notengrenzen (dunkles Filter) | größter Sprung 1 % der Spitze |
| Akzentfolge (6 Akzente) | Cutoff-Spitze 2,2 → 4,7 → 5,9 → 6,4 → 6,7 kHz |
| Slide 36 → 48 | 65 → 123 Hz in etwa 55 ms, keine neue Hüllkurve |

Im Spektrogramm folgt die Resonanzspitze sichtbar der Hüllkurve, akzentuierte Noten sind heller
und lauter, und die Akzente bauen sich auf. Ein Sägezahn- und Rechteck-Glissando über drei Oktaven
mit offenem Filter zeigt keine Spiegelfrequenzen. Der größte Sprung zwischen zwei Abtastwerten in
der Demo (0,88) kommt von den Flanken des Sägezahns bei weit offenem Filter, nicht von den
Hüllkurven. Als grober Vergleich diente dieselbe Linie, gespielt mit dem General-MIDI-Synthbass
einer freien Soundfont. Dort bleibt das Spektrum starr, es gibt keine wandernde Resonanz. Diese
Vergleichsaufnahme ist nicht Teil des Repos.

## Grenzen

- Die Diodenleitung ist vereinfacht: gleiche Diodenpaare, keine Transistor-Eingangsstufe, kein
  Hochpass im Rückkopplungspfad.
- Bei Selbstoszillation über etwa 10 kHz und starker Verzerrung entstehen Obertöne oberhalb der
  vierfachen Nyquist-Frequenz, die zurückspiegeln (um −45 dB). In normalen Einstellungen tritt das
  nicht auf.
- Bei Resonanz 0 ist das Filter sehr dunkel, weil der Regler die Resonanzfrequenz meint und der
  ungekoppelte Diodenleiter weit darunter abfällt.

## Quellen

- T. Stinchcombe: *Analysis of the Moog Transistor Ladder and Derivative Filters*, 2008 (enthält den
  Diodenleiter).
- V. Zavalishin: *The Art of VA Filter Design*, Rev. 2.1, 2018 (TPT, Leiterfilter, nichtlineare
  Lösung mit Newton).
- V. Välimäki, A. Huovilainen: *Antialiasing Oscillators in Subtractive Synthesis*, IEEE Signal
  Processing Magazine 24(2), 2007 (PolyBLEP).
- A. Huovilainen: *Non-linear Digital Implementation of the Moog Ladder Filter*, DAFx 2004.
- D. Yeh, J. Abel, J. O. Smith: *Simulation of the Diode Limiter in Guitar Distortion Circuits by
  Numerical Solution of Ordinary Differential Equations*, DAFx 2007.
- ITU-R BS.1770-4: *Algorithms to measure audio programme loudness and true-peak audio level*.

Der Code ist vollständig selbst geschrieben, aus den Gleichungen oben. Es wurde kein Code aus
Bibliotheken oder Veröffentlichungen übernommen.
