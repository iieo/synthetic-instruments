# Mundharmonika und Akkordeon (Durchschlagzungen)

`instruments/harmonica.mjs` erzeugt eine diatonische Mundharmonika mit zehn Kanälen in
Richter-Stimmung. `instruments/accordion.mjs` nutzt denselben Zungenkern für ein
Piano-Akkordeon mit Musette-Diskant und Stradella-Bass. Es gibt keine Samples. Jeder Ton
entsteht aus einer Simulation der schwingenden Messingzunge, des Luftstroms durch ihren
Schlitz und der kleinen Luftkammer davor.

```js
import { render } from './instruments/harmonica.mjs';
const x = render({ midi: 71, velocity: 0.8, duration: 1.2, bend: -1 }); // Float64Array, mono, 48 kHz
```

Umfang der Mundharmonika: MIDI 55 bis 98 in C, mit `key` um dieselbe Zahl Halbtöne verschoben.
Ohne `key` ist das Instrument in C gestimmt (Kanal 1 Blasen ist C4). Töne außerhalb des Umfangs
werden auf seinen Rand gesetzt. Ein Aufruf ohne Argumente spielt C4 mit Velocity 0,8. Ungültige
Werte (keine endliche Zahl, unbekannter Vibrato-Typ, leeres Array) lösen einen Fehler mit dem
Namen des Parameters aus. Der Puffer enthält nach `duration` noch das Ausschwingen. Gleiche
Parameter ergeben exakt dasselbe Signal.

## Parameter

| Parameter | Bedeutung |
|---|---|
| `midi` | Tonhöhe, Standard 60, oder ein Array für einen Akkord aus mehreren Kanälen |
| `velocity` | Atemdruck, 0 bis 1, abgebildet auf 120 bis 1020 Pa im Mund |
| `duration` | Dauer des Anblasens in Sekunden |
| `bend` | Zahl (Halbtöne, negativ): der Ton wird in etwa 0,15 s heruntergezogen, bei sehr kurzen Tönen in 0,06 s. Oder Stützpunkte `[[t, halbtöne], ...]` für freie Kurven |
| `vibrato` | `true`, eine Tiefe 0 bis 1, oder `{ rate, depth, type }` mit `type` `'throat'`, `'hand'` oder `'both'` |
| `wah` | Handmuschel, 0 offen bis 1 geschlossen, als Zahl oder Stützpunkte; Werte außerhalb werden begrenzt |
| `key` | MIDI-Ton von Kanal 1 Blasen (Tonart des Instruments), Standard 60, erlaubt 48 bis 72 |
| `draw` | erzwingt Ziehen (`true`) oder Blasen (`false`); sonst aus der Belegung |
| `attack` | Anstiegszeit des Atemdrucks in Sekunden; kurz wirkt wie Zungenstoß |
| `breathiness` | 0 bis 1, mehr Atemrauschen (für Zug-Rhythmen) |

## Physik der Durchschlagzunge

Eine Zunge ist ein dünnes Messingplättchen, an einem Ende auf die Stimmplatte genietet. Ihr
freies Ende schwingt durch einen passgenauen Schlitz, ohne ihn zu berühren. Anders als beim
Klarinettenblatt bestimmt die Zunge selbst die Tonhöhe, denn sie ist steif und schwach
gedämpft. Den Klang erzeugt nicht die Zunge als Fläche, sondern der Luftstrom, den sie
periodisch freigibt und absperrt (Fletcher und Rossing 1998, Kap. 13; Ricot, Caussé und
Misdariis 2005).

### 1. Zunge

Die Zunge ist ein eingespannter Biegebalken. Für die erste Mode gelten die bekannten Werte des
Euler-Bernoulli-Balkens: Die auf die Spitze bezogene effektive Masse ist 0,243 der Balkenmasse,
die wirksame Druckfläche 0,391 der Zungenfläche. Die zweite Mode liegt beim 6,27-fachen der
Grundfrequenz. Sie wird mit simuliert und verändert die Öffnung nur leicht.

