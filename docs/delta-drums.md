# Delta Drums

`instruments/delta-drums.mjs` ist der 1-Bit-Sample-Kanal einer Spielkonsole der Achtziger. Spiele
haben darüber Schlagzeug, Bassanschläge und kurze Rufe abgespielt. Der Kanal kennt keine
Lautstärke und keine Wellenform, nur einen 7-Bit-Zähler, den ein Bitstrom Schritt für Schritt
hinauf und hinunter schiebt. Daraus kommt der körnige, gebremste Klang: Ein Sample kann nicht
schneller steigen oder fallen, als die Bits es erlauben.

Alle Klänge werden hier selbst synthetisiert und beim Aufruf in einen Delta-Bitstrom kodiert, wie
es die Werkzeuge der Zeit mit aufgenommenen Samples getan haben. Ausgabe mono, 48 kHz.

```js
import { render, meta } from './instruments/delta-drums.mjs';
const x = render({ voice: 'snare', velocity: 0.9, rate: 4 });
```

## Der Kanal

Der Zähler c läuft von 0 bis 127 und beginnt in Ruhe bei 64. Pro Bit gilt

    Bit 1:  c ← c + 2, falls c ≤ 125
    Bit 0:  c ← c − 2, falls c ≥ 2

An den Rändern bleibt er also stehen. Ein Zeitgeber liest ein Bit alle P Takte des
Prozessortakts von 1 789 773 Hz. P ist eine von 16 festen Perioden, die Bitrate ist
f_s = 1 789 773 / P. Der Zeitgeber zählt in Paaren von Takten, deshalb ist jedes P gerade.

### Ratentabelle

Die Tabelle ist hier selbst hergeleitet. Die 16 Raten liegen auf einer pentatonischen Leiter über
4186 Hz (Halbtonschritte 0, 2, 5, 7, 10, 12, 14, 17, 19, 22, 24, 26, 29, 31, 34, 36), also drei
Oktaven von C bis C. Die Periode ist der nächste gerade Wert, `P = 2 · round(1 789 773 / (2 f))`.

| Index | P | f_s in Hz | Abweichung von der Leiter in Cent |
|---|---|---|---|
| 0 | 428 | 4181,7 | −1,8 |
| 1 | 380 | 4709,9 | +4,2 |
| 2 | 320 | 5593,0 | +1,7 |
| 3 | 286 | 6257,9 | −3,9 |
| 4 | 240 | 7457,4 | −0,3 |
| 5 | 214 | 8363,4 | −1,8 |
| 6 | 190 | 9419,9 | +4,2 |
| 7 | 160 | 11 186,1 | +1,7 |
| 8 | 142 | 12 604,0 | +8,3 |
| 9 | 120 | 14 914,8 | −0,3 |
| 10 | 106 | 16 884,7 | +14,5 |
| 11 | 96 | 18 643,5 | −14,0 |
| 12 | 80 | 22 372,2 | +1,7 |
| 13 | 72 | 24 858,0 | −15,9 |
| 14 | 60 | 29 829,5 | −0,3 |
| 15 | 54 | 33 143,9 | −17,9 |

Oben werden die Perioden kurz, ein Schritt von 2 Takten ist dort bis zu 18 Cent. Das ist die
Quantisierung der echten Hardware: Zwischen den Tabellenwerten gibt es keine Rate.

### Länge

Die Länge eines Samples steht in einem 8-Bit-Register als L, das Sample hat 16 L + 1 Bytes. Mehr
als 4081 Bytes, also 32 648 Bit, gehen nicht. Bei Rate 15 sind das 0,98 s, bei Rate 0 7,8 s. Das
Becken ist bei hohen Raten deshalb kürzer und blendet vor dem Ende aus. Jeder kodierte Strom
wird auf eine erlaubte Länge aufgefüllt.

## Kodierung

Die Quelle wird direkt mit der Rate f_s gerechnet, mit dem Zustandsvariablenfilter des Repos bei
dieser Rate. Rauschen ist weiß bei f_s, Töne sind Summen von Harmonischen, die bei 0,45 f_s
aufhören. Damit liegt in der Quelle nichts über f_s / 2, so wie ein Werkzeug ein Sample vor der
Kodierung auf die Zielrate umrechnet. Die Quelle wird auf Spitze 1 normiert und mit
`60 · velocity` Zählerstufen um die Ruhelage 64 skaliert.

