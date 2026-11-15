# Rave-Synthesizer

`instruments/rave.mjs` erzeugt die typischen Synthesizerklänge aus Rave, Hardcore und hartem
Techno: breite Akkord-Stabs aus verstimmten Sägezähnen, den heulenden Lead mit großem Pitch-Bend
(hier „Whoop“ genannt), einen kreischenden Industrial-Lead und eine dunkle, breite Fläche für
Breakdowns. Es gibt keine Samples. Alles entsteht aus Oszillatoren, Filtern und Effekten, die als
Modelle analoger Schaltungen geschrieben sind.

```js
import { render, meta } from './instruments/rave.mjs';
// meta.presets: ['stab', 'whoop', 'screech', 'pad']
const [L, R] = render({ preset: 'stab', chord: [57, 60, 64], velocity: 0.9, duration: 0.15 });
const lead = render({ preset: 'whoop', midi: 57, duration: 1.6, bend: [[0, 0], [0.4, 0], [0.4, 3], [1.6, 3]] });
```

Parameter:

| Name | Bedeutung |
| --- | --- |
| `preset` | `stab`, `whoop`, `screech` oder `pad` |
| `midi` | Tonhöhe als MIDI-Note |
| `chord` | Liste von MIDI-Noten, ersetzt `midi` |
| `velocity` | 0 bis 1, steuert Filterhüllkurve, Pitch-Dive, FM-Index und Pegel |
| `duration` | Haltezeit in Sekunden; der Puffer enthält danach noch das Release |
| `seed` | Startwert für Phasen, Bauteiltoleranzen und Drift |
| `bend` | Pitch-Bend in Halbtönen: Zahl, Funktion `t => halbtöne` oder Stützpunkte `[[t, halbtöne], ...]` |
| `glide` | Portamento-Zeitkonstante in Sekunden, mit der die Tonhöhe `bend` folgt. Standard: `stab` 0, `whoop` 0,045, `screech` 0,02, `pad` 0,1 |

Das Ergebnis ist ein Paar `[left, right]` aus `Float64Array` bei 48 kHz. Gleiche Parameter
ergeben exakt dasselbe Signal.

## Signalfluss

Jedes Preset rechnet intern überabgetastet, `stab`, `whoop` und `pad` mit 2x (96 kHz), `screech`
mit 4x (192 kHz). Oszillatoren, Filter und Sättigung laufen alle auf dieser hohen Rate. Am Ende
steht ein Dezimationsfilter, danach folgen die linearen Effekte bei 48 kHz.

```
Oszillator-Stapel (Stereo verteilt) -> Filter mit Sättigung -> VCA -> (Verzerrung)
  -> Dezimation -> DC-Blocker -> (BBD-Chorus) -> Bass mono -> Ausgang
```

### Oszillatoren

Sägezahn und Puls sind band-begrenzt mit PolyBLEP (Välimäki und Huovilainen 2007). Jede
Unstetigkeit der naiven Welle bekommt eine zweipunktige, quadratische Korrektur, die den harten
Sprung durch einen integrierten, band-begrenzten Sprung ersetzt. Die Korrektur ist allgemein für
einen Sprung der Höhe `h` an einer beliebigen Phasenposition geschrieben. So entstehen auch die
zusammengesetzten Wellen:

- Puls als Differenz zweier Sägezähne mit Phasenversatz `pw`. Er ist von selbst gleichanteilfrei.
- „PWM-Säge“ für den Whoop: Sägezahn plus Puls derselben Phase. Bei langsam wanderndem `pw` klingt
  das hohl und schwebend, wie die pulsbreitenmodulierte Säge vieler Analogsynthesizer der späten
  Achtziger.
- Sub-Oszillator: band-begrenztes Rechteck eine Oktave tiefer, wie ein vom Hauptoszillator
  abgeleiteter Frequenzteiler.

Weil alles bei 96 oder 192 kHz läuft, liegen die restlichen Spiegelfrequenzen von PolyBLEP fast
nur oberhalb von 24 kHz und fallen dem Dezimationsfilter zum Opfer. Die Frequenz darf sich von
Sample zu Sample ändern, deshalb funktionieren Bends, Vibrato und lineare FM ohne Umweg.

### Verstimmter Stapel

