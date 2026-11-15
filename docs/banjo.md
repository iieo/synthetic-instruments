# Banjo

`instruments/banjo.mjs` ist ein fünfsaitiges Banjo. Die Stahlsaiten laufen über einen leichten Steg, der nicht auf einer Holzdecke steht, sondern auf einem gespannten Fell, wie bei einer Trommel. Das Fell ist leicht und nimmt der Saite schnell Energie ab: der Ton springt hell an und verklingt rasch. Die fünfte Saite ist kurz, beginnt am fünften Bund und wird nur leer gespielt, als hoher Bordunton.

```js
import { render, meta } from './instruments/banjo.mjs';
// meta.presets: ['finger', 'pick', 'muted'], meta.range: [50, 84]
const note = render({ midi: 62, velocity: 0.8, duration: 0.6, preset: 'finger', tension: 0.6 });
```

Das Fell steht in `instruments/banjo/head.mjs`. Saite, Anregung und Resonatorbank kommen aus `instruments/strings-plucked/`.

## Saiten

Offene G-Stimmung: D3, G3, H3, D4 und die kurze g4-Saite. Mensur 67 cm. Jede Saite ist eine Wellenleiter-Schleife mit Verlust-Tiefpass, einer Kaskade aus drei Allpässen für die Steifigkeit und einem Bruchteil-Allpass für die exakte Stimmung, in zwei Polarisationen mit leicht verschiedener Stimmung (0,4 bis 0,9 Cent) und Abklingzeit (siehe `plucked-strings.md`). Die Saiten sind dünn und meist blank, die Inharmonizität der leeren Saiten liegt zwischen `B = 5,5·10⁻⁵` (D3, umsponnen) und `2,1·10⁻⁵`, sie wächst mit dem Bund wie `2^(2·Bund/12)`.

Weil das Fell die Saite stark belastet, sind die Abklingzeiten kurz: T60 beim Grundton 3,2 s bei 147 Hz und 1,6 s bei 660 Hz, bei 4,5 kHz nur 0,55 bis 0,35 s. Mit Dämpfer auf dem Steg (`muted`) sind es 0,9 und 0,5 s, und bei 1,8 kHz 0,12 bis 0,08 s.

## Anschlag

Gezupft wird nahe am Steg, das macht den Ton hell und spitz: mit Metall-Fingerpicks 6,5 cm vor dem Steg, mit dem flachen Plektrum 9 cm, je Ton um ±15 % gestreut. Die Saite wird als Dreieck ausgelenkt, dessen Steigung als eine Periode Rechteck in die Schleife geht, geglättet über die Kontaktbreite (2 mm bei Fingerpicks, 3 mm beim Plektrum, bei leisem Anschlag doppelt so breit). Das Abgleiten von der Saite gibt 3 ms bandpassgefiltertes Rauschen (Mitte 4,2 bis 6 kHz) direkt ins Fell. Weil Fell und Filter linear sind, läuft dieses Geräusch für sich durch dieselbe Abstrahlung und wird danach auf eine feste Spitze gebracht. Der Seed ändert so seine Körnung, aber nicht seine Lautstärke.

## Fell

Ein am Rand eingespanntes, kreisrundes Fell mit Radius `a`, Spannung `T` pro Länge und Flächendichte `σ` schwingt in den Moden

```
w_mn(r, θ) = J_m(j_mn · r / a) · cos(m θ)
f_mn = j_mn / (2 π a) · √(T / σ)
```

mit `j_mn` der `n`-ten Nullstelle der Besselfunktion `J_m` (Lehrbuch, etwa Fletcher und Rossing 1998, Kap. 3). Die Nullstellen werden beim ersten Aufruf ausgerechnet: `J_m(x) = 1/π ∫₀^π cos(m t − x sin t) dt` mit der Trapezregel (der Integrand ist glatt und periodisch, die Regel konvergiert sehr schnell), dann Vorzeichenwechsel suchen und per Bisektion einschachteln. Verwendet werden die Moden mit `m ≤ 14` und `j_mn < 48` unter 7,5 kHz, je nach Spannung 130 bis 180. Moden mit noch größerem `m` strahlen kaum ab.

Die Spannung verschiebt nur den ganzen Satz: `f01 = 250 Hz · √(1 + 2,5 · tension)`, also von 250 Hz (schlaff) bis 470 Hz (sehr straff), Standard 395 Hz. Der Steg steht bei 42 % des Radius. Seine Kraft regt jede Mode mit ihrer Form an dieser Stelle an, `J_m(j_mn · 0,42)`. Moden mit `m = 0` bewegen die Luft wie ein Kolben und strahlen voll ab, bei `m = 1` zählt die Abstrahlung 0,55, bei höheren `m` 0,35, weil sich die gegenphasigen Teile des Fells teilweise aufheben. Die Güte ist `Q = 22 · (1 + 0,08 m)`, mit Dämpfer `Q = 9 · (1 + 0,08 m)`. Dazu kommt die Luft im Topf hinter dem Fell als eigene, stark gedämpfte Mode bei 155 Hz.

