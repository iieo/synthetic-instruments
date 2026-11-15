# Stabspiele: Marimba, Vibraphon, Kalimba, Glockenspiel, Röhrenglocken

Alle fünf Instrumente entstehen per Modalsynthese. Jede Eigenschwingung (Mode) eines Stabs, einer Zunge oder eines Rohrs ist ein gedämpfter Resonator zweiter Ordnung mit Frequenz `f`, Abklingzeit `tau` und Amplitude. Angeregt werden die Resonatoren nicht mit einem Impuls, sondern mit einer physikalisch berechneten Kontaktkraft. So bestimmen Schlägelhärte und Anschlagstärke von selbst, wie viele Obertöne entstehen. Keine Samples, keine aufgenommenen Impulsantworten.

Dateien:

- `instruments/mallets/core.mjs`: gemeinsame Bausteine (Balken-Eigenformen, Hertz-Kontakt, Resonatoren, Ausblenden)
- `instruments/marimba.mjs`, `vibraphone.mjs`, `kalimba.mjs`, `glockenspiel.mjs`, `bells.mjs`
- `demos/mallets.mjs` schreibt `out/<instrument>.wav`

Jedes Modul exportiert `meta = { name, range }` und `render({ midi, velocity, duration, seed, ... })`, das ein `Float64Array` in Mono bei 48 kHz mit natürlichem Ausklang liefert. Gleiche Argumente ergeben dasselbe Signal. Ohne `midi` gilt 60, Töne außerhalb des Umfangs werden auf dessen Grenzen gesetzt. Zahlenwerte, die keine endlichen Zahlen sind, lösen einen Fehler mit dem Namen des Parameters aus.

## Gemeinsame Physik

### Schlägelkontakt nach Hertz

Ein Schlägel der Masse `m` trifft mit der Geschwindigkeit `v` auf den Stab. Die Kontaktkraft folgt dem Hertz-Gesetz `F = K·δ^p` (δ = Eindrückung). Für eine Kugel auf einer Ebene ist `p = 3/2`, Garn- und Filzwicklungen versteifen sich stärker, dort passt `p` um 2 bis 2,5. Die Bewegungsgleichung `m·δ'' = −K·δ^p` wird einmal in normierter Zeit integriert. Daraus folgt die Form des Kraftpulses, eine leicht asymmetrische Glocke. Die Kontaktdauer skaliert mit

```
T ∝ v^((1−p)/(1+p))
```

Ein harter Schlag ist also kürzer. Ein kurzer Puls hat ein breiteres Spektrum und regt höhere Moden an. Die Fläche des Pulses ist der übertragene Impuls und wächst linear mit `v`. Bei weichen Schlägeln bleibt der Klang dunkel, bei harten wird er hell, ohne dass ein Filter von Hand nachgeregelt wird. Zusätzlich erhöht ein kräftiger Anschlag die effektive Härte, weil die Wicklung zusammengedrückt wird und der Kern mitträgt.

Parameter je Instrument: Kontaktdauer bei voller Geschwindigkeit `t0` (etwa 0,25 bis 1 ms bei Marimba und Vibraphon, 0,25 bis 0,55 ms beim Glockenspiel), Exponent `p`, `hardness` 0 bis 1.

### Anschlagort

Die Amplitude jeder Mode ist proportional zur Eigenform am Anschlagort. Für den frei schwingenden Balken (beide Enden frei) gilt nach Euler-Bernoulli

```
φn(x) = cosh βn x + cos βn x − σn (sinh βn x + sin βn x),   βn L = 4,730; 7,853; 10,996; ...
```

und für die einseitig eingespannte Zunge (Kalimba) die entsprechende Form mit `βn L = 1,875; 4,694; 7,855; 10,996`. Ein Schlag in der Stabmitte trifft den Knoten der zweiten Mode und lässt sie aus. Der Standard für die Marimba (`position = 0.42`, Anteil der Stablänge) liegt deshalb etwas neben der Mitte, wie beim Spielen.

`position` wird auf 0,02 bis 0,5 begrenzt. Nahe am freien Ende liegen alle Moden fast im Bauch und haben dasselbe Vorzeichen. Sie schwingen dann gleichphasig an, und die Spitze steigt um bis zu 5 dB. Die gewichtete Summe der Eigenformen mit Vorzeichen folgt dieser Spitze gut. Marimba, Vibraphon und Glockenspiel teilen den Pegel deshalb durch diese Summe, sobald sie größer ist als ihr Maximum zwischen 0,15 und 0,5 (`strikeGain` in `core.mjs`). Ein Schlag ans Ende klingt so anders, aber nicht lauter. Bei Anschlag 1 bleibt die lauteste Note jedes Instruments über alle dokumentierten Optionen um −3 dBFS.

### Resonatoren und Dämpfung

Jede Mode ist ein Zwei-Pol-Resonator mit der Impulsantwort `a·e^(−t/τ)·sin(2πft)`. Er startet bei null, das verhindert Knacken am Notenanfang. Die Abklingzeit folgt aus der Güte, `τ = Q / (π f)`. Materialverluste steigen mit der Frequenz, deshalb fällt `Q` mit einer schwachen Potenz der Frequenz. Jeder Ton endet nach etwa 60 bis 70 dB Abfall mit einer kurzen Kosinus-Blende exakt bei null.

