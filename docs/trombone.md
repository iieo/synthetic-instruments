# Posaune

Physikalisches Modell einer Tenorposaune in B, komplett aus Gleichungen berechnet. Es gibt keine
Samples, keine gemessenen Impulsantworten und keine Soundfont-Daten. Der Code ist selbst
geschrieben. Aus der Literatur stammen nur physikalische Gesetze und veröffentlichte Größenordnungen
(siehe Quellen).

Dateien:

- `instruments/trombone.mjs`: das Instrument (`meta`, `render`), Prüfung der Parameter, Presets
- `instruments/trombone/voice.mjs`: Lippen, Bohrung, Schalltrichter, Stoßwellen
- `instruments/trombone/slide.mjs`: Zug, Naturtöne, Positionswahl und Glissando-Planung
- `instruments/trombone/mute.mjs`: Dämpferfilter
- `instruments/trombone/tuning.mjs`: gemessene Stimmkorrektur (erzeugt)
- `instruments/trombone/calibrate.mjs`: misst die Stimmung und schreibt `tuning.mjs`
- `demos/trombone.mjs`: kurze Bluesphrase mit Glissandi, schreibt `out/trombone.wav`

Das Modell baut auf der Trompete dieser Sammlung auf (siehe `trumpet.md`) und benutzt deren
Filter, Verzögerungsleitung, Dezimierfilter und die nichtlineare Rohrscheibe. Neu sind der Zug, der
die Rohrlänge während des Tons stetig verändert, die Wahl von Naturton und Position, die Glissandi
und die Dämpfer.

## Aufbau des Modells

Drei gekoppelte Teile: die Lippen als schwingendes Ventil, die Luftsäule als Wellenleiter mit
veränderlicher Länge und der Schalltrichter als frequenzabhängiger Reflektor und Abstrahler.
Gerechnet wird mit 96 kHz, ein Blackman-Fensterfilter mit 96 Taps dezimiert am Ende auf 48 kHz.

### Lippen

Gedämpfter Feder-Masse-Schwinger, vom Mundraumdruck `p_m` aufgedrückt und vom Druck im Mundstück
`p` zugedrückt:

```
y'' + (ω_l / Q_l) y' + ω_l² y = (p_m − p) / μ
```

Die Lippen schlagen nach außen (Fletcher 1993) und schwingen deshalb oberhalb ihrer eigenen
Resonanz: `ω_l = 2π · 0,88 · f` mit dem gespielten Ton `f`, Güte `Q_l = 5`. Die Masse pro Fläche
fällt mit der Tonhöhe, `μ = 3 · (262 Hz / f)^1,5` kg/m². Bei tiefen Tönen schwingt viel
Lippengewebe mit, bei hohen wenig. Der Exponent 1,5 statt 2 wie bei der Trompete gibt den tiefen
Tönen im Forte mehr Obertöne und lässt die hohen Naturtöne sauber einrasten.

Der Luftstrom folgt Bernoulli durch einen 12 mm breiten Spalt. Die implizite Gleichung aus Strom
und Druck im Mundstück wird in geschlossener Form gelöst, ohne Iteration:

```
u = 2 k a / (k Z_c + sqrt(k² Z_c² + 4 |a|)),   a = p_m − 2 p⁻,   k = b · max(y, 0) · sqrt(2/ρ)
```

`Z_c = ρ c / S` gehört zu einem Rohr mit 6,9 mm Radius, dem Innenmaß eines typischen Tenorzugs.

### Bohrung und Zug

Die Luftsäule ist eine Verzögerungsleitung. Wie bei der Trompete bildet das Modell das Ergebnis von
Mundstück und Schalltrichter direkt ab: Die Resonanzen liegen nahezu harmonisch bei `k · F`. In der
ersten Position ist `F = 58,27 Hz`, das Pedal-B1. Die wirksame akustische Länge ist dann
`c / (2F) = 2,94 m`.

Der Zug verlängert das Rohr. Ist er um `s` Halbtöne ausgezogen, gilt

```
F(s) = 58,27 Hz · 2^(−s/12),    L(s) = 2,94 m · 2^(s/12)
```

