# Saxophon

Physikalisches Modell eines Saxophons: ein einfaches Rohrblatt auf einer konischen Bohrung. Der Ton
entsteht aus der Rückkopplung zwischen Blatt und Luftsäule, er wird nicht aus Sinusschwingungen
zusammengesetzt. Es gibt keine Samples, keine gemessenen Impulsantworten und keine Soundfont-Daten.
Aus der Literatur stammen nur Gleichungen und veröffentlichte Größenordnungen (siehe Quellen), der
Code ist selbst geschrieben.

Dateien:

- `instruments/saxophone.mjs`: das Instrument (`meta`, `render`)
- `instruments/saxophone/bore.mjs`: Presets, Rohrblattkennlinie, Wandverluste, konische Bohrung als Wellenleiter
- `instruments/saxophone/tuning.mjs`: gemessene Stimmkorrektur (erzeugt)
- `instruments/saxophone/calibrate.mjs`: misst die Stimmung und schreibt `tuning.mjs`
- `demos/saxophone.mjs`: schreibt `out/saxophone.wav`

Verwendet werden außerdem Filter, Verzögerungsleitung und Zufallsdrift aus `instruments/trumpet/dsp.mjs`,
der Dezimierfilter aus `instruments/synth/dsp.mjs`, die Randblenden aus `instruments/winds/dsp.mjs` und
für die Demo der Hall aus `instruments/trumpet/room.mjs`.

## Warum der Konus anders klingt als die Klarinette

Klarinette und Saxophon haben fast dasselbe Mundstück, aber die Klarinette hat ein zylindrisches Rohr.
Ein Zylinder, der am Blatt geschlossen und am Ende offen ist, hat Resonanzen nur bei ungeraden
Vielfachen der Grundfrequenz. Deshalb fehlen der Klarinette im tiefen Register die geraden
Teiltöne, und sie überbläst in die Duodezime.

Ein Kegel, der an der Spitze angeblasen wird, verhält sich wie ein an beiden Enden offenes Rohr: Seine
Resonanzen liegen bei allen ganzzahligen Vielfachen von `c / 2R`, wobei `R` die Länge vom gedachten
Kegelscheitel bis zum offenen Ende ist. Darum hat das Saxophon alle Teiltöne und überbläst in die
Oktave. Im Modell ist das messbar. Gemessen am abgestrahlten Klang (0,35 bis 0,95 s eines Tons
ohne Vibrato, Seed 1) über jeden Ton von 44 bis 80, alle vier Presets und Anschlag 0,2, 0,6 und 1
liegt das Verhältnis der Energie in den ungeraden zu den geraden Teiltönen (H1 bis H8) beim
Saxophon zwischen −2,3 und +8,1 dB, im Mittel je Preset bei +1,0 bis +1,7 dB. Die Klarinette des
Repos liegt über ihren ganzen Umfang zwischen +17 und +26 dB.

## Die Bohrung

### Kegelstumpf und fehlende Spitze

In einem Kegel breiten sich Kugelwellen aus. Mit der Variablen `r · p` (Abstand vom Scheitel mal
Druck) gilt dieselbe Wellengleichung wie im Zylinder, eine Verzögerungsleitung reicht also für den
Kegel. Am Mundstück ist der Kegel aber abgeschnitten, der Scheitel liegt eine Länge `x₀` vor dem
Blatt. Die Eingangsadmittanz des Kegelstumpfs der Länge `L` (bezogen auf den Wellenwiderstand am
Mundstück) ist

```
Y_Stumpf = −j (cot kL + 1 / (k x₀))
```

Der zweite Term ist eine akustische Masse: Am engen Ende muss die Kugelwelle die Luft erst in
Bewegung setzen. Der Stumpf allein hätte unharmonische Resonanzen. Beim echten Instrument ersetzt das
Mundstück die fehlende Spitze, sein Volumen entspricht ungefähr dem Volumen des fehlenden Kegels. Die
Admittanz der fehlenden Spitze, vom Schnitt aus gesehen, ist

```
Y_Spitze = j (1 / (k x₀) − cot k x₀)      ≈ j k x₀ / 3   (das Mundstückvolumen) für kleine k x₀
```

Zusammen ergibt das

