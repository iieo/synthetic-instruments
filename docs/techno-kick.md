# Techno Kick

Eine harte, verzerrte Bassdrum für Techno, Industrial und Gabber, dazu der „Rumble“: der dunkle,
gepumpte Hall unter der Kick, wie man ihn aus aktuellem Techno kennt. Alles entsteht aus
Schaltungsmodellen, ohne Samples und ohne aufgenommene Impulsantworten.

```js
import { render, renderRumble, meta } from './instruments/techno-kick.mjs';
const hit = render({ preset: 'hard', velocity: 0.9, seed: 1 });        // Float64Array, mono, 48 kHz
const low = render({ preset: 'gabber', pitch: 58, drive: 1.3 });
const loop = renderRumble({ bpm: 150, bars: 8, roots: [33, 33, 29, 31] }); // Kick plus Rumble
```

`meta.presets` ist `['hard', 'industrial', 'gabber', 'rumble']`. `render` ist deterministisch:
gleicher Seed, gleiche Samples. Jeder Schlag beginnt und endet bei exakt null.

Demo: `node demos/techno-kick.mjs` schreibt `out/techno-kick.wav` (29 s, Rendern etwa 7 s). Zuerst
jedes Preset dreimal allein, dann je ein Takt 4/4 mit 150 BPM für `hard` (zwei Takte, mit Auftakt),
`industrial` und `gabber`, zum Schluss acht Takte Kick mit Rumble, Grundton A, A, F, G.

## Parameter

| Parameter | Bedeutung |
| --- | --- |
| `preset` | `hard`, `industrial`, `gabber`, `rumble` |
| `velocity` | 0 bis 1. Steuert Pegel, Tiefe des Pitch-Sweeps, Punch, Klick und Drive |
| `seed` | Ganze Zahl. Kleine Streuung von Endton und Sweep-Zeit, Rauschen |
| `pitch` | Endfrequenz des Resonators, 30 bis 120 Hz (Standard 46 bis 62 Hz je nach Preset) |
| `decay` | 0,25 bis 3, Faktor auf Länge, Abklingzeit, VCA und Release (Standard 1) |
| `drive` | 0,25 bis 3, Faktor auf Verstärkung vor dem Transistorpaar und Pegel am Diodenclipper (Standard 1) |
| `bpm` | Nur `rumble`, 60 bis 200: Länge des Schlags ist genau eine Viertelnote |
| `oversample` | Überabtastung der nichtlinearen Stufen, 1 bis 16, Standard 8 (nur für Messungen ändern) |

Werte außerhalb dieser Bereiche werden auf die nächste Grenze gesetzt.

`renderRumble({ bpm, bars, beats, roots, velocity, seed, decay, drive, rumble, kick, tail, pattern })`
rendert eine ganze Passage, denn der Hall läuft über die Schläge hinweg. `roots` enthält einen
MIDI-Ton pro Takt (zyklisch), die Kick wird darauf gestimmt (in die Oktave 40 bis 80 Hz gelegt).
`rumble` und `kick` sind Pegelfaktoren von 0 bis 2, `pattern` ist ein optionales Array aus
Wahrheitswerten pro Viertel, `tail` hängt 0 bis 4 Sekunden für das Ausklingen an. `bars` geht von
1 bis 64, `beats` (ersetzt `bars`) von 1 bis 256, die Grundtöne von MIDI 0 bis 127.

Jede einzelne Kick hat ihre Spitze bei höchstens −1 dBFS (0,89, mit der Velocity bis 0,43
herunter). Im Rumble können sich lange Kicks bei langsamem Tempo überlappen, und der Hall kommt
dazu. Liegt die Summe über −1 dBFS, wird die ganze Passage mit einem einzigen linearen Faktor
abgesenkt. Das ist kein Limiter: Die Form der Welle und das Verhältnis von Kick und Rumble bleiben
erhalten. Bei den Standardwerten greift die Absenkung schon (etwa 1,3 dB), weil Kick und Rumble
zusammen knapp über 0 dBFS kämen.

## Signalweg

Alles Nichtlineare läuft mit 384 kHz (achtfach überabgetastet) und wird erst am Ende dezimiert.