Jede Mode ist ein Zwei-Pol-Resonator mit Spitzenverstärkung 1, alle liegen parallel, dazu 35 % der Stegkraft direkt. Ein leichtes Fell strahlt wie ein kleiner Kolben, der Schalldruck folgt der Beschleunigung. Das bildet ein Hochpass erster Ordnung bei 700 Hz nach. Dazu ein Hochpass zweiter Ordnung bei 90 Hz, ein Tiefpass bei 9 kHz und bei `muted` ein weiterer bei 2,6 kHz.

## Presets

| Preset | Anschlag | Charakter |
|---|---|---|
| `finger` | Metall-Fingerpicks, 6,5 cm vor dem Steg | Hell und perlend, für schnelle Rolls |
| `pick` | Flaches Plektrum, 9 cm vor dem Steg | Etwas voller, lauteres Kratzen |
| `muted` | Fingerpicks, Dämpfer auf dem Steg | Kurz und dumpf, das Fell klingt kaum nach |

## Parameter

| Name | Bereich | Standard | Bedeutung |
|---|---|---|---|
| `midi` | 50 bis 84 | 62 | Tonhöhe, auch gebrochen |
| `velocity` | 0,05 bis 1 | 0,8 | Anschlagstärke, steuert Pegel und Helligkeit |
| `duration` | 0 bis 30 s | 1 | Zeit bis zum Abdämpfen, danach 0,25 s Ausklang |
| `seed` | Zahl | 1 | Streuung von Stimmung (±0,8 Cent), Zupfstelle, Kontaktbreite, Abklingzeit, Polarisationen |
| `preset` | `finger`, `pick`, `muted` | `finger` | Anschlag und Dämpfer |
| `tension` | 0 bis 1 | 0,6 | Fellspannung |
| `pluckPosition` | 0,02 bis 0,98 | etwa 0,1 | Zupfstelle als Anteil der Länge vom Steg, über 0,5 wie `1 - x` |
| `string` | 0 bis 4 | höchste passende | Saite 0 (D3) bis 3 (D4), Bund 0 bis 22. Saite 4 ist die kurze g4-Saite: sie spielt immer g4, egal welche Tonhöhe angegeben ist |

Werte außerhalb des Bereichs werden auf den Rand gesetzt. Ein Wert, der keine endliche Zahl ist, ein unbekanntes Preset oder eine Saite, auf der der Ton nicht liegt, ergeben einen Fehler mit dem Namen des Parameters. Ausgabe ist mono mit 48 kHz.

## Messwerte

Gemessen in zwei Läufen über alle drei Presets, Fellspannung 0 und 1, Zupfstelle 0,02, 0,5 und zufällig, mit automatischer Saitenwahl, auf der tiefen Saite bis Bund 22 und auf der kurzen fünften Saite. Erstens jeder Halbton bei Velocity 1 mit acht Seeds (13 392 Töne), zweitens jeder zweite Halbton mit Velocity 0,2, 0,6 und 1 und vier weiteren Seeds (10 368 Töne):

| Messgröße | Ergebnis |
|---|---|
| Lautester Ton bei Velocity 1 | `finger` −3,1, `pick` −3,1, `muted` −3,1 dBFS |
| Lautester Ton mit Standardeinstellungen (jeder Halbton, Seed 1) | −6,5 bis −7,3 dBFS je Preset mit Velocity 0,8, −4,0 bis −4,8 dBFS mit Velocity 1 |
| Größter Sprung von Sample zu Sample | 0,32 |
| Nicht endliche Werte | keine |
| Erstes und letztes Sample | exakt 0 |
| Gleichanteil | höchstens 6·10⁻⁵ bei Tönen ab 1 s |
| Stimmung (Spektralspitze 0,25 bis 1,1 s, drei Seeds) | höchstens 1,6 Cent, davon ±0,8 Cent gewollte Streuung |
| Rechenzeit für einen 10 s langen Ton | 0,9 s |
| Hörbeispiel `demos/banjo.mjs` | −25,9 LUFS, Sample-Spitze −3,0 dBFS, True Peak −2,9 dBTP |

## Grenzen

- Die Kopplung ist einseitig: das Fell färbt den Klang, wirkt aber nicht auf die Saite zurück. Die kurze Abklingzeit, die eine echte Rückwirkung verursacht, steckt direkt in den Verlusten der Saite.
- Kein Resonator und keine offene Rückseite als Varianten, keine Schnarrgeräusche der Spannhaken.
- Moden mit gleichem `m` und Sinus statt Kosinus (die zweite Hälfte der entarteten Paare) fehlen, weil der Steg auf ihrer Knotenlinie steht und sie nicht anregt.

## Quellen

- N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments. 2. Aufl., Springer 1998 (Membranen, Banjo).
- K. Karplus, A. Strong: Digital synthesis of plucked-string and drum timbres. Computer Music Journal 7(2), 1983.
- J. O. Smith: Physical Audio Signal Processing. Online-Buch, CCRMA Stanford.
- G. N. Watson: A Treatise on the Theory of Bessel Functions. Cambridge 1944 (Integraldarstellung von `J_m`).
