# Tabla

Die Tabla ist ein Trommelpaar aus Nordindien. Die rechte, kleinere Trommel heißt Dayan, die linke, große Bayan. Beide tragen auf dem Fell einen schwarzen Fleck aus mehreren Schichten einer harten Paste, die Syahi. Diese Auflage macht die Dayan zu einer gestimmten Trommel: Ihre Eigenschwingungen liegen fast im Verhältnis 1 : 2 : 3 : 4 : 5, das Ohr hört eine klare Tonhöhe. Auf der Bayan schiebt der Handballen das Fell während des Klingens zusammen und lässt den Bass auf und ab gleiten.

Das Modell rechnet beide Felle aus der Physik einer beschwerten Membran, regt sie mit Fingeranschlägen an verschiedenen Stellen an und dämpft sie mit aufliegenden Fingern und der Hand.

## Beschwerte Membran

Ein kreisrundes Fell mit Radius 1, Spannung 1 und einer Flächendichte ρ(r), die nur vom Abstand zur Mitte abhängt, schwingt in Moden u(r) · cos(mθ). Für den radialen Teil gilt

    (r u')' + (λ ρ(r) r − m²/r) u = 0,   u(1) = 0,   u ≈ r^m in der Mitte.

Die Eigenfrequenz ist proportional zu √λ. Für konstante Dichte ergeben sich die Nullstellen der Besselfunktionen, also die unharmonische Reihe 1 : 1,593 : 2,136 : 2,295 einer gewöhnlichen Pauke ohne Kessel. Der Löser im Modell findet genau diese Werte, wenn man ihm eine konstante Dichte gibt.

Die Syahi wird Schicht für Schicht aufgetragen, jede folgende Schicht mit kleinerem Durchmesser. Für die Dayan beschreibt das Modell sie deshalb als drei übereinanderliegende Scheiben: Die Dichte ist stückweise konstant, ρ = σ₁ bis zum Radius b₁, σ₂ bis b₂, σ₃ bis b₃, dann das blanke Fell mit ρ = 1. An jeder Stufe geht die Dichte über 3 Prozent des Radius linear in die nächste über. Für die Bayan genügt ein glattes Profil, das in der Mitte am dicksten ist:

    ρ(r) = 1 + (σ − 1) · (1 − (r/b)^p)   für r < b,   danach in einem schmalen Übergang auf 1.

Die Gleichung wird für jede Winkelordnung m numerisch gelöst: Ein Runge-Kutta-Verfahren vierter Ordnung integriert von der Mitte zum Rand, eine Bisektion sucht die Werte von λ, bei denen u(1) = 0 wird. Derselbe Durchlauf liefert die Modenform u(r), normiert auf die modale Masse. Das kostet beim ersten Anschlag einer Trommel etwa eine halbe Sekunde und wird danach im Speicher gehalten.

Die sechs Werte der Dayan wurden so gesucht, dass die tiefsten neun Moden möglichst nahe an den harmonischen Gruppen liegen, die C. V. Raman 1934 an echten Tablas gemessen hat. Die Mode (1,1) bekam dabei das dreihundertfache Gewicht, denn sie ist bei Na und Tin der lauteste Teilton und muss genau auf der Oktave liegen. Das Ergebnis: σ₁ = 53,8 bis b₁ = 0,061, σ₂ = 45,0 bis b₂ = 0,214 und σ₃ = 30,0 bis b₃ = 0,426 des Radius. Die Auflage ist also bis fast zur halben Breite rund dreißig bis fünfzigmal so schwer wie das Fell.

| Gruppe | Moden (m, n) | berechnetes Verhältnis |
|---|---|---|
| 1 | (0,1) | 1,000 |
| 2 | (1,1) | 1,999 |
| 3 | (0,2), (2,1) | 2,932 und 3,060 |
| 4 | (1,2), (3,1) | 3,988 und 4,118 |
| 5 | (0,3), (2,2), (4,1) | 5,043, 5,089 und 5,150 |
| darüber | (5,1), (3,2), (1,3), (6,1), (0,4), … | 6,15, 6,22, 6,28, 7,13, 7,27, … |

Die Oktave liegt damit 1 Cent zu tief. Die übrigen Moden weichen um bis zu 51 Cent von 1 : 2 : 3 : 4 : 5 ab, im Mittel über alle neun um 25 Cent. Genauer geht es mit einer rein radialen Auflage nicht: Wer (1,1) auf die Oktave zieht, schiebt die Moden mit vielen Knotendurchmessern, (3,1) und (4,1), nach oben. Ein glattes Profil mit drei Parametern lässt (1,1) bei gleich guten übrigen Gruppen 44 Cent zu tief. Typisch für die Tabla ist, dass mehrere verschiedene Moden zusammen auf einem Teilton liegen. Ramakrishna und Sondhi haben 1954 gezeigt, dass schon ein Fell mit einer schweren, gleichmäßigen Mittelzone diese Gruppen erzeugt. Oberhalb des fünften Teiltons laufen die Moden wieder auseinander.

Die Bayan hat eine kleinere, leichtere Auflage (σ = 6, b = 0,35, p = 2). Ihre Reihe ist nur teilweise harmonisch: 1 : 2,03 : 2,53 : 3,04 : 3,16 : 3,88. Weil ihre Syahi außermittig sitzt, sind die Modenpaare stärker aufgespalten.

## Entartete Paare und der Finger auf dem Fell

Jede Mode mit m > 0 existiert zweimal, als cos(mθ) und als sin(mθ). Ein echtes Fell ist nie perfekt rund gespannt, deshalb liegen die beiden Partner 0,75 bis 2,25 Promille (Dayan) und 0,6 bis 1,8 Prozent (Bayan) auseinander und schweben gegeneinander. Diese Aufspaltung ist im Modell eine feste Eigenschaft des Instruments.

Bei den Schlägen Na und Tin liegt der Ringfinger leicht am Rand der Syahi. Ein Finger an einem Punkt wirkt als Dämpfer mit der zusätzlichen Abklingrate

    α = c · u(r_Finger)² · w.

Für die achsensymmetrischen Moden (m = 0) ist w = 1, sie haben keine Knotenlinie durch den Finger und werden schnell gedämpft, darunter der Grundton. Bei den Paaren legt der Finger die Orientierung fest: Der Partner mit dem Schwingungsbauch unter dem Finger wird gedämpft, der andere hat dort eine Knotenlinie und klingt weiter. Nur über die Breite des Fingers berührt er ihn ein wenig, w ≈ (0,12 m)² / 3. Wie stark der überlebende Partner angeregt wird, hängt vom Winkel zwischen Anschlag und Finger ab, sin(mθ). So entsteht der typische Klang von Na: Der Grundton fehlt fast, die Teiltöne 2, 3 und 4 klingen lange.

Der Rand des Fells ist doppelt, ein zweiter Fellring liegt über dem Hauptfell. Er dämpft alle Moden mit der Rate c_Rand · u(0,94)², das trifft vor allem die Moden hoher Ordnung m, die sich am Rand sammeln.

## Anschlag und Abstrahlung

Der Finger trifft das Fell an der Stelle r_s und im Winkel θ. Die Amplitude einer Mode ist

    a = v · u(r_s) · cos(mθ) bzw. sin(mθ) · min(1, (ka)^m) · W(f, T).

W(f, T) ist die Hüllkurve des Spektrums eines halben Sinusimpulses der Dauer T, die Kontaktzeit folgt dem Hertz'schen Gesetz und wird mit der Geschwindigkeit kürzer (T ∝ v^−1/5). Der Faktor (ka)^m beschreibt, wie schlecht eine Quelle mit m Knotendurchmessern abstrahlt, solange der Umfang der Trommel kleiner als die Wellenlänge ist (Radius Dayan 7,5 cm, Bayan 11 cm). Deshalb klingt bei der Bayan vor allem die Grundmode, obwohl der Schlag auch höhere anregt.

Die Abklingzeiten fallen mit der Frequenz. Die achsensymmetrischen Moden strahlen als einzige wie eine pulsierende Kugel ab und verlieren dadurch schneller Energie. Bei den geschlossenen Schlägen (Te, Ka) bleibt die Hand auf dem Fell, alle Moden klingen dann in etwa 50 Millisekunden ab.

Dazu kommt ein kurzes Kontaktgeräusch, bandbegrenztes Rauschen für die vielen stark gedämpften hohen Moden während der Berührung. Am Ende läuft der ganze Anschlag durch einen Hochpass vierter Ordnung bei 25 Hz, weil ein geschlossenes Luftvolumen keinen Gleichanteil abstrahlen kann. Er sitzt hinter der kurzen Einblendung, damit kein Rest an Fläche übrig bleibt: Gerade die gedämpften Schläge Te und Ka trügen sonst einen Gleichanteil, und viele schnelle Schläge hintereinander erzeugten eine langsame Drift.

Alle Teiltöne werden einzeln mit eigener Phase aufsummiert, keine Mode liegt über 45 Prozent der Abtastrate. Es gibt keine Nichtlinearität, die Aliasing erzeugen könnte.

## Spannung und Gleiten

Alle Frequenzen eines Fells skalieren mit der Wurzel der Spannung. Das Modell führt deshalb einen gemeinsamen Faktor k(t) für alle Moden:

    k(t) = (1 + c · v² · e^(−t/τ)) · 2^(g · s(t) / 12)

Der erste Teil ist die Spannungsmodulation: Ein starker Schlag dehnt das Fell, der Ton beginnt etwas höher und sinkt in wenigen zehn Millisekunden auf die Stimmung (bei voller Stärke etwa 6 Cent auf der Dayan). Der zweite Teil gilt nur für ge-glide. Der Handballen drückt nach dem Schlag ins Fell der Bayan, s(t) steigt in etwa 0,35 Sekunden weich von 0 auf 1, die Tonhöhe gleitet um g Halbtöne nach oben. Ein negatives g heißt: Die Hand drückt schon beim Anschlag und lässt dann los, der Ton fällt.

## Schläge

| Stimme | Trommel | Anschlag | Dämpfung |
|---|---|---|---|
| na | Dayan | Zeigefinger auf den Rand | Ringfinger leicht am Rand der Syahi |
| tin | Dayan | Zeigefinger auf das freie Fell zwischen Rand und Syahi | wie na |
| tun | Dayan | Zeigefinger in die Mitte der Syahi, sofort wieder weg | keine |
| te | Dayan | Mittelfinger in die Mitte, bleibt liegen | geschlossen |
| ge | Bayan | Mittelfinger auf das freie Fell | Handgelenk leicht am Rand |
| ge-glide | Bayan | wie ge | Handballen schiebt nach, Tonhöhe gleitet |
| ka | Bayan | flache Hand | geschlossen |
| dha | beide | na und ge zugleich | |
| dhin | beide | tin und ge zugleich | |

Tun trifft die Mitte, dort haben nur die achsensymmetrischen Moden einen Ausschlag. Es klingen also Teilton 1, 3 und 5 und der Grundton ist laut.

## Parameter

- `voice`: einer der Schläge oben, Standard `na`. Unbekannte Namen werfen einen Fehler.
- `midi`: Stimmung der Dayan als Tonhöhe ihrer tiefsten Mode, 57 bis 69 (A3 bis A4), Standard 62. Zwischenwerte sind erlaubt, Werte außerhalb werden begrenzt. Die Bayan ist fest auf etwa 98 Hz gestimmt.
- `velocity`: Anschlagstärke 0,02 bis 1, Standard 0,8.
- `glide`: Gleiten der Bayan bei ge-glide in Halbtönen, −7 bis 7, Standard 4.
- `seed`: Zufall für Anschlagstelle, Winkel und Kontaktzeit. Gleicher Seed ergibt identische Ausgabe, auch gebrochene Seeds geben eigene Varianten.

Nicht endliche Zahlen werfen einen Fehler, der den Parameter nennt.

## Messwerte

Gemessen über alle Schläge, jede zweite Stimmung von 57 bis 69, Stärke 0,2, 0,6 und 1, fünf Seeds und für ge-glide die Werte −7, 0, 4 und 7 (1260 Anschläge):

- lautester Anschlag −3,0 dBFS (jede Stimme ist einzeln auf diesen Wert kalibriert)
- keine ungültigen Werte, erstes und letztes Sample jedes Anschlags exakt 0
- Gleichanteil höchstens 0,0003 Prozent des Spitzenwerts, über die Länge des Anschlags gemittelt
- 24 Schläge hintereinander im Abstand von 125 ms (Stimmung 62, volle Stärke): die stärkste Spektrallinie unter 10 Hz liegt 51 dB (Ka) bis 99 dB (Tun) unter der stärksten Linie des Klangs
- größter Sprung von Sample zu Sample 0,31 beim harten Na, das ist der helle Randanschlag mit Teiltönen bis gut 7 kHz
- Grundton der Dayan nach dem Abklingen der Spannungsmodulation auf 0,01 Cent genau bei allen 13 Stimmungen
- im Klang gemessene Teiltonverhältnisse der Dayan (Stimmung 62): Tun 1,000, 1,998, 2,932, 3,986; Na 2,000, 3,062, 3,991, 5,091
- ge-glide endet bei g = 4 auf 123,5 Hz und bei g = 7 auf 146,8 Hz, also genau 4 und 7 Halbtöne über 98 Hz
- Rechenzeit, bezogen auf die Länge des Klangs: 10 mal (Te, ein sehr kurzer Klang) bis 99 mal (Ge) schneller als Echtzeit

Das Hörbeispiel, eine eigene Komposition aus Bols bei 84 Schlägen pro Minute mit Dayan auf 61, hat einen Spitzenpegel von −3,0 dBFS (True Peak −3,0 dBTP) und eine Lautheit von −28,1 LUFS. Der Abstand zwischen beiden ist bei Fingertrommeln mit ihren scharfen Anschlägen groß.

## Quellen

- C. V. Raman (1934): The Indian musical drums. Messung der harmonischen Modengruppen der Tabla.
- B. S. Ramakrishna, M. M. Sondhi (1954): Vibrations of Indian musical drums regarded as composite membranes. Membran mit schwerer Mittelzone.
- T. D. Rossing, W. A. Sykes (1982): Acoustics of Indian drums. Messungen zu Schlägen und Abklingzeiten.
