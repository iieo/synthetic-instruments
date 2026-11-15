# Didgeridoo

Physikalisches Modell eines Didgeridoos, komplett aus Gleichungen berechnet. Es gibt keine Samples,
keine gemessenen Impulsantworten und keine Soundfont-Daten. Der Code ist selbst geschrieben. Aus der
Literatur stammen nur physikalische Zusammenhänge und veröffentlichte Größenordnungen (siehe Quellen).

Dateien:

- `instruments/didgeridoo.mjs`: das Instrument (`meta`, `render`)
- `instruments/didgeridoo/bore.mjs`: Resonanzen der Bohrung und des Vokaltrakts
- `instruments/didgeridoo/tuning.mjs`: gemessene Stimmkorrektur (erzeugt)
- `instruments/didgeridoo/calibrate.mjs`: misst die Stimmung und schreibt `tuning.mjs`
- `demos/didgeridoo.mjs`: Bordun auf D in drei Atemzügen, schreibt `out/didgeridoo.wav`

## Das Instrument

Ein Didgeridoo ist ein ein bis zwei Meter langes Holzrohr, meist ein von Termiten ausgehöhlter
Eukalyptusstamm. Die Bohrung ist unregelmäßig und weitet sich zum Ende hin. Der Spieler presst die
Lippen locker in ein Mundstück aus Wachs und lässt sie summen wie bei einem Blechblasinstrument. Er
spielt fast nur einen tiefen Grundton, den Bordun, und formt ihn mit Zunge, Wangen und Stimme. Durch
Zirkularatmung klingt der Ton ohne Pause weiter.

## Aufbau des Modells

Drei Teile sind gekoppelt: die Lippen als schwingendes Ventil, die Bohrung stromabwärts und der
Vokaltrakt des Spielers stromaufwärts. Beide Rohre sind als Summe von Resonanzen beschrieben
(modale Darstellung der Eingangsimpedanz). Gerechnet wird mit vierfacher Abtastrate (192 kHz). Ein
Kaiser-Fensterfilter dezimiert am Ende auf 48 kHz.

### Lippen

Wie bei der Trompete ist die Lippe ein gedämpfter Feder-Masse-Schwinger, der nach außen aufschlägt:

```
y'' + (ω_l / Q_l) y' + ω_l² y = ω_l² (p_m − p) / K
```

`y` ist die Öffnung, `K = 1,2 kPa / 1,2 mm` die Steifigkeit pro Fläche, `Q_l = 4`. Die
Lippenfrequenz liegt bei 0,88 des gespielten Tons. In Ruhe ist die Lippe geschlossen, die Öffnung ist
`h = max(y, 0)`. Der Luftstrom folgt Bernoulli durch einen 14 mm breiten Spalt:

```
u = b · h · sign(Δp) · sqrt(2 |Δp| / ρ),   Δp = p_m − p_vt − p
```

`p_m` ist der Blasdruck aus der Lunge (0,5 bis 2,2 kPa je nach `velocity`), `p_vt` der Druck,
den der Strom im Vokaltrakt aufbaut, und `p` der Druck im Mundstück.

### Bohrung: Resonanzen eines aufgeweiteten Rohrs

Die Eingangsimpedanz der Bohrung ist eine Summe von zehn Resonanzen:

```
Z(ω) = Σ Z_k / (1 + j Q_k (ω / ω_k − ω_k / ω))
```

Jede Resonanz ist ein bilinear transformierter Bandpass mit Spitzenwert `Z_k`. Ein Kegel hätte
Resonanzen im Verhältnis 1 : 2 : 3, ein Zylinder, der an den Lippen geschlossen ist, 1 : 3 : 5. Die
aufgeweitete, unregelmäßige Bohrung liegt dazwischen. Das Modell verwendet
1 : 2,64 : 4,38 : 6,1 : 7,85 : 9,6 : …, also deutlich unharmonisch, wie es Messungen an echten
Instrumenten zeigen (Fletcher 1983). Die Güten liegen zwischen 8 und 14, denn das
Holzrohr mit seiner rauen Wand dämpft stark. Die Spitzen fallen mit der Ordnung von 14 `Z_c` auf
etwa ein Achtel davon, `Z_c` gehört zu einem Mundstück mit 15 mm Radius.

Ab der vierten Resonanz streut jede Lage abhängig von `seed` um ±1,75 % und jede Güte um ±7,5 %.
Jeder Seed ist also ein etwas anderes Rohr. Die unteren drei Resonanzen bleiben fest, denn sie
bestimmen Tonhöhe und Toot.

Da die Gleichung für `u` implizit ist (`p` hängt von `u` ab), wird sie wie bei der Trompete
geschlossen gelöst. Jede Resonanz liefert ihren Anteil in der Form `p = h + Z_0 u`, wobei `h` aus
ihrem Zustand stammt. Mit `a = p_m − h_bohrung − h_vt`, `Z = Z_0,bohrung + Z_0,vt` und
`k = b · h · sqrt(2/ρ)` gilt