Jede Note ist ein Stapel aus mehreren Oszillatoren (7 bei Stab und Pad, 5 beim Whoop, 3 beim
Screech). Die Verstimmung folgt keiner linearen Reihe: Die Position `x` im Stapel (-1 bis 1)
wird mit `sign(x)·|x|^1,4` gewichtet, die äußeren Stimmen liegen also verhältnismäßig weiter
außen. Diese Form orientiert sich an der Messung einer bekannten Hardware-Supersäge durch Szabo
(2010), der eine stark nichtlineare Verteilung der Verstimmung und eine eigene Pegelkurve für
Mitte und Seiten fand. Die Kurve hier ist eigene Arbeit, keine Kopie der dort gemessenen
Polynome. Der Mittenoszillator verliert bei steigendem `mix` an Pegel, die Seitenstimmen
gewinnen.

Analoges Verhalten pro Stimme:

- zufällige Startphase (kein Phasengleichklang beim Anschlag, wie bei freilaufenden Oszillatoren)
- feste Bauteiltoleranz von etwa ±1,3 Cent und ±8 % auf der Verstimmung
- langsame Drift: tiefpassgefiltertes Rauschen (etwa 0,3 Hz) mit 3 bis 4 Cent Standardabweichung

Die Stimmen werden mit Equal-Power-Panning verteilt, und zwar abwechselnd: Die am stärksten nach
unten und nach oben verstimmten Stimmen liegen auf gegenüberliegenden Seiten. Daraus kommt die
Breite des Klangs. Damit die Summe monokompatibel bleibt, läuft das Seitensignal (L − R) am Ende
durch einen Hochpass bei 160 Hz. Der Bass ist dadurch mono.

### Filter

**Kaskadenfilter (Ladder)** für Stab, Whoop und Pad: vier Tiefpässe erster Ordnung in Reihe mit
Rückkopplung vom Ausgang auf den Eingang (Stilson und Smith 1996, Huovilainen 2004). Jede Stufe
ist ein trapezförmig diskretisierter Einpol (TPT nach Zavalishin 2012). Die Rückkopplungsschleife
wird für den linearen Teil exakt aufgelöst, ohne Ein-Sample-Verzögerung (zero delay feedback):

```
y4 = G⁴·u + S,   u = (x − k·S) / (1 + k·G⁴),   G = g/(1+g),  g = tan(π·fc/fs)
```

`S` fasst die Zustände der vier Stufen zusammen. Danach wird `u` durch einen `tanh` geführt. Das
entspricht dem Differenzverstärker am Eingang der Transistorkaskade, der im echten Filter zuerst in
die Begrenzung geht. Die Sättigung pro Stufe würde einen iterativen Löser brauchen. Diese
Vereinfachung hält das Filter stabil und erzeugt trotzdem das typische Verdichten bei hoher
Resonanz und hohem Pegel. Ein Teil des Eingangs wird zur Kompensation des Bassverlusts bei
Resonanz verstärkt.

**Zustandsvariables Filter (SVF)** für den Screech, ebenfalls in TPT-Form mit aufgelöster
Rückkopplung. Es liefert Tief-, Band- und Hochpass sowie die Kerbe (`x − k·bp`) gleichzeitig. Der
Zustand des Bandpass-Integrators läuft durch einen weichen Begrenzer `s/(1 + 0,08·|s|)`, ähnlich
einem OTA, dem bei großer Aussteuerung der Strom ausgeht. Bei Güte 7 hält das die Resonanz in
Grenzen.

### Dezimation

Ein Kaiser-gefenstertes Sinc-Filter (Kaiser 1974) mit `64·os − 1` Koeffizienten, Grenzfrequenz
23 kHz und β = 8,6 (etwa 85 dB Sperrdämpfung). Es wird nur jeder `os`-te Ausgangswert berechnet,
die Gruppenlaufzeit ist herausgerechnet. Komponenten oberhalb von etwa 25 kHz werden so stark
gedämpft, dass ihre Spiegelungen unterhalb von 23 kHz nicht mehr sichtbar sind.

### Chorus (Eimerkettenspeicher)

Jeder Kanal hat eine eigene Verzögerungsleitung (7 bis 9 ms Grundverzögerung), die an einer
modulierten, gebrochenen Position mit kubischer Hermite-Interpolation gelesen wird. Das LFO ist ein
Dreieck, das mit einem kubischen Polynom gerundet wird, wie ein analoges Dreieck, das den Takt
eines BBD-Bausteins steuert. Der rechte Kanal bekommt das invertierte LFO, so verstimmen sich die
beiden Seiten gegenläufig. Vor und hinter der Leitung liegt je ein Tiefpass zweiter Ordnung bei
7 bis 9 kHz als Anti-Imaging- und Rekonstruktionsfilter, die bei einem BBD-Chorus den Klang
mitprägen (Raffel und Smith 2010). Rauschen und Kompander des echten Bausteins sind nicht
modelliert.

