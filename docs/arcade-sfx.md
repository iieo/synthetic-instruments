# Arcade SFX

`instruments/arcade-sfx.mjs` sind Soundeffekte der Spielautomaten aus den späten Siebzigern und
frühen Achtzigern. Dort spielte kein Soundchip, sondern für jeden Effekt eine kleine Schaltung aus
Einzelteilen: astabile Kippstufen nach Art des 555, spannungsgesteuerte Oszillatoren, die von der
Lade- und Entladekurve eines Kondensators gefahren werden, Rauschen aus einem langen
Schieberegister oder einem Transistor in Sperrrichtung, RC-Filter und Hüllkurven aus
Kondensatorentladung. Dazu kommen ein paar kurze Melodien aus einem Teiler-Tongenerator. Alle
Klänge und Melodien sind eigene Erfindungen.

```js
import { render, meta } from './instruments/arcade-sfx.mjs';
const schuss = render({ voice: 'laser', midi: 100 });
const marsch = render({ voice: 'march', tempo: 180, length: 4 });
const motor = render({ voice: 'engine', rpm: 4200, length: 3 });
```

`meta.voices` ist `laser, explosion, siren, ufo, march, coin, powerup, hit, alarm, engine,
fanfare, lose`. Rückgabe ist ein mono `Float64Array` bei 48 kHz. Gleicher Seed, gleiche Samples,
erstes und letztes Sample exakt null.

| Name | Bedeutung |
| --- | --- |
| `voice` | einer der zwölf Effekte |
| `midi` | Tonhöhe der tonalen Effekte, 24 bis 108, danach auf den Bereich des Effekts begrenzt |
| `velocity` | 0 bis 1, Pegel mit Exponent 1,2 |
| `tempo` | 30 bis 960 pro Minute: Schritte bei `march`, Umschaltungen bei `alarm`, Sirenenzyklen bei `siren`, Warbelzyklen bei `ufo` |
| `rpm` | 400 bis 9000, Drehzahl bei `engine` |
| `length` | Dauer in Sekunden, 0,05 bis 20 |
| `seed` | Rauschen, Startzustand der Schieberegister, Phasen |

| Effekt | Bereich MIDI | Standard | Länge | Tempo |
| --- | --- | --- | --- | --- |
| `laser` | 60 bis 108 | 96 | 0,32 s | |
| `explosion` | | | 2,2 s | |
| `siren` | 48 bis 96 | 70 | 3,5 s | 40 |
| `ufo` | 60 bis 100 | 82 | 2,5 s | 420 |
| `march` | 28 bis 52 | 40 | 8 Schritte | 100 |
| `coin` | 72 bis 100 | 88 | 0,45 s | |
| `powerup` | 48 bis 84 | 64 | 0,55 s | |
| `hit` | 36 bis 84 | 64 | 0,28 s | |
| `alarm` | 60 bis 96 | 81 | 2,5 s | 240 |
| `engine` | | | 2,5 s | 1800 U/min |
| `fanfare` | 55 bis 91 | 72 | 1,0 s | |
| `lose` | 48 bis 84 | 67 | 1,6 s | |

## Bausteine

**Pulsoszillator.** Ein Phasenzähler läuft mit `f/48000` pro Sample, bei der Phase `d`
(Tastverhältnis) fällt der Ausgang auf −1, beim Überlauf steigt er auf +1. Die genaue Zeit jeder
Flanke folgt aus der linearen Interpolation der Phase. Jede Flanke wird als bandbegrenzter Sprung
eingesetzt (integrierter Kaiser-Sinc, 20,5 kHz, 64 Abtastwerte breit, 1/512 Sample Auflösung).
Frequenz und Tastverhältnis dürfen sich jedes Sample ändern, deshalb entstehen auch bei schnellen
Sweeps keine Spiegelfrequenzen. Der Mittelwert `2d − 1` wird abgezogen, wie hinter einem
Koppelkondensator. Bei der astabilen Kippstufe ist `d = (R1 + R2) / (R1 + 2R2)`, also über 0,5;
schmale Pulse wie beim Motor entstehen hinter einem Inverter.

**Kondensatorspannung als LFO.** Die Kippstufe lädt ihren Kondensator zwischen 1/3 und 2/3 der
Versorgung. Auf −1 bis 1 abgebildet:

```
laden:    v = 1 − (2/3)·exp(−ln2 · u/d)
entladen: v = (2/3)·exp(−ln2 · (u − d)/(1 − d))
LFO = 6v − 3
```

Das ist ein Dreieck mit gebogenen Flanken. Es steuert Sirene und Ufo.