Die Geometrie folgt der Tonhöhe: Bei C4 ist die Zunge 15,5 mm lang und 2,4 mm breit, zu hohen
Tönen hin kürzer und etwas schmaler. Die Dicke ergibt sich aus der Balkenformel mit
E = 100 GPa und ρ = 8500 kg/m³ für Messing. Die Güte der Zunge allein liegt bei 120. Dazu kommt
ein quadratischer Luftwiderstand der schwingenden Spitze.

### 2. Öffnung und Luftstrom

Die Spitze ruht etwas über dem Schlitz (Aufbiegung, bei C4 0,55 mm, hoch oben weniger).
Solange sie im Schlitz steckt, ist nur der Spalt von 25 µm offen. Taucht sie aus, öffnen sich
Spitze und beide Flanken. Die Flankenöffnung ist ein Dreieck, weil die Zunge an der Einspannung
nicht ausschlägt. Die Kanten des 0,95 mm dicken Schlitzes sind abgerundet, damit die Öffnung
keinen Knick hat.

Der Fluss durch den Schlitz folgt der instationären Bernoulli-Gleichung: Druckdifferenz gleich
Trägheit des Luftpfropfens im Schlitz plus quadratischer Austrittsverlust mit einer
Strahleinschnürung von 0,7. Weil die Öffnung pro Periode zweimal fast schließt, ist der Fluss
pulsförmig und reich an Obertönen. Der abgestrahlte Schall ist die zeitliche Ableitung des
Volumenflusses, wie bei jeder kleinen Quelle.

### 3. Kammer, Blas- und Ziehzunge

Jeder Kanal hat eine kleine Kammer (3,6 × 4,4 × 17 mm). Die Luft der Lippen füllt sie über die
Trägheit der Lippenöffnung, die Zungen leeren sie. Kammer und Schlitzpfropfen bilden eine
Helmholtz-Resonanz weit über dem Hörbereich. Deshalb wird der Kammerdruck zusammen mit allen
Flüssen implizit gelöst. Auch die Bewegung der Zungen verdrängt Luft in der Kammer.

In jeder Kammer sitzen zwei Zungen. Die Blaszunge liegt innen und wird beim Blasen in ihren
Schlitz gedrückt (schließende Zunge). Die Ziehzunge liegt außen und schließt beim Ziehen. Die
jeweils andere Zunge wird vom selben Druck aufgedrückt, lässt Luft vorbei und schwingt mit dem
Kammerdruck mit. Angeblasen wird sie nicht. Einen Luftstrahl, der eine Zunge antreibt, gibt es
nur im Schlitz einer Zunge, die der Atem zudrückt. Kippt der Kammerdruck kurz in die andere
Richtung, bekommt die zweite Zunge deshalb keinen Antrieb. Bei Tönen, die nicht in der
Richter-Belegung liegen, sitzt die zweite Zunge einen Ganzton tiefer, wie bei einem Paar aus
der Mittellage. Das Modell rechnet beide Zungen aus. Wie stark die zweite Zunge mitschwingt,
ergibt sich von selbst, und es nimmt zu, je näher der gebendete Ton ihrer Eigenfrequenz kommt.
Das ist der Mechanismus, den Johnston (1987) und Bahnson, Antaki und Beery (1998) für das
Benden beschreiben.

### 4. Anregung

Eine schließende Durchschlagzunge schwingt auch ohne akustischen Resonator. Ricot und Kollegen
(2005) zeigen, dass die Trägheit des gedrosselten Schlitzstroms gegenüber der Zunge nacheilt und
so Energie zuführt; St. Hilaire, Wilson und Beavers (1971) hatten das schon für die
Harmoniumzunge beschrieben. Wir bilden diesen Effekt als negative Dämpfung nach, die mit der
Strahlgeschwindigkeit wächst (also mit der Wurzel der Druckdifferenz). Ablösung und
Wirbelverluste wachsen mit dem Ausschlag und begrenzen die Amplitude. Zusammen hat das die Form
eines Van-der-Pol-Terms um die statisch ausgelenkte Ruhelage. Der Ausschlag liegt dann bei 1 bis
2 mm, die Zunge taucht in jeder Periode ganz durch den Schlitz. Der einsetzende Luftstrahl
stößt die Zunge zu Beginn leicht an. Ohne Anblasdruck gibt es keinen Strahl: Unter 40 Pa geht die
Anregung gegen null, sonst hielte sich die Zunge nach dem Absetzen am selbst gepumpten Kammerdruck
am Leben.

