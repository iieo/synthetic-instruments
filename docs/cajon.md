# Cajon

Eine Kistentrommel aus Holz, ohne Samples gerechnet. Der Spieler sitzt auf der Kiste und schlägt mit
der Hand auf die vordere Platte, die Tapa. Innen liegen Snare-Drähte an der Tapa an, in der Rückwand
sitzt ein rundes Schallloch. Fünf Schläge: `bass`, `tone`, `slap`, `tip`, `ghost`.

```js
import { render } from './instruments/cajon.mjs';
const hit = render({ voice: 'slap', velocity: 0.9, snare: 0.6, damping: 0, size: 'standard', seed: 3 });
// Float64Array, mono, 48 kHz
```

| Parameter | Bereich | Standard | Wirkung |
| --- | --- | --- | --- |
| `voice` | `bass`, `tone`, `slap`, `tip`, `ghost` | `bass` | Schlagart: Ort, Kontaktfläche und Kontaktzeit der Hand |
| `velocity` | 0,01 bis 1 | 0,8 | Schlagkraft, wirkt auf Pegel und Klangfarbe |
| `snare` | 0 bis 1 | 0,6 | 0 nimmt die Drähte ab, 1 legt sie ganz locker an (längstes Rasseln) |
| `damping` | 0 bis 1 | 0 | zweite Hand liegt auf der Tapa und dämpft |
| `size` | `small`, `standard`, `large` | `standard` | Kistengröße und Plattenstärke |
| `seed` | beliebige Zahl | 1 | kleine Streuung von Schlagort, Kontakt, Moden und Drähten |

Werte außerhalb der Bereiche werden begrenzt, nicht endliche Zahlen ergeben einen Fehler mit dem
Namen des Parameters, unbekannte Schläge oder Größen ebenso. Gleicher Seed heißt gleiche Samples,
auch gebrochene Seeds wie 1,5 ergeben eine eigene Variante. Jeder Schlag beginnt und endet bei
exakt null.

Demo: `node demos/cajon.mjs` schreibt `out/cajon.wav` (mono, etwa 23 s). Erst jeder Schlag einzeln,
dann der Slap ohne und mit voll gelösten Drähten, danach ein Groove mit 92 BPM in geraden
Sechzehnteln mit Ghost Notes, ein gedämpfter Takt und ein Fill.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `instruments/cajon.mjs` | Geometrie, Schläge, Parameter, Ausgang |
| `instruments/cajon/plate.mjs` | Balkenfunktionen und Moden der orthotropen Platte |
| `instruments/cajon/sim.mjs` | gekoppelte Simulation im Zeitbereich |

## Die Tapa als orthotrope Platte

Die Tapa ist Birkensperrholz von 2,5 bis 2,8 mm. Die Deckfurniere laufen senkrecht, deshalb ist die
Platte in der Höhe steifer als in der Breite (E₂ = 11 GPa, E₁ = 6 GPa, G₁₂ = 0,6 GPa, ν₁₂ = 0,04,
ρ = 680 kg/m³). Biegesteifigkeiten:

```
D1 = E1 h³ / (12 (1 − ν12 ν21)),  D2 = E2 h³ / (12 (1 − ν12 ν21)),  D12 = ν21 D1,  D66 = G12 h³ / 12
```

An den Seiten und unten ist die Tapa fest verschraubt (eingespannt), oben ist sie nur gehalten
(gelenkig gelagert). Die Moden kommen aus dem Rayleigh-Ritz-Ansatz nach Warburton (1954) mit einem
Produkt aus Balkenfunktionen `X_m(x) Y_n(y)`: in der Breite eingespannt an beiden Enden
(`cos β cosh β = 1`), in der Höhe eingespannt unten und gelenkig oben (`tan β = tanh β`). Damit gilt

```
ω² ρ h = [D1 ∫X''² ∫Y² + D2 ∫X² ∫Y''² + 2 D12 ∫XX'' ∫YY'' + 4 D66 ∫X'² ∫Y'²] / (∫X² ∫Y²)
```