```
u = 2 k a / (k Z + sqrt(k² Z² + 4 |a|))
```

ohne Iteration.

### Vokaltrakt: Formanten und „wow“

Der Mundraum liegt in Reihe vor den Lippen. Bei fast geschlossener Stimmritze hat er eigene
Impedanzspitzen. Tarnopolsky und Kollegen (2005) haben gezeigt, dass genau diese Spitzen den Klang
des Didgeridoos formen: Wo der Vokaltrakt eine hohe Impedanz hat, wird der Luftstrom gebremst, und im
abgestrahlten Spektrum entstehen Täler. Dazwischen erscheinen Formantbänder, die der Spieler mit der
Zunge verschiebt.

Das Modell hat drei Vokaltrakt-Resonanzen. Der Parameter `vowel` geht von 0 (dunkles „u“, Zunge
hinten) bis 1 (helles „i“, Zunge vorn und hoch):

| Resonanz | Frequenz | Güte | Spitze |
|---|---|---|---|
| 1 | 750 bis 1200 Hz | 6 | 12 `Z_c` |
| 2 | 1300 bis 2300 Hz | 7 | 20 `Z_c` |
| 3 | 2700 bis 3100 Hz | 8 | 12 `Z_c` |

Diese Impedanz wirkt direkt in der Strömungsgleichung, ist also Teil der Rückkopplung. Zusätzlich
hebt ein Bandpass (Güte 3) am Ausgang das Band zwischen den Spitzen an, bei 600 bis 2000 Hz je nach
Vokal. Das gibt dem Formant die Deutlichkeit, die man am echten Instrument hört.

`vowel` ist eine Zahl oder eine Liste von Stützpunkten `[[Sekunde, Wert], …]`, zwischen denen linear
interpoliert wird. Damit lassen sich gesprochene Rhythmen wie „did-ge-ri-doo“ schreiben. `wow` ist
eine Rate in Hz: Der Vokal pendelt dann im Kosinus vom Grundwert zum anderen Ende des Bereichs und
zurück, ein Grundwert unter 0,5 also Richtung „i“, darüber Richtung „u“. Der Hub ist 85 % des Wegs.

### Abstrahlung

Abgestrahlt wird die zeitliche Ableitung des Mundstückdrucks, also der Druck im Fernfeld einer
kleinen Quelle, durch einen Hochpass bei 25 Hz und einen Tiefpass bei 7 kHz. Die Ableitung gibt den
Obertönen das Gewicht, das der Grundton durch die schwache Abstrahlung tiefer Frequenzen verliert.

### Atem, Pulse, Zirkularatmung

- **Anstoß:** Die Lippe startet mit der statischen Öffnung, der Blasdruck schießt in den ersten
  30 ms um 60 % über, und die erste Resonanz ist für etwa 60 ms angehoben. So spricht der Bordun in
  50 bis 120 ms an.
- **Atemgeräusch:** Turbulenz im Lippenstrahl, bandbegrenzt zwischen 500 Hz und 3 kHz, proportional
  zum Strom.
- **`pulse`:** Rate in Hz für rhythmische Akzente im Blasdruck. Jeder Schlag ist ein Sinus²-Buckel
  über 40 % der Periode, jeder zweite ist schwächer. Zwischen den Akzenten liegt der Druck bei 82 %.
- **`breathe`:** Abstand der Zirkularatmung in Sekunden. Während der Spieler durch die Nase einatmet,
  drücken die Wangen die gespeicherte Luft heraus. Der Druck sinkt dabei für 0,3 s auf bis zu 50 %
  und kommt danach mit einem kurzen Akzent zurück, das typische „Schnaufen“ im Rhythmus.

### Toot: überblasene Resonanz

Spannt der Spieler die Lippen und bläst kräftiger, springt der Ton auf die zweite Resonanz. Dieser
Ton ist laut und trompetenartig und liegt beim Didgeridoo deutlich über der Oktave, weil die Resonanzen
unharmonisch liegen. Im Modell klingt der Toot beim 2,6- bis 2,7-fachen des Borduns, also etwa eine
Undezime höher.

Im Modell steigt die Lippenfrequenz während eines Toots auf das 0,9-fache der zweiten Resonanz, die
Lippengüte von 4 auf 8, der Blasdruck um 10 %. Damit die Lippe zuverlässig auf diese Resonanz
springt und nicht auf eine Mischform, betont das Modell den Registerwechsel zusätzlich: Die zweite
Resonanz wird um 80 % angehoben, die übrigen um 70 % gesenkt. Am echten Instrument erledigt das die
Feinabstimmung von Lippe und Mundraum, im Modell ist es eine bewusste Vereinfachung. Ein Toot dauert
0,35 s mit Blenden von 30 und 50 ms. Danach baut sich der Bordun in etwa 50 ms wieder auf.

