# Wavetable Chip

`instruments/wavetable-chip.mjs` ist der 4-Bit-Wellenkanal tragbarer Spielkonsolen und einiger
Heimcomputer. Der Kanal spielt einen kleinen Wellenspeicher mit 32 Werten zu je 4 Bit in einer
Schleife ab. Die Tonhöhe kommt aus einem ganzzahligen Periodenregister, die Lautstärke kennt nur
vier Stufen, und eine neue Welle wird erst übernommen, wenn die alte einmal durchgelaufen ist.
Der Reiz liegt in den Wellen: eigene Tabellen für Bass, Orgel, Sägezahn und Vokale, und Klänge,
bei denen der Spieltreiber in jedem Bild der Spielschleife eine andere Welle schreibt. Am Ende
sitzt die analoge Ausgangsstufe des Geräts mit Koppelkondensator und dünnem Klang.

Umfang: MIDI 28 bis 96. Ausgabe mono, 48 kHz.

```js
import { render, meta } from './instruments/wavetable-chip.mjs';
const x = render({ midi: 57, velocity: 1, duration: 1, preset: 'pwm-sweep', volumeShift: 0, morph: 0.7 });
```

| Name | Bedeutung |
| --- | --- |
| `preset` | `soft-bass`, `organ`, `saw`, `square-ish`, `vocal`, `bell`, `bit-harp`, `pwm-sweep` |
| `midi` | 28 bis 96, ganzzahlig gerundet |
| `velocity` | 0 bis 1, die 3-Bit-Gesamtlautstärke der Konsole |
| `duration` | Haltezeit in Sekunden, 0,01 bis 30 |
| `seed` | Phase des Kanaltakts beim Auslösen |
| `volumeShift` | 0 bis 3, gerundet: 100 %, 50 %, 25 %, stumm |
| `morph` | 0 bis 1, Tempo der Wellenanimation, 0,5 ist das Tempo der Vorgabe |

## Kanal

Der Chip läuft mit `f_clk = 2^21 Hz = 2 097 152 Hz`. Ein Zähler lädt das Periodenregister `P`
(1 bis 2048) und rückt alle `2 P` Takte einen der 32 Plätze im Wellenspeicher weiter:

    f = f_clk / (64 P) = 32768 Hz / P,    P = round(32768 Hz / f_soll)

Der Ausgang ist eine Treppe mit 32 Stufen pro Periode. Ihre Stufenrate ist `32 f`, bei C7 also
65,5 kHz. Die Stufen selbst und ihre Obertöne um Vielfache von `32 f` gehören zum Klang des Chips
und bleiben erhalten. Beim Umrechnen auf 48 kHz wird jede Stufe bandbegrenzt geschrieben, als
Integral eines Kaiser-gefensterten Sinc (Grenze 20,6 kHz, 24 Samples zu jeder Seite):

    y[n] = Σ Δ_j · B(n − t_j)

Dadurch fallen keine neuen Spiegelfrequenzen ins Hörband. Die Spektrogramme bis C7 zeigen nur
ganzzahlige Obertöne des gespielten Tons.

## Stimmungsfehler

Weil `P` ganzzahlig ist, wird die Stimmung nach oben immer grober:

| Ton | P | erzeugt (Hz) | Fehler (Cent) |
| --- | --- | --- | --- |
| C2 (36) | 501 | 65,41 | 0,0 |
| C3 (48) | 250 | 131,07 | +3,4 |
| C4 (60) | 125 | 262,14 | +3,4 |
| C5 (72) | 63 | 520,13 | −10,4 |
| C6 (84) | 31 | 1057,03 | +17,3 |
| Cis6 (85) | 30 | 1092,27 | −25,9 |
| D6 (86) | 28 | 1170,29 | −6,5 |
| Dis6 (87) | 26 | 1260,31 | +21,8 |
| E6 (88) | 25 | 1310,72 | −10,3 |
| F6 (89) | 23 | 1424,70 | +34,1 |
| Fis6 (90) | 22 | 1489,45 | +11,1 |
| G6 (91) | 21 | 1560,38 | −8,4 |
| Gis6 (92) | 20 | 1638,40 | −23,9 |
| A6 (93) | 19 | 1724,63 | −35,1 |
| Ais6 (94) | 18 | 1820,44 | −41,5 |
| H6 (95) | 17 | 1927,53 | −42,6 |
| C7 (96) | 16 | 2048,00 | −37,6 |

Größter Fehler pro Oktave: E1 bis H1 1,2 Cent, C2 bis H2 2,6, C3 bis H3 5,1, C4 bis H4 11,0,
C5 bis H5 19,9, C6 bis C7 42,6 Cent. Die oberste Oktave ist hörbar schief, so wie auf dem Gerät. Die
gemessene Tonhöhe stimmt auf 0,2 Cent mit `32768 / P` überein.

## Lautstärke und Wandler

Die Lautstärke ist eine Verschiebung nach rechts, keine Multiplikation:

    v = w >> s,    s = 0, 1, 2 (100 %, 50 %, 25 %), s = 3 stumm

Bei 25 % bleiben von den 4 Bit nur zwei übrig, die Welle wird gröber. Der Wandler gibt `v / 15`
aus, also nur positive Werte mit einem großen Gleichanteil, im Mittel etwa die halbe
Aussteuerung. `velocity` stellt die Gesamtlautstärke der Konsole in acht Stufen:
`(1 + round(7 · velocity)) / 8`, bei 0 Stille.

