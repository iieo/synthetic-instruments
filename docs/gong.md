# Gong

Ein großer Tamtam, ein gestimmter Buckelgong und ein kleiner Gong, gerechnet als dünne
Bronzeplatte mit nichtlinearer Dehnung. Kein Sample, kein Rauschen als Klangquelle: Auch das
Schimmern nach einem harten Schlag entsteht im Modell selbst, weil Energie von den tiefen in die
hohen Moden wandert.

Dateien: `instruments/gong.mjs` (Einstieg, Presets, `render`), `instruments/gong/plate.mjs`
(Plattenmoden). Mitbenutzt werden die Modalbank mit Berger-Dehnung und der Hertz-Kontakt aus
`instruments/metal/modal.mjs`. Demo: `node demos/gong.mjs` schreibt `out/gong.wav`.

## Schnittstelle

```js
import { render } from './instruments/gong.mjs';
render({ preset: 'tamtam', velocity: 1, duration: 10, seed: 1 }); // Float64Array, mono, 48 kHz
render({ preset: 'chau', midi: 50, velocity: 0.7 });
```

| Parameter | Bereich | Bedeutung |
| --- | --- | --- |
| `preset` | `tamtam`, `chau`, `small` | Bauart |
| `midi` | 28 bis 76 | Bei `chau` der Grundton des Buckels. Bei `tamtam` und `small` die Größe: Standard ist 36 (Tamtam, 1 m Durchmesser) und 64 (kleiner Gong, 40 cm), zwölf Halbtöne höher heißt ein um den Faktor √2 kleinerer Radius |
| `velocity` | 0,01 bis 1 | Aufprallgeschwindigkeit des Schlägels, `0,3 + v_max · velocity^1,3` m/s |
| `duration` | 0,1 bis 30 s, Standard 8 | Zeitpunkt, an dem der Gong mit der Hand abgedämpft wird |
| `seed` | beliebige Zahl | Schlagstelle, Hämmerungsfehler der Platte, Mikrofonpunkt, Modenauswahl |

Werte außerhalb der Bereiche werden auf die Grenze gesetzt, fehlende Werte nehmen den Standard.
NaN, unendliche Werte und Text statt einer Zahl werfen einen Fehler mit dem Namen des Parameters,
ebenso ein unbekanntes Preset. Gleicher Seed, gleiche Samples.

## Platte

Eine Kreisplatte aus Bronze (E = 110 GPa, ρ = 8600 kg/m³, ν = 0,34) mit Radius a und Dicke h hat
Biegemoden mit f = β·λ²/(2π a²) und β = h·√(E / (12ρ(1−ν²))). Der umgebogene Rand hält die Platte
ungefähr wie ein gelenkiges Lager, die Eigenwerte λ_mn liegen deshalb nahe den Besselnullstellen
j_m,n+1. Für große Ordnungen werden sie aus Näherungen berechnet (Olver für die erste Nullstelle,
McMahon für die weiteren). Moden mit m > 0 kommen paarweise vor (Sinus und Kosinus). Die gehämmerte
Platte trennt die Paare um 0,4 bis 1,6 % und verschiebt jede Mode zufällig um bis zu ±1,5 %.

Ein Tamtam mit 1 m Durchmesser und 1,8 mm Dicke hat bis 12 kHz einige tausend Moden. Unter einer
Grenzfrequenz (450 Hz beim Tamtam) wird jede gerechnet, darüber wird zufällig ausgedünnt mit
einer Behaltewahrscheinlichkeit p ∝ 1/f, so bleiben pro kritischem Band ähnlich viele übrig. Eine
behaltene Mode steht für 1/p Moden: Ihr Ausgangsgewicht wächst mit 1/√p, ihr Anteil an der Dehnung
mit 1/p. Übrig bleiben etwa 760 Moden.

Die Form am Schlagpunkt ist J_m(λ r₀)·cos(mθ). Für große Argumente verliert die Potenzreihe der
Besselfunktion alle Stellen, dort gilt die asymptotische Form √(2/(πx))·cos(x − mπ/2 − π/4).
Abklingzeiten: T60 = 0,6 + 26 / (1 + f / 320 Hz) s beim Tamtam, also 20 s bei 100 Hz und 2,2 s bei
5 kHz. Der kleine Gong und der Buckelgong klingen kürzer.

