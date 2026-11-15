# Oboe und Englischhorn

Physikalisches Modell eines Doppelrohrblattinstruments mit enger, kegelförmiger Bohrung. Der Ton entsteht aus der Rückkopplung zwischen dem Rohrblatt, das den Luftstrom steuert, und den Druckwellen im Kegel. Es gibt keine Samples, keine gemessenen Impulsantworten und keine Soundfont-Daten. Der Code ist selbst geschrieben, aus der Literatur stammen nur die Gleichungen (siehe Quellen).

Dateien:

- `instruments/oboe.mjs`: das Instrument (`meta`, `render`)
- `instruments/oboe/presets.mjs`: Bohrungs- und Rohrblattdaten für Oboe und Englischhorn
- `instruments/oboe/tuning.mjs`: gemessene Stimmkorrektur (erzeugt)
- `instruments/oboe/calibrate.mjs`: misst die Stimmung des Modells und schreibt `tuning.mjs`
- `demos/oboe.mjs`: eine Pastorale in d-Moll, schreibt `out/oboe.wav`

Filter, Verzögerungsleitung und Dezimierung kommen aus `instruments/trumpet/dsp.mjs` und `instruments/synth/dsp.mjs`, der Raum der Demo aus `instruments/winds/room.mjs`.

## Aufruf

```js
render({ midi, velocity, duration, seed, preset, vibrato, articulation, breath })
```

| Parameter | Bereich | Standard | Bedeutung |
|---|---|---|---|
| `midi` | 52 bis 93, auch gebrochen | 69 | Tonhöhe, wird auf den Bereich begrenzt |
| `velocity` | 0,05 bis 1 | 0,8 | Blasdruck |
| `duration` | 0,02 bis 30 s | 1 | Dauer bis zum Absetzen des Atems |
| `seed` | beliebige Zahl | 1 | Zufallsdrift und Atemrauschen, gleiche Argumente ergeben dasselbe Signal |
| `preset` | `'oboe'`, `'english-horn'` | `'oboe'` | Instrument |
| `vibrato` | 0 bis 1,5 | automatisch | ohne Angabe: verzögertes Vibrato bei Tönen über 0,6 s mit Tiefe 0,7 |
| `articulation` | `'tongue'`, `'legato'` | `'tongue'` | gestoßen oder gebunden |
| `breath` | 0 bis 2 | 1 | Anteil des Atemrauschens |

Das Ergebnis ist ein `Float64Array` in Mono bei 48 kHz, einschließlich Ausklang. Erstes und letztes Sample sind null. Nicht endliche Zahlen und unbekannte Werte für `preset` oder `articulation` lösen einen Fehler mit dem Namen des Parameters aus, zu große oder zu kleine Zahlen werden begrenzt.

`meta.range` ist 52 bis 93. Der übliche Umfang steht in `meta.ranges`: Oboe B3 bis A6 (58 bis 93), Englischhorn E3 bis C6 (52 bis 84), also eine Quinte tiefer. Außerhalb davon verlängert oder verkürzt das Modell einfach die Bohrung.

## Bohrung: Kegelstumpf

Die Bohrung der Oboe ist ein schlanker Kegel, der am Rohrblatt abgeschnitten ist. Die fehlende Spitze hat die Länge `x₀`, vom gedachten Scheitel bis zum Rohrblatt. Für Kugelwellen in einem Kegel der Länge `L` mit offenem Ende ist die Eingangsadmittanz am schmalen Ende

```
Y = (S / ρc) · ( 1/(j k x₀) − j cot(kL) )
```

Der erste Term ist die Masse der Luft, die in der fehlenden Spitze schwingen würde. Ein kurzes offenes Rohr der Länge `x₀` hat bei kleinem `k x₀` dieselbe Admittanz `−j cot(k x₀) ≈ 1/(j k x₀)`. Das Modell setzt deshalb zwei zylindrische Wellenleiter parallel an das Rohrblatt, beide mit demselben Wellenwiderstand:

```
Y = −j (cot kL + cot k x₀) / Z_c
```

Die Nullstellen liegen bei `sin k(L + x₀) = 0`, also bei allen ganzzahligen Vielfachen von `c / 2(L + x₀)`. Daraus folgt, was den Kegel vom Zylinder der Klarinette unterscheidet: Der Kegel hat alle Teiltöne, und er überbläst in die Oktave. Die Näherung hat einen Preis, der hier gewollt ist. Bei `k x₀ = π` schwingt der kurze Zweig selbst, die Impedanz hat dort eine Nullstelle. Bei der Oboe (`x₀` = 8 cm) liegt diese Antiresonanz bei etwa 2,1 kHz, beim Englischhorn (`x₀` = 11 cm) bei etwa 1,6 kHz. Sie trennt im Spektrum einen tieferen von einem höheren Bereich starker Teiltöne.

