# E-Gitarre

`instruments/electric-guitar.mjs` ist eine E-Gitarre mit massivem Korpus und Stahlsaiten, abgenommen von magnetischen Tonabnehmern und gespielt über einen Röhrenverstärker mit Lautsprecherbox. Alles entsteht aus Modellen: die Saite als Wellenleiter, der Tonabnehmer als Kammfilter mit Spulenresonanz, der Verstärker als Kette aus Triodenstufen, Klangregelung und Gegentakt-Endstufe, die Box als Satz von Filtern. Es gibt keine Samples und keine Impulsantworten.

Die Bausteine liegen in `instruments/electric-guitar/`:

| Datei | Inhalt |
|---|---|
| `pickup.mjs` | Tonabnehmer an einer Stelle der Saite, mit Spulenbreite |
| `amp.mjs` | Triodenstufe, Klangregelung, Endstufe, Lautsprecherbox |
| `dsp.mjs` | Biquads, Überabtastung, Parameterprüfung, Randblenden |

Die Saite selbst kommt aus `instruments/strings-plucked/` (siehe `plucked-strings.md`).

```js
import { render, meta } from './instruments/electric-guitar.mjs';
// meta.presets: ['clean', 'crunch', 'lead', 'muted'], meta.pickups: ['bridge', 'middle', 'neck', 'both']
const note = render({ preset: 'lead', midi: 71, velocity: 0.9, duration: 2 });
```

## Signalweg

```
Plektrum -> Saite (zwei Polarisationen, Steifigkeit) -> Tonabnehmer (Kammfilter, Spulenbreite)
  -> Spule und Kabel (resonanter Tiefpass) -> 4- oder 8-fache Überabtastung
  -> 1 bis 3 Triodenstufen -> Klangregelung -> Endstufe -> Dezimierung -> Lautsprecherbox
```

## Saite

Die Saite ist dieselbe Wellenleiter-Schleife wie bei der Akustikgitarre: Verzögerung, Verlust-Tiefpass, Allpass-Kaskade für die Steifigkeit, Bruchteil-Allpass für die exakte Stimmung, zwei Polarisationen mit leicht verschiedener Stimmung und Abklingzeit. Die Werte passen zu einem Satz Stahlsaiten der Stärken 0,010 bis 0,046 Zoll bei 64,8 cm Mensur: Inharmonizität `B` der leeren Saiten zwischen `8,5·10⁻⁵` (tiefe E) und `1,7·10⁻⁵` (hohe E), mit dem Bund wachsend wie `2^(2·Bund/12)`.

Ein massiver Korpus nimmt der Saite kaum Energie ab. Die Abklingzeit T60 beim Grundton reicht deshalb von etwa 9 s bei 82 Hz bis 3,5 s bei 660 Hz, bei 5 kHz liegt sie zwischen 1,6 und 1,1 s. Beim Preset `lead` ist sie um den Faktor 1,4 länger.

Angeschlagen wird mit dem Plektrum 9 bis 13 cm vor dem Steg, als Dreieck mit einer Kontaktbreite von 2 bis 6 mm (leiser Anschlag ist breiter und dumpfer), dazu ein wenig Kontaktgeräusch. Beim Abdämpfen mit dem Handballen (`muted`) liegt die Hand auf den Saiten am Steg: der Anschlag sitzt näher am Steg (etwa 7 cm), T60 sinkt auf 0,6 s beim Grundton und 70 ms bei 900 Hz.

## Tonabnehmer

Ein magnetischer Tonabnehmer misst die Geschwindigkeit der Saite über seiner Spule. Ist `w(n)` die Welle, die am Steg ankommt, dann trägt die Saite im Abstand `x` die Summe aus der hinlaufenden Welle `w(n + τ)` und der zurücklaufenden `-w(n - τ)`, mit `τ = x / c` Samples. Um `τ` verzögert ist das `w(n) - w(n - 2τ)`, und `2τ` ist genau der Anteil `x / L` einer Periode. Das ist ein Kammfilter: Obertöne, die an der Stelle des Tonabnehmers einen Knoten haben, fehlen.

Die Spule ist nicht punktförmig, sie sieht etwa 2 cm Saite. Beide Terme werden deshalb über ein Fenster dieser Breite gemittelt. Das geschieht über eine laufende Summe, die mit linearer Interpolation gelesen wird, so stimmen auch Fensterränder zwischen zwei Samples. Die Mittelung ist ein Tiefpass im Kammfilter, der hohe Obertöne bei tiefen Saiten stärker dämpft als bei hohen.

