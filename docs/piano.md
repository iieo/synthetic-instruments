# Piano

Ein Konzertflügel, komplett aus Physik gerechnet. Kein Sample, keine aufgenommene Impulsantwort.

Dateien: `instruments/piano.mjs` (Einstieg, `render`), `instruments/piano/params.mjs` (Tastenabhängige Kennwerte), `instruments/piano/hammer.mjs` (Hammer und Saite), `instruments/piano/unison.mjs` (Kopplung der Chorsaiten), `instruments/piano/soundboard.mjs` (Resonanzboden). Demo: `node demos/piano.mjs` schreibt `out/piano.wav`.

## Methode

Modalsynthese mit physikalischer Anregung. Jede Note läuft in drei Schritten.

1. **Hammer trifft Saite.** Die Saite ist eine Summe ihrer Eigenschwingungen (Moden). Der Filzhammer ist eine Masse mit nichtlinearer Feder, `F = K · δ^p`, wobei δ die Stauchung des Filzes ist. Der Kontakt wird mit 8facher Abtastrate simuliert. Jede Mode wird pro Teilschritt mit der exakten Lösung eines harmonischen Oszillators unter konstanter Kraft weitergerechnet, damit auch Moden bei 19 kHz stabil bleiben. Der Hammer prallt ab, sobald die Saite ihn zurückwirft. Daraus folgen von selbst: Kontaktdauer (etwa 2,7 ms bei C2, 1,7 ms bei C4, 0,8 ms bei C6), das Spektrum des Anschlags, die Lücken im Spektrum durch die Anschlagstelle (etwa bei 1/8 der Saitenlänge) und der hellere Klang bei schnellem Anschlag, denn der Filz wird bei mehr Stauchung steifer.
2. **Chorsaiten koppeln über den Steg.** Ab MIDI 29 hat jede Note zwei, ab MIDI 47 drei leicht verstimmte Saiten. Pro Teilton wird das gekoppelte System `a' = (D + cJ) a` gelöst (Weinreich): `D` enthält Verstimmung und Eigenverlust jeder Saite, `c` die Admittanz des Stegs. Eigenwerte über die charakteristische Gleichung (Durand Kerner), Residuen über die Eigenvektoren. Das ergibt die typische Schwebung und den zweistufigen Ausklang: Der gleichphasige Anteil gibt viel Energie an den Resonanzboden ab und klingt schnell ab, der gegenphasige Rest klingt lange nach. Eine schwach gekoppelte horizontale Polarisation pro Saite liefert den Nachklang auch bei den einsaitigen Basstönen.
3. **Resonanzboden.** Ein synthetischer, gerippter Plattenboden mit gut 230 Moden zwischen 48 Hz und 7 kHz (feste Saat, also immer dasselbe Instrument). Seine Admittanz am Steg bestimmt pro Teilton die Lautstärke (unregelmäßige Formanten), den Verlust an den Boden (Teiltöne klingen unterschiedlich schnell ab) und eine kleine Frequenzverschiebung. Dazu kommt eine Abstrahlung, die unter etwa 110 Hz schwach wird, deshalb sind die Grundtöne im tiefen Bass leise wie beim echten Flügel. Die Hammerkraft regt die Bodenmoden zusätzlich direkt an und gibt den kurzen Anschlagsklopfer.

Das Signal am Steg ist die Kraft der Saite auf den Steg, also die Steigung der Saite am Stegende, `Σ n·(−1)^n·q_n`.

Danach läuft jeder Anteil als gedämpfte komplexe Schwingung mit ganzzahligem Sampleindex. Beim Loslassen senkt sich der Dämpfer über 30 ms ab, der Zusatzverlust blendet weich ein. Ab MIDI 90 gibt es keine Dämpfer, diese Töne klingen frei aus. Jede Note beginnt bei exakt null und endet mit einer 30 ms langen Kosinusblende bei unter −100 dB.

## Physikalisches Modell und Parameter

| Größe | Wert | Quelle |
| --- | --- | --- |
| Inharmonizität `f_n = n f0 √(1 + B n²)` | B ≈ 2,5e−4 (A0), Minimum 1e−4 (A2), 3,5e−4 (C4), 2e−3 (C6), 1,5e−2 (C8) | Fletcher 1964, Fletcher und Rossing |
| Gestreckte Stimmung | bis −14 Cent im Bass, bis +22 Cent im Diskant, quadratisch ab A4. Die Kurve gilt für den klingenden ersten Teilton `f0·√(1 + B)`, deshalb wird `f0` um diesen Faktor gesenkt | Railsback 1938 |
| Saitenlänge, Spannung | 0,62 m und rund 780 N bei C4, Bass bis 1,95 m, Masse pro Länge aus `f0 = √(T/μ)/2L` | Chaigne und Askenfelt 1994, Conklin 1996 |
| Hammermasse | 11 g (A0) bis 4 g (C8) | Hall 1986, Askenfelt und Jansson 1990 |
| Filzexponent p | 2,2 (Bass) bis 3,1 (Diskant) | Hall 1986, Chaigne und Askenfelt 1994 |
| Anschlagstelle | 0,12 der Saitenlänge, im Diskant bis 0,075 | Conklin 1996 |
| Hammergeschwindigkeit | `0,15 + 5·velocity²` m/s, also etwa 0,2 bis 5 m/s | Askenfelt und Jansson 1990 |
| Abklingzeit T60 des Grundtons (schneller Teil) | 16 s (A0), 8 s (C4), 3,5 s (C6), 0,6 s (C8) | Martin 1947, Weinreich 1977, abgeglichen mit der Referenz |
| Frequenzabhängiger Verlust | `σ(f) = σ(f0) + 0,12·x + 0,09·x²`, x in kHz | angepasst an die Referenz |
| Nachklang | Eigenverlust der Saite = 0,28 × Verlust des schnellen Teils | Weinreich 1977 |
| Verstimmung der Chorsaiten | 0,2 bis 0,9 Cent, zufällig pro Note | Weinreich 1977 |
| Dämpfer T60 | 1,0 s (A0), 0,5 s (C3), 0,26 s (C5), 0,16 s (F6) | Schätzwert |