An der Verbindung gilt mit `Z_c = 1` für die ankommenden Wellen `a₁` (Hauptrohr) und `a₂` (Spitze) und den Fluss `u` aus dem Rohrblatt

```
p = a₁ + a₂ + u/2,    b₁ = p − a₁,    b₂ = p − a₂
```

Das Rohrblatt sieht also die Impedanz `1/2`.

Verluste: Am offenen Ende reflektiert das Hauptrohr mit `−g · TP(z) · HP(z)`. Der Tiefpass erster Ordnung steht für das Gitter der offenen Tonlöcher, oberhalb dessen Grenzfrequenz die Welle durchläuft statt zurückzukommen (Benade 1976). Er liegt bei der Oboe bei 2,5 kHz plus 25 Hz je Halbton, beim Englischhorn bei 1,8 kHz plus 25 Hz je Halbton. `g` = 0,975 (mit Oktavklappe 0,971) sammelt die Wandverluste. Der Hochpass bei 30 Hz hält Gleichanteile aus der Schleife. Der Zweig der Spitze reflektiert mit `−0,997` und einem Tiefpass bei 9 kHz.

Die Laufzeiten der Leitungen ergeben sich aus der gespielten Frequenz `f`, der Nummer `m` der Resonanz und den Phasenlaufzeiten der Filter `τ` bei `f`:

```
T = m · fs / (2f) · k,    T_Spitze = x₀ / c · fs,    T_Haupt = T − T_Spitze − τ/2
```

`k` ist die gemessene Stimmkorrektur. Gerechnet wird mit 96 kHz, die Leitungen lesen mit kubischer Interpolation.

## Rohrblatt

Das Doppelrohrblatt ist ein Ventil, das sich bei steigendem Druckunterschied schließt. In dimensionslosen Größen (Druck geteilt durch den Schließdruck) fließt durch den Spalt nach Bernoulli

```
u = ζ · h · sign(Δp) · √|Δp|,    Δp = γ − p,    h = max(0, 1 − x)
```

`γ` ist der Blasdruck, `ζ` die Kennzahl des Blatts (Öffnung und Wellenwiderstand), `x` die Auslenkung zum Schließen hin. Bei `x ≥ 1` liegen die Blätter aufeinander, der Fluss ist null. Weil `p` selbst von `u` abhängt, ist das eine implizite Gleichung. Mit `A = γ − a₁ − a₂` wird sie zu einer quadratischen Gleichung in `u`, die das Modell geschlossen und numerisch stabil löst:

```
u = 2c / (b + √(b² + 4c)),    b = (ζh)²/2,    c = (ζh)² |A|,    Vorzeichen von A
```

Die Blätter mit den Lippen darauf sind ein gedämpfter Feder-Masse-Schwinger, angetrieben vom Druckunterschied des vorigen Samples:

```
x'' + (ω_r / Q) x' + ω_r² x = ω_r² Δp,    ω_r = 2π · 1,3 f,    Q = 4
```

Der Ansatz stimmt die Resonanz des Blatts knapp über den gespielten Ton. Das ist für den Kegel entscheidend. Bei einem Kegelstumpf ist die erste Impedanzspitze schwächer als die zweite und dritte, und ein quasistatisches Blatt springt deshalb leicht in die Oktave oder die Duodezime. Erst eine Resonanz bei dem 1,2 bis 1,4fachen des Tons mit `Q` ab 3 hält jeden Ton im Grundregister bei allen Anschlagstärken zuverlässig auf dem Grundton. Oboisten kennen das als Arbeit des Ansatzes. `ζ` = 0,8, `γ` = 0,45 bis 0,65 je nach `velocity`.

Turbulenz am Spalt moduliert den Fluss um wenige Prozent (gefiltertes Rauschen zwischen 700 Hz und 5 kHz). Ein leises Atemrauschen kommt zum abgestrahlten Schall dazu, beides skaliert mit `breath`.

## Register