`toot` ist eine Startzeit in Sekunden oder eine Liste davon. Zeiten werden sortiert, auf die
Notenlänge begrenzt, zu dicht liegende Doppelte entfallen, höchstens 64 Toots pro Note.

## Stimmung

Eine nach außen aufschlagende Lippe schwingt oberhalb der Resonanz, auf der sie spielt. Im Modell
liegt der Bordun ohne Korrektur 2,25 bis 2,85 Halbtöne über der ersten Resonanz, mehr bei hohem Druck.
`calibrate.mjs` misst diese Abweichung für jeden Halbton, fünf Druckstufen und fünf Vokalstellungen
(400 Messungen) und schreibt die Tabelle `tuning.mjs`. Das Rohr wird dann um genau diesen Betrag
tiefer gebaut. Die Korrektur folgt dem momentanen Druck und Vokal, alle 32 Takte neu interpoliert,
deshalb bleibt der Bordun auch bei Pulsen und „wow“ stehen. Die Tabelle wird iterativ bestimmt: Jeder
Lauf misst mit der vorigen Korrektur und addiert den Restfehler.

## Parameter

| Parameter | Bereich | Bedeutung |
|---|---|---|
| `preset` | `drone`, `wow`, `pulse`, `toot` | Grundeinstellung (siehe unten) |
| `midi` | 33 bis 48 (A1 bis C3), Standard 38 | Bordun, auch gebrochene Werte |
| `velocity` | 0 bis 1 | Blasdruck, ändert Lautstärke und Obertonreichtum |
| `duration` | 0,05 bis 60 s | Länge, danach 0,3 s Ausklang |
| `seed` | Zahl | wählt das Rohr (Streuung der oberen Resonanzen) und das Atemrauschen |
| `vowel` | 0 bis 1 oder `[[s, Wert], …]` | Zungenstellung, 0 dunkel, 1 hell |
| `wow` | 0 bis 8 Hz | periodischer Vokalschwung |
| `pulse` | 0 bis 8 Hz | rhythmische Atemakzente |
| `breathe` | 0 oder 1 bis 10 s | Abstand der Zirkularatmung |
| `toot` | Sekunde oder Liste | Startzeiten überblasener Töne |

Alle Zahlen werden auf ihren Bereich begrenzt. Nicht endliche Werte führen zu einer Fehlermeldung,
die den Parameter nennt. Fehlende Optionen nimmt das Modell aus dem Preset.

| Preset | Einstellung |
|---|---|
| `drone` | Bordun mit `vowel` 0,3 |
| `wow` | `vowel` 0,1, `wow` 1,6 Hz |
| `pulse` | `vowel` 0,35, `pulse` 3 Hz, `breathe` 2,8 s |
| `toot` | `vowel` 0,3, ein Toot alle 1,2 s ab 0,6 s |

## Messwerte

Gemessen über alle vier Presets, jeden zweiten Halbton von 33 bis 47 und 48, Anschlagstärken 0,2,
0,6 und 1, die Seeds 1, 2,5 und 7 und zehn Optionskombinationen bis zu den Grenzen (`vowel` 0 und 1,
Vokalstützpunkte, `wow` 8 Hz, `pulse` 8 Hz, `breathe` 1 und 10 s, vier Toots, alles zusammen), 1296
Noten zu je 2,2 s:

| Größe | Wert |
|---|---|
| lautester Einzelton | −3,2 dBFS (Ton 48, `velocity` 1, mit Toots) |
| lautester Bordun ohne Toots und Akzente | −7,4 dBFS |
| größter Sprung zwischen zwei Samples | 0,13 |
| NaN oder Unendlich | keine |
| erstes und letztes Sample | exakt 0 |
| Gleichanteil | unter 5 · 10⁻⁶ |
| Tonhöhe des Borduns | höchstens 2,2 Cent Abweichung (alle Halbtöne, vier Druckstufen, zwei Vokale, zwei Seeds) |
| Toot | 2,6- bis 2,7-fache Frequenz des Borduns |
| Rechenzeit | etwa 8- bis 12-fach schneller als Echtzeit, eine Note von 10 s braucht gut 1 s |

Die Ausgabe ist ein fester linearer Faktor ohne Begrenzer. Das Spektrogramm des höchsten Tons mit
Toots und „wow“ zeigt nur harmonische Linien bis 20 kHz, keine zurückgefalteten Anteile.

Die Demo (`node demos/didgeridoo.mjs`) hat eine Spitze von −3,0 dBFS (True Peak −3,0 dBTP) und
eine integrierte Lautheit von −18,9 LUFS.

## Quellen

- N. H. Fletcher (1983): Acoustics of the Australian didjeridu. Australian Aboriginal Studies.
- A. Tarnopolsky, N. Fletcher, L. Hollenberg, B. Lange, J. Smith, J. Wolfe (2005): The vocal tract
  and the sound of a didgeridoo. Nature 436.
- N. H. Fletcher (1993): Autonomous vibration of simple pressure-controlled valves in gas flows.
  Journal of the Acoustical Society of America.
