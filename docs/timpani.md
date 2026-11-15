# Pauken

Eine Konzertpauke, aus den Eigenschwingungen ihres Fells gerechnet. Kein Sample, kein gefiltertes
Rauschen als Klangquelle.

Dateien: `instruments/timpani.mjs` (Einstieg, `render`), `instruments/timpani/head.mjs` (Fellmoden
mit Luftlast). Mitbenutzt werden die Modalbank und der Hertz-Kontakt aus `instruments/metal/modal.mjs`
und die Besselfunktion aus `instruments/drums/membrane.mjs`. Demo: `node demos/timpani.mjs` schreibt
`out/timpani.wav`.

## Schnittstelle

```js
import { render } from './instruments/timpani.mjs';
render({ midi: 45, velocity: 0.8, duration: 4, preset: 'normal', seed: 1 }); // Float64Array, mono, 48 kHz
```

| Parameter | Bereich | Bedeutung |
| --- | --- | --- |
| `midi` | 36 bis 62 (C2 bis D4), Standard 45 | Tonhöhe der Hauptmode (1,1). Tiefe Töne spielt ein großer Kessel (81 cm), hohe ein kleiner (58 cm) |
| `velocity` | 0,01 bis 1 | Aufprallgeschwindigkeit des Schlägels, `0,25 + 3,75 · velocity^1,5` m/s |
| `duration` | 0,05 bis 12 s, Standard 4 | Einzelschlag: Zeitpunkt, an dem die Hand das Fell abdämpft. Wirbel: Länge des Wirbels |
| `preset` | `normal`, `soft`, `hard`, `roll` | Schlägel und Spielweise |
| `seed` | beliebige Zahl | Schlagstelle, kleine Modenstreuung, Abklingzeiten, Zeitpunkte im Wirbel |

Werte außerhalb der Bereiche werden auf die Grenze gesetzt, fehlende Werte nehmen den Standard.
NaN, unendliche Werte und Text statt einer Zahl werfen einen Fehler mit dem Namen des Parameters,
ebenso ein unbekanntes Preset. Gleicher Seed ergibt bitgleich
dasselbe Ergebnis, auch gebrochene Seeds wie 1,5 sind eigene Varianten.

## Fell: ideale Membran plus Luft

Eine ideale Kreismembran hat die Moden f_mn ∝ j_mn, die Nullstellen der Besselfunktionen J_m
(m Knotendurchmesser, n Knotenkreise). Ihre Verhältnisse sind unharmonisch: 1 : 1,34 : 1,66 :
1,98 : 2,29 für (1,1) bis (5,1). Eine Pauke klingt trotzdem nach einem Ton, weil die Luft das Fell
belastet (Rossing, Science of Percussion Instruments; Fletcher und Rossing 1998):

* **Mitbewegte Luftmasse.** Die Luft über und unter dem Fell schwingt mit. Ihre Masse pro Fläche
  fällt mit der Wellenzahl, langwellige Moden schleppen mehr Luft mit und werden stärker
  abgesenkt. Im Modell ist die wirksame Flächenmasse σ_eff = σ · (1 + ε / j^p). ε und p sind an
  die gemessenen Verhältnisse der (m,1)-Moden angepasst (etwa 1 : 1,5 : 2 : 2,44 : 2,94). Das
  ergibt ε = 9,33 und p = 1,56 mit einem Restfehler unter 0,5 % für m = 1 bis 5:

  | Mode | ideal | mit Luftlast |
  | --- | --- | --- |
  | (1,1) Hauptton | 1,000 | 1,000 |
  | (2,1) Quinte | 1,342 | 1,495 |
  | (3,1) Oktave | 1,665 | 1,981 |
  | (4,1) | 1,980 | 2,457 |
  | (5,1) | 2,289 | 2,925 |

  Daraus hört man den Hauptton mit Quinte und Oktave darüber.