Weil das Zugrohr doppelt geführt ist, bewegt die Hand den Zug um die halbe Längenänderung. Die
Abstände der Positionen wachsen deshalb nach außen: Von der ersten zur zweiten Position sind es im
Modell 8,7 cm, von der sechsten zur siebten 11,7 cm, vom Anschlag bis zur siebten Position
insgesamt 64 cm.
Das passt zur Größenordnung echter Posaunen.

Die Schleifenlänge in Proben ist `RS / F(s)` minus der Phasenlaufzeit der Filter in der Schleife,
ausgewertet bei der aktuellen Spielfrequenz. Sie wird alle 16 Proben neu berechnet und dazwischen
linear interpoliert, die Leitung liest mit kubischer Hermite-Interpolation. So gleitet die
Tonhöhe ohne Stufen und ohne Knacken, auch bei schnellen Zugbewegungen. Ein Hochpass bei `F(s)/2`
dämpft die Pedalresonanz und wandert mit dem Zug mit.

Der Zug hat Anschläge. Der Stimmzug ist so gesetzt, dass der ganz eingeschobene Zug 0,35 Halbtöne
zu hoch klingt. Gespielt wird die erste Position deshalb leicht ausgezogen, und zu tiefe Naturtöne
(der fünfte liegt 14 Cent unter der gleichstufigen Terz) lassen sich durch Hineinschieben
korrigieren. Außen endet der Zug bei 6,4 Halbtönen. Kein Glissando und keine Note führt über diese
Grenzen hinaus.

### Naturtöne und Positionen

Ein Ton entsteht aus Naturton `n` und Zugstellung `s`: `f = n · F(s)`. Benutzt werden die
Naturtöne 2 bis 10 und 12. Der elfte ist auch bei echten Posaunen kaum brauchbar. `position()`
wählt für einen einzelnen Ton den Naturton mit dem kürzesten Zug, so wie die üblichen Griffe:

| Ton | Naturton | Zug (Halbtöne) | Position |
|-----|----------|----------------|----------|
| E2  | 2 | 6,00 | 7 |
| A2  | 2 | 1,00 | 2 |
| D3  | 3 | 3,02 | 4 |
| F3  | 3 | 0,02 | 1 |
| G3  | 4 | 3,00 | 4 |
| H3  | 5 | 2,86 | 4, etwas hoch |
| D4  | 5 | −0,14 | 1, hineingeschoben |
| E4  | 6 | 1,02 | 2 |
| G4  | 7 | 0,69 | 2, tief |
| C5  | 9 | 0,04 | 1 |
| Es5 | 12 | 2,02 | 3 |
| F5  | 12 | 0,02 | 1 |

Die Stimmung jeder Position ergibt sich aus dieser Rechnung: Wo ein Naturton von der gleichstufigen
Stimmung abweicht, sitzt die Position entsprechend weiter innen oder außen. Auf dem zwölften
Naturton halten die Lippen den Ton in den langen Positionen nicht mehr sauber (im Modell
gemessen: ab etwa drei Halbtönen Zug springt er im Forte um). Dort ist der Zug deshalb auf 2,2
Halbtöne begrenzt, tiefere Töne laufen über den zehnten oder neunten Naturton.

### Glissando

Das Glissando ist der Grund, warum es eine Posaune gibt. Im Modell verändert sich während des Tons
nur die Länge der Verzögerungsleitung, also der Zug. Die Lippen bleiben auf ihrem Naturton, ihre
Spannung folgt der Tonhöhe. Ein Ton gleitet deshalb stetig von einer Position zur nächsten, ohne
neuen Anstoß.

Geplant wird in `slidePlan()`:

1. Für jeden Ton einer gebundenen Folge wird der Naturton gewählt. Liegt der nächste Ton auf dem
   aktuellen Naturton innerhalb des Zugbereichs, bleiben die Lippen dort. Sonst wird bevorzugt ein
   Naturton gewählt, auf dem dieser und der nächste Ton erreichbar sind. Ein Glissando von F3 nach
   B3 beginnt so auf dem vierten Naturton in der sechsten Position und gleitet in die erste.
2. Jede Bewegung verläuft als Halbkosinus über die Zeit `glide`, mindestens aber so lange, wie der
   Zug physisch braucht (0,02 s pro Halbton, also 0,12 s von der ersten in die siebte Position).