## Wellenwechsel

Der Spieltreiber läuft mit 60 Bildern pro Sekunde. In jedem Bild darf er eine neue Welle und eine
neue Lautstärke schreiben. Die Lautstärke wirkt sofort, die neue Welle wartet, bis der Zähler
wieder auf Platz 0 springt, also bis zum Ende der laufenden Periode. Tiefe Töne wechseln ihre
Welle deshalb seltener und später als hohe.

Animierte Klänge gehen ihre Liste von Wellen mit

    Bilder pro Welle = max(1, round(F · 2^(3 · (0,5 − morph))))

durch, `F` aus der Vorgabe. `morph: 1` ist knapp dreimal so schnell wie die Vorgabe, `morph: 0`
knapp dreimal so langsam. Erreicht die Lautstärke aus `volumeShift` und dem Verlauf der Vorgabe
den Wert 3, ist der Kanal stumm und der Ton endet.

## Ausgangsstufe

Der Koppelkondensator vor dem Verstärker (Hochpass 38 Hz) trennt den Gleichanteil ab. Er ist beim
Auslösen schon auf den Mittelwert der ersten Welle geladen, wie bei einem Kanal, der vorher lief.
Jeder spätere Sprung im Gleichanteil (ein anderer Puls, eine andere Lautstärke) wird von ihm zu
einem kurzen Absinken mit 4 ms Zeitkonstante, ein leiser Stoß, der zum Gerät gehört. Dazu kommen
der kleine Lautsprecher als Hochpass bei 70 Hz, der den Bass dünn macht, und ein Tiefpass bei
12 kHz im Verstärker. Das Einschalten und Stummschalten, das am Gerät knackt, ist hier durch
1,5 ms und 3 ms lange Blenden mit erhöhtem Kosinus ersetzt, damit jeder Ton bei exakt 0 beginnt
und endet.

## Vorgaben

Alle Tabellen sind eigene Entwürfe: Teiltonsummen, auf 0 bis 15 skaliert und gerundet.

| Vorgabe | Wellen | Verlauf |
| --- | --- | --- |
| `soft-bass` | Grundton mit wenig zweitem und drittem Teilton | fest |
| `organ` | Teiltöne 1, 2, 3, 4, 6, 8 wie Zugriegel | fest |
| `saw` | Rampe 0 bis 15, jeder Wert zweimal | fest |
| `square-ish` | Rechteck mit abgerundeten Kanten | fest |
| `vocal` | drei Vokale a, o, e: Teiltöne nach Formanten bei einem 140-Hz-Grundton | Schleife a, o, e, o, 14 Bilder pro Welle |
| `bell` | vier Wellen von hell nach dumpf, Teiltöne 1, 2, 3, 5, 7, 11 | einmal durch, 9 Bilder pro Welle; Lautstärke ab Bild 14 50 %, ab 40 25 %, ab 90 stumm |
| `bit-harp` | sechs Wellen vom obertonreichen Anriss zum fast reinen Grundton | einmal durch, 3 Bilder pro Welle; ab Bild 10 50 %, ab 28 25 %, ab 70 stumm |
| `pwm-sweep` | 16 Pulse mit 1 bis 16 von 32 Plätzen hoch | hin und zurück, 2 Bilder pro Welle |

Die Formanten der Vokalwellen hängen an der Tabelle und wandern deshalb mit der Tonhöhe mit. Ein
tiefes a klingt dunkler als ein hohes, eine Grenze des Kanals, die dazugehört.

Hexadezimal, ein Zeichen pro Platz:

| Welle | Tabelle |
| --- | --- |
| soft-bass | `9bdefffeeddccbba9865432100001347` |
| organ | `8dfeeecaaa99a9757a86566555311102` |
| saw | `00112233445566778899aabbccddeeff` |
| square-ish | `9cefffffffffffeca630000000000013` |
| vocal-a | `7889987788887777887667788602fe86` |
| bell-0 | `fcb97888dd988ac8479ac9871046765a` |
| harp-0 | `fdcbabaa99b98a988897797776652019` |

## Messwerte

Prüflauf über jede Taste von 28 bis 96, Anschlag 0,2, 0,6 und 1, alle acht Vorgaben,
`volumeShift` 0, 1 und 2, `morph` 0, 0,5 und 1, vier Startwerte (26 496 Töne):

- lautester Ton bei Anschlag 1: −1,2 dBFS
- keine ungültigen Werte, jeder Ton beginnt und endet bei exakt 0
- Gleichanteil eines gehaltenen Tons unter 5e−4 des Spitzenpegels
- größter Sprung zwischen zwei Samples 0,63 (Flanke eines schmalen Pulses, kein Knacken)
- Rechenzeit: etwa 700-fache Echtzeit

Die Demo `demos/wavetable-chip.mjs` spielt sechzehn Takte in a-Moll mit 128 BPM, jede Stimme auf
dem Wellenkanal: weicher Bass, Orgelakkorde auf dem Offbeat bei 50 %, ein Bit-Harfen-Arpeggio,
eine eigene Melodie mit der Vokalwelle und einmal mit dem Sägezahn, der Pulsdurchlauf als Fläche
und Glocken. Ergebnis: −14,5 LUFS, True Peak −0,9 dBTP.
