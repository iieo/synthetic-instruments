# Cembalo

Ein zweichöriges Cembalo mit 8-Fuß- und 4-Fuß-Register und Lautenzug, aus der gezupften Saite und
einem hellen Resonanzboden gerechnet. Kein Sample.

Dateien: `instruments/harpsichord.mjs` (Einstieg, Register, `render`),
`instruments/harpsichord/string.mjs` (gezupfte Saite als Teiltonsumme mit Dämpfer),
`instruments/harpsichord/board.mjs` (Resonanzboden und Geräusche). Mitbenutzt wird der modale
Korpusfilter aus `instruments/strings-bowed/body.mjs`. Demo: `node demos/harpsichord.mjs` schreibt
`out/harpsichord.wav`.

## Schnittstelle

```js
import { render } from './instruments/harpsichord.mjs';
render({ midi: 60, velocity: 0.8, duration: 1, preset: '8ft', seed: 1 }); // Float64Array, mono, 48 kHz
```

| Parameter | Bereich | Bedeutung |
| --- | --- | --- |
| `midi` | 29 bis 89 (F1 bis F6), Standard 60 | Taste. Beim 4-Fuß klingt die Saite eine Oktave höher |
| `velocity` | 0,01 bis 1 | Wie schnell die Taste fällt. Ändert beim Cembalo kaum den Pegel (1,5 bis 2,5 dB über den ganzen Bereich), aber etwas die Helligkeit |
| `duration` | 0,02 bis 20 s, Standard 1 | Wie lange die Taste gehalten wird. Danach fällt der Dämpfer auf die Saite |
| `preset` | `8ft`, `4ft`, `lute`, `8ft+8ft` | Register |
| `seed` | beliebige Zahl | Kleine Streuung von Zupfpunkt, Inharmonizität, Verstimmung des zweiten Chors, Geräusche |

Werte außerhalb der Bereiche werden auf die Grenze gesetzt, fehlende Werte nehmen den Standard.
NaN, unendliche Werte und Text statt einer Zahl werfen einen Fehler mit dem Namen des Parameters,
ebenso ein unbekanntes Register. Gleicher Seed, gleiche Samples.

## Saite und Kiel

Der Kiel (heute meist Kunststoff, früher Rabenfeder) drückt die Saite zur Seite und rutscht ab.
Die Saite startet also aus einer Dreiecksform aus der Ruhe. Für die Kraft am Steg gilt pro Teilton m

```
a_m ∝ sin(m π β) / m · 1 / √(1 + (f_m / f_q)²)
```

mit dem Zupfpunkt β als Anteil der Saitenlänge. Der zweite Faktor ist die endliche Zeit, die der
Kiel zum Abrutschen braucht, ein Tiefpass erster Ordnung mit f_q = 3,2 kHz + 5,2 kHz · velocity.
Gezupft wird nahe am Ende: β = 0,10 im Bass bis 0,21 im Diskant, weil die Diskantsaiten kurz sind
und die Springerreihen fest liegen. Erst jeder zehnte bis fünfte Teilton fällt in eine Nullstelle,
das Spektrum reicht weit nach oben.

Teiltöne f_m = f₀·m·√((1 + B m²)/(1 + B)), der erste liegt also genau auf der Stimmung (A = 440 Hz,
gleichstufig). B wächst von 4·10⁻⁶ im Bass auf 8·10⁻⁵ im Diskant (4-Fuß bis 1,4·10⁻⁴), Cembalosaiten sind dünn und
lang, die Obertöne liegen fast harmonisch. Gerechnet wird jeder Teilton bis 19 kHz, das Signal ist
also von selbst bandbegrenzt.

Messing im Bass und Eisen darüber dämpfen wenig. T60 des Grundtons: 16 s bei F1, 8 s bei F3,
2,8 s bei F6, für Teiltöne kürzer mit T60(f) = T₀ / (1 + (f / 2,2 kHz)^1,3). Jeder Teilton hat zwei
Polarisationen: die angezupfte und eine schwächere (12 bis 20 %), die 0,25 bis 0,75 Cent höher
liegt und 1,7-mal länger klingt. Das gibt die leichte Schwebung und den zweistufigen Ausklang.

Jeder Teilton ist eine gedämpfte komplexe Schwingung mit ganzzahligem Sampleindex. Er beginnt in
Sinusphase, das Signal startet also bei null. Ein Teilton, der vor dem Loslassen unter −120 dB fällt,
wird nicht weiter gerechnet.

## Loslassen: Dämpfer und Kiel

