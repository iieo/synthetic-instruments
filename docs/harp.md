# Konzertharfe

`instruments/harp.mjs` erzeugt eine Doppelpedalharfe mit 47 Saiten, ohne Samples. Jeder Ton
entsteht aus einem Wellenleitermodell der Saite, das ein Finger anzupft und das über den Steg einen
Resonanzkasten antreibt. Alle Werte der Saiten (Länge, Spannung, Durchmesser, Steifigkeit,
Dämpfung) werden aus einer kleinen physikalischen Tabelle berechnet, nicht von Hand pro Ton gesetzt.

Umfang: MIDI 24 bis 103 (C1 bis G7).

```js
import { render, meta } from './instruments/harp.mjs';
const x = render({ midi: 60, velocity: 0.8, duration: 3, seed: 1 }); // Float64Array, mono, 48 kHz
const dry = render({ midi: 48, velocity: 1, muted: true });         // étouffé
```

| Parameter | Bedeutung |
| --- | --- |
| `midi` | Tonhöhe, wird auf den Umfang begrenzt und gerundet. Ohne Angabe 60 |
| `velocity` | 0 bis 1, Kraft des Fingers: Lautstärke und Helligkeit |
| `duration` | Zeit in Sekunden, bis die Hand die Saite abdämpft. Danach folgt das kurze Abklingen unter der Hand |
| `seed` | kleine Streuung von Zupfstelle und Zupfrichtung, gleiche Werte ergeben exakt dasselbe Signal |
| `pluckPosition` | Zupfstelle als Anteil der Saitenlänge vom Steg aus, begrenzt auf 0,1 bis 0,9. Ohne Angabe 0,47 ± 0,025 |
| `muted` | Étouffé: die Saite wird nach 70 bis 100 ms von derselben Hand gestoppt |
| `sympathetic` | Mitschwingende Nachbarsaiten, Standard `true` |

Zahlen, die keine endlichen Zahlen sind, lösen einen Fehler mit dem Namen des Parameters aus. Der Puffer beginnt und endet exakt bei null. Ein Ton von 8 s in C1 rechnet etwa 0,1 s.

## Die Saiten

Die Harfe hat drei Saitenarten. Bis G2 (MIDI 43) sind es umsponnene Saiten mit Stahlkern, darüber
Darm, ab F6 (MIDI 89) Nylon. `instruments/harp/strings.mjs` legt für jede Saite die klingende
Länge fest (1,50 m bei C1, 0,64 m bei C4, 0,075 m bei G7, dazwischen geometrisch) und eine typische
Spannung (170 N im Bass, 95 N bei C4, 60 N ganz oben). Aus Frequenz, Länge und Spannung folgt die
Massenbelegung `mu = T / (2 L f0)^2`, mit der Dichte des Materials daraus der Durchmesser.

**Inharmonizität.** Eine steife Saite hat gestreckte Teiltöne
`f_k = k f0 sqrt(1 + B k^2)`. Der Koeffizient folgt aus der Biegesteifigkeit:
`B = pi^2 E I / (T L^2)` mit `I = pi d^4 / 64`. Bei umsponnenen Saiten trägt nur der Stahlkern
(halber Außendurchmesser, E = 200 GPa) zur Steifigkeit bei, die Umspinnung nur zur Masse. So
ergibt sich für C1 etwa B = 2,6e-4: der zehnte Teilton liegt rund 24 Cent zu hoch. In der Mitte
liegt B bei 3e-5 bis 5e-5 (Darm, E = 3,5 GPa), in der kurzen Nylonlage ganz oben wieder höher.

**Dämpfung.** Die Abklingrate eines Teiltons bei der Frequenz f ist die Summe aus vier Anteilen,
nach dem Modell von Valette:

1. Luftreibung an einem schwingenden Zylinder (Stokes), abhängig von Durchmesser und f.
2. Viskoelastischer Verlust beim Biegen: Verlustwinkel des Materials mal dem Anteil der
   Biegeenergie `E I w^2 mu / T^2`. Wirkt vor allem auf hohe Teiltöne steifer Saiten.