Diese Anregung ist ein effektives Modell, keine Strömungssimulation. Alles andere (Öffnung,
Fluss, Kammer, zweite Zunge, Abstrahlung) ist direkt aus der Physik gerechnet.

### 5. Stimmung

Eine Durchschlagzunge klingt etwas tiefer als ihre Eigenfrequenz, und zwar umso tiefer, je
stärker man bläst. Das Modell zeigt das auch: Zwischen leisem und hartem Spiel sinkt der
Ton in der Mitte um bis zu 30 Cent, in hohen Kanälen kaum. Wie ein Stimmer gleicht `render` das bei mittlerer Lautstärke aus. Ein kurzer
Probelauf misst die Tonhöhe, ein Sekantenschritt auf der Eigenfrequenz korrigiert sie. Das
Ergebnis wird zwischengespeichert. Über den ganzen Umfang liegen die Töne danach innerhalb von
3 Cent.

### 6. Benden, Vokaltrakt und Hände

Beim Benden stimmt der Spieler seinen Vokaltrakt knapp unter den Zungenton. Die Last des
Vokaltrakts zieht die Zunge nach unten, bei Ziehbendings mit der Blaszunge als zweitem Partner
(Johnston 1987; Bahnson und andere 1998). Den Vokaltrakt simulieren wir nicht als Rohr. Seine
Netto-Wirkung auf die klingende Zunge geht als verringerte effektive Steifigkeit ein. Die
Partnerzunge im selben Kanal reagiert darauf physikalisch. Dazu kommt ein Formant auf dem
gebendeten Grundton, der den Ton dunkler und vokaler macht. Mit `bend: -1` landet
Kanal 4 Ziehen 100 bis 105 Cent tiefer.

Die Hände formen eine Muschel um das Instrument. Geschlossen wirkt sie als resonanter Tiefpass
um 500 Hz und macht den Ton leiser. Offen wirkt sie nicht. `wah` blendet zwischen beiden.
Handvibrato bewegt diese Muschel periodisch, Kehlvibrato moduliert den Atemdruck. Tonhöhe und
Klangfarbe folgen dann über die Zunge.

Atemrauschen ist bandbegrenzte Turbulenz, die mit dem Quadrat des Flusses wächst. Die
Deckplatten und der Abstand dämpfen über 6,5 kHz ab, damit hohe Kanäle nicht schrill werden.

## Akkordeon

`instruments/accordion.mjs` nimmt `midi`, `velocity`, `duration`, `seed`, `bend` (nur als Zahl),
`vibrato` und `attack` wie die Mundharmonika, dazu `voice` und `chord`. Umfang: MIDI 40 bis 93,
Töne außerhalb werden auf den Rand gesetzt. Ohne Argumente klingt C4 in Musette. Ein unbekannter
Wert für `voice` oder `chord` löst einen Fehler aus.

- `voice: 'musette'` (Standard): drei Diskantzungen pro Ton, eine sauber und zwei um −15 und
  +15 Cent verstimmt. Daraus kommt die typische Schwebung.
- `voice: 'bass'`: ein Bassknopf, Grundton und Oktave.
- `voice: 'chord'` mit `chord` `'maj'`, `'min'`, `'7'` oder `'dim'`: ein Akkordknopf, Dreiklang auf
  zwei Chören.

Jede Akkordeonzunge sitzt in einer eigenen Zelle, denn ein Lederventil sperrt die Zunge der
Gegenrichtung. Die Zungen sind länger, die Platten dicker (1,6 mm) und der Balgdruck liegt bei
180 bis 1280 Pa. Stimmstock, Klappenlöcher und Gitter geben eine leichte Resonanz im
Mittenbereich und einen weichen Höhenabfall. Balgvibrato moduliert den Druck. Beim Loslassen
schließt die Klappe auch das Tonloch, deshalb wird der Ausklang mit ihr abgeblendet.