Pro Note variieren Frequenzen der oberen Moden um wenige Promille, Amplituden um einige Prozent und der Grundton um höchstens 1 bis 2 Cent, gesteuert über `seed`.

Moden oberhalb von 0,45·SR werden weggelassen. Ein sanfter Abfall oberhalb von 5 bis 8 kHz (Abstrahlung kleiner Flächen, Luftdämpfung) hält Metall und harte Schläge von schrillen Spitzen fern.

## Marimba

- Palisanderstab mit Unterschnitt. Der Bogen unter dem Stab stimmt die zweite Mode auf zwei Oktaven (Verhältnis 4) und die dritte auf etwa 10 (zwei Oktaven plus große Terz). Ab etwa C6 bleibt nur die zweite gestimmt, die dritte rutscht nach unten (bis 8,2), wie bei kurzen Stäben üblich.
- Dazu zwei ungestimmte höhere Biegemoden (etwa 17 und 26, bei hohen Tönen tiefer) und zwei schwache Torsionsmoden (etwa 3,05 und 6,3), angeregt durch Schläge neben der Mittellinie.
- Holz dämpft stark: `Q ≈ 160·(f/1 kHz)^−0,2`. Die hohen Teiltöne klingen nach wenigen Zehntelsekunden ab.
- Resonanzrohr: ein Viertelwellenrohr, leicht zu hoch gestimmt, wird vom Grundton des Stabs angetrieben (Bandpass mit Güte 18 bis 35). Es verstärkt den Grundton, lässt ihn kurz anschwellen und trägt im Bass den größten Teil des Pegels. Die Nachklingzeit des Grundtons liegt zwischen 2,4 s (C2) und 0,3 s (C7).
- Ein kurzer, vom Kontakt bandbegrenzter Rauschimpuls bildet das hölzerne Klopfen des Schlägels nach.
- Umfang MIDI 36 bis 96. Optionen: `hardness`, `position`.

## Vibraphon

- Aluminiumstab mit Unterschnitt, Verhältnis 1 : 4 und etwa 10 im tiefen Register, dazu schwache Torsionsmoden bei 3 und 7.
- Aluminium dämpft kaum: der Grundton klingt mit Pedal 22 s (F3) bis 4,5 s (F6), die oberen Moden mit `Q ≈ 2600·(f/1 kHz)^−0,45`.
- `duration` ist die Zeit, bis der Dämpfer wieder anliegt (Pedal oder Taste losgelassen). Danach wechseln alle Moden auf `τ = 50 ms`. Mit `duration: Infinity` klingt der Ton frei aus.
- `motor` (Hz): Drehende Scheiben oben in den Rohren öffnen und schließen den Resonator. Moduliert wird nur der Rohranteil des Grundtons (Tiefe 85 %), der direkte Stabklang bleibt. Typisch sind 3 bis 7 Hz. `motorPhase` setzt die Scheibenstellung.
- Umfang MIDI 53 bis 89.

## Kalimba

- Einseitig eingespannte Stahlzunge (Kragbalken), Verhältnisse 1 : 6,27 : 17,55 : 34,39. Die zweite Mode bei etwa 6,3 ist der typische metallische Beiklang.
- Der Daumen drückt das freie Ende herunter und rutscht ab. Das wird als weicher Kraftpuls von 0,35 bis 1,6 ms modelliert (fester Anschlag mit dem Nagel kürzer).
- Eine zweite Biegerichtung 0,25 % über dem Grundton und eine Torsionsmode bei etwa 4,4 kommen schwach hinzu, weil der Daumen nie genau senkrecht drückt.
- Kurzes Klicken von Nagel und Zunge auf dem Steg: drei stark gedämpfte Moden zwischen 2,9 und 5,3 kHz.
- Holzkasten: Helmholtz-Resonanz des Schalllochs bei etwa 210 Hz und vier Deckenmoden (455 bis 2250 Hz, Güte 9 bis 20). Sie filtern das Zungensignal parallel zum direkten Anteil.
- `buzz` (0 bis 1, Standard 0,15): leichtes Schnarren, wenn die Zunge bei großem Ausschlag am Sattel anschlägt. Ein amplitudengesteuerter Halbwellen-Anteil wird bei 3,4 kHz breit gefiltert und leise beigemischt. Das ist die einzige Nichtlinearität, sie wirkt auf das Instrumentsignal, nicht auf den Ausgang.
- Umfang MIDI 55 bis 91.

## Glockenspiel