| | Oboe | Englischhorn | Modell |
|---|---|---|---|
| Grundregister | bis C♯5 (73) | bis F♯4 (66) | erste Resonanz |
| Oktavklappe | D5 bis G5 (74 bis 79) | G4 bis H4 (67 bis 71) | zweite Resonanz, Registerloch offen |
| drittes Register | ab A♭5 (80) | ab C5 (72) | verkürzte Bohrung, erste Resonanz |

Mit Oktavklappe bleibt die Bohrung so lang wie für den Ton eine Oktave tiefer. Das Registerloch ist eine Querverbindung mit Massenträgheit (Admittanz ∝ 1/(jωm)) zwischen zwei Abschnitten des Hauptrohrs:

```
p_j = (b₁ + b₂ − u_h/2) / (1 + K/2),    u_h ← u_h + K · p_j
```

Es sitzt bei 0,92 des Abstands vom Rohrblatt zum ersten Druckknoten der zweiten Resonanz. Dieser Knoten liegt im Kegel bei `r = λ/2` vom Scheitel, im parallelen Ersatzmodell an derselben Stelle des Hauptrohrs. Dort stört das Loch den gespielten Ton und seine Obertöne kaum, verstimmt und dämpft aber die tiefere Resonanz. Darüber gibt es im Modell keine Lochgröße, mit der der Ton zuverlässig auf der zweiten Resonanz bleibt. Die echten Griffe dort sind Gabelgriffe und Halbloch, das Modell spielt diese Töne deshalb als kurze Bohrung auf der ersten Resonanz. Die Spitze wird dabei auf höchstens 25 % der klingenden Länge begrenzt, sonst entstehen bei leisen hohen Tönen Subharmonische.

## Anstoß und Absetzen

Gestoßen: Der Druck baut sich in 12 ms hinter der Zunge auf, die Zunge gibt das Blatt nach 8 ms innerhalb von 3 ms frei (`h` wird mit dieser Öffnung multipliziert). Gebunden: kein Zungenstoß, das Blatt öffnet sich in 12 ms, der Druck steigt in 30 ms. In den ersten Zehntelsekunden kommt ein Druckstoß dazu, `γ · (1 + κ e^(−t/40 ms))`, mit `κ` = 0,5 bis eine Quarte über dem tiefsten Ton, danach abnehmend und null ab zwei Oktaven darüber (gebunden 60 % davon). Die schwache erste Resonanz des Kegels spricht sonst zu langsam an. Am Ende fällt der Druck in 45 ms (gebunden 50 ms) auf null, die Bohrung klingt 0,25 s aus.

Vibrato ist ein Atemvibrato mit 5,0 bis 5,6 Hz, nach einer Verzögerung von bis zu 0,45 s weich eingeblendet. Es moduliert den Blasdruck um ±10 % je Tiefeneinheit und die Laufzeit des hinteren Rohrabschnitts. Bei Tiefe 0,7 schwankt die Tonhöhe um etwa ±8 Cent, bei 1,5 um etwa ±18 Cent. Dazu kommt eine langsame Zufallsdrift von Druck und Tonhöhe.

## Abstrahlung

Der Schall kommt aus zwei Quellen. Am Ende ist es die Ableitung des austretenden Flusses, der Differenz aus ankommender Welle `x` und reflektierter Welle. Durch die Tonlöcher tritt der Teil aus, den das Gitter nicht reflektiert, also vor allem Anteile oberhalb der Grenzfrequenz:

```
v = (x − r) + 2 · (x − TP·HP(x)),    Schall ∝ dv/dt
```

Danach folgen ein Hochpass erster Ordnung (Oboe 600 Hz, Englischhorn 400 Hz) für die kleinen Abstrahlflächen, zwei Formantfilter (Oboe +8 dB bei 1250 Hz und +5 dB bei 3 kHz, Englischhorn +7 dB bei 900 Hz und +3 dB bei 2,3 kHz) und zwei Tiefpässe (Oboe 6,5 kHz, Englischhorn 4,8 kHz). Das Englischhorn hat einen Liebesfuß, einen birnenförmigen Schallbecher mit enger Öffnung. Sein Hohlraum wirkt als Resonator bei etwa 620 Hz (+6 dB) und macht den Klang runder und dunkler.

Weil die Ableitung und der Hochpass hohe Töne bevorzugen, skaliert der Ausgang mit `(440 Hz / f)^0,85` und mit `0,35 + 0,65 · velocity`. Der feste Pegel je Preset ist so gewählt, dass der lauteste Ton über alle Töne, Seeds und Optionen bei etwa −3 dBFS liegt. Es gibt keinen Begrenzer.

