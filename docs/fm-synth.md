# FM-Synthesizer

`instruments/fm-synth.mjs` ist ein Synthesizer mit Frequenzmodulation aus vier Sinus-Operatoren.
Ein Operator ist ein Sinusoszillator mit eigener Hüllkurve. Moduliert ein Operator die Phase eines
anderen, entstehen Seitenbänder im Abstand seiner Frequenz, und mit der Stärke der Modulation
wächst die Zahl der Obertöne. So entstehen aus wenigen Sinustönen Glocken, angeschlagene Zungen,
Bässe und Bläser.

Umfang: MIDI 28 bis 103. Ausgabe mono, 48 kHz.

```js
import { render, meta } from './instruments/fm-synth.mjs';
const x = render({ midi: 64, velocity: 0.8, duration: 1, preset: 'epiano' });
```

## Operator

Jeder Operator k erzeugt

    y_k(t) = A_k · e_k(t) · sin(2π f_k t + Σ y_m(t))

Die Summe läuft über die Operatoren m, die k modulieren. Das ist Phasenmodulation, die für
Sinusträger dasselbe Spektrum wie Frequenzmodulation ergibt (Chowning 1973). Für einen Modulator
ist A der Modulationsindex I in Radiant, für einen Träger die Ausgangsamplitude. Ein Träger mit
Frequenz f_c, moduliert mit Index I und Frequenz f_m, hat Seitenbänder bei f_c ± n f_m mit den
Amplituden J_n(I) (Besselfunktionen erster Art).

Die Frequenz ist `f_k = f0 · ratio · 2^(detune / 1200)`. Die Hüllkurve hat einen Anstieg als
erhöhter Kosinus, einen exponentiellen Abfall auf den Haltepegel und nach dem Loslassen einen
Ausklang als erhöhter Kosinus. So beginnt und endet jeder Ton exakt bei null. Dazu kommen pro
Operator:

- Anschlagsempfindlichkeit `vs`: Pegel mal `1 − vs + vs · velocity`. Bei den Modulatoren heißt das:
  fester Anschlag, hellerer Klang.
- Tastaturskalierung `ks`: Pegel mal `(f0 / 262 Hz)^−ks`. Hohe Töne werden weicher moduliert, wie
  bei akustischen Instrumenten.
- Abklingskalierung `kd`: Abfallzeit mal `(f0 / 262 Hz)^−kd`. Hohe Töne klingen schneller aus.

Operator 4 kann sich selbst modulieren. Die Rückkopplung nimmt den Mittelwert der letzten zwei
Ausgangswerte, damit sie nicht schwingt. Mit wachsender Rückkopplung wird der Sinus einer
Sägezahnwelle ähnlich.

## Algorithmen

Ein Algorithmus legt fest, wer wen moduliert. Ein Modulator hat immer eine höhere Nummer als sein
Ziel, so lässt sich jedes Sample in einem Durchgang von Operator 4 bis 1 rechnen.

| Algorithmus | Verschaltung | Träger |
|---|---|---|
| `stack` | 4 → 3 → 2 → 1 | 1 |
| `two-stacks` | 2 → 1, 4 → 3 | 1, 3 |
| `branch` | 2 → 1, (4 → 3) → 1 | 1 |
| `stack-plus` | 3 → 2 → 1, dazu 4 allein | 1, 4 |
| `shared-mod` | 4 → 1, 4 → 2, 4 → 3 | 1, 2, 3 |
| `additive` | keine Modulation | 1, 2, 3, 4 |

Jedes Preset bringt seinen eigenen Algorithmus mit. Mit `algorithm` lässt er sich austauschen; die
Operatoren behalten dann ihre Einstellungen, spielen aber eine andere Rolle. Ein Operator mit
hohem Frequenzverhältnis, der eigentlich als Modulator gedacht war, wird als Träger oberhalb von
6 kHz mit `1 / (1 + (f / 6 kHz)²)` abgeschwächt, damit er nicht schrill pfeift.

## Presets

| Preset | Algorithmus | Idee |
|---|---|---|
| `epiano` | two-stacks | Zungen-E-Piano: Träger 1:1 mit abklingendem Index für den runden Ton, dazu ein zweiter Träger, den ein Modulator mit Verhältnis 14 nur im Anschlag trifft. Das gibt das helle „Ping“ der Zunge. |
| `bell` | two-stacks | Glocke: Modulatoren mit Verhältnis 3,5 und 5,19 ergeben unharmonische Teiltöne, der Index fällt langsamer als der Träger, lange Abklingzeit. |
| `bass` | stack-plus | Bass: Kette 3 → 2 → 1 mit kurzem Biss im Anschlag, dazu Operator 4 mit Rückkopplung als leicht sägezahnartige Grundlage. |
| `brass` | two-stacks | Blechbläser: Der Index steigt langsamer als die Lautstärke, so wird der Ton im Einschwingen heller. Dazu ein kurzer Tonhöhenanstieg (−0,35 Halbtöne in 30 ms), ein um 4 Cent verstimmter zweiter Träger und ein spät einsetzendes Vibrato. |
| `marimba` | two-stacks | Stabspiel: kurzer Modulator mit Verhältnis 4 für den Holzklang, schwacher Teilton bei 3,93 f0 und ein sehr kurzer Anschlagsklick. |