* **Eingeschlossene Luft.** Die rotationssymmetrischen Moden (0,n) ändern das Volumen im Kessel.
  Die Luft wirkt als Feder und hebt sie an, die (0,1) liegt dann beim 1,7-fachen des Haupttons.
  Diese Moden strahlen als Monopol sehr gut ab und verlieren ihre Energie in wenigen Zehntelsekunden.
  Sie machen den dumpfen Anfang des Schlags.

Gerechnet werden alle Moden bis j = 4,6 · j_11, das sind 30 Moden bis etwa zum sechsfachen
Hauptton. Fell: Polyester, 0,19 mm, ρ = 1390 kg/m³, E = 4,5 GPa.

Abklingzeiten T60: Hauptton 3,6 s · √(100 Hz / f), also etwa 4,4 s bei C2 und 2,1 s bei D4.
Die übrigen (m,1)-Moden etwas kürzer, Moden mit Knotenkreisen (n ≥ 2) unter einer Sekunde, die
(0,n)-Moden 0,31 s (D4) bis 0,37 s (C2). Jeder Seed streut die Zeiten um ±10 %.

Abstrahlung: Moden mit vielen Knotendurchmessern sind schlechte Strahler. Gewicht 1,6 für m = 0,
1 für m = 1, dann fallend bis 0,07 für m = 12.

## Schlägel

Der Schlägel ist eine Masse an einer nichtlinearen Filzfeder, F = K·δ^1,5 mit Hunt-Crossley-Dämpfung,
gerechnet mit 32 Unterschritten pro Sample gegen eine feste Fläche. Die Nachgiebigkeit des Fells
steckt in der angepassten Federsteifigkeit K. Die Kraft geht als Impuls pro Sample in
jede Mode, gewichtet mit J_m(j·r)·cos(mθ) an der Schlagstelle. Geschlagen wird etwa ein Viertel des
Durchmessers vom Rand entfernt (r = 0,74 bis 0,79 des Radius), dort sind die (0,n)-Moden schwach und
der Ton klar.

| Preset | Kopfmasse | Kontaktzeit (velocity 0,2 / 1) |
| --- | --- | --- |
| `normal` | 24 g, Filz | 2,8 / 1,9 ms |
| `soft` | 26 g, dicker Filz | 5,6 / 3,8 ms |
| `hard` | 20 g, harter Filz | 1,1 / 0,74 ms |

Ein härterer Schlag ist nach Hertz kürzer und damit heller. Velocity ändert also Klangfarbe und
Pegel zugleich.

## Spannungsänderung: das Absinken nach dem Schlag

Große Auslenkung dehnt das Fell, die Spannung steigt um E·h·S / (2(1−ν)) mit S der mittleren
quadrierten Steigung (Kirchhoff-Carrier für Membranen). Jede Mode wird dadurch angehoben,
ω² = ω₀² + c·S·k². S wird pro Sample aus allen Moden berechnet und mit 30 Hz geglättet. Direkt nach
einem kräftigen Schlag liegt der Ton also höher und sinkt beim Ausklingen auf die Stimmung. Der
Spannring nimmt einen Teil der Dehnung auf, deshalb ist c ein angepasster Bruchteil des
theoretischen Werts.

Gemessen (Abweichung des Haupttons in Cent, Fenster 0,03 bis 0,25 s / 0,5 bis 1 s, `normal`):

| MIDI | velocity 0,2 | velocity 0,6 | velocity 1 |
| --- | --- | --- | --- |
| 36 | 1 / 0 | 14 / 0 | 49 / 1 |
| 43 | 0 / 0 | 5 / 0 | 21 / 0,5 |
| 50 | 0 / 0 | 1 / 0 | 6,5 / 0 |
| 62 | 0 / 0 | 0 / 0 | 1 / 0 |

Zwischen 1,5 und 3 s liegt jeder Ton auf der Stimmung (Spitze eines fein gerasterten Spektrums,
Raster 0,25 Cent).