### Hüllkurven und Klickfreiheit

Attack und Release sind Halbkosinus-Rampen. Jede Note beginnt und endet exakt bei null. Der
DC-Blocker (Einpol-Hochpass bei 12 Hz) sitzt nach der Dezimation, seine kurze Restfahne wird mit
einer 20-ms-Blende am Pufferende abgeschlossen. Zeitindizes werden immer ganzzahlig hochgezählt.

## Presets

### `stab`

Sieben Sägezähne pro Akkordton, Spreizung ±34 Cent, breit verteilt. Ein gemeinsames Ladder-Filter
pro Kanal für den ganzen Akkord (paraphon). Dadurch erzeugt die Eingangssättigung
Intermodulation zwischen den Akkordtönen, was dem Stab Biss gibt. Grenzfrequenz:
`220 Hz + 0,8·f(Grundton) + (2200 + 9000·v²)·e^(−t/0,1 s)`, Resonanz 0,38, Eingangsverstärkung 2,2.
Amplitude: 1,5 ms Attack, Abfall auf 55 % mit 160 ms, 70 ms Release.

### `whoop`

Fünf PWM-Sägen (Spreizung ±20 Cent, PWM-LFO um 0,55 Hz mit eigenem Tempo pro Stimme) plus
Sub-Oszillator eine Oktave tiefer. Die Tonhöhe hat eine eingebaute Kurve: in 35 ms ein Sturz um
8 bis 14 Halbtöne (je nach Anschlag), danach eine exponentielle Rückkehr zum Zielton
(Zeitkonstante 75 ms). Genau dieses Ab und Auf ist der „Whoop“. Nach 0,35 s setzt ein leichtes
Vibrato ein (5,3 Hz, ±12 Cent), im Release fällt die Tonhöhe um bis zu 4 Halbtöne. Der
Nutzer-Bend läuft durch ein Portamento (Standard 45 ms). Mit Stufen in `bend` entstehen
Legato-Riffs mit Glide. Danach kommen das Ladder-Filter mit Eingangsverstärkung 3 (die leichte
Übersteuerung) und ein kräftiger Chorus (Mischung 0,6, Tiefe ±3 ms bei 0,45 Hz).

### `screech`

Läuft mit 4x Überabtastung, weil hier die stärkste Nichtlinearität sitzt.

1. Drei Sägezähne (±14 Cent) mit linearer FM: Die Momentanfrequenz wird mit
   `1 + I·sin(2π·1,5·f0·t)` multipliziert (Chowning 1973). Der Index steigt über die Notendauer
   von 0,15 auf bis zu 0,6 und bleibt unter 0,9, damit die Frequenz nie durch null geht.
2. Ringmodulation mit einem Sinus beim 2,37-fachen Grundton, also bewusst unharmonisch. Der Anteil
   steigt von 35 auf 65 %.
3. Resonanter Bandpass (Güte 7), der über die Notendauer von 350 Hz um 4,2 Oktaven nach oben fährt,
   dazu ein LFO mit 4,1 Hz und ±0,35 Oktaven. Links und rechts sind um 3 % gegeneinander versetzt.
4. Kerbfilter in Gegenrichtung (3,2 kHz nach unten), das Lücken in das Spektrum schneidet.
5. Asymmetrische Verzerrung `tanh(d·(y + 0,12)) − tanh(d·0,12)` mit `d` = 3 bis 8, danach ein
   Tiefpass bei 7 kHz, der das Kratzen oberhalb davon zähmt.

### `pad`

Sieben Sägezähne pro Akkordton (±22 Cent, volle Breite, Drift 4 Cent) und der tiefste Ton eine
Oktave tiefer mit drei Stimmen. Ladder-Tiefpass zwischen etwa 400 und 1600 Hz, der sich mit dem
Attack öffnet und mit 0,12 Hz langsam atmet. Attack bis 1,2 s, Release 1,4 s, dazu ein langsamer,
tiefer Chorus. Absichtlich dunkel.

## Demo

`node demos/rave.mjs` schreibt `out/rave.wav` (31,4 s, Stereo, 24 Bit) in etwa 4 Sekunden:

- 0 bis 10 s: jedes Preset einzeln (Stabs in a-Moll und f-Moll, ein Whoop, ein Screech mit Sweep,
  ein Pad-Akkord)
