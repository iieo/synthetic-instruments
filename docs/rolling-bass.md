# Rolling Bass

`instruments/rolling-bass.mjs` ist der kurze, druckvolle Bass aus Eurodance und Hardtekk, der
zwischen den Kicks auf der Offbeat-Achtel sitzt. Die Note ist kurz und fängt hart an, dann ist sie
sofort wieder weg und macht Platz für die nächste Kick. Gedacht für Achtel und Sechzehntel im
Step-Sequencer.

Vom Acid Bass unterscheidet er sich bewusst: kein Diodenfilter, kaum Resonanz, kein Akzent und kein
Slide. Hier geht es um Druck und Takt, nicht um Quietschen.

```js
import { render, meta } from './instruments/rolling-bass.mjs';
// meta.presets: ['offbeat', 'rolling', 'howl'], meta.range: [28, 64]
const hit = render({ preset: 'offbeat', midi: 45, velocity: 0.9, duration: 0.11 });
```

| Name | Bedeutung |
| --- | --- |
| `preset` | `offbeat`, `rolling` oder `howl` |
| `midi` | Tonhöhe, 28 bis 64 |
| `velocity` | 0 bis 1, Pegel und Öffnung der Filterhüllkurve |
| `duration` | Haltezeit in Sekunden, typisch 0,07 bis 0,2 |
| `seed` | Startwert für Toleranzen und Pulsbreiten-LFO |

`offbeat` und `rolling` geben ein Mono-Signal zurück, `howl` ein Paar `[left, right]`, dessen
Bass unterhalb von 120 Hz mono ist.

## Signalfluss

```
Schichten aus Säge und Puls (PolyBLEP, 2x) -> Ladder-Tiefpass mit schneller Hüllkurve
  + Sinus eine Oktave tiefer -> VCA -> Dezimation -> DC-Blocker -> (Seitensignal-Hochpass)
```

Jede Schicht ist ein Sägezahn mit Pulsanteil. Der Puls entsteht als Differenz zweier
phasenversetzter Sägezähne, jede Kante bekommt ihre eigene PolyBLEP-Korrektur. So ist auch die
Mischung band-begrenzt. Die Oszillatoren starten bei `offbeat` und `rolling` mit fester Phase,
damit jeder Schlag gleich hart kommt.

**Filter.** Ein Kaskaden-Tiefpass mit vier Polen und Sättigung am Eingang. Die Grenzfrequenz
springt beim Anschlag um bis zu 3,2 kHz nach oben und fällt mit 40 bis 55 ms zurück. Diese kurze
Hüllkurve macht den „Plopp“ am Anfang jeder Note. Die Eingangsverstärkung von 1,6 bis 2,2
verdichtet den Ton leicht.

**Hüllkurve.** Attack 1,2 bis 4 ms als Halbkosinus, Abfall mit 70 bis 160 ms auf 20 bis 50 %,
Release 25 bis 60 ms als Halbkosinus. Jede Note beginnt und endet bei null.

## Presets

| Preset | Schichten | Filter | Besonderheit |
| --- | --- | --- | --- |
| `offbeat` | Säge mit 45 % Puls, dazu eine Säge +7 Cent | Hüllkurve 55 ms, Resonanz 0,28 | heller Anschlag für Offbeat-Achtel |
| `rolling` | zwei Sägen ±5 Cent, kräftiger Sub | Hüllkurve 40 ms, Resonanz 0,42 | runder und kürzer, für rollende Sechzehntel |
| `howl` | vier PWM-Sägen ±6 und ±19 Cent | Hüllkurve 140 ms | Tonhöhe kommt 3 Halbtöne von unten (45 ms), breit im Stereobild |

Beim `howl` wandert die Pulsbreite jeder Schicht mit etwa 1,3 Hz. Die Tonhöhe setzt drei
Halbtöne zu tief ein und zieht in 45 ms auf den Zielton. Zusammen mit der Verstimmung klingt das
nach dem heulenden Rave-Bass, aber kurz genug für die Offbeats.

## Pegel

Feste Verstärkung pro Preset. Bei Velocity 1 über den ganzen Umfang liegt die Spitze unter
−1,4 dBFS.

## Demo

`node demos/rolling-bass.mjs` schreibt `out/rolling-bass.wav` mit 158 BPM: vier Takte `offbeat` auf
den Offbeat-Achteln, vier Takte `rolling` mit drei Sechzehnteln nach jeder Zählzeit (die mittlere
eine Oktave höher), dann vier Takte `howl`. Die Grundtöne folgen einer eigenen Folge a, f, c, g.

## Quellen

- V. Välimäki, A. Huovilainen: Antialiasing Oscillators in Subtractive Synthesis. IEEE Signal
  Processing Magazine 24(2), 2007.
- V. Zavalishin: The Art of VA Filter Design. 2012, überarbeitet 2018.

Der Code ist eigenständig geschrieben.