3. Innere Reibung mit konstantem Gütefaktor (Fasern im Darm, Umspinnung bei Drahtsaiten). Sie
   macht Darm in den Höhen schnell dumpf, Draht dagegen klingt lange hell.
4. Abgabe an den Resonanzboden über den Steg. Für eine verlustfreie Saite an einem Ende mit der
   Admittanz Y gilt `sigma = T Re(Y) / L`. Dieser Anteil ist für alle Teiltöne gleich und macht
   kurze Saiten schnell leise.

Damit ergibt sich die Nachhallzeit T60 der Grundschwingung in der stark gekoppelten Polarisation
zu rund 12 s bei C1, 4,4 s bei C4 und 0,7 s bei G7, ohne dass ein Wert pro Register von Hand
eingestellt ist. Die schwach gekoppelte Polarisation klingt länger (siehe unten).

## Wellenleiter

`instruments/harp/waveguide.mjs` ist eine Saite mit einer einzigen Verzögerungsschleife. In der
Schleife liegen:

- eine ganzzahlige Verzögerungsleitung,
- ein einpoliges Verlustfilter `g (1 - a) / (1 - a z^-1)`, dessen Betrag bei f0 und bei einer
  hohen Frequenz genau den Verlust pro Umlauf `exp(-sigma(f) / f0)` aus dem Dämpfungsmodell trifft,
- bis zu sechs gleiche Allpässe erster Ordnung für die Dispersion. Ihr Koeffizient wird per
  Bisektion so gesucht, dass ein höherer Teilton (k = 12, oben weniger) genau auf
  `k f0 sqrt(1 + B k^2)` liegt,
- ein Allpass erster Ordnung für den Bruchteil der Länge.

Alle drei Filter verzögern auch. Ihre Phasenlaufzeit bei f0 wird exakt berechnet und von der
Periode abgezogen, die ganzzahlige Leitung bekommt den Rest. Der Koeffizient des Bruchteil-Allpasses
wird ebenfalls bei f0 gelöst und nicht mit der Näherung für tiefe Frequenzen gesetzt. Gemessen
liegt der Grundton aller Saiten innerhalb von 1 Cent (der Rest kommt von der zweiten Polarisation,
siehe unten).

**Zwei Polarisationen.** Die Hand zieht die Saite quer zur Saitenebene, also etwa parallel zur
Decke. Diese Schwingung bewegt den Boden kaum und klingt lange. Die Schwingung in der Saitenebene
drückt auf den Boden, strahlt stark ab und klingt schneller ab. Beide laufen als eigene Schleifen
mit Admittanz 5e-3 und 5e-4 m/(N s), 0,6 Cent und 20 % Steifigkeit auseinander. Der Finger
verteilt die Energie nach einem Zupfwinkel von 18 bis 32 Grad. Das ergibt den typischen
zweistufigen Ausklang und eine langsame Schwebung der Obertöne.

## Anzupfen mit dem Finger

`instruments/harp/excitation.mjs`. Die Saite wird von der Fingerkuppe ausgelenkt und losgelassen.
Für eine ruhende Anfangsform `u0(x)` ist die Kraft am Steg über eine Periode `T u0'(c t)` für
`c t` von 0 bis L und `T u0'(2L - c t)` danach. Für eine Dreiecksform ist das eine Rechteckwelle,
deren Tastverhältnis die Zupfstelle ist. Harfenisten zupfen etwa in der Mitte der Saite, darum
fehlen die geraden Teiltöne weitgehend (bei genau 0,5 ganz).