## Entfaltung der Nichtlinearität

Das aufschlagende Blatt erzeugt Knicke im Fluss und damit Obertöne bis weit über die Nyquist-Frequenz. Das Modell rechnet deshalb mit doppelter Abtastrate. Ein Kaiser-Fenster-Tiefpass bei 20,5 kHz filtert vor dem Heruntertasten auf 48 kHz. Im Spektrogramm des höchsten Tons (A6, volle Stärke, starkes Vibrato) liegen alle Linien auf Vielfachen des Grundtons, gespiegelte Anteile sind nicht zu sehen.

## Stimmung

Die Resonanz des Blatts knapp über dem Ton und die Filter in der Bohrung ziehen das Spiel etwas von der idealen Kegelresonanz weg. `calibrate.mjs` rendert jeden Halbton von 52 bis 93 für beide Presets bei fünf Anschlagstärken ohne Vibrato, misst die Grundfrequenz (Hann-Fenster, 32768 Punkte, logarithmisch-parabolische Spitzeninterpolation) und schreibt die Abweichung in `tuning.mjs`. `render()` verlängert oder verkürzt die Bohrung um diesen Betrag, gebrochene Tonhöhen und Anschlagstärken werden linear interpoliert. Nach dem zweiten Durchlauf (der die Restabweichung zur Tabelle addiert) ist die Tabelle stabil. Ohne Korrektur lag das Modell zwischen −25 und +18 Cent.

## Messungen

Alle Werte stammen aus Messläufen über das fertige Modell.

- Tonhöhe: jeder Halbton von 52 bis 93, beide Presets, sechs Anschlagstärken von 0,05 bis 1, drei Seeds, ohne Vibrato: größte Abweichung 1,1 Cent. Eine Periodenschätzung nach YIN prüft dabei, ob der Ton wirklich auf dem Grundton läuft. Es gab keinen einzigen Sprung in Oktave oder Duodezime.
- Pegel: der lauteste Ton über alle Halbtöne, sechs Seeds, Vibrato 1,5 und Atem 2 liegt bei −3,1 dBFS (Oboe) und −3,0 dBFS (Englischhorn). Im Raster aus jedem zweiten Halbton, Anschlagstärken 0,2, 0,6 und 1, Seeds 1, 2,5 und 99 und den Randwerten aller Optionen (603 Töne) ist der größte Sprung von einem Sample zum nächsten 0,19, kein Wert ist NaN oder unendlich, erstes und letztes Sample sind immer null, der Gleichanteil liegt unter 10⁻⁸.
- Vibrato: Tiefe 0,7 ergibt etwa ±8 Cent und 1 bis 2 dB Pegelschwankung, Tiefe 1,5 etwa ±18 Cent und 2 bis 4 dB.
- Ansprache (Zeit bis zum halben Endpegel, gestoßen, mittlere Stärke): Oboe B3 70 ms, E4 30 ms, ab B4 25 ms und weniger. Englischhorn E3 105 ms, B3 40 ms. Gebunden dauert es etwa doppelt so lang.
- Spektrum der Oboe auf B3: Teiltöne bis 1,4 kHz fast gleich stark, Einbruch um 2,1 kHz (Antiresonanz der Spitze), zweiter Bereich starker Teiltöne zwischen 2,3 und 3,3 kHz. Das Englischhorn hat sein Maximum um 600 bis 700 Hz und fällt darüber deutlich steiler ab.
- Rechenzeit: ein Ton von 10 s braucht etwa 0,75 s.
- Demo: −18,0 LUFS, Spitze −3,0 dBFS (auch als True Peak).

## Quellen

- A. H. Benade (1976): Fundamentals of Musical Acoustics. Grenzfrequenz des Tonlochgitters, Kegel und Registerlöcher.
- N. H. Fletcher, T. D. Rossing (1998): The Physics of Musical Instruments. Eingangsimpedanz von Kegeln, Rohrblattventil.
- J.-P. Dalmont, J. Gilbert, J. Kergomard (2000): Reed instruments, from small to large amplitude periodic oscillations and the Helmholtz motion analogy. Kegel als Paar paralleler Zylinder, Schwingungsformen.
- S. Ollivier, J.-P. Dalmont, J. Kergomard (2004): Idealized models of reed woodwinds. Part I: Analogy with the bowed string.
- A. Almeida, C. Vergez, R. Caussé (2007): Quasistatic nonlinear characteristics of double-reed instruments.
