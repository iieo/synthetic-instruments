# E-Piano (Zungen-Bauart)

`instruments/epiano.mjs` erzeugt ein elektromechanisches Piano mit angeschlagenen Stahlzungen,
wie es in Jazz, Soul und Lofi üblich ist. Es gibt keine Samples. Jeder Ton entsteht aus einem
kleinen physikalischen Modell: Hammer, Zunge mit Klangstab, elektromagnetischer Tonabnehmer,
Verstärker und Lautsprecher.

Umfang: MIDI 28 bis 100 (E1 bis E7, wie bei einem Instrument mit 73 Tasten).

```js
import { render, meta } from './instruments/epiano.mjs';
const x = render({ midi: 57, velocity: 0.8, duration: 1.5, seed: 1 }); // Float64Array, mono, 48 kHz
```

`duration` ist die Zeit, die die Taste gehalten wird. Der Puffer enthält danach noch das Abklingen
unter dem Dämpfer. Gleiche Parameter ergeben exakt dasselbe Signal.

## Mechanismus

Ein Hammer mit Neoprenspitze schlägt eine dünne Stahlzunge an. Die Zunge ist an einem Ende
eingespannt und mit einem schweren Klangstab verschraubt, der auf dieselbe Grundfrequenz
gestimmt ist. Die freie Spitze schwingt vor einem Tonabnehmer aus Magnet und Spule. Der
Tonabnehmer misst keine Auslenkung, sondern die Änderung des magnetischen Flusses. Diese
Abhängigkeit ist stark nichtlinear, und genau daraus kommt fast der ganze Obertongehalt.

## Modell

### 1. Hammer

Die Kontaktzeit `tauC` liegt bei etwa 0,4 bis 1,3 ms. Ein harter Anschlag drückt die Neoprenspitze
kürzer zusammen, also wird die Kontaktzeit mit der Geschwindigkeit kürzer, und in der Höhe ist sie
kürzer als im Bass. Das Kraftspektrum eines halbsinusförmigen Kontakts ist bis etwa `0,6 / tauC`
flach und fällt darüber mit f⁻² ab (Hall 1986). Die Nullstellen des exakten Spektrums werden
geglättet, weil ein echter Filzkontakt kein perfekter Halbsinus ist. Dieses Spektrum bestimmt, wie
stark die höheren Biegemoden angeregt werden. Ein harter Anschlag regt daher die Glocke stärker an.

Die Moden selbst werden mit einem kurzen Halbsinus-Puls (unter 0,6 ms) angestoßen. Sein eigenes
Spektrum wird pro Mode herausgerechnet, damit jede Mode genau mit der vorgesehenen Amplitude
startet. Der Puls sorgt dafür, dass jeder Ton weich und exakt bei null beginnt.

### 2. Zunge und Klangstab (Modalsynthese)

Jede Mode ist ein gedämpfter Zweipol-Resonator, der die Auslenkung der Zungenspitze liefert.

| Mode | Frequenz | Rolle | Abklingzeit T60 |
|---|---|---|---|
| 1a | f0 · (1 − ε) | Zunge, Grundton | 18 s · (f0 / 41 Hz)^−0,5 |
| 1b | f0 · (1 + ε) | Klangstab, Anteil 0,14 | 1,7 · T60 der Zunge |
| 2 | f0 · 6,9 bis 7,4 | Glocke („Ping“) | 0,7 s · (f0 / 100 Hz)^−0,45 |
| 3 | f0 · 19 bis 21 | Anschlagsglanz | sehr kurz |

Ein einseitig eingespannter Balken hat die Modenverhältnisse 1 : 6,267 : 17,55 (Fletcher und
Rossing 1998). Die Stimmfeder nahe der Spitze ist eine Zusatzmasse, die vor allem den Grundton
absenkt. Dadurch steigen die Verhältnisse. In Aufnahmen solcher Instrumente liegt die Glocke
etwa beim Siebenfachen des Grundtons, das Modell nimmt 6,9 bis 7,4 an. Die zweite Mode klingt viel
schneller ab als die erste, deshalb hört man die Glocke nur im Anschlag.