`render({ midi = 60, velocity = 0.8, duration = 1, seed = 1 })`: `midi` 21 bis 108, gerundet und auf diesen Bereich begrenzt. `velocity` 0 bis 1, ebenfalls begrenzt. `duration` ist die Haltedauer in Sekunden, negative Werte zählen als 0. `seed` steuert die kleinen Abweichungen jeder Note (Verstimmung, Anschlagstelle, Polarisation). `render()` ohne Argument spielt C4. Ist ein Wert keine endliche Zahl, wirft `render` einen `TypeError` mit dem Namen des Parameters.

Gemessen wird der erste Teilton per Hann-Fenster und Spitzensuche im Spektrum über die ersten 0,5 s (unter MIDI 48 über 2 s), gemittelt über vier Saaten. Er liegt im ganzen Umfang höchstens 1,5 Cent neben der Kurve, bei C8 etwa +22,5 statt +22 Cent. Die Reste kommen vom Resonanzboden, der jede Frequenz leicht verschiebt, und von der zufälligen Verstimmung der Chorsaiten.

Das Demo legt einen kleinen eigenen Raumhall (4 Verzögerungsleitungen mit Rückkopplung und Dämpfung) mit geringem Anteil darüber. Im Instrument selbst steckt kein Hall.

## Vergleich mit der Referenz

Referenz war ein frei lizenzierter, gesampelter Konzertflügel aus einer General-MIDI-Klangbank. Gemessen bei MIDI-Velocity 100:

- Spektraler Schwerpunkt C4: Referenz 1708, 1525, 1132, 1085 Hz bei 0,01, 0,1, 0,3 und 1 s. Modell 1547, 1361, 1056, 986 Hz.
- Spektraler Schwerpunkt C6: Referenz 2488, 2683, 2441 Hz, Modell 1959, 1754, 1968 Hz.
- Inharmonizität aus den Teiltönen gemessen: C4 Referenz 3,2e−4, Modell 3,5e−4. C6 Referenz 1,8e−3, Modell 2,1e−3.
- Abklingen des Grundtons C4: Referenz −12 dB nach 1 s und −29 dB nach 3,5 s, Modell −7 und −27 dB.
- Dynamik: zwischen Velocity 40 und 100 liegen bei beiden rund 15 dB. Das Modell wird leise zusätzlich dunkler (Schwerpunkt 906 statt 1547 Hz), die Referenz kaum. Das ist beim echten Flügel so und ein Vorteil des Hammermodells.
- Anschlag: Das Modell erreicht den Spitzenpegel nach etwa 1 ms. Die Referenz braucht länger, weil ihr Sample mit einer Schwebung einsetzt.

## Bekannte Schwächen

- Keine Phantomteiltöne aus der Längsschwingung der Saite. Der Bass klingt dadurch etwas glatter als ein echter Flügel.
- Kein Pedal und keine Resonanz der ungedämpften Nachbarsaiten.
- Mono, keine Mikrofonposition.
- Der Resonanzboden ist ein statistisches Modell, kein gemessener Boden. Filzsteifigkeit und Verlust oberhalb von 2 kHz sind anhand der Messwerte auf die Referenz abgestimmt, nicht an einem echten Flügel gemessen.
- Kein Geräusch der Mechanik beim Loslassen.

## Quellen

- Askenfelt, A. und Jansson, E. V. (1990). From touch to string vibrations. I: Timing in the grand piano action. J. Acoust. Soc. Am. 88(1), 52 bis 63.
- Chaigne, A. und Askenfelt, A. (1994). Numerical simulations of piano strings. I. A physical model for a struck string using finite difference methods. J. Acoust. Soc. Am. 95(2), 1112 bis 1118.
- Conklin, H. A. (1996). Design and tone in the mechanoacoustic piano. Parts I bis III. J. Acoust. Soc. Am. 99(6) und 100(2, 3).
- Fletcher, H. (1964). Normal vibration frequencies of a stiff piano string. J. Acoust. Soc. Am. 36(1), 203 bis 209.
- Fletcher, N. H. und Rossing, T. D. (1998). The Physics of Musical Instruments, 2. Auflage, Kapitel 12. Springer.
- Hall, D. E. (1986). Piano string excitation in the case of small hammer mass. J. Acoust. Soc. Am. 79(1), 141 bis 147, und die Folgeartikel der Reihe.
- Martin, D. W. (1947). Decay rates of piano tones. J. Acoust. Soc. Am. 19(4), 535 bis 541.
- Railsback, O. L. (1938). Scale temperament as applied to piano tuning. J. Acoust. Soc. Am. 9, 274.
- Suzuki, H. (1986). Vibration and sound radiation of a piano soundboard. J. Acoust. Soc. Am. 80(6), 1573 bis 1582.
- Weinreich, G. (1977). Coupled piano strings. J. Acoust. Soc. Am. 62(6), 1474 bis 1484.

Aus den Arbeiten stammen nur Modellgleichungen und gerundete Messwerte. Der Code ist eigenständig geschrieben.