Beim Loslassen fällt der Springer zurück. Der Dämpferfilz legt sich auf die Saite, der zusätzliche
Verlust blendet quadratisch über 12 ms ein, danach hat die Saite T60 = 0,15 s (Bass 0,25 s). Der
Kiel gleitet auf dem Rückweg über die Saite: ein kleiner zweiter Anstoß mit 2 % der Amplitude und
umgekehrtem Vorzeichen. Er ändert nur die Geschwindigkeit, nicht die Auslenkung, darum knackt er
nicht.

Geräusche, alle durch den Resonanzboden gefiltert:

* Kiel rutscht ab: 0,8 ms Rauschimpuls, 1,8 bis 9 kHz
* Taste schlägt auf: 6 ms, 60 bis 900 Hz
* Dämpfer landet: 14 ms, 150 Hz bis 2,5 kHz
* Zunge des Springers klappt zurück: 2 ms, 6 ms nach dem Loslassen

## Resonanzboden

Ein Cembaloboden ist etwa 3 mm dünn und nur leicht berippt. Er bleibt deshalb bis weit nach oben
lebendig. Im Modell: sieben tiefe Moden zwischen 98 Hz (Luft im Gehäuse) und 640 Hz, darüber 46
dicht liegende, sich überlappende Moden bis 14 kHz mit einer Hüllkurve, die um 3 kHz ansteigt, dazu
ein direkter Anteil. Die Moden haben zufällige Vorzeichen (feste Saat), so entstehen keine
systematischen Auslöschungen. Das ist dieser helle, leicht nasale Glanz.

## Register

| Preset | Saiten | Unterschied |
| --- | --- | --- |
| `8ft` | vorderer 8-Fuß-Chor | Grundregister |
| `4ft` | 4-Fuß-Chor, klingt eine Oktave höher | dünnere, kürzere Saiten, 20 % leiser, Zupfpunkt 0,12 bis 0,28 |
| `lute` | vorderer 8-Fuß mit Lautenzug | Lederpolster liegen an der Saite: T60 auf 0,3 + 0,9 / (1 + (f / 450 Hz)²) s begrenzt, also gut eine Sekunde für tiefe Teiltöne und 0,35 s bei 2 kHz. Klingt gedämpft wie eine gezupfte Laute |
| `8ft+8ft` | beide 8-Fuß-Chöre gekoppelt | hinterer Chor zupft 18 % weiter vom Ende, ist 0,8 bis 2 Cent höher gestimmt und zupft 4 bis 8 ms später, weil die Springer verschieden reguliert sind. Voller, schwebender Klang |

## Messwerte

Stimmung: erster Teilton (beim tiefen Bass ein höherer Teilton geteilt durch seine Ordnung) auf
0,25 Cent genau bei `8ft` und `4ft`, bis 1,25 Cent bei `8ft+8ft` durch den höher gestimmten
zweiten Chor. Velocity 0,2 gegen 1: 1,5 bis 2,5 dB.

Prüfung über jeden Halbton von 29 bis 89, velocity 0,2, 0,6 und 1, je vier frische Seeds:

| Register | lautester Fall | ungültige Werte | Gleichanteil (relativ) |
| --- | --- | --- | --- |
| `8ft` | −3,4 dBFS | 0 | unter 2·10⁻⁸ |
| `4ft` | −3,7 dBFS | 0 | unter 2·10⁻⁸ |
| `lute` | −2,9 dBFS | 0 | unter 10⁻⁸ |
| `8ft+8ft` | −3,9 dBFS | 0 | unter 2·10⁻⁸ |

Der größte Sprung von Sample zu Sample liegt bei 0,26 im Diskant. Das ist der helle Zupfklang mit
Teiltönen bis 19 kHz, kein Knacken: Die Teiltonsumme enthält nichts über 19 kHz.

Rechenzeit: eine Note C4 mit 10 s Haltedauer (7,3 s Ausklang) braucht 0,2 s, der ungünstigste Fall
F1 mit beiden 8-Fuß-Chören und 18 s Ausklang 2,3 s.

Jede Note beginnt und endet bei exakt null (6 Samples Einblendung je Teilton, 30 ms Raised Cosine am
Ende). Kein Gleichanteil (Hochpass 38 Hz, zwei Stufen).

## Grenzen

* Teiltonsumme statt Wellenleiter: Der Kiel wirkt nur über die Anfangsform, nicht als
  zeitabhängiger Kontakt.
* Der Resonanzboden ist ein Filter, die Rückwirkung auf die Saiten (Kopplung der Chöre über den
  Steg, Mitschwingen ungedämpfter Saiten) fehlt.
* Mono. Kein Raum.

## Quellen

* N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments. Springer 1998, Kapitel 2 und 12.
* N. H. Fletcher: Analysis of the design and performance of harpsichords. Acustica 37 (1977).
* H. A. Conklin: Design and tone in the mechanoacoustic piano. J. Acoust. Soc. Am. 99 (1996), für die
  Dämpfung der Saiten.
