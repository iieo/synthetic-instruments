# Reese-Bass

`instruments/reese.mjs` erzeugt den Reese-Bass aus Drum'n'Bass: zwei oder drei Sägezähne, die
gegeneinander verstimmt sind und deshalb langsam schweben, dazu ein Sinus als Sub. Das Schweben
ist der ganze Trick. Weil die Verstimmung selbst langsam atmet, wird die Schwebung mal schneller,
mal langsamer, und der Ton wirkt lebendig, auch wenn man ihn vier Takte lang hält.

```js
import { render, meta } from './instruments/reese.mjs';
// meta.presets: ['clean', 'dark', 'growl'], meta.range: [24, 60]
const [L, R] = render({ preset: 'dark', midi: 31, velocity: 0.9, duration: 2 });
const slide = render({ preset: 'growl', midi: 33, from: 31, glide: 0.04, duration: 0.5 });
```

| Name | Bedeutung |
| --- | --- |
| `preset` | `clean`, `dark` oder `growl` |
| `midi` | Tonhöhe, 24 bis 60 (C1 bis C4) |
| `velocity` | 0 bis 1, steuert Pegel, Filterhüllkurve und Verzerrung |
| `duration` | Haltezeit in Sekunden, danach folgt das Release |
| `seed` | Startwert für Phasen, Toleranzen und LFO-Phasen |
| `from`, `glide` | optional: Gleiten von der Note `from` mit der Zeitkonstante `glide` in Sekunden |

Ergebnis ist `[left, right]` als `Float64Array` bei 48 kHz.

## Signalfluss

```
2 bis 3 Sägezähne (PolyBLEP, 4x) -> Ladder-Tiefpass mit Hüllkurve und LFO
  -> (asymmetrische Sättigung) -> (wandernder Bandpass) -> (Tiefpass) + Sinus-Sub -> VCA
  -> Dezimation -> DC-Blocker -> Seitensignal-Hochpass 120 Hz -> Ausgang
```

Alles Nichtlineare läuft mit vierfacher Abtastrate (192 kHz). Die Sägezähne sind mit PolyBLEP
band-begrenzt: Am Phasensprung ersetzt eine quadratische Korrektur über zwei Samples den harten
Sprung. Der Rest an Spiegelfrequenzen liegt bei 192 kHz weit oberhalb des Hörbereichs und fällt dem
Dezimationsfilter zum Opfer (Kaiser-Fenster, 255 Koeffizienten, etwa 85 dB Sperrdämpfung).

### Bewegte Verstimmung

Stimme `j` liegt bei `x` zwischen −1 und 1 und ist um

```
cents(t) = x · detune · (1 + wobble · sin(2π · rate · t + φ))  +  Toleranz
```

verstimmt. `rate` liegt je nach Preset bei 0,1 bis 0,25 Hz und bekommt pro Stimme ±30 %
Streuung, `φ` und die Startphase kommen aus dem Seed. Die Schwebung zwischen zwei Stimmen hat die
Frequenz `f0 · (2^(Δcents/1200) − 1)`, bei 55 Hz und 30 Cent also etwa 1 Hz. Mit `wobble` um 0,4
pendelt sie zwischen 0,6 und 1,4 Hz.

### Filter und Bewegung

Ein Kaskaden-Tiefpass mit vier Polen (TPT-Form nach Zavalishin, Rückkopplung ohne
Ein-Sample-Verzögerung aufgelöst, Sättigung am Eingang) pro Kanal. Die Grenzfrequenz ist

```
fc(t) = (cutoff + keyTrack · f0 + envAmt · v · e^(−t/envTau)) · 2^(lfoOct · sin(2π · lfoRate · t))
```

also Anschlag, Tonhöhe und ein langsamer LFO, der das Filter über eine halbe bis eine Oktave
atmen lässt.

### Sättigung und Growl

Bei `dark` und `growl` folgt nach dem Filter eine asymmetrische Sättigung
`(tanh(d·(x + 0,15)) − tanh(d·0,15)) / d` auf das um 1,5 verstärkte Signal, mit
`d = 1 + 5 · drive · (0,5 + 0,5 · v)`. `drive` ist 0,4 bei `dark` (leicht) und 1 bei `growl`,
`clean` bleibt unverzerrt. Der Versatz erzeugt gerade Obertöne, die Subtraktion hält den Nullpunkt
fest. Nur bei `growl` wandert danach ein resonanter Bandpass (Güte 5) mit 1,6 Hz zwischen
380 Hz und 1,5 kHz, links und rechts um 4 % versetzt. Das klingt wie ein Vokal, der sich öffnet
und schließt. Ein Tiefpass bei 5,2 kHz nimmt die Schärfe.

### Mono im Bass

Die Sägezähne liegen im Stereobild verteilt, der Sub ist mono. Am Ende läuft das Seitensignal
(L − R) durch einen Butterworth-Hochpass vierter Ordnung bei 120 Hz. Unterhalb davon ist der Bass
also mono, auf großen Anlagen kippt nichts weg und die Monosumme verliert keinen Druck.

## Presets

| Preset | Sägen | Verstimmung | Filter | Besonderheit |
| --- | --- | --- | --- | --- |
| `clean` | 2 | ±11 Cent | 700 Hz + Tonhöhe, offen | heller, ruhiger Reese |
| `dark` | 3 | ±17 Cent | 300 Hz, Resonanz 0,32 | leichte Sättigung, tiefes Atmen mit 0,11 Hz |
| `growl` | 3 | ±24 Cent | 1,3 kHz | Sättigung und wandernder Bandpass |

Attack 6 ms als Halbkosinus, danach ein langsamer Abfall auf 85 %, Release 80 bis 120 ms als
Halbkosinus. Jede Note beginnt und endet exakt bei null.

## Pegel

Jedes Preset hat eine feste Verstärkung, keine Normalisierung pro Note. Über den ganzen Umfang,
drei Haltezeiten und drei Seeds bei Velocity 1 liegt die höchste Spitze unter −1,5 dBFS.

## Demo

`node demos/reese.mjs` schreibt `out/reese.wav`: erst jedes Preset als gehaltene Note, dann acht
Takte einer eigenen Basslinie in e-Moll mit 174 BPM, vier Takte `dark`, vier Takte `growl`, mit
einigen gleitenden Übergängen. Eine einzige lineare Verstärkung bringt die Spitze auf −1 dBFS,
solange der True-Peak unter −0,6 dBTP bleibt. Kein Limiter.

## Quellen

- V. Välimäki, A. Huovilainen: Antialiasing Oscillators in Subtractive Synthesis. IEEE Signal
  Processing Magazine 24(2), 2007.
- V. Zavalishin: The Art of VA Filter Design. 2012, überarbeitet 2018.
- J. F. Kaiser: Nonrecursive Digital Filter Design Using the I0-sinh Window Function. ISCAS 1974.

Der Code ist eigenständig geschrieben. Aus den Quellen stammen nur Verfahren, kein Code.