**Teiler-Tongenerator.** Für Melodien teilt ein Rückwärtszähler einen 250-kHz-Takt durch eine ganze
Zahl `N`, ein Flipflop halbiert: `f = 250000 / (2N)`. Die Tonhöhe ist damit quantisiert:

| MIDI | Soll (Hz) | N | Ist (Hz) | Cent |
| --- | --- | --- | --- | --- |
| 48 | 130,8 | 956 | 130,8 | −0,8 |
| 60 | 261,6 | 478 | 261,5 | −0,8 |
| 72 | 523,3 | 239 | 523,0 | −0,8 |
| 79 | 784,0 | 159 | 786,2 | +4,8 |
| 84 | 1046,5 | 119 | 1050,4 | +6,5 |
| 88 | 1318,5 | 95 | 1315,8 | −3,6 |
| 91 | 1568,0 | 80 | 1562,5 | −6,1 |
| 96 | 2093,0 | 60 | 2083,3 | −8,0 |
| 100 | 2637,0 | 47 | 2659,6 | +14,7 |
| 108 | 4186,0 | 30 | 4166,7 | −8,0 |
| 112 | 5274,0 | 24 | 5208,3 | −21,7 |

Bis MIDI 96 bleibt der Fehler unter 10 Cent, ganz oben im Arpeggio von `powerup` (bis MIDI 112)
erreicht er 26 Cent. Die frei laufenden VCOs (`laser`, `siren`, `ufo`, `alarm`, `hit`) sind nicht
quantisiert.

**Rauschen.** Ein Transistor in Sperrrichtung liefert weißes Rauschen (für Explosion und
Treffer). Gerechnet wird es als Summe aus vier gleichverteilten Zufallszahlen, auf Varianz 1
skaliert: fast gaußsch, aber hart auf ±3,46 begrenzt, damit ein langer Rauschstoß keinen seltenen
Ausreißer über die Aussteuerung wirft. Ein 17-Bit-Schieberegister mit Rückkopplung aus Bit 0 und Bit 3 (Länge 131 071),
getaktet mit freier Rate, liefert ±1 mit bandbegrenzten Flanken (für den Motor).

**Filter.** Einpolige RC-Tief- und Hochpässe und ein zweipoliges aktives Filter (eine
Operationsverstärkerstufe), gerechnet als trapezförmig diskretisiertes Zustandsvariablenfilter mit
Grenzfrequenz pro Sample.

**Hüllkurve.** Ein Kondensator wird über einen kleinen Widerstand geladen und über einen großen
entladen: `e(t) = (1 − exp(−t/τa)) · exp(−t/τd)`.

## Effekte

- **laser.** Pulsoszillator, dessen Frequenz von `f0` exponentiell auf `f0/14` sinkt
  (`τ = Länge/5`), RC-Tiefpass 5,5 kHz, Hüllkurve mit `τd = Länge/2,6`.
- **explosion.** Weißes Rauschen durch ein zweipoliges Tiefpassfilter, dessen Grenze mit der
  Entladung von 2,8 kHz auf 180 Hz fällt, dazu ein Grollen (Rauschen durch 90 Hz, Güte 1,4) und ein
  heller Knall in den ersten 20 ms. Abklingen mit `τ = Länge/3,2`.
- **siren.** VCO, gesteuert vom gebogenen Dreieck, Hub 0,9 Oktaven nach oben, Ausgang durch ein
  zweipoliges Filter bei 2,2·f, das mitläuft. 40 ms Einschwingen.
- **ufo.** VCO, gewobbelt vom schnellen Kondensatordreieck (±2,5 Halbtöne, abgeflacht wie eine
  übersteuerte Transistorstufe) und einer langsamen Drift von 0,6 Hz (±0,8 Halbtöne), durch einen
  Bandpass bei 1,3·f.
- **march.** Vier Bassschritte aus dem Teiler, die auf und ab springen: Grundton, Quinte, kleine
  Terz, kleine Septime (0, 7, 3, 10 Halbtöne). Jeder ist ein kurzer dumpfer Schlag: Rechteck in ein resonantes Tiefpassfilter bei 3,2·f, Hüllkurve neu
  ausgelöst bei jedem Schritt, Abklingen höchstens 0,16 s. `tempo` macht ihn schneller.
- **coin.** Zwei Rechteck-Blips aus dem Teiler: 65 ms auf `midi`, dann die Quinte darüber, die
  ausklingt.
- **powerup.** Arpeggio über Dur-Dreiklang durch zweieinhalb Oktaven (0, 4, 7, 12, 16, 19, 24, 28),
  Puls mit Tastverhältnis 0,25, der letzte Ton klingt aus.
- **hit.** Rauschstoß (12 ms) und ein Rechteck, das in 25 ms von einer Oktave über `midi` auf zwei
  Oktaven darunter fällt.