3. Lässt sich ein Sprung auf keinem gemeinsamen Naturton spielen, gleitet der Zug trotzdem stetig,
   und die Lippen wechseln während der Bewegung der Reihe nach über alle Naturtöne dazwischen. Ihre
   Frequenz folgt einem Partialwechsel mit 12 ms Zeitkonstante. Die Rohrlänge springt dabei nie,
   denn sie hängt nur vom Zug ab. Das ergibt den „Rip“ der Blechbläser, etwa von B2 auf B4 in einem
   Atem.

Gemessen über 150 Glissandi (Sprünge von −6 bis +9 Halbtönen über den ganzen Umfang, zwei
Lautstärken) liegt der Zielton nach der Bewegung höchstens 1,6 Cent neben der Sollfrequenz.
Bruchteile von MIDI-Noten spielt der Zug wie jeden anderen Ton, Mikrotöne sind also möglich.

### Schalltrichter

Die Reflexion am Trichter ist ein Tiefpass zweiter Ordnung bei 800 Hz (Güte 0,5) mit
Verlustfaktor 0,94. Was nicht reflektiert wird, wird abgestrahlt (komplementärer Hochpass). Die
Grenzfrequenz liegt tiefer als bei der Trompete, weil der Posaunentrichter größer ist. Die weiche
Güte 0,5 hat einen zweiten Zweck: Sie dämpft die Nachbarresonanzen hoher Naturtöne. Mit
schärferem Filter klingen beim Anstoß von Tönen ab dem zehnten Naturton die Nachbarmoden bis zu
0,3 s mit und ergeben eine hörbare Modulation um 50 Hz. Mit dem jetzigen Filter liegt der Anteil
unharmonischer Energie in den ersten 0,3 s im Mittel bei 2 %, nur im Fortissimo der obersten Töne
bei bis zu 16 %, ein kurzes, kratziges Ansprechen.

### Stoßwellen

Laute Posaunen schmettern, weil sich die Druckwelle im langen zylindrischen Rohr aufsteilt.
Hirschberg und Kollegen haben diese Stoßwellen an Posaunen gemessen. Druckspitzen laufen schneller
als Mulden:

```
c(p) ≈ c · (1 + (γ + 1) / 2 · p / (ρ c²)),   γ = 1,4
```

Der Hinweg ist in 8 Scheiben mit eigener, druckabhängiger Ankunftszeit jeder Probe geteilt (siehe
`trumpet.md`). Die wirksame Länge ist 1,5 m plus der doppelte Zugweg, also bis 2,9 m in der
siebten Position. Bei ausgezogenem Zug steilt sich die Welle deshalb stärker auf, wie beim echten
Instrument. Die Stoßfronten entstehen bei 96 kHz und werden vor der Dezimierung gefiltert, im
Spektrogramm lauter hoher Töne und Glissandi sind keine zurückgefalteten Linien zu sehen.

### Blasdruck, Anstoß, Vibrato

`p_m = 600 Pa · (f / 116,5 Hz)^1,2 + 11 kPa · v^2,2 · (f / 116,5 Hz)^0,2`. Der Grunddruck steigt
mit der Tonhöhe, denn hohe Naturtöne brauchen auch im Piano Druck, um anzusprechen. Der laute Anteil
steigt nur schwach. Das reicht von etwa 0,4 kPa (E2 pianissimo) bis 21 kPa (F5 fortissimo).
`velocity` kann ein Paar `[start, ende]` sein (Crescendo, Diminuendo).

Anstoß, Atemgeräusch und Lippenvibrato funktionieren wie bei der Trompete: `tongue` regelt vom
harten „t“ bis zum Atemanstoß, das Rauschen ist eine bandbegrenzte Schwankung des Lippenstroms und
läuft durch das Rohr. Lange Noten bekommen automatisch ein verzögertes Vibrato mit etwa 5 Hz.

### Dämpfer

- **`mute`** (gerader Dämpfer): ein hohler Kegel im Trichter, mit Korkstreifen abgedichtet. Unter
  seiner eigenen Helmholtz-Resonanz geht wenig Schall durch den Ringspalt, deshalb ein Hochpass bei
  620 Hz. Der enge Spalt gibt ein näselndes Band bei 1,8 kHz (+8 dB) und ein schnarrendes bei
  4,5 kHz (+4 dB), darüber ein Tiefpass bei 7,5 kHz.