## Bandbegrenzung

Bei hohem Index reicht das Spektrum weit über 20 kHz hinaus, und alles oberhalb der halben
Abtastrate würde gespiegelt. Zwei Maßnahmen verhindern das:

1. **Begrenzter Index.** Die Bandbreite wird mit der Carson-Regel abgeschätzt: Moduliert ein
   Signal mit Bandbreite B einen Träger f_c mit Index I, reicht das Ergebnis bis etwa
   `f_c + (I + 1) · B`. Die Abschätzung läuft durch die ganze Kette eines Algorithmus, die
   Rückkopplung zählt mit `f · (1 + 5 β)`. Liegt der breiteste Träger über 30 kHz, werden alle
   Indizes gemeinsam so weit verkleinert, bis er passt. Seitenbänder weit über dem Hörbereich
   machen nur den Anschlag hoher Töne scharf; deshalb nehmen FM-Klänge den Index mit der Tonhöhe
   zurück, und das Modell tut das hier automatisch.
2. **Überabtastung.** Gerechnet wird mit 96 kHz, danach filtert ein Kaiser-Tiefpass bei 20,5 kHz
   und dezimiert auf 48 kHz. Ein Anteil fällt erst ab 75,5 kHz (96 kHz − 20,5 kHz) in den hörbaren
   Bereich zurück, darunter landet alles im Sperrband. Gegenüber der Grenze von 30 kHz bleibt so
   reichlich Platz für die schwachen äußeren Seitenbänder, die Carson nicht erfasst.

Ein Modulator über 0,45 der Rechenrate wird abgeschaltet; seine Seitenbänder lägen ohnehin weit
oberhalb des Hörbereichs.

## Parameter

| Parameter | Werte | Standard |
|---|---|---|
| `midi` | 28 bis 103 (auch gebrochen) | 60 |
| `velocity` | 0 bis 1 | 0,8 |
| `duration` | Haltezeit in s, 0,01 bis 60 | 1 |
| `preset` | `epiano`, `bell`, `bass`, `brass`, `marimba` | `epiano` |
| `algorithm` | siehe Tabelle | aus dem Preset |
| `brightness` | 0 bis 1, skaliert alle Indizes von 0,5 bis 2 | 0,5 |
| `seed` | Zahl, bestimmt die Startphasen | 1 |

## Messwerte

Durchlauf über jede zweite Note, Anschlag 0,2, 0,6 und 1, alle Presets mit `brightness` 0, 0,5
und 1 und dazu jedes Preset mit jedem Algorithmus, zwei Seeds:

- Lautester Ton bei Anschlag 1: −1,1 dBFS (vor der Sicherheitsgrenze). Jedes Preset hat einen festen Pegel, der über alle
  Algorithmen und Helligkeiten auf −1 dBFS abgestimmt ist; eine Sicherheitsgrenze bei −1 dBFS
  greift nur bei Ausreißern.
- Keine NaN, erstes und letztes Sample exakt 0, Gleichanteil unter 0,001 (Mittel über kurze Töne; Verhältnisse 1:1 erzeugen in FM selbst einen Gleichanteil, den ein Hochpass bei 8 Hz entfernt).
- Größter Sprung von Sample zu Sample: 1,03, im Anschlag der höchsten Glockentöne bei `brightness: 1`. Dort liegen starke, bandbegrenzte Teiltöne zwischen 10 und 20 kHz; ein Knacken ist es nicht. Bei den anderen Presets bleibt er auch mit `brightness: 1` unter 0,75.
- Tonhöhe (2 s Messfenster): `bell` und `marimba` exakt, `epiano` und `bass` innerhalb von 0,8 Cent.
  `brass` liegt durch den verstimmten zweiten Träger und das Vibrato je nach Lage 0 bis 3 Cent höher.
- Rechenzeit: ein Ton von 10 s braucht 0,35 bis 0,75 s.
- Spektrogramme der höchsten Töne bei `brightness: 1` zeigen keine Spiegelfrequenzen.

Die Demo `demos/fm-synth.mjs` spielt acht eigene Takte in e-Moll mit allen Presets: E-Piano-Akkorde,
Bass, Marimba-Arpeggio, Glockenantworten und einen Bläserakkord am Schluss. Spitzenpegel −1,0 dBFS,
True Peak −1,0 dBTP, Lautheit etwa −17 LUFS.