```
Y = Y_Stumpf + Y_Spitze = −j (cot kL + cot k x₀)
```

Das ist genau die Admittanz von zwei offenen Zylindern mit demselben Wellenwiderstand, parallel am
Blatt: einer der Länge `L`, einer der Länge `x₀`. Die Resonanzen liegen dort, wo
`sin k(L + x₀) = 0` ist, also exakt harmonisch bei `n · c / 2R` mit `R = L + x₀`. Dieses Ersatzbild ist
in der Literatur als „zylindrisches Saxophon“ bekannt (Dalmont, Kergomard und Mitarbeiter).

Umsetzung in `ConeBore`: zwei Verzögerungsleitungen für die lange Bohrung (hin und zurück), eine
kurze Leitung der Laufzeit `2 x₀ / c` für die Spitze, beide mit Vorzeichenumkehr am offenen Ende. Am
Blatt gilt für den Druck `p` und den Fluss `u` des Blatts (Wellenwiderstand = 1)

```
p = 2 p⁻ + u_L = 2 s⁻ + u_S,   u = u_L + u_S   ⇒   p = (2 p⁻ + 2 s⁻ + u) / 2
```

mit den ankommenden Wellen `p⁻` aus der Bohrung und `s⁻` aus der Spitze.

### Verluste und Tonlöcher

Die Reflexion am offenen Ende ist `−g · LP_Wand(z) · LP_Löcher(z)`.

- **Wandreibung:** Viskose und thermische Verluste wachsen mit `√f`. Für einen Umlauf gilt
  `|R(f)| = exp(−κ L √f)` mit `κ = 0,004` (Subtone 0,005). Ein Verstärkungsfaktor und ein Tiefpass
  erster Ordnung werden pro Note so eingepasst, dass dieser Betrag bei der Grundfrequenz der Bohrung
  und beim Sechsfachen stimmt. Lange Rohre (tiefe Töne) verlieren damit mehr als kurze.
- **Tonlochgitter:** Ein Tiefpass erster Ordnung steht für die Grenzfrequenz des Gitters offener
  Tonlöcher, oberhalb der die Welle durchläuft und abstrahlt. Er liegt bei 1,8 kHz (Alt) bzw.
  1,5 kHz (Tenor) am tiefsten Ton und steigt um eine Oktave pro zwei Oktaven Tonhöhe.

Abgestrahlt wird die Ableitung des Flusses, der das Rohr verlässt (ankommende minus reflektierte
Welle), danach zwei Tiefpässe erster Ordnung, deren Grenzfrequenz mit der Anschlagstärke steigt
(Alt von 2,5 auf 7,5 kHz). Diese letzte Stufe liegt außerhalb der Schleife und ändert die Stimmung
nicht.

### Oktavklappe

Ab dem Ton, an dem das echte Instrument die Oktavklappe öffnet (Alt ab F4, Tenor ab C4, klingend),
ist die Bohrung so lang wie für den Ton eine Oktave tiefer und das Modell spielt auf der zweiten
Resonanz. Die Klappe ist ein Streuknoten mit Massenträgheit in der langen Leitung:

```
p_j = (a₁ + a₂ − u_h / 2) / (1 + K / 2),    u_h ← u_h + K · p_j
```

Sie sitzt bei 0,8 des Abstands vom Mundstück zum Druckknoten der zweiten Mode. Dort lädt sie diese
Mode kaum, dämpft und verstimmt aber die erste. `K` ist so gewählt, dass die Admittanz des Lochs bei der Frequenz der ersten Mode das 2,5fache
der Admittanz der Bohrung beträgt. Das Loch zieht den Ton im zweiten Register um 30 bis 60 Cent nach
oben, das gleicht die Stimmkorrektur aus. Wie beim echten Saxophon würde die
Bohrung auch ohne Klappe in die Oktave springen, wenn man sie hart anbläst. Die Klappe macht diesen
Sprung sicher und für alle Anschlagstärken gleich.

### Wirksame Länge der Spitze

`x₀` ist 0,21 m beim Alt und 0,24 m beim Tenor, Subtone und Growl. Das passt zu einem halben
Öffnungswinkel von gut 2° und einem Mundstückdurchmesser um 1 cm. Zu den hohen Tönen hin wird die
wirksame Spitze kürzer (bis 0,08 m ab E5 beim Alt und D5 beim Tenor), mit einem weichen Übergang. Zwei
Gründe aus den Parameterläufen:

- Je kleiner `x₀ / R`, desto empfindlicher reagiert die Schwingung der tiefen Töne. Bei
  `x₀ = 0,15 m` sprangen viele tiefe Töne in die Oktave, mit 0,21 bis 0,24 m sprechen alle an.
- Die kurze Spitzenleitung hat bei `c / 2 x₀` eine Admittanzpolstelle (Impedanznull). Liegt dort der
  zweite oder dritte Teilton eines hohen Tons, kippt die Schwingung zwischen zwei Tonhöhen, die
  20 Cent auseinanderliegen. Mit 0,08 m liegt diese Stelle oberhalb von 2,1 kHz, über dem zweiten
  Teilton aller Töne.

Das Ersatzbild Mundstück = fehlende Spitze gilt beim echten Instrument ohnehin nur bei tiefen
Frequenzen. Der Verlauf von `x₀` ist eine Anpassung des Modells, keine Messung.

## Rohrblatt

Das Blatt ist ein druckgesteuertes Ventil mit der quasistatischen Kennlinie (dimensionslos, Druck
geteilt durch den Schließdruck)

```
Δp = γ − p
u  = ζ (1 − Δp) √Δp        für 0 ≤ Δp < 1
u  = 0                      für Δp ≥ 1   (Blatt liegt auf)
u  = −ζ (1 − Δp) √(−Δp)    für Δp < 0
```

`γ` ist der Blasdruck, `ζ` die Blattöffnung samt Ansatz. Mit `p = (a + u) / 2` und dem bekannten Teil
`a = 2 p⁻ + 2 s⁻` ist pro Sample `2 (γ − Δp) − a = F(Δp)` zu lösen. Die linke Seite fällt mit der
Steigung −2, die Kennlinie fällt höchstens mit −ζ, für `ζ < 2` ist die Gleichung also streng monoton
und eine Bisektion mit 28 Schritten findet die einzige Lösung.

Beim Kegel schlägt das Blatt in jeder Periode einmal auf: Es ist kurz geschlossen, etwa für den
Bruchteil `x₀ / R` der Periode, und lange offen. Das ist die Helmholtzbewegung des konischen
Rohrblattinstruments, analog zur Haft-Gleit-Bewegung einer gestrichenen Saite. Sie macht das
Spektrum breit: Die Teiltöne fallen nach einer Spaltfunktion ab, mit einer Lücke um den Teilton
`R / x₀`. Beim Alt auf E3 fehlt deshalb der fünfte Teilton fast ganz (−20 dB), die ersten vier liegen
innerhalb von 2 dB.

### Wo die Schwingung stabil ist

Parameterläufe über alle Töne des ersten Registers zeigen: Die Helmholtzbewegung mit einem
Schließen pro Periode ist stabil für `γ` bis etwa 0,44 und `ζ` ab etwa 0,5. Bei höherem Blasdruck
schließt das Blatt zwei- oder viermal pro Periode und der Ton springt in die Oktave oder höher. Das
ist das Überblasen, das Saxophonisten bei den tiefsten Tönen kennen. Das Modell bleibt deshalb bei
`γ = 0,38 … 0,42` und regelt die Dynamik vor allem über `ζ = 0,7 … 1,1`. Weil Ansatz und
Lippenkraft im Modell fehlen, steigen Abstrahlpegel (Faktor 0,3 bis 1) und Grenzfrequenz der
Abstrahlung zusätzlich mit der Anschlagstärke.

Gerechnet wird mit doppelter Abtastrate (96 kHz), ein Tiefpass mit Kaiserfenster (Grenzfrequenz 20,5 kHz)
dezimiert auf 48 kHz. Das Aufschlagen des Blatts erzeugt Ecken in der Druckkurve, deren Anteile
sonst zurückfalten würden.

## Atem, Zunge, Vibrato, Growl