Die Fingerkuppe ist breit (8 mm Auflage). Die Ecke des Dreiecks ist deshalb über diese Breite
gerundet, was auf den kurzen Saiten oben einen großen Teil der Länge ausmacht. Beim Loslassen
rutscht die Saite über die Haut. Das wirkt wie ein Tiefpass zweiter Ordnung, dessen Grenzfrequenz
mit der Anschlagstärke und mit der Tonhöhe steigt, und ein Anstieg von höchstens 0,5 ms. Die Kraft
der Saite am Steg hängt bei gleicher Fingerkraft nicht von der Saite ab (Auslenkung proportional
zu L / T), deshalb ist die Anregung über den Umfang fast gleich laut. Unter dem Finger ist die
Auslenkung bei gleicher Kraft `F β (1 − β) L / T`. Wer nahe am Steg oder nahe am oberen Ende zupft,
lenkt die Saite also weniger aus. Ohne diesen Faktor wäre ein Zupfen bei 0,1 rund 12 dB lauter als
in der Mitte, weil die Stegkraft dort eine schmale, hohe Rechteckspitze bekommt. Mit ihm bleibt die
lauteste Saite über den ganzen Bereich von `pluckPosition` bei Anschlag 1 um −3 dBFS. Ein sehr leises, kurzes
Rauschen von 4 ms steht für die Haut auf der Saite.

## Resonanzkasten

`instruments/harp/body.mjs`. Der Kasten der Harfe ist lang, schmal und nach oben verjüngt, mit
Schalllöchern auf der Rückseite. Er strahlt unterhalb von etwa 100 Hz schlecht ab, die
Grundtöne der tiefsten Saiten sind deshalb schwächer als ihr zweiter und dritter Teilton. Das
Modell ist ein modales Filter: die Stegkraft treibt elf gedämpfte Resonatoren zwischen 96 Hz und
990 Hz (Luftraum und erste Biegemoden der Decke, Güte 9 bis 30) und eine feste, pseudozufällige
Reihe schwächerer, dichterer Moden bis 7 kHz für die Holzfärbung. Dazu kommt ein direkter Anteil
mit einem Hochpass zweiter Ordnung bei 110 Hz. Lage und Güte der Moden sind eigene Annahmen im
Bereich der in der Literatur berichteten Messungen, keine gemessenen Daten einer bestimmten Harfe.

## Mitschwingende Saiten

Auf einer Harfe sind fast immer alle Saiten frei. Die Oktave darunter und darüber, die Quinte und
die Duodezime werden über den Boden angeregt. Jede ist eine eigene, einfache Schleife ohne
Dispersion, getrieben von der Stegkraft mal 0,01 und mit demselben Faktor zurück in die Stegkraft.
Nach einer Sekunde liegt ihr Anteil 32 bis 38 dB unter dem Ton in der Mitte und im Bass. Oben, wo
die gezupfte Saite schnell verklingt, ist er stärker.

## Abdämpfen und Étouffé

Wenn `duration` abgelaufen ist, legt sich die Hand auf die Saite. In 20 ms steigt der Verlust pro
Umlauf so weit, dass T60 nur noch 0,12 bis 0,35 s beträgt, und der Pol des Verlustfilters wandert
nach oben, weil die weiche Haut die Höhen zuerst schluckt. Bei `muted: true` passiert das schon
nach 70 bis 100 ms mit T60 = 50 ms. Zusätzlich gibt die Handfläche einen dumpfen Stoß aus
tiefpassgefiltertem Rauschen in den Boden. Das ergibt den trockenen, kurzen Klang des Étouffé.

## Demo

`node demos/harp.mjs` schreibt `out/harp.wav` (27,7 s, Stereo, 172 Töne, Rechenzeit einige Sekunden):

1. Arpeggien über vier Akkorde, auf und ab gerollt, jede Saite klingt bis zum Akkordwechsel.
2. Glissando über die C-Dur-Stimmung von G1 bis D7 und zurück in die Mitte.
3. Melodie in a-Moll mit Oktavbässen und leisen gebrochenen Akkorden in der Mitte.
4. Eine kurze Figur im Étouffé.
5. Ein großer, gerollter C-Dur-Akkord über fast den ganzen Umfang.

Tiefe Saiten stehen links, hohe rechts. Ein kleiner Raum (`instruments/harp/room.mjs`,
Rückkopplungsnetz aus acht Verzögerungen mit Householder-Matrix, T60 1,7 s) liegt leise darunter.
Normiert auf −3 dBFS Spitze, integrierte Lautheit −19,6 LUFS, größter Sprung von Sample zu Sample
0,15 bei einem Spitzenwert von 0,71. Keine Sättigung auf dem Summenbus.

## Vergleich mit einer Referenz