Der Kodierer arbeitet Bit für Bit: liegt das Ziel über dem Zähler, eine 1, darunter eine 0, bei
Gleichstand abwechselnd. Er bildet den Zähler dabei mit allen Grenzen nach. Ist die Quelle unter
eine Zählerstufe abgeklungen, endet der Strom, danach hält der Zähler seinen letzten Wert.

### Steigungsgrenze

Der Zähler kann sich um höchstens 2 Stufen pro Bit bewegen, also mit 2 f_s Stufen pro Sekunde.
Ein Sinus mit Amplitude A (in Stufen) und Frequenz f braucht die Steigung 2π f A. Über

    2π f A > 2 f_s

kommt der Zähler nicht mehr mit und läuft als Dreieck hinterher. Die Bassdrum (Anfang bei 177 Hz,
A = 60) braucht 66 700 Stufen pro Sekunde. Bei Rate 0 schafft der Kanal 8 363, bei Rate 15
66 288. Bei niedrigen Raten wird die Kick daher zum gerundeten Dreieck mit kleinerer Amplitude, und
hohe Anteile von Snare, Clap und Becken gehen im Rauschen der Kodierung unter. Leise Anschläge
überfordern den Kanal weniger und klingen sauberer.

### Körnung und Ruheton

Wo die Quelle flach ist, pendelt der Zähler mit 1, 0, 1, 0 um das Ziel. Das ist ein Ton bei f_s / 2
mit einer Zählerstufe Amplitude. Bei Rate 0 liegt er bei 2,1 kHz und ist im Ausklang leise zu
hören, wie auf der Konsole. Jede Stufe ist eine Treppenstufe bei der Rate f_s; ihre Spiegelbilder
um Vielfache von f_s gehören zum Klang.

## Ausgang

### Nichtlineare Mischung

Der Zähler treibt einen Widerstands-DAC, der mit den anderen Kanälen an einer gemeinsamen Last
hängt. Die Spannung wächst darum nicht linear mit c:

    h(c) = c / (1 + c / 230)

Bei c = 127 ist die Stufenhöhe nur noch 41,5 % der Stufenhöhe bei c = 0. Der Kanal ist also
komprimierend und unsymmetrisch: Vom Ruhewert 64 aus reicht der Weg nach unten (h(0) − h(64) =
−50,1) weiter als nach oben (h(127) − h(64) = +31,7). Ausgegeben wird h(c) − h(64), geteilt durch
50.

### Bandbegrenzte Stufen

Jede Änderung von h ist ein Sprung zur Zeit k P / 1 789 773. Diese Zeit fällt fast nie auf ein
Sample bei 48 kHz. Jeder Sprung wird deshalb durch das Integral eines Kaiser-gefensterten Sinc
ersetzt (Grenzfrequenz 23 kHz, 32 Stützstellen breit, β = 10). Ab 28 kHz ist es um rund 100 dB
gedämpft, nichts davon faltet in den Bereich unter 20 kHz zurück. Das Ergebnis ist die
tiefpassgefilterte Treppe selbst; neue Spiegelfrequenzen durch die Umrechnung auf 48 kHz gibt es
nicht.

### Analoge Filter

Am Ausgang liegen zwei Koppelkondensatoren als Hochpässe erster Ordnung bei 37 Hz und 90 Hz und
ein RC-Tiefpass erster Ordnung bei 14 kHz, alle trapezförmig diskretisiert. Die Hochpässe nehmen
den Gleichanteil weg, auch den gehaltenen Zählerwert nach dem Ende des Stroms, und machen die Kick
so dünn wie auf der Konsole.

## Stimmen

| Stimme | Quelle |
|---|---|
| `kick` | Sinus, gleitet von 177 Hz auf 52 Hz (Zeitkonstante 32 ms), Abklingen 150 ms, kurzer Rauschklick |
| `snare` | Ton 188 Hz mit kurzem Tonhöhenabfall, dazu Rauschen im Band um 3,8 kHz über 900 Hz |
| `tom-high` | Sinus 172 Hz, beim Anschlag 45 % höher, Abklingen 200 ms |
| `tom-low` | Sinus 108 Hz, sonst wie oben, Abklingen 270 ms |
| `clap` | vier Rauschstöße im Abstand von etwa 10,5 ms durch Bandpässe bei 1,15 und 2,4 kHz, dann Nachhall |
| `cowbell` | zwei Rechtecke 545 und 815 Hz durch Bandpässe bei 2,5 kHz und 900 Hz |
| `crash` | Rauschen über 3,2 kHz und sechs unharmonische Rechtecke über 5 kHz, Abklingen 450 ms |
| `shout` | „Hey“: Hauchen, dann ein stimmhafter Gleitlaut von /e/ nach /i/ mit Grundton 205 Hz und drei Formanten (540 → 330, 1850 → 2250, 2500 → 2950 Hz) |
| `slap` | Slap-Bass auf G2 (98 Hz): bis zu 40 Harmonische, hohe klingen schneller ab, die 3. bis 9. knallen 20 ms lang auf, dazu ein kurzer Klick |