- **Zunge:** Die Zunge gibt das Blatt frei, während der Druck schon ansteht. Blasdruck und Fluss
  setzen in 2 ms ein, eine einzige Stufe läuft durch das Rohr. Das ist auch der Anfangszustand der
  Helmholtzbewegung, der Ton spricht sofort im richtigen Register an. `legato` setzt in 4 ms ohne
  Zungenstoß ein. Nach `duration` fällt der Druck in 50 ms ab, das Rohr klingt 0,3 s aus.
- **Atemgeräusch:** Turbulenz am Blattspalt moduliert den Fluss (bandbegrenzt 0,8 bis 4 kHz) und
  läuft so durch die Resonanzen der Bohrung. Ein kleiner direkter Rauschanteil (1,5 bis 6 kHz),
  proportional zur Wurzel des Flusses, steht für das hörbare Anblasgeräusch. `breath` skaliert beides.
- **Vibrato:** Kiefervibrato mit 5,05 bis 5,55 Hz. Die Blattöffnung schwankt um ±6 % mal Tiefe, die
  Bohrung wird um ±14 Cent mal Tiefe gestreckt (die Nachgiebigkeit des Blatts, die beim echten
  Instrument die Tonhöhe ändert, fehlt im quasistatischen Modell). Es setzt nach 0,3 der Notenlänge
  (höchstens 0,35 s) ein und wächst über 0,4 s.
- **Growl:** Der Spieler summt oder singt beim Spielen. Die Stimme ist eine Pulsfolge der Stimmlippen
  bei 92 bis 122 Hz (je nach `seed`), additiv aus Harmonischen bis 2,5 kHz mit Abfall `h^−1,5` und
  einer kleinen Tonhöhendrift. Sie moduliert Munddruck (±30 % mal `growl`) und Blattöffnung
  (±30 %), und ein Teil des Stimmflusses gelangt direkt ins Rohr. Die Rauigkeit entsteht durch
  Intermodulation im nichtlinearen Blatt. Gemessen am Growl-Preset (C3 bis F5, Anschlag 0,8) liegt
  der Anteil der Energie zwischen den Teiltönen ohne Stimme bei −21 bis −35 dB, mit `growl: 1` bei
  −4 bis −18 dB, am stärksten im höchsten Ton.
- **Drift:** Blasdruck und Rohrlänge wandern langsam zufällig (deterministisch über `seed`).

## Presets

| Preset | Bohrung | Charakter |
|---|---|---|
| `alto` | Alt, `x₀` 0,21 m, Gitter 1,8 kHz, Oktavklappe ab F4 | hell, klar |
| `tenor` | Tenor, `x₀` 0,24 m, Gitter 1,5 kHz, Oktavklappe ab C4 | voller, etwas dunkler |
| `soft` | Tenor mit Subtone: Gitter 1,1 kHz, mehr Wandverlust, Blatt kaum geöffnet, viel Atem, Abstrahlung bis 3 kHz | dunkel, hauchig |
| `growl` | Tenor mit Growl 0,8 und mehr Atem | rau, schmutzig |

Beim Subtone legt der Spieler mehr Unterlippe auf das Blatt und dämpft es. Im Modell heißt das:
kleinerer Blasdruckbereich, kleinere Öffnung, stärkere Verluste und deutlich mehr Luftgeräusch.

Der Umfang `meta.range` ist [44, 80], vom tiefen As des Tenors (Ab2) bis zum hohen As des Alts
(Ab5), klingend. Jedes Preset spielt den ganzen Umfang. Außerhalb des echten Umfangs (Alt unter
Db3, Tenor über Eb5) verhält sich das Modell wie ein entsprechend verlängertes oder verkürztes
Instrument.

## Stimmung

Das gekoppelte System schwingt nicht genau auf der Rohrresonanz: Phasen von Wand und Gitterfilter,
die Spitzenleitung und im zweiten Register die Oktavklappe ziehen den Ton nach oben, um 5 Cent
(tiefe Töne) bis 62 Cent (zweites Register). Die Phasenlaufzeit der Filter bei der Zielfrequenz wird
analytisch von der Rohrlänge abgezogen. Den Rest misst `calibrate.mjs` für jedes Preset, jeden Ton
und fünf Anschlagstärken (FFT über 0,68 s ab 0,45 s, Hann-Fenster, logarithmisch-parabolische
Spitzeninterpolation) und schreibt die Tabelle `tuning.mjs`. Beim Rendern wird das ganze Instrument,
Spitze und Lage der Oktavklappe eingeschlossen, um diesen Wert gestaucht, auch während eines
Crescendos. Jeder Lauf misst den Rest mit der aktuellen Tabelle und addiert ihn. Nach Änderungen am
Modell `node instruments/saxophone/calibrate.mjs` zwei- bis dreimal aufrufen.

