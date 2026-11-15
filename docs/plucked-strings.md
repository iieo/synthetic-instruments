# Gezupfte Saiten: Gitarre und Bass

`instruments/guitar.mjs` (Nylon und Stahl) und `instruments/bass.mjs` (E-Bass mit Fingern gezupft, Kontrabass pizzicato) erzeugen jeden Ton aus einem physikalischen Saitenmodell. Es gibt keine Samples, keine Impulsantworten und keine Tabellen aus fremden Quellen. Gemeinsame Bausteine liegen in `instruments/strings-plucked/`:

| Datei | Inhalt |
|---|---|
| `string.mjs` | Wellenleiter-Schleife, Abstimmung, Steifigkeits-Allpässe, Anregung, Abdämpfen, zwei Polarisationen |
| `body.mjs` | Modaler Korpus: Resonatorbank aus Moden |
| `filters.mjs` | Allpass- und Tiefpass-Phasen, Biquads, Resonator, DC-Filter |

## Saite als digitaler Wellenleiter

Eine ideale Saite trägt zwei gegenläufige Wanderwellen, die an Steg und Sattel reflektiert werden. Fasst man beide Richtungen und alle Verluste zu einer Schleife zusammen, bleibt eine Verzögerungsleitung mit Filtern im Rückweg (Karplus und Strong 1983, erweitert von Jaffe und Smith 1983, als Wellenleiter formuliert von Smith 1992). Pro Abtastwert läuft das Signal durch:

1. eine ganzzahlige Verzögerung von `N` Samples,
2. einen einpoligen Verlust-Tiefpass `H(z) = g (1 - a) / (1 - a z^-1)`,
3. eine Kaskade von Allpässen erster Ordnung für die Steifigkeit,
4. einen Allpass erster Ordnung für den Bruchteil der Verzögerung (Thiran, siehe Laakso et al. 1996).

**Exakte Stimmung.** Die Grundfrequenz entsteht dort, wo die Phase der ganzen Schleife `-2π` erreicht. Der Code rechnet die Phasenverzögerung von Tiefpass und Steifigkeits-Allpässen bei `f0` aus, zieht sie von `SR / f0` ab und bestimmt den Koeffizienten des Bruchteil-Allpasses per Bisektion, sodass die Gesamtphase bei `f0` genau stimmt. Gemessen (Spektralspitze zwischen 0,2 und 1,2 s): alle Töne liegen innerhalb von ±1,3 Cent, davon sind ±0,8 Cent gewollte Streuung pro Ton.

**Frequenzabhängige Dämpfung.** Statt `g` und `a` zu raten, gibt jedes Instrument eine Abklingzeit T60 bei der Grundfrequenz und eine bei einer hohen Frequenz `fh` vor. Pro Periode muss die Schleife um `10^(-3 / (T60 · f0))` abklingen. `a` wird so gelöst, dass das Verhältnis der Beträge bei `fh` und `f0` passt, `g` danach so, dass der Betrag bei `f0` stimmt. `g` bleibt unter 1, sonst wächst der Gleichanteil. Die Werte sind auf Messungen am Referenzklang abgestimmt (siehe unten). Umsponnene Saiten (die drei tiefen der Gitarre) verlieren Höhen schneller.

**Steifigkeit und Inharmonizität.** Eine steife Saite hat Teiltöne bei `f_n = n f0 √(1 + B n²)` (Fletcher 1964), mit `B = π³ E d⁴ / (64 T L²)`. Die `B`-Werte der leeren Saiten stammen aus dieser Formel mit üblichen Saitenstärken, Spannungen und Materialkonstanten (Stahl etwa 200 GPa, Nylon etwa 4,5 GPa). Wird eine Saite gegriffen, schrumpft `L` um den Faktor `2^(-Bund/12)`, also wächst `B` mit `2^(2·Bund/12)`. Die Streckung entsteht durch eine Kaskade identischer Allpässe erster Ordnung mit negativem Koeffizienten, deren Verzögerung mit der Frequenz fällt (Ansatz nach Van Duyne und Smith 1994). Den Koeffizienten sucht ein Goldener-Schnitt-Verfahren: Für jeden Kandidaten wird die Schleife neu gestimmt, die tatsächlichen Teiltonfrequenzen werden per Bisektion auf der Schleifenphase bestimmt und der quadratische Fehler in Cent gegen die Formel minimiert. Beim Bass sind es 10 bis 16 Allpässe, bei der Gitarre 3 bis 6. Rest-Fehler: unter 2 Cent bis etwa zum fünften Teilton, bei tiefen Basstönen bis zu etwa 10 Cent ab dem zehnten Teilton.