- Rechteckiger Stahlstab ohne Unterschnitt, freie Enden: 1 : 2,756 : 5,404 : 8,933 : 13,34. Bei kurzen, dicken Stäben senken Schubverformung und Drehträgheit (Timoshenko) die oberen Moden leicht, das ist mit einem kleinen Faktor berücksichtigt.
- Angeschlagen nahe der Mitte (`position = 0.47`), deshalb bleiben die antisymmetrischen Moden (2,76 und 8,93) schwach.
- Harter Schlägel, `p` nahe 1,5, Kontakt 0,25 bis 0,55 ms. Lange Nachklingzeit: 6,5 s (G5) bis 1,8 s (C8).
- Umfang MIDI 79 bis 108 (klingende Tonhöhe).

## Röhrenglocken

- Messingrohr mit freien Enden. Die Moden folgen dem frei schwingenden Balken. Die Moden 4, 5 und 6 liegen fast bei 2 : 3 : 4, das Ohr hört deshalb einen virtuellen Schlagton eine Oktave unter Mode 4. `midi` bezeichnet diesen Schlagton, Mode 4 liegt exakt bei der doppelten Frequenz.
- Angeschlagen am oberen Ende, wo alle Moden einen Bauch haben.
- Leichte Unrundheit spaltet jede Mode in ein enges Paar (0,04 bis 0,16 %), das ergibt die langsame Schwebung.
- Umfang MIDI 60 bis 77.

## Messung und Abgleich

Verglichen wurde mit einer frei lizenzierten General-MIDI-Soundfont. Gemessen wurden Modenverhältnisse und Pegel per FFT, Abklingzeit des Grundtons, Spektralschwerpunkt der ersten 85 ms, Energie über 8 kHz und Spektrogramme.

- Tonhöhe: der Grundton liegt bei allen Instrumenten innerhalb von 2 Cent am Sollwert (Parabel-Interpolation im 65536-Punkte-Spektrum).
- Marimba: Pegel der zweiten Mode relativ zum Grundton −8 dB (C2) bis −34 dB (C6), die Referenz liegt bei −12 bis −34 dB. Ausklang 2,4 s (C2) bis 0,3 s (C7), Referenz 2,0 bis 0,4 s.
- Vibraphon: Verhältnisse 1 : 3,99 : 9,9 wie in der Referenz. Der Klang ist im Anschlag etwas dunkler, der Ausklang mit Pedal deutlich länger als bei den geloopten Referenzsamples.
- Kalimba: zweite Mode bei 6,29 mit −15 dB (C4), Referenz 6,7 bis 6,8 mit −12 bis −28 dB.
- Glockenspiel und Röhrenglocken sind absichtlich weicher als die Referenz (Schwerpunkt etwa halb so hoch), denn die Referenz hat über 8 kHz fast so viel Energie wie im Grundton.

Ausgabe der Demos: Spitze −3 dBFS, Lautheit etwa −17 bis −24 LUFS, kein Knacken (größter Sprung von Sample zu Sample deutlich unter dem Spitzenpegel und kleiner als bei der Referenz), keine Sättigung im Ausgang. Alle fünf Demos rendern zusammen in wenigen Sekunden.

## Bekannte Schwächen

- Die Eigenformen stammen vom gleichmäßigen Balken. Der Unterschnitt verschiebt die Knoten in Wirklichkeit etwas, das ist nur über die Gewichte ausgeglichen.
- Die Kopplung von Stab und Rohr ist einseitig (das Rohr hört den Stab, nicht umgekehrt). Die Rückwirkung auf die Dämpfung des Stabs ist über die Nachklingzeit des Grundtons eingestellt.
- Der Schlägel prallt von einem starren Stab ab. Mehrfachkontakt bei weichen Schlägeln im Bass fehlt.
- Kein Raum und keine Stereoabbildung, die Ausgabe ist trocken und mono.

## Quellen

- *The Physics of Musical Instruments*, 2. Auflage, Springer 1998, Kapitel 19 (Stabspiele) und 21 (Glocken und Röhrenglocken).
- *Science of Percussion Instruments*, World Scientific 2000, Kapitel zu Marimba, Vibraphon, Glockenspiel und Röhrenglocken (Modenverhältnisse, Unterschnitt, Resonatoren, Motor des Vibraphons).
- „Numerical simulations of xylophones. I. Time-domain modeling of the vibrating bars“, J. Acoust. Soc. Am. 101 (1997), 539-557 (Hertz-Kontakt mit Schlägel, frequenzabhängige Dämpfung von Holzstäben).
- „Practical tuning of xylophone bars and resonators“, Applied Acoustics 46 (1995), 103-127 (Stimmung 1 : 4 : 10, Resonanzrohre).
- „The tones of the kalimba (African thumb piano)“, J. Acoust. Soc. Am. 131 (2012), 3478 (Modenverhältnisse der Zungen, Kasten).
- *Contact Mechanics*, Cambridge University Press 1985, Kapitel 4 und 11 (Hertz-Kontakt, Stoßdauer `∝ v^(−1/5)`).
- Euler-Bernoulli-Balken: Eigenwerte `βn L` für freie und eingespannt-freie Ränder aus jeder Standardtabelle der Balkenschwingung.

Alle Parameter sind veröffentlichte Messgrößen oder auf diese Größen abgeglichen. Der Code ist eigenständig geschrieben, nichts ist aus Bibliotheken oder fremdem Code übernommen.