## Schnittstelle

```js
import { render, meta } from './instruments/saxophone.mjs';
// meta = { name: 'Saxophone', range: [44, 80], presets: ['alto', 'tenor', 'soft', 'growl'] }
render({
  midi: 60,              // Standard 60, wird auf meta.range begrenzt
  velocity: 0.8,         // 0..1 oder [start, ende] für Crescendo und Diminuendo
  duration: 1,           // Sekunden bis zum Absetzen (0,02 bis 60), Ausklang kommt dazu
  seed: 1,               // Drift, Vibratofrequenz, Stimmhöhe beim Growl; auch Kommazahlen
  preset: 'alto',        // 'alto', 'tenor', 'soft', 'growl'
  vibrato: undefined,    // undefined: Preset-Tiefe bei Noten über 0,6 s, 0: aus, bis 1
  breath: undefined,     // Luftgeräusch 0..1, undefined: Preset
  growl: undefined,      // Stimme ins Horn 0..1, undefined: Preset
  articulation: 'tongue' // oder 'legato'
}); // Float64Array, mono, 48 kHz
```

Zahlen außerhalb ihres Bereichs werden begrenzt. Ist eine Zahl nicht endlich (etwa `NaN`) oder kein
Zahlwert, ist das Velocity-Array leer, das Preset unbekannt oder die Artikulation weder `'tongue'`
noch `'legato'`, wirft `render` einen Fehler mit dem Namen des Parameters. `render()` und
`render({})` liefern ein Alt-C4. Gleiche Argumente ergeben bitgleich dasselbe Signal.

Pegel: Ein fester Faktor pro Preset hinter der Schleife ist so gewählt, dass der lauteste Fall im
ganzen Optionsraum (Velocity 1, Atem 1, Growl 1, Vibrato 1, alle Töne, mehrere Seeds) um −3,3 dBFS
liegt. Kein Limiter, keine Sättigung auf dem Ausgang. Jede Note beginnt und endet exakt bei null.

## Messungen

Prüflauf über alle vier Presets: jeder zweite Halbton von 44 bis 80, Anschlag 0,2, 0,6 und 1, Seeds
1, 2 und 7,5, dazu Legato, Crescendo von 0 auf 1, Diminuendo mit Growl, Atem, Growl und Vibrato auf
dem Maximum, lange Noten mit Vibrato (251 Noten pro Preset).

| | Alt | Tenor | Subtone | Growl |
|---|---|---|---|---|
| größte Spitze | −3,3 dBFS | −3,3 dBFS | −3,3 dBFS | −3,3 dBFS |
| größter Sprung zwischen zwei Samples | 0,25 | 0,26 | 0,18 | 0,27 |
| NaN, erstes/letztes Sample ≠ 0 | 0 | 0 | 0 | 0 |
| Gleichanteil | < 10⁻⁶ | < 10⁻⁶ | < 10⁻⁶ | < 10⁻⁶ |
| größte Tonhöhenabweichung | 2,4 Cent | 2,4 Cent | 2,4 Cent | 2,4 Cent |

Die größten Sprünge liegen im höchsten Ton mit Growl und Atem auf dem Maximum, also in einer sehr
obertonreichen Wellenform, nicht am Anfang oder Ende einer Note.

Ansprache: Für jedes Preset, jeden Ton von 44 bis 80, Anschlag 0, 0,5 und 1, gestoßen und gebunden
wurde der Druck im Mundstück untersucht (Unterharmonische, Verhältnis ungerader zu gerader Teiltöne,
Tonhöhe). Von 888 Fällen spielen 887 im vorgesehenen Register. Die Ausnahme ist das Growl-Preset auf
A3 bei Anschlag 1, wo die Stimme die Schwingung zeitweise in die Oktave kippen lässt. Das gehört zum
Growl.