- **`bucket`** (Filzdämpfer): ein mit Filz ausgekleideter Becher vor dem Trichter. Der Filz schluckt
  die Höhen, Tiefpass bei 1,1 kHz und 3 kHz, leichte Anhebung um 320 Hz.

Beide Dämpfer sind Filter auf der Abstrahlung, die Rückwirkung auf die Stimmung ist nicht
modelliert.

### Stimmung

Das gekoppelte System spielt höher als die Rohrresonanz, weil die Lippen die Frequenz zu sich
ziehen: unkorrigiert 13 bis 66 Cent, mehr bei hohem Druck und tiefen Naturtönen. `calibrate.mjs`
misst das für jeden Naturton an neun Zugstellungen und sieben Lautstärken (630 Messungen, FFT über
0,7 s, logarithmisch-parabolische Spitzeninterpolation) und schreibt die Tabelle `tuning.mjs`.
Beim Rendern wird die Korrektur in Zugstellung und Lautstärke bilinear interpoliert. Weil die
Tabelle nach Zugstellung und nicht nach Note geordnet ist, gilt sie auch mitten im Glissando und
für Töne auf ungewohnten Positionen. Nach Änderungen am Modell zweimal
`node instruments/trombone/calibrate.mjs` aufrufen.

## Schnittstelle

```js
import { render, meta } from './instruments/trombone.mjs';
// meta = { name: 'Trombone', range: [40, 77], presets: ['open', 'mute', 'bucket'] }  (E2 bis F5)
render({
  midi: 58,              // Standard 58, auf meta.range begrenzt, Bruchteile erlaubt
  velocity: 0.8,         // 0..1 oder [start, ende]
  duration: 1,           // Sekunden bis zum Absetzen (0,02 bis 30), Ausklang 0,3 s kommt dazu
  preset: 'open',        // 'open', 'mute' (gerader Dämpfer) oder 'bucket' (Filzdämpfer)
  seed: 1,               // Zufallsdrift von Druck und Lippe, deterministisch, auch für Bruchzahlen
  vibrato: undefined,    // undefined: automatisch bei langen Noten, 0: aus, bis 2: Tiefe
  tongue: true,          // true, false oder 0..1
  from: undefined,       // Startton eines Glissandos in den Ton midi (beginnt nach 0,05 s)
  glide: 0.2,            // Dauer einer Zugbewegung in Sekunden, 0,02 bis 3
  path: undefined,       // [[t, midi], ...]: weitere Zugbewegungen im selben Atem, t in Sekunden
}); // Float64Array, mono, 48 kHz
```

Beispiele:

```js
render({ midi: 58, from: 53, glide: 0.6 });                       // F3 nach B3, ein Naturton
render({ midi: 65, duration: 3, path: [[1.2, 60]], glide: 0.8 }); // F4, dann langsam nach C4
render({ midi: 46, duration: 2, path: [[0.5, 70]], glide: 0.4 }); // Rip über die Naturtonreihe
```

Werte außerhalb der Bereiche werden begrenzt. `null` gilt als nicht gesetzt. Ist ein Zahlwert
(auch `seed`) keine endliche Zahl, ein `path`-Eintrag kein Paar oder das Preset unbekannt, wirft
`render` einen Fehler mit dem Namen des Parameters. `path` nimmt bis zu 64 Einträge, sortiert sie nach Zeit und verträgt
doppelte oder leere Listen.

Pegel: Der Ausgangsfaktor sitzt hinter der Rückkopplung und ändert die Stimmung nicht. Er ist je
Preset so gewählt, dass der lauteste gemessene Fall (Velocity 1, schnelles Glissando) bei −3,0 dBFS
liegt. Jede Note beginnt und endet exakt bei null (1 ms und 5 ms Halbkosinus-Blende).

## Messungen

Prüflauf über jeden zweiten Halbton des Umfangs, drei Lautstärken (0,2, 0,6, 1), drei Presets,
drei Seeds (auch gebrochene), mit und ohne Vibrato, mit und ohne Zunge (2160 Noten), dazu 876
Noten mit Glissandi, Rips, Extremwerten von `glide`, `vibrato`, `velocity` und `duration`, und
1140 schnelle Glissandi im Forte:

| | offen | gerader Dämpfer | Filzdämpfer |
|-|-------|-----------------|-------------|
| größte Spitze | −3,0 dBFS | −3,0 dBFS | −3,1 dBFS |
| größter Sprung zwischen zwei Proben | 0,45 | 0,25 | 0,06 |
| NaN, Randwerte ≠ 0 | 0 | 0 | 0 |
| größter Gleichanteil | 5·10⁻⁶ | 2·10⁻⁷ | 5·10⁻⁶ |

Der größte Sprung sitzt an den Stoßfronten lauter Töne und ist Teil der Wellenform.

Stimmung: Über 342 Prüfnoten (alle Prüftöne, drei Lautstärken, drei Seeds, mit und ohne Zunge,
ohne Vibrato) liegt die größte Abweichung bei 1,8 Cent, nach Glissandi bei 1,6 Cent.

Spektraler Schwerpunkt im eingeschwungenen Ton (Velocity 0,25 / 1):

| Ton | offen | gerader Dämpfer | Filzdämpfer |
|-----|-------|-----------------|-------------|
| E2  | 172 / 681 Hz | 773 / 1386 Hz | 173 / 395 Hz |
| F3  | 283 / 854 Hz | 652 / 1508 Hz | 262 / 410 Hz |
| B3  | 351 / 910 Hz | 760 / 1594 Hz | 301 / 394 Hz |
| F4  | 465 / 922 Hz | 948 / 1620 Hz | 386 / 427 Hz |
| F5  | 762 / 1198 Hz | 880 / 1389 Hz | 709 / 735 Hz |

Im offenen Instrument steigt der Schwerpunkt vom Piano zum Forte um den Faktor 1,6 bis 4. Das ist
die Aufsteilung der Welle, nicht nur ein lauterer Ton.

Rechenzeit: etwa neunmal schneller als Echtzeit, eine 10 s lange Note mit zwei Glissandi braucht
1,1 s.

Demo (`out/trombone.wav`, 24 s, Stereo mit Hall): Spitze −3,0 dBFS, True Peak −2,9 dBTP,
−17,8 LUFS integriert, Lautheitsumfang 13 LU.

## Grenzen

- Die Resonanzen sind exakt harmonisch. Echte Posaunen haben kleine Abweichungen je Naturton, die
  Spieler mit dem Zug ausgleichen. Hier entstehen solche Abweichungen nur aus den Filtern und
  werden über die Tabelle korrigiert.
- Pedaltöne unterhalb von E2 sind nicht vorgesehen.
- Ein Legato ohne Glissando, bei dem echte Posaunisten weich mit der Zunge binden, gibt es nur
  über einzelne Noten mit weichem Anstoß.
- Die Dämpfer sind Filter auf dem abgestrahlten Schall.
- Leise tiefe Töne sind sehr dunkel. Ob das dem echten Instrument entspricht, ist ohne Aufnahme
  nicht sicher zu prüfen.

## Quellen

Physikalische Grundlagen und Größenordnungen, keine Code-Übernahme:

- A. H. Benade: *Fundamentals of Musical Acoustics*. Oxford University Press, 1976.
- N. H. Fletcher, T. D. Rossing: *The Physics of Musical Instruments*, 2. Aufl., Springer, 1998,
  Kapitel 8 und 14.
- N. H. Fletcher: Autonomous vibration of simple pressure-controlled valves in gas flows. J. Acoust.
  Soc. Am. 93(4), 2172-2180, 1993.
- S. J. Elliott, J. M. Bowsher: Regeneration in brass wind instruments. J. Sound Vib. 83(2),
  181-217, 1982.
- A. Hirschberg, J. Gilbert, R. Msallam, A. P. J. Wijnands: Shock waves in trombones. J. Acoust.
  Soc. Am. 99(3), 1754-1758, 1996.
- R. Msallam, S. Dequidt, R. Caussé, S. Tassart: Physical model of the trombone including nonlinear
  effects. Acta Acustica 86, 725-736, 2000.
- J. Cullen, J. Gilbert, D. M. Campbell: Brass instruments: linear stability analysis and
  experiments with an artificial mouth. Acta Acustica 86, 704-724, 2000.
- M. F. Hamilton, D. T. Blackstock (Hrsg.): *Nonlinear Acoustics*. Academic Press, 1998.
- J. O. Smith: Physical modeling using digital waveguides. Computer Music Journal 16(4), 74-91, 1992.