mit Integralen über die normierten Längen geteilt durch die passenden Potenzen von Breite a und
Höhe b. Die Balkenfunktionen werden so ausgewertet, dass cosh und sinh bei großen β nicht
auslöschen: der wachsende Anteil steht mit `1 − σ = (cos β − sin β − e^−β) / (sinh β − sin β)` direkt
im Code. Modelliert werden alle Moden bis 9 kHz, je nach Größe 209 bis 261.

Für die Standardkiste (30 × 46 cm, 2,6 mm) liegen die ersten Moden ohne Luft bei 98, 150, 250, 261,
282 und 362 Hz. Moden mit großem Nettovolumen (ungerade in beiden Richtungen) bekommen eine
mitschwingende Luftmasse und zusätzliche Abstrahldämpfung. Der Verlustfaktor ist
`η = 0,018 + 0,006 √(f / 1 kHz)` plus der Abstrahlanteil, typisch für Sperrholz.

## Luft in der Kiste

**Helmholtz-Resonator.** Der Kasten (Standard 40 Liter) wirkt mit dem Schallloch (Radius 6 cm,
Mündungskorrektur `L = t + 1,7 r`) als Helmholtz-Resonator. Der Druck folgt aus dem Volumen, das
Platte und Luftpfropfen im Loch verdrängen:

```
p = ρc²/V · (Σ ν_k q_k + S x_h),   ν_k = ∫ φ_k dA
m_h ẍ_h = −p S − R_h ẋ_h,          Platte: Kraft −ν_k p auf Mode k
```

Allein läge die Helmholtz-Resonanz bei 87 Hz. Gekoppelt mit der Grundmode der Platte stoßen sich
beide ab wie bei der Gitarre: gemessen liegen die beiden tiefen Spitzen des Bassschlags bei 67 und
120 Hz (klein 72 und 129 Hz, groß 63 und 113 Hz).

**Höhere Hohlraummoden.** Die vier tiefsten stehenden Wellen im Quader (Standard 373, 572, 591 und
683 Hz) koppeln über das Integral der Plattenmode mit der Druckverteilung auf der Tapa,
`C_kj = ∫ φ_k ψ_j dA`. Sie stehen in Steifigkeitsform im Modell: eine Hilfsgröße `U_j` folgt der
Projektion `Σ C_kj q_k` unterhalb der Resonanz, der Druck ist `P_j = ρc²/(V Λ_j) · (Σ C_kj q_k − U_j)`.
So ist die Kopplung ohne Beschleunigungsterme stabil.

## Snare-Drähte

Vier Drähte liegen auf 80 % der Höhe innen an der Tapa. Jeder ist eine kleine Masse (0,15 g) an einer
Feder (60 bis 120 Hz) mit Vorspannung gegen die Platte. Zwischen Platte und Draht wirkt nur Druck,
nach Hertz `F = K δ^1,5` für Eindringen `δ > 0`, sonst nichts. Beschleunigt die Platte stärker nach
außen, als die Vorspannung den Draht nachziehen kann, hebt er ab und schlägt wieder auf. Jeder
Aufschlag ist ein kurzer Kraftstoß, der die hohen Plattenmoden anregt: das Rasseln zwischen 2 und
7 kHz. `snare` verkleinert die Vorspannung, bei 1 rasselt es am längsten.

Weil der Kontakt nichtlinear ist, läuft die ganze Simulation doppelt überabgetastet mit 96 kHz und
wird danach mit einem Kaiser-gefensterten Tiefpass bei 20,5 kHz auf 48 kHz dezimiert. Der
Ausgang besteht nur aus Antworten der Moden unter 9 kHz, die Aufschläge selbst erscheinen nur
über diese Moden. Oberhalb von 6 kHz wird die Abstrahlung sanft ausgeblendet, damit am Ende der
Modenliste keine Kante entsteht.

## Die Hand

Eine Hand trifft nicht als Punkt. Die harten Fingerknochen geben einen kurzen Kraftstoß, der weiche
Handballen einen längeren Druck. Jeder Schlag besteht deshalb aus ein oder zwei Halbsinus-Kräften
mit eigener Lage, Kontaktfläche und Dauer. Die Modenformen werden über eine gaußförmige Fläche
gemittelt, eine breite Hand regt hohe Moden also kaum an.