1. **Triggerimpuls.** Ein Rechteck von 0,6 bis 0,9 ms durch ein RC-Glied (40 µs). Der Impuls wird
   aus seiner geschlossenen Form abgetastet, damit seine Form nicht von der Abtastrate abhängt.
2. **Brücken-T-Resonator.** Der klassische analoge Bassdrum-Kreis ist ein Brücken-T-Netzwerk in der
   Rückkopplung eines Verstärkers, also ein Bandpass zweiter Ordnung mit hoher Güte, den der
   Triggerimpuls anstößt. Modelliert als Zustandsvariablenfilter in trapezförmiger Diskretisierung
   (Topology Preserving Transform), dessen Koeffizienten jedes Sample neu berechnet werden. Das bleibt
   bei schneller Modulation stabil. Die Mittenfrequenz folgt
   `f(t) = fEnd · (1 + a·e^(−t/τ1)) · (1 + b·e^(−t/τ2)) · (1 + c·e^(−t/τ3))`.
   Der langsame Term (τ1 25 bis 50 ms) ist die Entladung des Kondensators, der über den Trigger
   geladen wird und den Arbeitspunkt des Abstimmelements verschiebt: der natürliche Pitch-Drop.
   Der schnelle Term (τ2 1 bis 2 ms) ist der Punch, ein Chirp aus dem Kilohertzbereich. Der dritte,
   kleine Term hält den Ton im Körper leicht fallend. Die Güte wird mit der Frequenz mitgeführt
   (`Q = π f τ`), damit die Abklingzeit τ konstant bleibt, während sich die Frequenz bewegt.
3. **Klick.** Die Flanke des Triggers durch einen Bandpass bei 2,6 bis 4 kHz, dazu ein kurzer,
   gefilterter Rauschstoß. Bei `hard` und `rumble` wird der Klick größtenteils nach der Verzerrung
   zugemischt (sauberer Klick), bei `industrial` und `gabber` geht er mit in die Verzerrung.
4. **VCA.** Hält einen Teil der Länge, dann exponentiell abwärts, damit der Körper natürlich aus der
   Sättigung fällt, statt bis zum Ende als Rechteck zu stehen.
5. **Transistorpaar.** Ein emittergekoppeltes Differenzpaar liefert den Strom `I·tanh(vd/2Vt)`.
   Ein Offset (Fehlanpassung der Transistoren) macht die Kennlinie unsymmetrisch und erzeugt gerade
   Obertöne. Der statische Anteil wird abgezogen.
6. **Wavefolder (nur `gabber`).** Eingang minus verstärkter Diodenrest:
   `y = x − G·(x − T·tanh(x/T))`. Unterhalb der Schwelle leiten die Dioden nicht und `y = x`,
   darüber wird die Steigung `1 − G` negativ, die Welle faltet sich zurück. Danach eine weiche
   Begrenzung. Das ist eine vereinfachte Form der Diodenfalter, wie sie Esqueda u. a. für Serge- und
   Lockhart-Falter analysieren.
7. **Diodenclipper.** Serienwiderstand 2,2 kΩ, Kondensator 10 nF nach Masse, parallel eine
   Siliziumdiode in Durchlassrichtung und zwei in Serie in Sperrrichtung (unsymmetrisch):
   `C·dv/dt = (vin − v)/R − Is·(e^(v/nVt) − e^(−v/2nVt))`. Gelöst mit der Trapezregel und pro Sample
   einem Newton-Verfahren mit Bisektions-Rückfall. Die implizite Gleichung ist in `v` monoton, das
   Verfahren konvergiert deshalb immer (ein reines Newton mit Schrittbegrenzung blieb bei hartem
   Eingang in etwa 0,4 % der Samples unkonvergiert).
8. **Dezimierung.** Kaiser-gefenstertes Sinc-FIR, eben bis 20 kHz, mindestens 100 dB Dämpfung ab
   24 kHz, nullphasig, dann jedes achte Sample.
9. **Nachbearbeitung bei 48 kHz.** Butterworth-Hochpass 28 Hz zweiter Ordnung (entfernt auch den
   Gleichanteil aus der unsymmetrischen Begrenzung), Tiefpass vierter Ordnung (6,5 bis 12 kHz),
   Glockenfilter je Preset, linearer Ausgangspegel, Raised-Cosine-Release bis exakt null.

