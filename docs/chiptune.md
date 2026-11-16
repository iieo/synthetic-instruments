# Chiptune (8-Bit)

`instruments/chiptune.mjs` spielt Töne, wie sie die Soundchips der 8-Bit-Spielkonsolen und
Heimcomputer der Achtziger erzeugt haben. Es gibt keine Samples. Das Modell rechnet nach, was der
Chip tut: Zähler, die einen Takt herunterteilen, Sequenzer mit wenigen Stufen, ein Schieberegister
für Rauschen und eine Lautstärke mit 16 Stufen, die ein Treiberprogramm 60-mal pro Sekunde neu
setzt.

Umfang: MIDI 24 bis 96 (C1 bis C7), ganze Halbtöne. Ausgabe mono, 48 kHz.

```js
import { render, meta } from './instruments/chiptune.mjs';
const lead = render({ midi: 76, velocity: 0.9, duration: 0.6, preset: 'lead' });
const chord = render({ midi: 57, duration: 1, preset: 'arp', arp: 'minor' });
const kick = render({ midi: 53, preset: 'kick', crush: 4 });
```

## Parameter

| Parameter  | Werte                        | Bedeutung |
|------------|------------------------------|-----------|
| `midi`     | 24 bis 96, Standard 60       | Tonhöhe, bei Schlagzeug und Rauschen siehe unten |
| `velocity` | 0 bis 1, Standard 0,8        | wird auf die 16 Lautstärkestufen des Chips gerundet |
| `duration` | Sekunden, Standard 0,5       | Haltedauer, auf ganze Frames gerundet; Schlagzeug, Laser und Münze ignorieren sie |
| `preset`   | siehe unten, Standard `lead` | Kanal und Treiberprogramm |
| `vibrato`  | 0 bis 1                      | Tiefe des verzögerten Vibratos, ohne Angabe gilt das Preset |
| `arp`      | `major`, `minor`, `power`    | Akkord für das Preset `arp` |
| `crush`    | `'off'`, 8, 4                | DAC jedes Kanals auf 8 oder 4 Bit vergröbern |
| `seed`     | Zahl                         | Startzustand des Rauschregisters |

Unbekannte Presets, Akkorde oder `crush`-Werte und nicht endliche Zahlen lösen einen Fehler mit dem
Namen des Parameters aus. `render()` und `render({})` spielen ein C4 mit dem Lead.

## Der Chip

**Takt und Periode.** Der Chip läuft mit 1,789773 MHz, der halben Farbträgerfrequenz des
NTSC-Fernsehens. Jeder Tonkanal hat einen Zähler, der von einem ganzzahligen Periodenregister P
herunterzählt. Läuft er ab, rückt der Kanal eine Stufe weiter. Daraus folgt

    f = 1789773 / (k · (P + 1))

mit k = 16 für die Pulskanäle (8 Stufen, je 2 Takte), k = 32 für das Dreieck (32 Stufen, je ein
Takt) und k = 64 für den Wellenkanal (32 Abtastwerte, je 2 Takte). Das Register ist hier 12 Bit
breit, damit auch die unterste Oktave hineinpasst. Ein neuer Wert für P wirkt erst, wenn der
Zähler das nächste Mal neu lädt, so wie bei der Hardware.

**Pulskanäle.** Ein Sequenzer mit 8 Stufen gibt 0 oder die Lautstärke aus. Die Tastverhältnisse
sind 12,5 %, 25 % und 50 %. Ein Wechsel des Tastverhältnisses wird gespeichert und erst übernommen,
wenn der Sequenzer wieder bei Stufe 0 beginnt, deshalb entsteht beim Umschalten kein halber Puls.

**Dreieck.** 32 Stufen mit 4 Bit, von 15 hinunter auf 0 und wieder hinauf. Die Treppe hört man als
leises Sirren über dem weichen Grundton, das ist der typische Bass. Der Kanal beginnt in der Mitte
der Treppe bei 0, damit der Einsatz nicht knackt.

**Wellenkanal.** Ein Speicher mit 32 Abtastwerten zu 4 Bit, wie ihn spätere Chips für eigene
Wellenformen hatten. Hier enthält er eine runde Basswelle aus Grundton mit etwas zweiter und
dritter Harmonischer.

