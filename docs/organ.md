# Pfeifenorgel

`instruments/organ.mjs` erzeugt eine Kirchenorgel mit einigen typischen Registern. Es gibt keine
Samples. Jede Pfeife ist ein kleines physikalisches Modell: Wind, Kernspalt mit Luftband
(Lippenpfeifen) oder schlagende Zunge (Zungenpfeifen), dazu ein Resonator als digitaler
Wellenleiter. Der Kirchenraum im Demo ist ein selbst geschriebener algorithmischer Hall.

Umfang Manual: MIDI 36 bis 96 (C bis c''''). Pedalregister klingen eine Oktave tiefer als die
Taste, wie bei echten 16'-Registern.

```js
import { render, meta } from './instruments/organ.mjs';
const x = render({ midi: 60, duration: 2, stops: ['principal8', 'octave4'] }); // Float64Array, mono, 48 kHz
```

`duration` ist die Zeit, die die Taste gehalten wird. Danach folgt das kurze Ausschwingen der
Pfeifen. `velocity` skaliert nur den Pegel, denn eine Orgel ist nicht anschlagsdynamisch (man kann
es wie einen Schwellkasten verwenden). Gleiche Parameter ergeben exakt dasselbe Signal.

`midi` ist ohne Angabe 60 und wird auf ganze Halbtöne im Umfang 36 bis 96 begrenzt, `duration` auf
mindestens 0,02 s. `stops` ist eine Liste von Registernamen (ein einzelner Name als Text geht auch,
ohne Angabe klingt `principal8`). Ein doppelt genanntes Register klingt nur einmal, denn es ist
dieselbe Pfeifenreihe. Eine leere Liste oder ein unbekannter Name ergibt einen Fehler, ebenso eine
Zahl, die nicht endlich ist. Ohne gezogenes Register gibt eine Orgel keinen Ton, ein stilles Signal
würde den Fehler nur verstecken.

## Register

| Name | Bauart | Fußton | Charakter |
|---|---|---|---|
| `principal8` | offene Lippenpfeife | 8' | Grundregister, alle Teiltöne, kräftige Oktave |
| `gedackt8` | gedeckte Lippenpfeife | 8' | weich, flötig, fast nur ungerade Teiltöne, deutlicher Vorläufer |
| `octave4` | offen | 4' | Prinzipal eine Oktave höher |
| `superoctave2` | offen | 2' | Prinzipal zwei Oktaven höher |
| `mixture` | offen, vierfach | 1 1/3' | Ränge auf 2 2/3', 2', 1 1/3', 1' mit Repetitionen |
| `trumpet8` | Zungenpfeife, konischer Becher | 8' | Trompete |
| `subbass16` | gedeckt, weit | 16' | Pedalbass |
| `trombone16` | Zungenpfeife | 16' | Pedalposaune |

Die Mischung repetiert: Ein Rang, der über g''' (MIDI 91) steigen würde, springt eine Oktave
zurück, aber nie unter die 4'-Lage. So bleibt der Glanz im Diskant erträglich, wie bei echten
Mixturen.

## Lippenpfeife

### Wind und Ventil

Wenn die Taste das Ventil (die Kanzelle) öffnet, steigt der Druck im Pfeifenfuß nicht sofort,
sondern über einige Millisekunden, große Pfeifen langsamer als kleine. Nach dem Anstieg gibt es
einen kleinen Überschwinger, weil sich das Fußvolumen durch das Fußloch füllt und dabei wie ein
schwach gedämpftes System zweiter Ordnung reagiert. Nach dem Loslassen fällt der Druck in etwa
6 ms ab. Nolle und Finch haben gezeigt, dass die Anstiegszeit des Drucks den Einschwingvorgang
der Pfeife stark prägt [3].

Der Wind ist nie ganz ruhig. Balg und Regler schwanken langsam. Das Modell legt einige
Teilschwingungen zwischen 1 und 7 Hz mit ±0,4 % Druckschwankung darüber. Der Druck verändert die
Strahlgeschwindigkeit (proportional zu √p) und damit leicht Pegel und Tonhöhe.

### Luftband und Labium

Aus der Kernspalte tritt ein flaches Luftband aus, das vom Schallfeld im Aufschnitt hin und her
ausgelenkt wird und an der Oberlippe geteilt wird. Der Volumenfluss, der in die Pfeife gelangt,
ist eine sättigende Funktion der Auslenkung, weil das Strahlprofil eine endliche Breite hat [1, 5]:

```
Q(t) ∝ tanh((a(t) · sin φ − y0) / b)
```

`b` ist die halbe Breite des Strahls, `y0` der Versatz zwischen Strahlmitte und Lippe und `a` die
Auslenkung. Ein großer Versatz macht die Flusspulse asymmetrisch und erzeugt gerade Teiltöne.
Eine starke Auslenkung relativ zu `b` macht den Fluss fast rechteckig und damit obertonreich.
Die Auslenkung `a` wächst mit der Ansprache der Pfeife (Zeitkonstante etwa 12 ms plus 5 Perioden).
Deshalb beginnt der Ton fast sinusförmig und wird erst im eingeschwungenen Zustand voll.

### Ansprache: Vorläufer, Spuckgeräusch, Windrauschen

Bevor das Luftband auf den Grundton einrastet, schwingt es oft in der zweiten Mode der Pfeife.
Man hört kurz die Oktave, dann übernimmt der Grundton [2, 3]. Das Modell speist dafür einen
kurzen Anteil bei 2 f0 ein, der nach etwa einem Drittel der Ansprechzeit sein Maximum hat und
dann verschwindet. Dazu kommt Turbulenzrauschen im Strahl: ein Stoß beim Anblasen (Spucken,
englisch chiff), beim Gedackt stärker als beim Prinzipal, und ein leiser Dauerbestandteil. Das
Rauschen läuft durch den Resonator und wird dort zu schmalen Bändern um die Teiltöne, so wie
das Blasgeräusch einer echten Pfeife. Ein kleiner Teil wird direkt am Aufschnitt abgestrahlt.

### Resonator

Der Pfeifenkörper ist ein digitaler Wellenleiter [6]: eine Verzögerungsleitung, die den
Umlauf der Druckwelle enthält, mit einem Tiefpass für Abstrahl- und Wandverluste.

- Offene Pfeife: Reflexion −1 an beiden Enden, also Schleifenvorzeichen +1. Resonanzen bei allen
  ganzzahligen Vielfachen von f0.
- Gedeckte Pfeife: +1 am Deckel, −1 am Aufschnitt, Schleifenvorzeichen −1 bei halber Länge.
  Resonanzen nur bei ungeraden Vielfachen. Die geraden Teiltöne fallen auf Antiresonanzen und
  werden um etwa 45 dB abgesenkt. Ein kleiner Rest kommt über die direkte Abstrahlung am
  Aufschnitt, deshalb liegt die zweite Harmonische des Gedackts bei etwa −45 dB statt bei null.

Die Schleifenverstärkung folgt aus einer Güte Q von 30 bis 40, wie sie für Orgelpfeifen typisch
ist [1]. Daraus ergibt sich die Abklingzeit nach dem Loslassen: bei c' etwa 0,3 s bis −60 dB,
bei C entsprechend länger. Die Phasenverzögerung des Schleifentiefpasses wird von der Länge
abgezogen, damit die Pfeife sauber gestimmt ist.

Der abgestrahlte Schalldruck ist bei tiefen Frequenzen proportional zur zeitlichen Ableitung des
Volumenflusses. Ein teilweiser Differenzierer (`tilt`) bildet das nach.

### Mensur und Stimmung

Jede Pfeife ist ein eigenes Objekt. Aus Register, Rang und Tonhöhe wird ein fester Zufallswert
gebildet, der die Verstimmung (±2 Cent), den Pegel (±0,5 dB), die Strahlauslenkung (±5 %) und
den Lippenversatz (±20 %) setzt. Dieselbe Pfeife klingt also bei jedem Anschlag gleich, aber
verschiedene Pfeifen unterscheiden sich wie in einer echten Orgel. Weil die Ränge eines
Plenums nie exakt gleich gestimmt sind, schweben sie leicht gegeneinander. Das ergibt den
Chorklang einer großen Orgel. Diskantpfeifen sind etwa 1,2 dB pro Oktave leiser intoniert.

## Zungenpfeife

Eine Messingzunge schlägt gegen die offene Fläche der Kehle. Die Zunge schwingt auf ihrer eigenen
Frequenz, die mit der Stimmkrücke eingestellt wird, und bestimmt die Tonhöhe [1, 7]. Der Spalt
zwischen Zunge und Kehle ist

```
h(t) = 1 + A(t) · sin φ,   begrenzt auf h ≥ 0
```

Sobald die Amplitude `A` größer als 1 wird, schließt der Spalt für einen Teil jeder Periode: die
Zunge schlägt. Der Fluss folgt Bernoulli, `u = h · √p`. Weil sich die Zunge auf die Kehle abrollt,
ist der Schließvorgang abgerundet (weiche Begrenzung). Das hält das Signal zugleich frei von
Aliasing. Bei hohen Pfeifen wird die Rundung größer, wie bei der Intonation echter Diskantzungen.
In der Ansprache wächst `A` mit dem Druck: Erst schwingt die Zunge frei und weich, dann schlägt
sie und der Klang wird schmetternd. Die Flusspulse treiben einen konischen Becher (Wellenleiter
mit niedriger Güte, etwa 10). Der Schall wird als Ableitung des Flusses abgestrahlt, der Trichter
hebt Teiltöne oberhalb seiner Grenzfrequenz (900 bis 1200 Hz) zusätzlich an.

## Raum

Eine Orgel ohne Kirche klingt falsch, deshalb hat das Demo einen eigenen Hall
(`instruments/organ/reverb.mjs`). Er ist ein Feedback-Delay-Netzwerk nach dem Prinzip von Jot
und Chaigne [8]:

- acht Verzögerungsleitungen zwischen 85 und 187 ms, gemischt über eine orthogonale
  Hadamard-Matrix (energieerhaltend, als schnelle Walsh-Hadamard-Transformation gerechnet)
- in jeder Leitung ein Einpol-Absorptionsfilter, dessen Verstärkung bei Gleichstrom und bei
  Nyquist aus den gewünschten Nachhallzeiten folgt: 4,2 s tief, 1,6 s hoch. So verliert jede
  Leitung pro Sekunde gleich viel, unabhängig von ihrer Länge.
- davor 22 ms Vorverzögerung, vier Schroeder-Allpässe als Diffusor [9] und acht frühe
  Reflexionen, links und rechts verteilt
- der Direktschall wird leicht tiefpassgefiltert (Luftdämpfung über die Entfernung im Schiff)

Gemessen (Schroeder-Rückwärtsintegration der Impulsantwort): −20,8 dB nach 1 s, −36,6 dB nach
2 s, also eine Nachhallzeit von etwa 3,8 s. Das liegt im Bereich großer Kirchen [10]. Das
Verhältnis von Direktschall zu Hallschall liegt bei etwa −3 dB, wie für einen Platz im Schiff.

## Demo

`node demos/organ.mjs` schreibt `out/organ.wav` (Stereo, 34 s). Ein vierstimmiger Choralsatz in
G-Dur und e-Moll, erst auf Gedackt 8', dann auf dem Prinzipalchor 8' 4' 2', dann im Plenum mit
Mixtur und Trompete und mit einer laufenden Pedalstimme auf Subbass 16', Prinzipal 8' und
Posaune 16'. Töne, die in den nächsten Akkord gehalten werden, schlagen nicht neu an. Die Pfeifen
stehen auf zwei Laden (C-Seite und Cis-Seite) links und rechts im Gehäuse.

## Messungen

Referenz zum Vergleich: General-MIDI-Programm 20 (Kirchenorgel) aus einer freien Soundfont.

Teiltonpegel in dB relativ zum Grundton, Taste c' (MIDI 60):

| Klang | H1 | H2 | H3 | H4 | H5 | H6 | H7 | H8 | H12 | H16 |
|---|---|---|---|---|---|---|---|---|---|---|
| Referenz (Plenum) | 0 | −1 | −1 | −4 | −14 | −8 | −31 | −19 | −9 | −11 |
| Modell 8' 4' 2' Mixtur | 0 | −6 | −4 | −2 | −27 | −10 | −38 | −17 | −12 | −20 |
| Modell Prinzipal 8' | 0 | −11 | −14 | −14 | −26 | −18 | −35 | −24 | | |
| Modell Gedackt 8' | 0 | −45 | −19 | −48 | −32 | −53 | −43 | | | |
| Modell Trompete 8' | 0 | −3 | −7 | −18 | −10 | −19 | −16 | −16 | | |

Das Plenum trifft das Muster der Referenz: starke Oktav- und Quintteiltöne (H2, H3, H4, H6, H8,
H12, H16) aus den Obertonregistern, schwache H5 und H7. Das Gedackt hat wie eine Klarinette
fast nur ungerade Teiltöne.

Einschwingen (Taste c', Prinzipal): Die Oktave erreicht nach etwa 20 ms ihr Maximum, der
Grundton erst nach etwa 60 ms (−3 dB). Die Referenz zeigt dasselbe Muster mit etwas längeren
Zeiten (Oktave bei 40 ms, Grundton bei 90 ms). Bei C (MIDI 36) braucht der Grundton etwa
120 ms.

Stimmung: Alle Pfeifen liegen im Mittel bei 0 Cent (gemessen ±0,5 Cent, dazu die gewollte
Streuung von ±2 Cent). Die Referenz liegt 5 bis 13 Cent zu hoch.

Demo: Spitze −3,0 dBFS, integrierte Lautheit −15,3 LUFS, größter Sprung zwischen zwei Samples
0,10 (an einer Stelle mit vollem Plenum und Mixtur, kein Knacken), Rechenzeit etwa 7 s.

## Grenzen

- Die Pfeifen sind nicht selbsterregt. Die Tonhöhe kommt aus einer Phase, die das Luftband
  antreibt, nicht aus der Rückkopplung von Resonator und Strahl. Deshalb gibt es kein echtes
  Überblasen, und der Oktav-Vorläufer ist modelliert statt emergent.
- Alle Pfeifen einer Taste teilen keinen gemeinsamen Wind. Ein echtes Plenum lässt den Wind bei
  großen Akkorden leicht einbrechen, das fehlt.
- Die Kopplung benachbarter Pfeifen (Mitnahme bei fast gleicher Stimmung) fehlt.
- Die Zunge ist zwangserregt. Die Rückwirkung des Bechers auf die Zungenbewegung fehlt, damit
  auch das leichte Ziehen der Tonhöhe beim Ansprechen.
- Der Hall ist ein Netzwerk aus acht Leitungen. Bei sehr trockenen, perkussiven Signalen kann man
  eine leichte Färbung hören, bei Orgelklang fällt das nicht auf.

## Quellen

1. N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments, 2. Auflage, Springer 1998,
   Kapitel 16 und 17 (Lippenpfeifen, Zungenpfeifen, Orgel).
2. N. H. Fletcher: Transients in the speech of organ flue pipes, a theoretical study. Acustica 34
   (1976), S. 224 bis 233.
3. A. W. Nolle, T. L. Finch: Starting transients of flue organ pipes in relation to pressure rise
   time. Journal of the Acoustical Society of America 91 (1992), S. 2190 bis 2202.
4. J. W. Coltman: Sounding mechanism of the flute and organ pipe. Journal of the Acoustical
   Society of America 44 (1968), S. 983 bis 992.
5. M.-P. Verge, B. Fabre, A. Hirschberg, A. P. J. Wijnands: Sound production in recorderlike
   instruments I. Journal of the Acoustical Society of America 101 (1997), S. 2914 bis 2924.
6. J. O. Smith: Physical Audio Signal Processing. Online-Buch, CCRMA, Stanford University
   (digitale Wellenleiter).
7. A. Miklós, J. Angster, S. Pitsch, T. D. Rossing: Reed vibration in lingual organ pipes without
   the resonators. Journal of the Acoustical Society of America 113 (2003), S. 1081 bis 1091.
8. J.-M. Jot, A. Chaigne: Digital delay networks for designing artificial reverberators. 90. AES
   Convention, Paris 1991, Preprint 3030.
9. M. R. Schroeder: Natural sounding artificial reverberation. Journal of the Audio Engineering
   Society 10 (1962), S. 219 bis 223.
10. J. Meyer: Kirchenakustik. Bochinsky, Frankfurt am Main 2003.

Der Code ist eigenständig geschrieben. Aus den Quellen stammen nur physikalische Zusammenhänge
und Größenordnungen, kein Code.