## Anregung: Zupfen statt Rauschen

Kein Rauschstoß. Die Saite wird zu einem Dreieck ausgelenkt, Spitze an der Zupfstelle `β` (Anteil der schwingenden Länge vom Steg aus), und losgelassen. Was der Steg als Kraft spürt, ist die Steigung der Saite am Steg, und die Steigung eines Dreiecks ist ein Rechteck: Wert `1 - β` über den Anteil `β`, Wert `-β` über den Rest. Eine Periode dieser Form wird in die Schleife gespeist. Ihr Spektrum ist `sin(nπβ) / n`, also genau der Kammfilter der Zupfposition samt 1/n-Abfall, ohne eigenes Kammfilter.

Finger, Nagel oder Plektrum berühren die Saite nicht punktförmig. Die Kontaktbreite (Nylon 1,2 bis 3,2 cm, Plektrum 2 bis 7 mm, Bassfinger 1,6 bis 2,8 cm, Kontrabass 4 bis 7 cm) wird über die Wellengeschwindigkeit `c = 2 L f0` in eine Zeit umgerechnet und glättet die Kanten mit einem Hann-Fenster. Hohe Anschlagsstärke heißt schmaler Kontakt und damit mehr Höhen. Dazu kommen eine kurze Ablösezeit, ein wenig tiefpassgefiltertes Kontaktgeräusch in der Schleife (wird tonal) und ein Klick von wenigen Millisekunden direkt am Steg (Nagel oder Plektrum, beim Bass ein weicher Fingerton).

Die absolute Zupfstelle ist fest (Gitarre 13 cm vom Steg bei Nylon, 11 cm bei Stahl, E-Bass 13 cm, Kontrabass 30 cm) und wird pro Ton um ±10 bis 15 % gestreut. Weil die schwingende Länge mit dem Bund schrumpft, wandert `β` nach oben, wie auf dem echten Instrument.

## Zwei Polarisationen

Eine Saite schwingt senkrecht und parallel zur Decke. Die senkrechte Richtung koppelt stark an den Steg und klingt schneller ab, die parallele schwächer und länger (Weinreich 1977 für Klaviersaiten, für Gitarren in Fletcher und Rossing 1998). Beide Polarisationen sind eigene Schleifen mit 0,3 bis 0,9 Cent Verstimmung, die Anregung wird nach einem zufälligen Winkel aufgeteilt. Das ergibt den zweistufigen Abfall und leichte Schwebungen.

## Abdämpfen

`duration` ist die Zeit, in der der Ton frei klingt. Danach legt der Spieler die Hand auf die Saite: Die Schleife bekommt innerhalb von 30 ms einen zusätzlichen Verlust mit T60 von 0,12 s (Gitarre), 0,07 s (E-Bass) oder 0,1 s (Kontrabass). Der Puffer enthält noch 0,3 s Nachklang, die letzten 20 ms werden auf exakt null geblendet, die ersten 0,5 ms aus null eingeblendet.

## Korpus und Abnahme

**Akustische Gitarre.** Die Stegkraft treibt eine Parallelbank aus Zwei-Pol-Resonatoren. Die tiefen Moden folgen veröffentlichten Messungen (Christensen und Vistisen 1980; Fletcher und Rossing 1998, Kap. 9): Helmholtz-Resonanz des Luftraums bei etwa 100 Hz, erste Deckenmode bei etwa 190 Hz, weitere Decken- und Bodenmoden zwischen 230 und 1000 Hz. Darüber liegt ein fester, pseudozufälliger Satz schwächerer Moden (Nylon 0,95 bis 5,2 kHz, Stahl 1,1 bis 7 kHz), der für die dichte Holzfärbung sorgt. Unterhalb der Luftresonanz strahlt ein Gitarrenkorpus schlecht ab, weil Decke und Schallloch gegenphasig arbeiten. Das bildet ein Hochpass zweiter Ordnung bei 90 bis 95 Hz nach. Im Mittenbereich wirkt der Korpus wie ein kleiner Monopol, dessen Schalldruck mit der Frequenz mal Stegschnelle wächst. Das macht ein Hochpass erster Ordnung bei 0,9 bis 1,2 kHz als Neigung nach oben.