| Schlag | Ort (Breite, Höhe) | Kontakt | Klang |
| --- | --- | --- | --- |
| `bass` | Mitte, halbe Höhe | Handfläche, Radius 7 cm, 6,5 ms | tiefe Plattenmode und Helmholtz-Resonanz |
| `tone` | Mitte, oberes Viertel | Finger 0,6 ms und Ballen 2,8 ms | offener Mittelton |
| `slap` | Mitte, 2 cm unter der Kante | Finger 0,35 ms und Ballen 1,6 ms | Knall bei 1 bis 3 kHz, viel Draht |
| `tip` | links oben | Fingerspitze, 0,5 ms | heller, leiser Klick |
| `ghost` | rechts oben | Fingerspitze, 0,9 ms, leicht | fast nur Drahtrascheln |

Nahe der oberen Kante ist die Grundmode klein, die höheren Moden dagegen nicht. Darum klingt der
Slap hell, obwohl er auf dieselbe Platte trifft. Die Kontaktzeit verkürzt sich mit der Schlagkraft
wie `T ∝ v^−0,2`, die Kraft wächst mit `velocity^1,1`.

`damping` legt die zweite Hand flach links auf die Tapa. Moden, die an dieser Stelle schwingen,
bekommen zusätzliche Dämpfung proportional zu ihrem Quadrat dort.

## Zeitschritt und Ausgang

Jede Plattenmode ist ein massennormierter Oszillator, integriert mit symplektischem Euler. Die
Steifigkeit wird vorverzerrt (`ω² = (2 fs sin(ω₀/(2 fs)))²`), dann stimmt die Frequenz im diskreten
System exakt. Vor dem Schlag läuft eine kurze, stark gedämpfte Einschwingphase, damit die Drähte in
Ruhelage an der Platte liegen.

Abgestrahlt wird der Volumenfluss: Platte nach außen, Schallloch mit Gewicht 0,6 (es zeigt nach
hinten), dazu die höheren Moden mit einem Abstrahlgrad, der bis zur Koinzidenzfrequenz (etwa 6 kHz)
wächst. Der Schalldruck ist die Ableitung davon. Danach folgen Hochpass 35 Hz und Tiefpass 10 kHz.
Die Simulation hört auf, wenn der Ausgang 50 ms lang unter −80 dB liegt.

## Pegel

Der Ausgang hat eine feste Verstärkung, keine Normierung pro Schlag und keinen Limiter. Sie ist so
gewählt, dass der lauteste Schlag über alle Schläge, Größen, Drahtstellungen, Dämpfungen und viele
Seeds bei velocity 1 etwa −3,3 dBFS erreicht (Bass in der großen Kiste). Die Schläge stehen im
natürlichen Verhältnis: Bass −3,3, Tone −5,2, Slap −5,4, Tip −12, Ghost −18,7 dBFS.

## Messwerte

Sweep über alle Schläge, drei Größen, `snare` 0 / 0,6 / 1, `damping` 0 / 1, fünf Seeds (auch
gebrochene) bei velocity 1 und velocity 0,2 und 0,6: 630 Schläge.

| Größe | Wert |
| --- | --- |
| lautester Schlag | −3,3 dBFS |
| NaN oder Infinity | 0 |
| erstes und letztes Sample ungleich 0 | 0 |
| Gleichanteil | höchstens 0,2 % vom Spitzenwert |
| größter Sprung von Sample zu Sample | 0,25 (Bass), 0,41 des Spitzenwerts im schlimmsten Fall |
| Rechenzeit | etwa 0,1 bis 0,25 s für einen Schlag von 0,5 bis 0,7 s, rund 2,5 bis 5 mal schneller als Echtzeit |

Die Demo hat −3,0 dBFS Spitzenpegel (auch als True Peak) und −23,8 LUFS integriert.

## Quellen

* G. B. Warburton (1954): The vibration of rectangular plates. Rayleigh-Ritz mit Balkenfunktionen.
* A. W. Leissa (1969): Vibration of Plates. Randbedingungen und orthotrope Platten.
* Helmholtz-Resonator und Kopplung an eine Platte wie in den Lehrbüchern von Fletcher und Rossing
  (The Physics of Musical Instruments, 1998).