## Nichtlinearität: Dehnung und Energiekaskade

Ab einer Auslenkung in der Größenordnung der Plattendicke dehnt sich die Mittelebene. Nach Berger
(1955) wirkt das als Spannung N = κ·E/(2(1−ν²))·⟨|∇w|²⟩, die jede Mode anhebt,
ω_k² = ω_k0² + N·k_k². Das allein gibt das Absinken der Tonhöhe beim Ausklingen.

Eine gehämmerte Platte ist aber nicht eben. Ihre Anfangsverformung w_i (je Seed zufällig, beim
Tamtam bis 1 mm, fallend mit 1/k) macht aus der Spannung eine Kraft auf jede Mode,
F_k ∝ −N(t)·k_k²·w_i,k. Weil N quadratisch in den Auslenkungen ist, enthält diese Kraft Summen- und
Differenzfrequenzen aller schwingenden Moden. So wandert Energie von den tief angeregten Moden
schrittweise nach oben: die Kaskade, die Chaigne, Touzé und Thomas (2005) an Gongs und Tamtams
gemessen und mit von-Kármán-Platten erklärt haben. Unterhalb einer Schwelle der Auslenkung passiert
fast nichts, darüber schwillt das hohe Schimmern nach dem Schlag an.

Die Modalbank rechnet diesen Term pro Sample und prüft die Energie: Die freie Platte kann nur
verlieren, also wird der Zustand zurückskaliert, falls die Energie über die Arbeit des Schlägels
steigen würde. κ ist angepasst (0,08 beim Tamtam, 0,004 beim Buckelgong, 0,01 beim kleinen Gong),
denn Bergers Näherung gilt für unverschiebliche Ränder, ein frei hängender Gong gibt in der Ebene
nach. Angepasst ist auch die Tiefe der Anfangsverformung (1 mm beim Tamtam, 1,5 mm beim Buckelgong,
1,2 mm beim kleinen Gong). Mehrfach tiefere Verformungen machen das Verfahren instabil. Sollte ein
Schlag doch einmal ungültige Werte liefern, rechnet der Gong ihn mit halber Dehnung neu.

Gemessen: Verhältnis der Energie über 2,5 kHz zur Energie unter 600 Hz, Tamtam, Seed 1, je 0,1 s:

| Zeit | velocity 0,2 | velocity 0,6 | velocity 1 |
| --- | --- | --- | --- |
| 0 bis 0,1 s | −63 dB | −60 dB | −56 dB |
| 0,3 bis 0,4 s | −68 dB | −61 dB | −32 dB |
| 0,9 bis 1,0 s | −72 dB | −35 dB | −24 dB |
| 1,3 bis 1,4 s | −79 dB | −29 dB | −24 dB |
| 2,0 bis 2,1 s | −85 dB | −31 dB | −24 dB |

Ein leiser Schlag bleibt dunkel und wird immer dunkler. Ein mittlerer blüht nach etwa einer
Sekunde auf, ein voller Schlag schon nach einer Drittelsekunde, und das Schimmern bleibt dann über
Sekunden hell. So hängt die Klangfarbe viel stärker von velocity ab als der Pegel.

## Presets

| Preset | Platte | Schlägel | Charakter |
| --- | --- | --- | --- |
| `tamtam` | 1 m, 1,8 mm, Schlag bei 18 bis 30 % des Radius | 400 g, weicher Filz, Kontakt 6,6 ms (velocity 0,2) bis 4,8 ms (1) | dunkler Anschlag, Schimmern blüht auf |
| `chau` | 64 cm, 2 mm, mit Buckel in der Mitte, Schlag auf den Buckel | 250 g, Kontakt 3,9 bis 2,8 ms | klarer Ton, sinkt nach hartem Schlag |
| `small` | 40 cm, 1,2 mm | 120 g, Kontakt 2,6 bis 1,9 ms | hell, kürzer, blüht schneller |