## Messungen

Zum Vergleich dienten Einzeltöne einer frei lizenzierten General-MIDI-Soundfont (Programm 23
Mundharmonika, 22 Akkordeon). Sie sind nicht im Repository.

- Tonhöhe: Einzeltöne über den ganzen Umfang (MIDI 55 bis 98) bei Velocity 0,2, 0,6 und 1
  innerhalb von 2,5 Cent.
- Obertöne bei C4: Modell 0 / −2 / −0 / −17 / −13 dB für die ersten fünf Teiltöne, Referenz
  0 / −7 / −9 / −23 / −15 dB. Der spektrale Schwerpunkt liegt beim 1,7- bis 2,5-fachen der
  Grundfrequenz, bei der Referenz beim 2,1- bis 2,6-fachen. Das Modell ist also leicht dunkler.
- Einschwingen auf 90 %: 25 bis 40 ms in der Mitte und Höhe (Referenz 15 bis 50 ms), bei C4 etwa
  100 ms.
- Demo `out/harmonica.wav` (20 s, Blues in G auf einer C-Harp): Spitze −3,0 dBFS, maxJump 0,11,
  −19,4 LUFS. Rechenzeit etwa 5 s.
- Demo `out/accordion.wav` (16 s, Musette-Walzer in a-Moll): Spitze −3,0 dBFS, maxJump 0,10,
  −19,1 LUFS. Rechenzeit etwa 13 s.

Gerechnet wird mit vierfacher Überabtastung (192 kHz) und einem Fenster-Sinc-Tiefpass zum
Heruntertakten. Die Ausgabe wird weder gesättigt noch begrenzt; Ein- und Ausklang enden exakt
bei null.

## Grenzen

- Die Anregung ist ein effektiver Term, abgeleitet aus den Messungen und Erklärungen der Literatur,
  keine Strömungsrechnung.
- Der Vokaltrakt ist kein simuliertes Rohr. Benden ist daher nicht auf die Intervalle zwischen
  Blas- und Ziehzunge begrenzt, wie es beim echten Instrument der Fall ist. Overblows gibt es
  nicht.
- Die Lautstärke wird pro Ton auf einen Zielpegel gebracht. Die Klangfarbe hängt vom Druck ab,
  der Pegel nur über eine einfache Kurve. Liegt der Einsatz oder ein Bending weit über dem
  gehaltenen Pegel, wird der ganze Ton leiser gesetzt, damit seine Spitze höchstens das Fünffache
  des Zielpegels erreicht. Für Akkorde gilt dieselbe Grenze wie für den Einzelton. Der lauteste
  Ton oder Akkord bei Velocity 1 liegt so bei etwa −3 dBFS.
- Bei tiefen Tönen ist das Einschwingen langsamer als bei der Referenz.

## Quellen

- N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments, 2. Aufl., Springer 1998,
  Kap. 13 (Rohrblätter und Durchschlagzungen).
- D. Ricot, R. Caussé, N. Misdariis: Aerodynamic excitation and sound production of blown-closed
  free reeds without acoustic coupling: The example of the accordion reed. J. Acoust. Soc. Am.
  117 (2005), 2279-2290.
- A. O. St. Hilaire, T. A. Wilson, G. S. Beavers: Aerodynamic excitation of the harmonium reed.
  J. Fluid Mech. 49 (1971), 803-816.
- R. B. Johnston: Pitch control in harmonica playing. Acoustics Australia 15 (1987), 69-75.
- H. T. Bahnson, J. F. Antaki, Q. C. Beery: Acoustical and physical dynamics of the diatonic
  harmonica. J. Acoust. Soc. Am. 103 (1998), 2134-2144.
- Balkenwerte (Eigenwerte 1,875 und 4,694, Modalmasse): Standardlösung des
  Euler-Bernoulli-Kragbalkens, etwa in jedem Lehrbuch der Strukturdynamik.