Positionen vom Steg aus: Steg 4,2 cm, Mitte 10 cm, Hals 15,8 cm, `both` mischt Steg und Hals. Weil die schwingende Länge mit dem Bund schrumpft, rückt der Tonabnehmer relativ zur Saite nach außen und der Klang ändert sich über das Griffbrett. Induktivität der Spule und Kapazität des Kabels bilden einen resonanten Tiefpass zweiter Ordnung (3,6 kHz beim Hals, sonst 4,2 kHz, Güte 1,6).

## Verstärker

Alle Nichtlinearitäten laufen mit 4-facher Abtastrate (192 kHz), beim Preset `lead` mit 8-facher. Hoch- und heruntergetastet wird mit einem Kaiser-Fenster-Tiefpass bei 20,5 kHz.

**Triodenstufe.** Jede Stufe besteht aus dem Koppelkondensator (Hochpass erster Ordnung, 25 bis 160 Hz), der Verstärkung, der Kennlinie, dem Anodenwiderstand mit Miller-Kapazität (Tiefpass erster Ordnung, 7 bis 12 kHz) und einer Phasenumkehr. Die Kennlinie ist um den Arbeitspunkt `b` herum

```
f(u) = tanh(u)            für u ≥ 0   (Gitterstrom: hartes Begrenzen nach oben)
f(u) = k · tanh(u / k)    für u < 0   (Sperrbereich: weicheres Begrenzen nach unten, k = 1,8)
y    = f(g · x + b) - f(b)
```

Beide Zweige haben bei null dieselbe Steigung, die Kurve ist also stetig differenzierbar. Die Asymmetrie erzeugt gerade Obertöne und einen Gleichanteil, der von der Signalstärke abhängt und vom nächsten Koppelkondensator entfernt wird. Weil jede Stufe die Phase umkehrt, wechselt die harte Seite von Stufe zu Stufe. `clean` hat eine Stufe, `crunch` und `muted` zwei, `lead` drei. Bei `lead` sitzt vor der zweiten und dritten Stufe ein Koppelkondensator bei 120 bis 160 Hz, der das Fundament strafft, bevor es verzerrt wird.

**Klangregelung.** Ein passives Netzwerk kann nur absenken. Die drei Regler wirken deshalb als Absenkungen: Bass als Kuhschwanz bei 140 Hz (bis −14 dB), Mitten als breite Glocke bei 600 Hz (bis −10 dB), Höhen als Kuhschwanz bei 1,8 kHz (bis −14 dB). Die Absenkung folgt `(1 - Regler)^1,5`, damit der Regelweg sich gleichmäßig anfühlt. In der Mittelstellung ergibt das die bekannte Mittensenke. Die folgende Stufe hebt 60 % des mittleren Pegelverlusts wieder an, damit die Regler vor allem die Farbe ändern.

**Endstufe.** Eine Gegentaktstufe begrenzt symmetrisch, also `tanh`. Eine langsame Hüllkurve des Ausgangs (10 ms Anstieg, 150 ms Abfall) senkt die Ansteuerung ein wenig ab, wenn viel Strom fließt. Das bildet das Einbrechen der Versorgungsspannung nach und gibt die Kompression eines aufgedrehten Verstärkers.

**Gain.** `drive` (0 bis 1) skaliert die Verstärkung der ersten Stufe von 0,25 bis 4. Gleichzeitig regelt ein Master-Pegel um einen Teil davon zurück, beim cleanen Sound stark, beim Lead kaum. Der Regler ändert so vor allem die Verzerrung und weniger die Lautstärke.

## Lautsprecherbox

Eine geschlossene Box mit einem 12-Zoll-Lautsprecher, aufgebaut aus Filtern nach dem typischen Verlauf solcher Boxen: steiler Abfall unter etwa 70 Hz, Resonanz von Membran und Luftfeder bei 110 Hz (+3,5 dB), eine Senke um 450 Hz (−4 dB), der Präsenzbereich der Membran bei 2,3 und 3,6 kHz (+3,5 und +2,5 dB) und darüber ein steiler Abfall durch drei Tiefpässe bei 5,2, 5,6 und 9 kHz. Die Box nimmt dem verzerrten Signal das Kratzen in den Höhen.

## Presets

| Preset | Tonabnehmer | Stufen | Charakter |
|---|---|---|---|
| `clean` | Hals | 1 | Sauber, die Endstufe greift erst bei kräftigem Anschlag |
| `crunch` | Steg | 2 | Angezerrt, reagiert deutlich auf den Anschlag |
| `lead` | Steg | 3 | Stark verzerrt und komprimiert, der Ton steht lange |
| `muted` | Steg | 2 | Mit dem Handballen abgedämpft, kurzer, perkussiver Ton |

## Parameter