## Wirbel und Abdämpfen

`roll` ist ein Einzelschlagwirbel mit zwei Schlägeln. Die Rate steigt mit der Tonhöhe von 10 auf
16 Schläge pro Sekunde, jeder Abstand streut um ±10 %. Die beiden Hände treffen an leicht
verschiedenen Stellen (Radius und Winkel), die zweite etwas schwächer, und die ersten 0,4 s schwillt
der Wirbel an. Weil das Fell nie zur Ruhe kommt, bleibt die Spannung erhöht: Ein lauter Wirbel auf
der tiefsten Pauke liegt bis zu 20 Cent über der Stimmung, wie beim echten Instrument. Nach dem
Wirbel klingt das Fell 1,6 s frei und wird dann abgedämpft.

Bei Einzelschlägen legt die Hand zum Zeitpunkt `duration` auf: Die Dämpfung blendet über 20 ms ein,
danach fällt der Pegel mit τ = 70 ms. Ist `duration` länger als der natürliche Ausklang, klingt die
Note bis unter −60 dB aus.

## Pegel, Randbedingungen, Messwerte

Eine Pegeltabelle pro Preset in 2-Halbtonschritten gleicht die Register an. Sie ist so gesetzt,
dass der lauteste von mehreren Seeds bei velocity 0,2, 0,6 und 1 bei etwa −3 dBFS liegt.

Prüfung über jeden Halbton von 36 bis 62, velocity 0,2/0,6/1, vier frische Seeds (darunter 10,5),
Wirbel mit 2 und 6 s:

| Preset | lautester Fall | größter Sprung | ungültige Werte | Gleichanteil (relativ) |
| --- | --- | --- | --- | --- |
| `normal` | −2,8 dBFS | 0,06 | 0 | unter 4·10⁻⁶ |
| `soft` | −3,0 dBFS | 0,04 | 0 | unter 4·10⁻⁶ |
| `hard` | −2,8 dBFS | 0,06 | 0 | unter 4·10⁻⁶ |
| `roll` (1, 2, 6 und 12 s) | −3,0 dBFS | 0,05 | 0 | unter 5·10⁻⁶ |

Zwischen den Tönen eines Presets schwankt der lauteste Fall nur um etwa 2 dB. Stimmung: zwischen
1 und 3 s nach dem Schlag weicht der Hauptton bei velocity 0,6 auf allen geraden Tönen um weniger
als 0,25 Cent ab. Rechenzeit: eine Note mit 4,6 s Ausklang braucht etwa 0,05 s, ein Wirbel von 10 s
etwa 0,25 s.

Jede Note beginnt und endet bei exakt null (Einblendung über 8 Samples, Ausblendung 50 ms mit
Raised Cosine). Ein Hochpass bei 28 Hz und ein Tiefpass bei 9 kHz runden nur ab. Alle Moden liegen
unter 2 kHz, Aliasing gibt es nicht.

## Grenzen

* Der Kessel ist nur als Luftfeder für die (0,n)-Moden und als Luftmasse enthalten, eigene
  Kesselresonanzen fehlen.
* Die Luftlast ist ein angepasstes Potenzgesetz, keine gekoppelte Rechnung von Fell und Luftraum.
* Der Schlägel trifft im Wirbel auf ein ruhendes Fell, die Rückwirkung der Fellbewegung auf den
  Kontakt fehlt.
* Pedal und Glissando gibt es nicht.

## Quellen

* T. D. Rossing: Science of Percussion Instruments. World Scientific 2000.
* N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments. Springer 1998, Kapitel 18.
* K. H. Hunt, F. R. E. Crossley: Coefficient of restitution interpreted as damping in vibroimpact.
  J. Appl. Mech. 42 (1975).
* H. Hertz: Über die Berührung fester elastischer Körper. J. reine angew. Math. 92 (1882).