**E-Bass.** Kein Korpus. Ein magnetischer Tonabnehmer misst die Schnelle der Saite an seiner Position `x`. In der Schleife ist das die Differenz der Steigungswelle und ihrer um `x / L` einer Periode verzögerten Kopie, also ein Kammfilter mit fraktionaler Verzögerung. Zwei Tonabnehmer bei 9,5 und 16 cm vom Steg werden gemischt. Spulen-Induktivität und Kabelkapazität bilden einen resonanten Tiefpass (2,8 kHz, Q 1,3), danach folgt ein sanfter Lautsprecher-Tiefpass bei 5 kHz.

**Kontrabass.** Modaler Korpus mit tieferen Moden (Luftresonanz um 58 Hz, Deckenmoden um 100 bis 130 Hz und darüber, nach Fletcher und Rossing 1998, Kap. 10), Tiefpass bei 2,5 kHz, kürzere Abklingzeiten als beim E-Bass.

## Parameter

`render({ midi, velocity, duration, seed })` bei beiden Instrumenten, zusätzlich:

| Parameter | Gitarre | Bass |
|---|---|---|
| Typ | `type: 'nylon'` (Standard) oder `'steel'` | `style: 'electric'` (Standard) oder `'upright'` |
| `pluckPosition` | Zupfstelle als Anteil der Saitenlänge vom Steg, zwischen 0 und 1 (ohne die Grenzen). Werte über 0,5 wirken wie ihr Spiegelbild `1 - x`, wirksam sind 0,02 bis 0,45 | ebenso |
| `string` | Saite 0 (tiefes E) bis 5, sonst die höchste Saite, auf der der Ton liegt | Saite 0 (E) bis 3 (G), ebenso |

Tonumfang: Gitarre MIDI 40 bis 86, Bass 28 bis 67. Töne außerhalb werden auf den Rand gesetzt. Ohne `midi` spielt die Gitarre C4 (60) und der Bass E2 (40), Velocity 0,8. Eine gewählte Saite muss den Ton zwischen Bund 0 und 24 erreichen, sonst gibt es einen Fehler. Ebenso bei unbekanntem Typ, einer Saitennummer außerhalb des Instruments oder einem Wert, der keine endliche Zahl ist. Beide Instrumente skalieren die Ausgabe mit einem festen Faktor. Der lauteste Ton bei Velocity 1 liegt über alle Typen, Saiten, Zupfstellen und Seeds bei etwa −3 dBFS (Gitarre höchstens −2,8, Bass höchstens −3,5 dBFS). Pro Ton streuen mit `seed` deterministisch: Stimmung ±0,8 Cent, Zupfstelle, Kontaktbreite, Abklingzeit ±8 %, Polarisationswinkel und Verstimmung. Ein Ton rendert in etwa 0,1 s.

## Abgleich mit einer Referenz

Zum Vergleich dienten Einzeltöne einer frei lizenzierten General-MIDI-Soundfont (Programme Nylon, Stahl, Fingered Bass, Acoustic Bass), nicht im Repo. Gemessen wurden Tonhöhe, Anstieg, spektraler Schwerpunkt über die Zeit und die Abklingrate der Teiltöne 1 bis 10.

| Ton | Schwerpunkt bei 0,1 s (Modell / Referenz) | Hüllkurve nach 2 s (Modell / Referenz) |
|---|---|---|
| Nylon E2 | 560 / 260 Hz | −23 / −10 dB |
| Nylon E4 | 850 / 840 Hz | −30 / −33 dB |
| Nylon E5 | 940 / 1785 Hz | −42 / −47 dB |
| Stahl E4 | 1125 / 1500 Hz | −25 / −25 dB |
| Stahl E5 | 1156 / 1133 Hz | −35 / −49 dB |
| E-Bass E1 | 127 / 115 Hz | −23 / −22 dB |
| E-Bass E3 | 267 / 316 Hz | −27 / −12 dB |
| Kontrabass E2 | 123 / 99 Hz | −36 / −24 dB |