| Name | Bereich | Standard | Bedeutung |
|---|---|---|---|
| `midi` | 40 bis 86 | 52 | Tonhöhe, auch gebrochen |
| `velocity` | 0,05 bis 1 | 0,8 | Anschlagstärke, steuert Pegel, Helligkeit und damit die Verzerrung |
| `duration` | 0 bis 30 s | 1,5 | Zeit bis zum Abdämpfen der Saite, danach folgen 0,25 s Ausklang |
| `seed` | Zahl | 1 | Streuung von Stimmung (±0,6 Cent), Anschlagstelle, Kontaktbreite und Abklingzeit |
| `preset` | siehe oben | `crunch` | Grundeinstellung |
| `pickup` | `bridge`, `middle`, `neck`, `both` | je Preset | Tonabnehmer |
| `drive` | 0 bis 1 | je Preset | Vorverstärkung |
| `bass`, `mid`, `treble` | 0 bis 1 | je Preset | Klangregelung, 1 ist flach |
| `pluckPosition` | 0,02 bis 0,98 | etwa 0,17 | Anschlagstelle als Anteil der Saite vom Steg, Werte über 0,5 wirken wie `1 - x` |
| `string` | 0 bis 5 | höchste passende | Saite (0 ist die tiefe E), der Ton muss zwischen Bund 0 und 22 liegen |

Zahlen außerhalb des Bereichs werden auf den Rand gesetzt. Ein Wert, der keine endliche Zahl ist, ein unbekanntes Preset, ein unbekannter Tonabnehmer oder eine Saite, auf der der Ton nicht liegt, ergeben einen Fehler mit dem Namen des Parameters. Ausgabe ist ein Mono-Signal mit 48 kHz.

## Messwerte

Gemessen über alle vier Presets und alle vier Tonabnehmer, jeden zweiten Halbton von 40 bis 86, `drive` 0, Standard und 1, Klangregelung im Standard, ganz offen, ganz zu und in drei gemischten Stellungen, Anschlagstelle 0,5 und zufällig, zwei Seeds, Velocity 1 (23 040 Töne). Dazu die Standardeinstellungen jedes Presets mit Velocity 0,2, 0,6, 0,8 und 1 (768 Töne). Am lautesten wird es mit Velocity 1, `drive` 0, Bass auf 1, Anschlag in der Mitte der Saite und Hals oder Mitteltonabnehmer auf den tiefen Saiten:

| Messgröße | Ergebnis |
|---|---|
| Lautester Ton bei Velocity 1 | `clean` −3,1, `crunch` −3,4, `lead` −3,2, `muted` −3,1 dBFS |
| Lautester Ton mit Standardeinstellungen (jeder Halbton, Seed 1) | −4,7 bis −7,3 dBFS je Preset mit Velocity 0,8, −4,6 bis −7,0 dBFS mit Velocity 1 |
| Größter Sprung von Sample zu Sample | 0,18 |
| Nicht endliche Werte | keine |
| Erstes und letztes Sample | exakt 0 |
| Gleichanteil | höchstens 7·10⁻⁵ |
| Stimmung `clean` (Spektralspitze 0,25 bis 1,1 s, drei Seeds) | höchstens 0,9 Cent Abweichung, davon ±0,6 Cent gewollte Streuung |
| Stimmung `lead` | höchstens 4,4 Cent, die Verzerrung mischt die leicht gespreizten Obertöne in den Grundton |
| Rechenzeit für einen 10 s langen Ton | 1,4 s (`crunch`), 3,3 s (`lead`, 8-fach überabgetastet) |
| Hörbeispiel `demos/electric-guitar.mjs` | −18,0 LUFS, Sample-Spitze −3,0 dBFS, True Peak −2,9 dBTP |

Die Spektrogramme der höchsten Töne mit `lead` zeigen saubere Obertonlinien ohne zurückgespiegelte Anteile.

## Grenzen

- Die Saite kennt kein Ziehen und kein Vibrato, jeder Ton hat eine feste Tonhöhe.
- Akkorde entstehen als Summe einzeln verzerrter Töne. Ein echter Verstärker verzerrt den Akkord als Ganzes und erzeugt dabei Differenztöne, die hier fehlen.
- Keine Rückkopplung zwischen Lautsprecher und Saite, kein Brummen, kein Rauschen.
- Die Lautsprecherbox ist ein fester Filtersatz und hängt nicht von der Mikrofonposition ab.

## Quellen

- K. Karplus, A. Strong: Digital synthesis of plucked-string and drum timbres. Computer Music Journal 7(2), 1983.
- D. A. Jaffe, J. O. Smith: Extensions of the Karplus-Strong plucked-string algorithm. Computer Music Journal 7(2), 1983.
- J. O. Smith: Physical Audio Signal Processing. Online-Buch, CCRMA Stanford (Wellenleiter, Allpässe).
- N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments. 2. Aufl., Springer 1998 (Saite, Tonabnehmer).
- R. Bristow-Johnson: Cookbook formulae for audio EQ biquad filter coefficients (Kuhschwanz- und Glockenfilter).