Zunge und Klangstab sind zwei schwach gekoppelte Schwinger auf fast derselben Frequenz. Die
Kopplung spaltet den Grundton in zwei Normalmoden, deren Abstand `2 ε f0` im Modell 0,35 bis
1,05 Hz beträgt. Das ergibt die leichte, langsame Schwebung im Ausklang. Die Klangstab-Mode
klingt langsamer ab und trägt das lange Sustain.

Die Auslenkung der höheren Moden wird durch ihr Frequenzverhältnis geteilt, denn bei gleichem
Kraftstoß ist die Auslenkung einer steiferen Mode kleiner. Der Tonabnehmer differenziert später
wieder, so landen die Moden im richtigen Verhältnis im Signal.

### 3. Tonabnehmer (die eigentliche Klangquelle)

Der Fluss durch die Spule hängt von der Lage der Zungenspitze relativ zum Polschuh ab. Modelliert
wird das als glockenförmige Kurve

    Φ(u) = 1 / (1 + u²),   u = x + x0

mit `x` als Auslenkung in Einheiten der Feldbreite und `x0` als Ruhelage („Voicing“). Nach dem
Induktionsgesetz ist die Spannung `U = dΦ/dt`. Im Programm ist das die Differenz zweier
aufeinanderfolgender Flusswerte. Daraus folgt:

- **Leiser Anschlag:** kleine Auslenkung, die Kurve ist fast linear, der Ton ist rund und fast
  sinusförmig.
- **Harter Anschlag:** die Spitze schwingt über den Scheitel der Kurve hinweg. Es entstehen
  kräftige gerade und ungerade Obertöne, das typische „Bellen“ oder Knurren. Es ist rein eine
  Folge der Amplitude, eine Hüllkurve oder einen Filter dafür gibt es nicht.
- **Voicing:** Am Wendepunkt `u = 1/√3 ≈ 0,577` verschwindet der zweite Oberton. Bass und Mitte
  sind mit `x0 ≈ 0,28` näher an der Achse eingestellt (viel zweiter Oberton, warm und knurrig),
  der Diskant mit `x0 ≈ 0,5` (reiner, eher ungerade Obertöne). Das entspricht dem Verhalten der
  FluidSynth-Referenz, deren Diskant mehr dritten als zweiten Oberton zeigt.
- **Intermodulation:** Grundton, Klangstab-Mode und Glocke laufen gemeinsam durch die Kurve. Die
  Schwebung färbt dadurch auch die Obertöne, und die Glocke bekommt Seitenbänder.
- Weil die Auslenkung beim Abklingen kleiner wird, wird der Ton von selbst dunkler: hell im
  Anschlag, weich im Sustain.

Die Nichtlinearität sitzt nur im Tonabnehmer. Auf dem Ausgang gibt es keine Sättigung.

### 4. Dämpfer

Beim Loslassen legt sich ein Filzdämpfer an. Im Modell steigt die Dämpfung jeder Mode innerhalb
von 12 ms auf eine T60 von 0,09 s (Bass) bis etwa 0,45 s (oberste Lage, wo die Dämpfer schwächer
greifen). Die Glocke wird doppelt so schnell gedämpft. Danach blendet der Ton über 4 ms exakt
auf null.

### 5. Verstärker und Lautsprecher

Linear und fest: Hochpass 45 Hz, eine leichte Anhebung bei 180 Hz (Gehäuse), eine Senke bei
2,6 kHz und ein Tiefpass bei 6,5 kHz (Breitbandlautsprecher). Die Biquad-Koeffizienten folgen den
bekannten Formeln von Bristow-Johnson.

### 6. Streuung pro Ton

Abhängig von `seed` und `midi`: Verstimmung bis ±1,5 Cent, Voicing ±10 %, Abklingzeit ±8 %,
Glockenverhältnis ±2 %, Hammerhärte ±5 %, Anschlagstärke ±4 %, Schwebungsfrequenz.

## Parameter in Kürze