Die erste Fassung war viel zu dumpf und klang zu schnell ab. Die Referenz zeigt, dass echte Saiten auch hohe Teiltöne mehrere Sekunden halten (10 bis 20 dB/s). Daraufhin wurden der Verlust-Tiefpass flacher, die Kontaktbreite physikalisch über die Wellengeschwindigkeit bestimmt und Abstrahlungs-Hochpass sowie Neigung ergänzt. Größte Abweichungen: Nylon E2 ist heller als die Referenz, Nylon E5 dunkler, und hohe E-Bass-Töne klingen schneller ab als das Sample. Der schwache Grundton tiefer Gitarrentöne in der Referenz (E2: zweiter Teilton 18 bis 24 dB über dem ersten) wird durch den Hochpass unter der Luftresonanz teilweise nachgebildet.

## Grenzen

- Keine Spannungsmodulation: Kräftig gezupfte Basssaiten sinken in Wirklichkeit in den ersten Millisekunden leicht in der Tonhöhe.
- Keine Kopplung zwischen den Saiten über den Steg, also kein Mitschwingen leerer Saiten.
- Die Steifigkeits-Allpässe treffen die Teiltöne tiefer Basstöne oberhalb des zehnten Teiltons nur auf etwa 10 Cent.
- Der Korpus ist eine feste Modenbank, kein gekoppeltes Platten-Luft-Modell, und strahlt mono ab.
- Keine Griffgeräusche (Rutschen über umsponnene Saiten, Bundschnarren, Hammer-on).

## Quellen

- K. Karplus, A. Strong: Digital synthesis of plucked-string and drum timbres. Computer Music Journal 7(2), 1983.
- D. A. Jaffe, J. O. Smith: Extensions of the Karplus-Strong plucked-string algorithm. Computer Music Journal 7(2), 1983.
- J. O. Smith: Physical modeling using digital waveguides. Computer Music Journal 16(4), 1992.
- V. Välimäki, J. Huopaniemi, M. Karjalainen, Z. Jánosy: Physical modeling of plucked string instruments with application to real-time sound synthesis. Journal of the Audio Engineering Society 44(5), 1996.
- M. Karjalainen, V. Välimäki, T. Tolonen: Plucked-string models: from the Karplus-Strong algorithm to digital waveguides and beyond. Computer Music Journal 22(3), 1998.
- S. A. Van Duyne, J. O. Smith: A simplified approach to modeling dispersion caused by stiffness in strings and plates. Proc. International Computer Music Conference, 1994.
- T. I. Laakso, V. Välimäki, M. Karjalainen, U. K. Laine: Splitting the unit delay. IEEE Signal Processing Magazine 13(1), 1996.
- H. Fletcher: Normal vibration frequencies of a stiff piano string. Journal of the Acoustical Society of America 36(1), 1964.
- G. Weinreich: Coupled piano strings. Journal of the Acoustical Society of America 62(6), 1977.
- O. Christensen, B. B. Vistisen: Simple model for low-frequency guitar function. Journal of the Acoustical Society of America 68(3), 1980.
- N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments, 2. Auflage, Springer 1998, Kapitel 2, 9 und 10.
- R. Bristow-Johnson: Cookbook formulae for audio equalizer biquad filter coefficients (Formeln für Tief- und Hochpass).

Der gesamte Code ist eigenständig geschrieben. Aus den Quellen stammen nur Gleichungen und Messwerte.

## Demos

`node demos/guitar.mjs` schreibt `out/guitar.wav` (27 s): gezupfte Nylon-Arpeggien über Am, F, C, E, dann Stahlsaiten mit Plektrum geschlagen (Ab- und Aufschlag, 8 bis 14 ms Versatz pro Saite), zum Schluss eine Nylon-Melodie über leisen Basstönen. `node demos/bass.mjs` schreibt `out/bass.wav` (24 s): eine Walking-Line über Em7, A7, Dmaj7, B7 zuerst auf dem E-Bass in tiefer Lage, dann auf dem Kontrabass hoch bis Es4, mit gelegentlichen leisen Durchgangstönen, und am Ende ein tiefes E1. Beide werden auf −3 dBFS normalisiert und rendern in wenigen Sekunden.