### Presets

| Preset | Endton | Sweep-Start | Länge | Charakter |
| --- | --- | --- | --- | --- |
| `hard` | 50 Hz | etwa 330 Hz | 0,42 s | punchig, verzerrt, für 145 bis 155 BPM |
| `industrial` | 46 Hz | etwa 360 Hz | 0,46 s | mehr Drive, Rauschen im Klick, Grit, Präsenz bei 2,4 kHz |
| `gabber` | 62 Hz | etwa 550 Hz | 0,56 s | Transistorpaar weit übersteuert, Wavefolder, tonaler „Boom“ |
| `rumble` | 50 Hz | etwa 250 Hz | eine Viertel | kürzere Kick mit Hallfahne für eine Viertelnote |

Grit (`industrial`): breitbandiges Rauschen, mit dem Quadrat der Körperamplitude moduliert, vor dem
Transistorpaar. Die Verzerrung lässt es mit der Kick knistern.

## Rumble

1. Die Kicks werden auf den Grundton des Taktes gestimmt und auf einen Bus summiert.
2. Send: Tiefpass 400 Hz, damit der Hall im Bass klingt und nicht auf dem Klick.
3. Hall: eigenes Feedback-Delay-Netzwerk. Acht Verzögerungsleitungen mit teilerfremden Längen
   (32 bis 83 ms), orthogonale Hadamard-Rückkopplung (verlustfrei), pro Leitung eine Dämpfung für
   T60 = 2,6 s und ein Einpol-Tiefpass, der die Höhen schneller abklingen lässt (absorbierende
   Verzögerungen nach Jot).
4. Verzerrung des Hallsignals, vierfach überabgetastet: Differenzpaar, dann Diodenclipper.
5. Butterworth-Tiefpass 180 Hz vierter Ordnung, Hochpass 32 Hz.
6. Ein zeitvarianter Bandpass (Güte 4) auf dem aktuellen Grundton wird beigemischt. So folgt der
   Rumble dem Grundton auch dann, wenn der Hall vom vorigen Takt noch klingt.
7. Sidechain: Spitzenwertfolger auf dem Kick-Bus (Attack 0,8 ms, Release ein Drittel einer
   Viertel), Absenkung bis 92 %.

`render({ preset: 'rumble', bpm })` liefert eine einzelne Kick mit ihrer Hallfahne, genau eine
Viertelnote lang, so dass sie sich nahtlos auf Viertel legen lässt. Für echte Passagen ist
`renderRumble` gedacht, weil sich dort der Hall über die Schläge aufbaut.

## Messungen

**Tonhöhe** (Nulldurchgänge nach Tiefpass 600 Hz, Velocity 0,9):