**Buckel.** Der gestimmte Gong hat in der Mitte eine steife flache Kuppel. Sie bekommt eigene
Moden bei 1 : 1,99 : 2,89 : 4,03 : 5,21 über dem Grundton, die viel länger klingen als die flache
Umgebung (11 s für den Grundton bei 150 Hz). Die Plattenmoden der Umgebung beginnen erst beim
1,25-fachen Grundton und sind leiser. Der Buckel nimmt an der Dehnung teil, hat aber keinen
Anfangsverformungsterm, denn der würde in der Modalbank auch die lineare Steifigkeit erhöhen und
den Grundton verstimmen. Gemessen bei MIDI 52: velocity 0,2 trifft die Stimmung auf 2 Cent (Raster der Messung), nach
einem vollen Schlag liegt der Ton in den ersten 0,3 s um 62 Cent höher, nach einer Sekunde noch
um 22 Cent, nach drei Sekunden wieder auf der Stimmung.

**Größe über `midi`.** Der Radius skaliert mit 2^(−(midi − ref)/24), die Dicke bleibt. Ein großer
Gong ist dann schwerer, und derselbe Schlag lenkt ihn relativ zur Dicke genauso weit aus wie den
kleinen. Darum bleibt das nichtlineare Verhalten über den ganzen Bereich gleich.

## Abdämpfen und Ränder

Zum Zeitpunkt `duration` legt die Hand auf: Die Dämpfung blendet über 40 ms ein, danach fällt der
Pegel mit τ = 120 ms. Ist `duration` länger als der Ausklang, endet die Note natürlich. Jede Note
beginnt und endet bei exakt null (8 Samples Einblendung, 80 ms Raised Cosine am Ende). Alle Moden
liegen unter 0,45·48 kHz, auch die Dehnung kann eine Mode nicht über 0,46·48 kHz schieben. Hochpass
30 Hz, Tiefpass 14 kHz runden nur ab.

## Pegel und Messwerte

Eine Pegeltabelle pro Preset in 4-Halbtonschritten gleicht die Größen an. Sie ist so gesetzt, dass
der lauteste von mehreren Seeds bei velocity 0,2, 0,6 und 1 etwa bei −3 dBFS liegt.

Prüfung mit frischen Seeds über jeden Halbton von 28 bis 76, velocity 0,2, 0,6 und 1:

| Preset | lautester Fall | größter Sprung | ungültige Werte | Gleichanteil (relativ) |
| --- | --- | --- | --- | --- |
| `tamtam` | −3,5 dBFS | 0,14 | 0 | unter 3·10⁻⁶ |
| `chau` | −3,5 dBFS | 0,04 | 0 | unter 2·10⁻⁶ |
| `small` | −3,0 dBFS | 0,05 | 0 | unter 10⁻⁶ |

Die größten Sprünge kommen von kleinen, hart angeschlagenen Platten (hohes `midi` beim Tamtam):
In den ersten 30 ms liegt dann ein Zehntel der Energie zwischen 5 und 15 kHz, ein heller Anschlag,
kein Knacken. Über 18 kHz liegt weniger als −58 dB der Energie.

Rechenzeit: Tamtam mit vollem Schlag und 26 s Ausklang 1,5 s, Buckelgong 10 s Ausklang 0,1 s,
kleiner Gong 0,3 s.

## Grenzen

* Plattenmoden aus Näherungsformeln, keine Rechnung der echten Gongform mit Rand und Wölbung.
* Die Berger-Näherung ersetzt die volle von-Kármán-Kopplung, κ ist angepasst, nicht hergeleitet.
* Ein Mikrofonpunkt, mono. Kein Raum.

## Quellen

* H. M. Berger: A new approach to the analysis of large deflections of plates. J. Appl. Mech. 22 (1955).
* A. Chaigne, C. Touzé, O. Thomas: Nonlinear vibrations and chaos in gongs and cymbals.
  Acoust. Sci. & Tech. 26 (2005).
* N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments. Springer 1998, Kapitel 20.
* A. W. Leissa: Vibration of Plates. NASA SP-160 (1969).