Als Vergleich dienten Einzeltöne des General-MIDI-Programms 47 (Orchesterharfe) aus einer frei
lizenzierten Soundfont. Gemessen wurden Stimmung, Anstieg, Abklingzeit (Abfall um 30 dB) und spektraler
Schwerpunkt in den ersten 300 ms.

| MIDI | t30 Referenz | t30 Modell | Schwerpunkt Referenz | Schwerpunkt Modell |
| --- | --- | --- | --- | --- |
| 48 | 2,7 s | 5,5 s | 371 Hz | 194 Hz |
| 60 | 2,0 s | 2,3 s | 263 Hz | 446 Hz |
| 67 | 1,6 s | 2,0 s | 395 Hz | 476 Hz |
| 72 | 1,3 s | 1,5 s | 548 Hz | 616 Hz |
| 79 | 1,2 s | 1,1 s | 853 Hz | 859 Hz |
| 91 | 0,2 s | 0,7 s | 2953 Hz | 1629 Hz |

In der Mitte stimmen Abklingen und Klangfarbe gut überein. Im Bass klingt das Modell länger als
die Referenz, deren Samples dort eine kurze Hüllkurve haben. Eine echte Harfe muss gerade die
Drahtsaiten aktiv abdämpfen, darum bleibt das Modell hier bei der Physik. Ganz oben ist die
Referenz heller und kürzer. Die Stimmung des Modells liegt bei allen Saiten zwischen +0,1 und
+0,7 Cent.

## Grenzen

- Die Längen, Spannungen und Moduln der Saiten sind typische Werte, keine Maße eines bestimmten
  Instruments. Die Steifigkeit von Darm schwankt in der Literatur stark.
- Der Resonanzkasten ist ein festes modales Filter. Er hängt nicht davon ab, wo auf der Decke die
  Saite sitzt, obwohl die Admittanz entlang der Decke stark wechselt.
- Keine Nichtlinearität der Saite (Spannungsmodulation, Längswellen) und kein Schnarren an Pedal-
  oder Halteklammern, kein Nachklingen beim Pedalwechsel.
- Die mitschwingenden Saiten sind fest gewählt (Oktaven, Quinte, Duodezime) und nicht nach der
  tatsächlichen Pedalstellung.

## Quellen

- K. Karplus, A. Strong: Digital synthesis of plucked-string and drum timbres. Computer Music
  Journal 7(2), 1983.
- D. A. Jaffe, J. O. Smith: Extensions of the Karplus-Strong plucked-string algorithm. Computer
  Music Journal 7(2), 1983 (Allpass für Bruchteile der Länge, Dämpfungsfilter).
- J. O. Smith: Physical Audio Signal Processing. Online-Buch, CCRMA Stanford (Wellenleiter,
  Phasenlaufzeit, Allpässe für Dispersion).
- V. Välimäki, J. Huopaniemi, M. Karjalainen, Z. Jánosy: Physical modeling of plucked string
  instruments with application to real-time sound synthesis. Journal of the Audio Engineering
  Society 44(5), 1996.
- C. Valette: The mechanics of vibrating strings. In: A. Hirschberg, J. Kergomard, G. Weinreich
  (Hrsg.), Mechanics of Musical Instruments, Springer 1995 (Luftreibung, viskoelastische Verluste).
- A. Chaigne, J. Kergomard: Acoustics of Musical Instruments. Springer 2016 (Saitendämpfung,
  Kopplung Saite und Steg).
- N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments. 2. Aufl., Springer 1998
  (gezupfte Saite, Spektrum nach Zupfstelle, Harfe).
- I. M. Firth: On the acoustics of the harp. Acustica 37, 1977 (Resonanzkasten, Abstrahlung).
- J.-L. Le Carrou, F. Gautier, R. Badeau: Sympathetic string modes in the concert harp. Acta
  Acustica united with Acustica 95, 2009 (mitschwingende Saiten).
- H. Fletcher: Normal vibration frequencies of a stiff piano string. Journal of the Acoustical
  Society of America 36(1), 1964 (Inharmonizität `sqrt(1 + B k^2)`).