Spektraler Schwerpunkt und Spitze bei Anschlag 0 / 0,5 / 1 (ohne Vibrato):

| Ton | Alt | Tenor | Subtone |
|---|---|---|---|
| E3 | 628 / 797 / 987 Hz | 591 / 757 / 970 Hz | 446 / 524 / 608 Hz |
| E4 | 891 / 1050 / 1252 Hz | 795 / 878 / 960 Hz | 695 / 758 / 814 Hz |
| C5 | 1054 / 1466 / 2007 Hz | 1120 / 1329 / 1576 Hz | 945 / 1077 / 1205 Hz |

Zwischen Anschlag 0 und 1 liegen beim Alt und Tenor etwa 16 dB Pegel, beim Subtone etwa 11 dB.

Rechenzeit: etwa 0,1 s pro Sekunde Ton, eine 10 s lange Note braucht 1,6 s.

Demo (`out/saxophone.wav`, 33,6 s, Stereo mit Hall, 42 Noten: eine Altphrase in d-Moll, eine
Subtone-Linie, ein Growl-Riff und ein kurzer Tenorschluss): Spitze −3,0 dBFS, True Peak −2,9 dBTP,
−15,0 LUFS integriert, Lautheitsumfang 8,5 LU, größter Sprung 0,21. Sie rendert in knapp 3 s.

## Grenzen

- Das Blatt ist quasistatisch. Seine Masse und Eigenresonanz fehlen, damit auch das Quietschen über
  die Blattresonanz, Altissimo und die Tonhöhenänderung durch die Nachgiebigkeit des Blatts.
- Der stabile Bereich des Blasdrucks ist im Modell schmal. Laute Töne entstehen über die
  Blattöffnung und den Abstrahlpegel, nicht über höheren Druck. Ein echtes Fortissimo mit stark
  wachsender Helligkeit bildet das Modell nur teilweise nach.
- Tonlöcher sind nicht einzeln modelliert, nur über Rohrlänge und Gitterfilter. Gabelgriffe und die
  Klangunterschiede zwischen Griffen fehlen.
- Der Verlauf der wirksamen Spitzenlänge über die Tonhöhe ist an das Modell angepasst, nicht an ein
  gemessenes Instrument.
- Jede Note ist ein eigenes Modell, gebundene Töne werden überblendet.
- Die Stimme beim Growl ist eine einfache Pulsfolge, kein Modell des Vokaltrakts.

## Quellen

Nur Gleichungen und Größenordnungen, kein Code:

- A. H. Benade: *Fundamentals of Musical Acoustics*. Oxford University Press, 1976. Konische
  Bohrungen, Tonlochgitter.
- N. H. Fletcher, T. D. Rossing: *The Physics of Musical Instruments*, 2. Aufl., Springer, 1998,
  Kapitel 8 und 15.
- J. Kergomard: Elementary considerations on reed-instrument oscillations. In: A. Hirschberg,
  J. Kergomard, G. Weinreich (Hrsg.), *Mechanics of Musical Instruments*, Springer, 1995.
  Dimensionslose Kennlinie mit `γ` und `ζ`.
- J.-P. Dalmont, J. Gilbert, S. Ollivier: Nonlinear characteristics of single-reed instruments:
  Quasistatic volume flow and reed opening measurements. J. Acoust. Soc. Am. 114(4), 2003.
- S. Ollivier, J.-P. Dalmont, J. Kergomard: Idealized models of reed woodwinds. Part I: Analogy with
  the bowed string. Acta Acustica united with Acustica 90, 2004. Zylindrisches Saxophon,
  Helmholtzbewegung.
- C. J. Nederveen: *Acoustical Aspects of Woodwind Instruments*. Northern Illinois University Press,
  1998. Mundstückvolumen, Register- und Oktavlöcher.
- J. O. Smith III: Physical modeling using digital waveguides. Computer Music Journal 16(4), 1992.
- G. P. Scavone: An acoustic analysis of single-reed woodwind instruments with an emphasis on
  design and performance issues and digital waveguide modeling techniques. Dissertation, Stanford
  University, 1997. Konische Wellenleiter.
- J.-M. Jot, A. Chaigne: Digital delay networks for designing artificial reverberators. 90. AES
  Convention, 1991. Hall der Demo.