Kleine Abweichungen in Tonhöhe und Abständen kommen aus dem Seed. Formanten über 0,42 f_s
fallen weg; bei Rate 0 hat der Ruf nur noch den ersten Formanten und klingt dumpf.

## Parameter

| Parameter | Werte | Standard |
|---|---|---|
| `voice` | `kick`, `snare`, `tom-high`, `tom-low`, `clap`, `cowbell`, `crash`, `shout`, `slap` | `kick` |
| `velocity` | 0 bis 1, Amplitude der Quelle vor der Kodierung | 0,8 |
| `rate` | 0 bis 15, Index der Ratentabelle, mit dieser Rate wird kodiert | 15 |
| `tune` | −12 bis 12 Halbtöne | 0 |
| `seed` | Zahl | 1 |

`tune` spielt den Strom mit der Tabellenrate ab, die der gewünschten Verschiebung in
logarithmischer Frequenz am nächsten liegt. Wie auf der Hardware ändern sich Tonhöhe und Länge
gemeinsam. Die erreichbaren Schritte sind die der Leiter; außerhalb der Tabelle geht nichts:

| `tune` | ab Rate 0 | ab Rate 7 | ab Rate 15 |
|---|---|---|---|
| −12 | 0 | −1200 | −1168 |
| −7 | 0 | −702 | −680 |
| −5 | 0 | −503 | −498 |
| −2 | 0 | −298 | −182 |
| +2 | +206 | +207 | 0 |
| +5 | +503 | +498 | 0 |
| +7 | +698 | +713 | 0 |
| +12 | +1200 | +1200 | 0 |

(tatsächliche Verschiebung in Cent)

Kodierte Ströme werden zwischengespeichert, höchstens 48, Schlüssel sind Stimme, Rate, Seed und
Anschlag. Falsche Typen oder nicht endliche Zahlen werfen einen Fehler mit dem Namen des
Parameters, Zahlen außerhalb des Bereichs werden begrenzt.

## Pegel

Niedrige Raten verlieren durch die Steigungsgrenze bis zu 10 dB. Eine feste Tabelle hebt jede Rate
um den Median dieses Verlusts über alle Stimmen an (Rate 0 um 9,8 dB, Rate 15 um 0 dB). Danach
hat jede Stimme einen festen Pegel, eingemessen über alle 16 Raten, fünf Stimmungen und sechs
Seeds bei Anschlag 1, Ziel −1,5 dBFS. Es gibt keinen Begrenzer.

## Messwerte

Durchlauf mit allen Stimmen, Raten 0, 3, 7, 11 und 15, `tune` −12, 0 und 12, Anschlag 0,2, 0,6 und
1, Seeds 1, 2 und 3,5 (1215 Töne):

- Lautester Ton bei Anschlag 1: −1,48 dBFS (`shout`, Rate 15).
- Größter Sprung von Sample zu Sample: 0,18 (`crash` bei Rate 0, um eine Oktave hoch gespielt).
- Keine NaN, erstes und letztes Sample jedes Tons exakt 0, Gleichanteil unter 10⁻⁷.
- Gleicher Seed ergibt bitgleiche Ausgabe, Seed 4,5 klingt anders als Seed 4.
- Rechenzeit: 0,8 % der Klangdauer, ein Becken bei Rate 15 braucht etwa 50 ms.
- Spektrogramme über alle Raten zeigen Spiegelbilder nur um Vielfache der Kanalrate und die
  Linie bei f_s / 2, beides vom Kanal selbst. Fallende Linien durch Rückfaltung bei 48 kHz gibt es
  nicht.

Die Demo `demos/delta-drums.mjs` spielt jede Stimme erst sauber bei Rate 15, dann bei Rate 3, und
danach acht Takte Groove bei 112 BPM: vier Takte bei Rate 12, vier bei Rate 4. Der Slap-Bass
antwortet auf demselben Kanal, seine Töne kommen aus `tune` entlang der pentatonischen Leiter.
Weil die Konsole nur einen Delta-Kanal hat, schneidet jeder Schlag den vorigen ab. Länge 29 s,
−16,1 LUFS, Spitze −1,0 dBFS, True Peak −1,0 dBTP.