- 10,6 bis 23,4 s: acht Takte harter Techno mit 150 BPM. Synkopierte Stabs in Moll-Akkorden
  (Am, Fm, Gm, Em), tiefe Stab-Noten auf den Offbeats, in Takt 3 bis 6 ein Whoop-Riff mit
  Portamento zwischen je zwei Vierteln, in Takt 7 und 8 ein Screech, der eine Oktave aufwärts fährt
- ab 23,4 s: Breakdown mit zwei Pad-Akkorden (Am(add9), Fm(add9))

Die Normalisierung ist eine einzige lineare Verstärkung: Spitze auf −1 dBFS, solange der
True-Peak (4x überabgetastet gemessen, wie im Messverfahren nach ITU-R BS.1770) dabei unter
−0,6 dBTP bleibt. Kein Limiter.

## Messungen

- **Aliasing:** Einzelner Sägezahn und PWM-Säge, gesweept von 1 kHz bis 8 kHz Grundfrequenz. Im
  Spektrogramm liegen die gespiegelten, abwärts laufenden Teiltöne bei etwa −85 bis −100 dBFS,
  das Signal bei etwa −10 dBFS. Beim Screech zeigt der Vergleich mit 1x, 4x und 8x: Bei 1x ist
  ein deutlicher Teppich aus Spiegelfrequenzen sichtbar, 4x und 8x sehen gleich aus. Der verbleibende
  dichte Teppich ist das gewollte unharmonische Spektrum aus FM, Ringmodulation und Verzerrung.
- **Tonhöhe:** Gemessen als leistungsgewichteter Schwerpunkt um den erwarteten Ton (±80 Cent) über
  drei Seeds. Whoop vor und nach einem Bend um 5 Halbtöne: −2 bis −5 Cent. Stab −2 bis −5 Cent,
  Pad +1 bis +2 Cent, Screech −0 bis +5 Cent. Die Streuung kommt aus Drift und Toleranz.
- **Stereo:** Korrelation L/R: Stab 0,8, Whoop 0,6, Screech 0,8, Pad 0,55, Demo gesamt 0,70.
  Pegelverlust in der Monosumme etwa 0,7 dB. Zum Vergleich haben die GM-Referenzen aus FluidSynth
  (Programme 82, 91, 63) mit ihrem Chorus eine negative Korrelation (−0,25 bis −0,5).
- **Gleichanteil:** unter 1e−5 in allen Presets und im Demo.
- **Ränder:** erstes und letztes Sample jeder Note praktisch null, keine Klicks.
- **Demo:** Spitze −1,0 dBFS, True-Peak −1,0 dBTP, integrierte Lautheit −13,8 LUFS,
  `maxJump` 0,23 (steile, gewollte Sägezahnflanken in den Stabs).

## Grenzen

- Das Ladder-Filter sättigt nur am Eingang, nicht in jeder Stufe.
- PolyBLEP zweiter Ordnung lässt bei sehr hohen Tönen (über 4 kHz Grundfrequenz) einen kleinen
  Rest an Aliasing, der durch die Überabtastung weit unter −80 dB liegt.
- Der Chorus hat kein BBD-Rauschen und keinen Kompander.
- Keine Velocity-Kurve pro Stimme im Stapel; alle Stimmen einer Note teilen sich Filter und VCA.

## Quellen

- V. Välimäki, A. Huovilainen: Antialiasing Oscillators in Subtractive Synthesis. IEEE Signal
  Processing Magazine 24(2), 2007.
- V. Välimäki, J. Pekonen, J. Nam: Perceptually informed synthesis of bandlimited classical
  waveforms using integrated polynomial interpolation. JASA 131(1), 2012.
- T. Stilson, J. O. Smith: Analyzing the Moog VCF with Considerations for Digital Implementation.
  ICMC 1996.
- A. Huovilainen: Non-Linear Digital Implementation of the Moog Ladder Filter. DAFx 2004.
- V. Zavalishin: The Art of VA Filter Design. 2012, überarbeitet 2018.
- A. Szabo: How to Emulate the Super Saw. Abschlussarbeit, KTH Stockholm, 2010.
- C. Raffel, J. O. Smith: Practical Modeling of Bucket-Brigade Device Circuits. DAFx 2010.
- J. M. Chowning: The Synthesis of Complex Audio Spectra by Means of Frequency Modulation.
  JAES 21(7), 1973.
- J. F. Kaiser: Nonrecursive Digital Filter Design Using the I0-sinh Window Function. ISCAS 1974.
- ITU-R BS.1770-4: Algorithms to measure audio programme loudness and true-peak audio level, 2015.

Der gesamte Code ist eigenständig geschrieben. Aus den Quellen stammen nur Verfahren und
Messergebnisse, kein Code.