| Größe | Wert | Wirkung |
|---|---|---|
| Spitzenauslenkung `A` | (0,12 + 1,25 v^1,6) · (1 − 0,8 p) | Lautstärke und Bellen, `p` = Lage 0 bis 1 |
| Kontaktzeit `tauC` | (1,3 − 0,7 v) · (1 − 0,5 p) ms | Glockenanteil |
| Glockenanteil | 1,6 · (0,4 + 0,8 v) | Ping im Anschlag |
| Voicing `x0` | 0,28 + 0,22 p | Verhältnis gerade zu ungerade Obertöne |

## Demo

`node demos/epiano.mjs` schreibt in unter einer Sekunde zwei Dateien:

- `out/epiano.wav`, mono, etwa 28 s: Dmaj9, Bm9, Em9, A13 leise mit Melodie im Diskant, danach
  zwei Takte harte Akkorde (Gmaj7♯11, F♯m7, Em9, A13) mit Bellen, am Ende ein Basslauf und Dmaj9
  mit None.
- `out/epiano-tremolo.wav`, stereo: dasselbe mit einem Stereo-Tremolo wie bei Koffer-Verstärkern,
  4,2 Hz, gleich laute Panoramaverschiebung zwischen zwei Lautsprechern.

Messwerte: Spitze −3,0 dBFS, Integrierte Lautheit −24,3 LUFS (mono) und −24,1 LUFS (stereo),
größter Sprung von Sample zu Sample 0,051. Jeder einzelne Ton beginnt und endet exakt bei null.

## Vergleich mit der Referenz

Referenz: FluidSynth mit FluidR3_GM, Programm 5 („Electric Piano 1“), dieselben Töne (E2, E3, E4,
E5, E6, jeweils Anschlag 40 und 120). Die Referenz liegt nur lokal in `reference/` und gehört nicht
ins Repository. Verglichen wurden die Pegel der Obertöne 2 bis 6 relativ zum Grundton zu
mehreren Zeitpunkten, die Glocke und die Hüllkurve.

- Obertonprofil pro Lage passt im Mittel: Bass sehr obertonreich (zweiter Oberton etwa gleich
  laut wie der Grundton), Mitte etwa −10 bis −15 dB, Diskant fast rein. Im hohen Diskant bei
  mittlerem Anschlag bleibt das Modell etwas heller als die Referenz.
- Die Referenz ändert bei der Anschlagstärke nur den Pegel, nicht die Klangfarbe. Das Modell
  wird bei hartem Anschlag deutlich obertonreicher, wie das echte Instrument.
- Anschlag bei beiden fast sofort (unter 6 ms), Sustain in der Mitte ähnlich, die oberste Oktave
  klingt im Modell etwas schneller ab.

## Bekannte Schwächen

- Kein Geräusch von Hammer, Taste oder Dämpfer.
- Der Tonabnehmer ist eindimensional. Die echte Zunge schwingt auch etwas quer, und die Feldform
  ist nur angenähert.
- Die Klangstab-Kopplung ist als zwei feste Normalmoden umgesetzt, nicht als Zeitintegration
  zweier gekoppelter Schwinger.
- Der Verstärker ist linear. Ein übersteuerter Röhrenverstärker ist nicht nachgebildet.

## Quellen

- N. H. Fletcher, T. D. Rossing: *The Physics of Musical Instruments*, 2. Aufl., Springer 1998,
  Kap. 2 (Biegeschwingungen von Stäben, Modenverhältnisse des einseitig eingespannten Balkens).
- F. Pfeifle, M. Münster: „Tone Production of the Wurlitzer and Rhodes E-Pianos“, in R. Bader
  (Hg.): *Studies in Musical Acoustics and Psychoacoustics*, Springer 2017 (Zunge, Klangstab,
  Tonabnehmer, gemessene Spektren). Der Markenname steht hier nur als Titel der Quelle.
- D. E. Hall: „Piano string excitation in the case of small hammer mass“, J. Acoust. Soc. Am. 79
  (1986), sowie die Folgeartikel (Kraftverlauf und Spektrum des Hammerkontakts).
- R. Bristow-Johnson: *Cookbook formulae for audio EQ biquad filter coefficients*
  (Filterformeln).
- Induktionsgesetz nach Faraday, U = −N dΦ/dt (Vorzeichen und Windungszahl gehen in die
  Normierung ein).