- **alarm.** Eine langsame Kippstufe schaltet die Steuerspannung der Tonstufe zwischen `midi` und
  einer Quarte tiefer, über ein RC mit 6 ms, also mit kurzem Gleiten. Puls mit 0,62.
- **engine.** Zündimpulse mit `rpm/30` Hz (vier Zylinder, Viertakt), Tastverhältnis 0,18. Die
  Periode zittert um bis zu 9 % mit dem tiefpassgefilterten Schieberegister, ein resonantes
  Tiefpassfilter bei 4·f (höchstens 2,4 kHz) gibt den Auspuff, ein leiser Rauschanteil (Register
  mit 9 kHz, 0,5 bis 6 kHz) das Rasseln.
- **fanfare.** Sechs Töne aufwärts (0, 4, 7, 4, 9, 12) mit Bass aus Grundton und Quinte,
  Rechtecke aus dem Teiler.
- **lose.** Vier fallende Töne (0, −3, −5, −8), jeder sackt um 0,4 Halbtöne ab, der letzte bekommt
  ein Wackeln von 6 Hz. Weil der Teiler nur ganze Zahlen kennt, sackt die Tonhöhe in Stufen ab.

Jeder Ton im Teiler hat 1,5 ms Einschwingen und eine Raised-Cosine-Ausblendung von höchstens 6 ms,
deshalb klicken die Notenwechsel nicht. Am Ende gehen alle Effekte durch einen Hochpass bei 20 Hz
(Koppelkondensator zum Verstärker im Automatengehäuse), Dauertöne bekommen 30 ms Ausblendung, die
übrigen 4 ms.

## Pegel und Messung

Feste Verstärkung pro Effekt. Kalibriert über jeden zweiten Halbton im Bereich, `length` 0,05,
0,2, Standard, 5 und 20 s, `tempo` 30, 90, Standard, 400 und 960, `rpm` 400, 900, Standard, 4000
und 9000 bei Velocity 1 (der Pegel steigt mit Velocity monoton). Die Effekte mit Rauschen liefen mit
vielen Seeds, ganze und gebrochene: `explosion` mit 1200 Seeds bei acht Längen bis 20 s, `hit` mit
1200 Seeds bis 1,5 s und 400 Seeds bei 3 und 20 s, `ufo` und `engine` mit 205 Seeds. Zusammen rund
220 000 Renderings:

| Effekt | Verstärkung | lautester Wert (dBFS) |
| --- | --- | --- |
| `laser` | 0,757 | −1,5 |
| `explosion` | 0,375 | −2,0 |
| `siren` | 0,743 | −1,5 |
| `ufo` | 0,48 | −1,51 |
| `march` | 0,53 | −1,51 |
| `coin` | 0,777 | −1,51 |
| `powerup` | 0,514 | −1,43 |
| `hit` | 0,373 | −2,01 |
| `alarm` | 0,623 | −1,51 |
| `engine` | 0,333 | −1,37 |
| `fanfare` | 0,428 | −1,27 |
| `lose` | 0,564 | −1,42 |

Explosion und Treffer liegen tiefer, weil ihr Spitzenwert vom Rauschen abhängt und mit der Zahl
der Seeds noch langsam wächst. Das begrenzte Rauschen setzt dabei eine feste Obergrenze.

Kein NaN, erstes und letztes Sample immer null. Der Mittelwert eines ganzen Effekts hängt von
seiner Länge ab: Ab 1 s Länge bleibt er unter 5·10⁻⁴, der größte Wert kommt vom Motor bei 400 U/min,
dessen Grundton mit 13 Hz unter dem Koppelkondensator liegt. Bei sehr kurzen Effekten kann der
Koppelkondensator nicht einschwingen, und der Mittelwert erreicht bis 3·10⁻² (Motor bei 50 ms und
niedriger Drehzahl, das sind nur ein oder zwei Zündimpulse). Größter Sprung zwischen zwei Samples
0,83 (bandbegrenzte Rechteckflanke der Münze). Spektrogramme von Sweeps und hohen Tönen zeigen über
21 kHz nichts und keine Spiegelfrequenzen. Gerechnet wird 35 bis 90-mal schneller als Echtzeit.

Demo: `node demos/arcade-sfx.mjs` schreibt `out/arcade-sfx.wav` (30 s, mono): Münzen und
Fanfare, ein Marsch in gleichbleibendem Tempo mit Münzen und zwei Power-ups darüber, dann ein Ufo,
das unter Beschuss und Treffern explodiert, Sirene, Alarm, Motor in zwei Drehzahlen und die
Verlierermelodie. Eine lineare Verstärkung auf −1 dBFS Spitze, −15,6 LUFS integriert, True Peak
−1,0 dBTP.