**Rauschen.** Ein Schieberegister mit 15 Bit. Bei jedem Takt des Rauschteilers wird es nach rechts
geschoben, oben kommt das XOR aus Bit 0 und Bit 1 hinein. Das ergibt eine Folge von 32767 Bit, die
wie weißes Rauschen klingt. Im kurzen Modus kommt das XOR aus Bit 0 und Bit 6, die Folge ist dann
nur 93 Bit lang und klingt metallisch mit einer erkennbaren Tonhöhe. Der Teiler ist ganzzahlig und
so gewählt, dass die 93er Folge auf dem gespielten Ton liegt: `D = round(1789773 / (93 · f))`. Im
langen Modus bestimmt derselbe Teiler die Helligkeit. Der Seed legt fest, an welcher Stelle der
Folge das Register beginnt.

**Lautstärke.** Jeder Kanal hat 16 Stufen. Die Anschlagstärke wird auf eine Stufe gerundet
(0,2 ergibt 3, 0,6 ergibt 9, 1 ergibt 15), die Hüllkurve rechnet in Bruchteilen davon und rundet
wieder auf ganze Stufen. Leise Töne klingen deshalb gröber abgestuft als laute.

**Treiber.** Wie in den Spielen setzt ein Programm einmal pro Bild, also 60-mal pro Sekunde,
Lautstärke, Periode und Tastverhältnis neu. Vibrato, Arpeggio und Hüllkurven laufen auf diesem
Raster. Die Sweep-Einheit für Kick und Laser wird zweimal pro Frame getaktet und vergrößert die
Periode jedes Mal um `P >> n`, die Tonhöhe fällt also in Stufen.

**DAC.** Jeder Kanal gibt Stufe mal Lautstärke aus. Mit `crush: 8` oder `crush: 4` wird dieser Wert
auf 256 oder 16 Stufen über den vollen Bereich gerundet. Beim Puls ändert das nichts, beim Dreieck
und beim Wellenkanal bleiben bei kleiner Lautstärke nur noch wenige Stufen übrig, das klingt rau.

**Analoge Ausgangsstufe.** Ein Koppelkondensator als Hochpass bei 30 Hz und ein RC-Tiefpass bei
14 kHz, beide erster Ordnung. Der Hochpass nimmt auch den Gleichanteil weg, denn alle Kanäle geben
nur Werte zwischen 0 und der Lautstärke aus.

## Ohne Aliasing

Der Chip erzeugt Treppen mit senkrechten Kanten. Tastet man sie einfach bei 48 kHz ab, falten die
Obertöne oberhalb von 24 kHz zurück, und bei hohen Tönen und Sweeps hört man pfeifende Spiegeltöne.
Das Modell kennt aber die genaue Zeit jeder Kante, auf den Chiptakt genau. Jede Kante der Höhe d zum
Zeitpunkt τ wird durch eine bandbegrenzte Stufe ersetzt:

    B(x) = ∫ h(u) du von −32 bis x,   h = Sinus cardinalis bei 20 kHz mit Kaiser-Fenster (β = 9)

Die Stufe ist 64 Abtastwerte breit und in Schritten von 1/1024 Abtastwert tabelliert. Gerechnet
wird die einfache Treppe plus die Korrektur `d · (B(t − τ) − u(t − τ))` an den 64 Abtastwerten um die
Kante. Weil das linear ist, ergibt die Summe genau die bandbegrenzte Fassung des Chipsignals. Der
Durchlassbereich reicht bis etwa 18 kHz, oberhalb von 22 kHz ist die Dämpfung rund 90 dB. Alles,
was zurückfalten könnte, liegt also mindestens 90 dB unter der Kante, im Spektrogramm sind bis
−120 dBFS nur die echten Obertöne zu sehen, auch bei C7 mit 12,5 % und beim Laser-Sweep. Die harte
Treppe bleibt hörbar, denn alle Obertöne bis 18 kHz sind unverändert da.

## Stimmung

Weil P ganzzahlig ist, liegen hohe Töne etwas daneben. Die Abweichung in Cent:

| Ton | Hz     | Puls (k = 16) | Dreieck (k = 32) | Welle (k = 64) | Rauschen kurz (93 · D) |
|-----|--------|---------------|------------------|----------------|------------------------|
| C1  | 32,7   | +0,2          | +0,2             | +0,2           | +1,4                   |
| C2  | 65,4   | +0,2          | +0,2             | −1,8           | +1,4                   |
| C3  | 130,8  | +0,2          | −1,8             | −1,8           | +1,4                   |
| C4  | 261,6  | −1,8          | −1,8             | −1,8           | −10,4                  |
| A4  | 440,0  | +1,6          | +1,6             | −12,0          | −10,3                  |
| C5  | 523,3  | −1,8          | −1,8             | +14,5          | −10,4                  |
| C6  | 1046,5 | −1,8          | +14,5            | −17,9          | +37,1                  |
| A6  | 1760,0 | −12,0         | −12,0            | −12,0          | −10,3                  |
| C7  | 2093,0 | +14,5         | −17,9            | +47,5          | +37,1                  |

Größte Abweichung im ganzen Umfang: Puls 14,5 Cent (C7), Dreieck 19,2 Cent (H6), Welle 47,5 Cent
(C7), kurzes Rauschen 61 Cent (Gis6). Bis C6 bleibt der Puls unter 4,2 Cent. Gemessen am fertigen
Signal stimmt die Frequenz mit der Formel überein, ein C7 auf dem Puls klingt mit 2110,58 Hz statt
2093,00 Hz. Wellenkanal und kurzes Rauschen eignen sich deshalb vor allem für tiefe und mittlere
Lagen.

## Presets

| Preset        | Kanäle             | Klang |
|---------------|--------------------|-------|
| `lead`        | Puls               | 50 % für drei Frames, dann 25 %, Vibrato setzt nach 12 Frames ein und wächst über 15 Frames |
| `arp`         | Puls 12,5 %        | Akkord aus drei Tönen, jeder Frame ein anderer Ton, also 20 Durchläufe pro Sekunde |
| `bass`        | Dreieck und Puls   | Dreieck auf dem Ton, dazu für fünf Frames ein Puls eine Oktave höher als Biss |
| `pulse12`, `pulse25`, `pulse50` | Puls | reiner Pulskanal mit festem Tastverhältnis |
| `triangle`    | Dreieck            | reiner Dreieckskanal ohne Abklingen |
| `wave`        | Wellenkanal        | runde Basswelle |
| `noise`       | Rauschen lang      | Helligkeit folgt dem Ton |
| `noise-short` | Rauschen kurz      | metallischer Ton auf dem gespielten Ton |
| `kick`        | Dreieck und Rauschen | Sweep vom gespielten Ton zwei Oktaven abwärts, ein Frame Rauschen als Klick |
| `snare`       | Rauschen und Puls  | Rauschen eine Oktave über dem Ton, ein Puls fällt in vier Frames um 9 Halbtöne |
| `hat`         | Rauschen kurz      | zwei Oktaven über dem Ton, fünf Frames |
| `laser`       | Puls 25 %          | Sweep von einer Oktave über dem Ton steil abwärts |
| `coin`        | Puls 50 %          | vier Frames der Ton, dann die Quinte darüber, die ausklingt |

Für die Kick ist MIDI 50 bis 56 ein guter Bereich, für die Snare 60 bis 66, für die Hi-Hat 80 bis 90.

## Pegel

Jedes Preset hat eine feste Ausgangsverstärkung. Über den ganzen Umfang in Schritten von zwei
Halbtönen, die Anschlagstärken 0,2, 0,6 und 1, alle Werte von `crush`, `vibrato` und `arp`, drei
Haltedauern und vier Seeds (insgesamt 42 624 Töne) liegt der lauteste Ton bei Anschlag 1 bei etwa
−1,5 dBFS, bei den Presets mit Rauschen zwischen −2 und −2,8 dBFS. Dort hängt die Spitze vom Startzustand
des Registers ab, über 3000 Seeds bleibt die Kick unter −1,7 dBFS. Kein Wert ist ungültig, jeder
Ton beginnt und endet bei genau 0, der Gleichanteil liegt unter 10⁻⁸.

## Demo

`node demos/chiptune.mjs` schreibt `out/chiptune.wav`: ein eigenes Stück in a-Moll mit 150 BPM, eine
Sechzehntel dauert genau sechs Frames. Lead, Arpeggio, Dreiecksbass und Rauschschlagzeug laufen
zweimal acht Takte, im zweiten Durchgang mit einer Echostimme auf dem 12,5-%-Puls, wie sie in
Spielen oft einen freien Kanal füllt. Jeder Kanal spielt wie auf dem Chip nur einen Ton zur Zeit.