| Preset | 5 ms | 10 ms | 20 ms | 40 ms | 80 ms | 150 ms | 250 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hard` | 327 | 212 | 165 | 105 | 70 | 52 | 50 |
| `industrial` | 364 | 233 | 191 | 131 | 78 | 50 | 47 |
| `gabber` | 556 | 411 | 342 | 247 | 141 | 88 | 68 |
| `rumble` | 244 | 214 | 166 | 104 | 70 | 56 | 55 |

**Energieverteilung** (Anteil an der Gesamtenergie eines Schlags in dB):

| Preset | 30 bis 60 Hz | 80 bis 150 Hz | 150 bis 500 Hz | 0,5 bis 2 kHz | 2 bis 5 kHz | 5 bis 16 kHz |
| --- | --- | --- | --- | --- | --- | --- |
| `hard` | −3,2 | −7,4 | −9,9 | −17,3 | −28,9 | −38,5 |
| `industrial` | −2,8 | −7,8 | −10,0 | −15,0 | −22,0 | −32,1 |
| `gabber` | −7,9 | −6,0 | −5,8 | −14,3 | −20,4 | −29,3 |

Der Klick (2 bis 5 kHz) macht in den ersten 30 ms −18 dB (`hard`) bis −11 dB (`industrial`,
`gabber`) der Energie aus.

**Aliasing.** Die Kette aus Resonator, Transistorpaar, Folder und Diodenclipper wurde ohne
Rauschanteile mit Überabtastung 1, 2, 4, 8 und 16 gerendert und mit einer 32-fach überabgetasteten
Referenz verglichen (Differenzenergie oberhalb 500 Hz):

| Faktor | 1 | 2 | 4 | 8 | 16 |
| --- | --- | --- | --- | --- | --- |
| `hard` | −34 dB | −47 dB | −54 dB | −64 dB | −74 dB |
| `gabber` | −27 dB | −46 dB | −50 dB | −66 dB | −73 dB |

Achtfach liegt der Fehler also gut 30 dB unter dem ohne Überabtastung. Im Spektrogramm der Demo
gibt es keine gespiegelten Teiltöne, die von oben herunterfalten.

**Rumble.** Stärkste Frequenz des Rumbles allein pro Takt: 58 / 58 / 42,5 / 48 Hz bei Grundtönen
55 / 55 / 43,7 / 49 Hz. Die Abweichung um etwa 2,5 Hz ist das Seitenband der Pumpbewegung mit
2,5 Hz (150 BPM). Ducking: direkt nach der Kick 12 bis 17 dB leiser als kurz vor der nächsten.
Rumble-Energie etwa 9 dB unter der Kick.

**Demo** (`out/techno-kick.wav`): Spitze −1,0 dBFS, True Peak −1,0 dBTP, −16,5 LUFS integriert,
LRA 4,7 LU, größter Sprung von Sample zu Sample 0,26 (die Klickflanke), Gleichanteil 1,6·10⁻⁴.
Normalisiert wird linear: −1 dBFS Sample-Spitze, höchstens −0,6 dBTP, ohne Limiter.

## Grenzen

- Der Resonator ist ein idealisierter Bandpass, nicht die vollständige Netzliste mit Transistor im
  Rückkopplungspfad. Die Abhängigkeit der Frequenz vom Trigger ist als Exponentialentladung
  angesetzt, nicht aus Bauteilwerten abgeleitet.
- Der Wavefolder ist eine vereinfachte Diodenstufe, keine exakte Nachbildung eines bestimmten
  Faltermodells.
- Der Rumble-Hall ist mono. Ein Stereobild bräuchte zwei Ausgangsvektoren des FDN.

## Quellen

- K. J. Werner, J. S. Abel, J. O. Smith III: Schaltungsanalyse eines analogen Bassdrum-Kreises mit
  Brücken-T-Resonator und Pitch-Abhängigkeit vom Trigger, Proc. DAFx-14, Erlangen 2014.
- V. Zavalishin: The Art of VA Filter Design, Native Instruments 2012 (Zustandsvariablenfilter in
  trapezförmiger Diskretisierung, zeitvariante Stabilität).
- D. T. Yeh, J. S. Abel, J. O. Smith III: Simulation of the Diode Limiter in Guitar Distortion
  Circuits by Numerical Solution of Ordinary Differential Equations, Proc. DAFx-07, Bordeaux 2007.
- P. R. Gray, P. J. Hurst, S. H. Lewis, R. G. Meyer: Analysis and Design of Analog Integrated
  Circuits, Wiley (Kennlinie des emittergekoppelten Paares).
- F. Esqueda, H. Pöntynen, J. D. Parker, S. Bilbao: Virtual Analog Models of the Lockhart and Serge
  Wavefolders, Applied Sciences 7 (12), 2017.
- J. Stautner, M. Puckette: Designing Multi-Channel Reverberators, Computer Music Journal 6 (1), 1982.
- J.-M. Jot, A. Chaigne: Digital Delay Networks for Designing Artificial Reverberators, 90th AES
  Convention, Paris 1991.
- J. F. Kaiser: Nonrecursive Digital Filter Design Using the I0-sinh Window Function, Proc. IEEE
  ISCAS 1974.
- R. Bristow-Johnson: Cookbook Formulae for Audio EQ Biquad Filter Coefficients.
- ITU-R BS.1770: Algorithmen zur Messung von Lautheit und True Peak.

Der Code ist vollständig selbst geschrieben, aus den Gleichungen dieser Veröffentlichungen.
