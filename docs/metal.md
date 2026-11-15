# Industrial Metal

Geschlagenes, geworfenes und geschabtes Metall für Industrial Techno. Alles wird aus Physik gerechnet:
Modalsynthese mit Modensätzen, die aus Geometrie und Materialdaten abgeleitet sind, angeregt durch
Kontaktmodelle (Hertz, Reibung, fallende Kette). Es gibt keine Samples, keine aufgenommenen
Impulsantworten und kein gefiltertes Rauschen als Klangquelle.

Dateien:

- `instruments/metal.mjs`: `meta` und `render({ voice, velocity, seed, size, damping, duration })`
- `instruments/metal/modal.mjs`: Modalbank, Hertz-Kontakt, Hilfsfunktionen
- `instruments/metal/objects.mjs`: Modensätze für Balken, Zylinderschale, Platte, eingespannte Kreisplatte, Luftraum, Ring
- `instruments/metal/chain.mjs`: fallende Kette
- `instruments/metal/scrape.mjs`: Reibung Metall auf Metall
- `demos/metal.mjs` erzeugt `out/metal.wav`

## Parameter

| Parameter | Bedeutung |
|---|---|
| `voice` | `anvil`, `pipe`, `sheet`, `barrel`, `chain`, `scrape` |
| `velocity` | 0 bis 1. Aufprallgeschwindigkeit des Hammers (1 bis 7 m/s), Fallhöhe der Kette, Zuggeschwindigkeit und Andruck beim Schaben |
| `seed` | Schlagpunkt, Mikrofonpunkt, kleine Maßtoleranzen, Prellzeiten, Reihenfolge der Kettenglieder. Gleicher Seed ergibt bitgleich dasselbe Ergebnis |
| `size` | 0,5 bis 2. Skaliert alle Längen des Objekts. Frequenzen fallen ungefähr mit 1/size |
| `damping` | 0,5 bis 4. Faktor auf die Verlustfaktoren (Standard 1). Größer heißt kürzer, etwa ein Magnet auf dem Amboss |
| `duration` | nur `scrape`: Dauer des Zugs in Sekunden, 0,1 bis 4 (Standard 1,4) |

Werte außerhalb der Bereiche werden auf die Grenze gesetzt. Unter size 0,5 wird das dünne Blech
bei hartem Schlag so weit ausgelenkt, dass die Rechnung nicht mehr trägt (bei 0,3 lief sie über).

Das Ergebnis ist ein mono `Float64Array` mit Ausklang. Es beginnt und endet bei null (kurze
Einblendung über 8 Samples, Ausblendung mit Raised Cosine).

Pegel: Je Stimme gibt es eine Pegelkurve über size. Sie ist an neun Stützstellen zwischen 0,5 und 2
und fünf Zwischenwerten gemessen, jeweils als lautester von 200 Seeds bei velocity 0,2, 0,6 und 1,
und so gesetzt, dass dieser Fall bei −3 dBFS liegt. Dazwischen wird in log(size) interpoliert. Das
Blech hat einzelne Seeds mit kurzen Spitzen aus der Energiekaskade. Sein typischer Schlag liegt
deshalb deutlich tiefer: bei size 1 und velocity 1 im Median bei −10 dBFS, 90 % der Seeds unter
−8,6 dBFS. Ein kleines Objekt ist leichter und wird vom gleichen Hammer viel weiter ausgelenkt, ohne die Kurve läge das Rohr bei size 0,5 um 15 dB
höher als bei size 1. Weniger Dämpfung als 1 lässt Amboss, Rohr, Kette und Schaben etwas lauter
aufbauen, das Blech zeigt öfter Spitzen. Dafür gibt es unter damping 1 einen kleinen Abschlag
(damping^0,15 bis damping^0,4). Die Kurve ist als `trimDb(voice, size)` exportiert.

Prüfung mit frischen Seeds (201 bis 300, 28 840 Renderings über alle Stimmen, 14 Größen, velocity
0,2/0,6/1, damping 0,5/1/4): keine ungültigen Werte, erstes und letztes Sample immer null, lautester
Fall −1,5 dBFS (Blech, size 0,5), alle übrigen Stimmen zwischen −2,1 und −3,5 dBFS.

## Gemeinsamer Kern: Modalbank

Jede Mode ist ein gedämpfter Oszillator mit modaler Masse m, Kreisfrequenz ω und Abklingzeit T60.
Im Code ist sie ein komplexer Einpol z ← r·e^{iω/SR}·z + b·J. Mit b = φ/(m·ω) ist Im(z) die modale
Auslenkung in Metern und ω·Re(z) die Geschwindigkeit. J ist der Impuls (N·s), den der Kontakt in
einem Sample überträgt, φ die Modenform am Kontaktpunkt. Ein Impuls verändert nur Re(z), die
Auslenkung bleibt stetig. Darum beginnt jeder Ton bei null, und Frequenzänderungen während des
Ausklangs sind phasenstetig.

Gehört wird die modale Schnelle, gewichtet mit der Modenform am Mikrofonpunkt und einem
Abstrahlfaktor. Moden unter etwa 60 Hz strahlen kaum ab und werden entsprechend abgesenkt. Alle
Moden liegen unter 16 kHz, darüber wird nichts erzeugt. Weil das gesamte Signal aus Moden unter
Nyquist besteht, gibt es kein Aliasing. Ein Hochpass bei 25 Hz und ein sanfter Tiefpass bei
15,5 kHz (je 2. Ordnung) runden nur ab. Es gibt keinen Limiter und keine Sättigung.

Verluste: η(f) = η₀ + η₁·√(f/1 kHz) und T60 = 2,2/(f·η). η₀ ist der Materialverlust von Stahl
(10⁻⁴ bis 10⁻³ je nach Lagerung, Cremer, Heckl, Petersson), η₁ fasst thermoelastische und
Abstrahlverluste zusammen. Für sehr tiefe Moden einer großen Platte begrenzt eine feste Obergrenze
die T60 (Luftreibung, Aufhängung).

Ausgeklungene Moden werden blockweise aus der Rechnung entfernt. Ein Schlag auf das Blech mit rund
1500 Moden braucht so etwa 0,6 s Rechenzeit, alle anderen Stimmen deutlich weniger.

Material: Stahl, E = 200 GPa, ρ = 7850 kg/m³, ν = 0,29, also c_L = √(E/ρ) ≈ 5050 m/s.

## Kontakt: Hertz mit Hunt-Crossley-Dämpfung

Der Hammer (Masse M) trifft mit v auf eine lokal starre Fläche. Die Kraft ist
F = K·δ^{3/2}·(1 + λ·δ̇) mit K = (4/3)·E*·√R (Hertz 1882) und λ = 3(1−e)/(2v) nach Hunt und
Crossley (1975), womit sich die Stoßzahl e einstellt. Die Gleichung wird mit 32 Unterschritten pro
Sample integriert, die Kraft wird pro Sample zum Impuls aufsummiert. Die Kontaktzeit sinkt mit
v^{-1/5}: Ein harter Schlag ist kürzer und damit heller. Stahl auf Stahl gibt etwa 0,1 ms, das
Blech mit weichem Schlägel 1 bis 2 ms.

## Stimmen

### anvil: Hammer auf Amboss

Der Ambosskörper (0,42 × 0,15 × 0,11 m bei size 1, rund 55 kg) ist ein dicker freier Balken. Die
Biegemoden folgen Euler-Bernoulli mit Timoshenko-Korrektur für Schub und Drehträgheit,
f = f_EB / √(1 + (k·r_g)²·(1 + E/(κG))), κ = 0,85 für den Rechteckquerschnitt. Dazu kommen
seitliche Biegung, Torsion und Längsschwingung, schwach angeregt, weil der Schlag senkrecht kommt.
Das Horn ist ein Kragträger (konische Form vereinfacht als Zylinder mit mittlerem Radius). Die
Verluste sind sehr klein, die Hauptmoden klingen über mehrere Sekunden.

Nachfedern: Nach dem Rückprall drückt die Hand den Hammer mit einer effektiven Beschleunigung
g_eff (180 bis 340 m/s², je Seed) zurück. Er trifft nach 2·v_r/g_eff erneut, mit etwa der
Rückprallgeschwindigkeit. So entsteht das schneller werdende „ting-ting-ting“, bis v unter
0,35 m/s fällt.

Messung (Seed 1): Moden bei rund 1,0 kHz (Horn), 2,6 und 3,1 kHz (Körper), 5,2 und 6,3 kHz, dazu
schnell abklingende Moden bei 9 bis 12 kHz. Im Spektrogramm sind die vier Prellschläge in den
ersten 0,1 s als getrennte Anschläge sichtbar. −20 dB nach 1,4 s, −40 dB nach 3,6 s.

### pipe: angeschlagenes Stahlrohr

Gerüstrohr 48,3 × 3,2 mm, 1 m lang, frei aufgehängt. Die Biegemoden des freien Balkens
(Trägheitsradius √(r_a² + r_i²)/2, Timoshenko mit κ = 0,53 für dünnwandige Rohre) bilden den
gestimmten Anteil mit den unharmonischen Verhältnissen 1 : 2,76 : 5,40 : 8,93 wie bei
Röhrenglocken (Fletcher und Rossing). Der metallische „Clang“ kommt aus den Schalenmoden
(Ovalisieren, n ≥ 2), berechnet mit der Donnell-Mushtari-Gleichung (Soedel):

ω² = E/(ρR²(1−ν²)) · [ (1−ν²)λ⁴/(λ²+n²)² + k(λ²+n²)² ], λ = mπR/L, k = h²/(12R²).

Die Schalenmoden liegen bei 2 bis 10 kHz und klingen in 0,2 bis 0,8 s ab, die Biegemoden über
viele Sekunden. Mit 50 % Wahrscheinlichkeit (Seed) gibt es einen leisen zweiten Kontakt einige
Millisekunden später. Messung: −20 dB nach 1,5 s, die Grundmode ist nach 6 s noch hörbar.
Zum Vergleich klingt die GM-Röhrenglocke aus FluidR3 (nur grob vergleichbar) in den tiefen
Teiltönen etwa 4 s.

### sheet: großes dünnes Blech, Donnerblech

0,9 × 1,8 m, 0,6 mm. Die Biegemoden folgen der Plattengleichung (Kirchhoff, Ränder als gelenkig
gelagert genähert), f_mn = (π/2)·√(D/ρh)·((m/a)² + (n/b)²). Die Modendichte ist konstant, etwa
0,9 Moden pro Hz, bis 12 kHz also über 10 000 Moden. Unter 400 Hz wird jede Mode gerechnet. Darüber
wird zufällig ausgedünnt, mit einer Behaltewahrscheinlichkeit p ∝ 1/f. So bleibt pro kritischem
Band etwa gleich viel übrig. Behaltene Moden werden mit 1/√p verstärkt, damit die spektrale
Energie gleich bleibt.

Nichtlinearität nach Berger (1955): Große Auslenkung dehnt die Mittelebene. Die Membranspannung
N = κ·Eh/(2(1−ν²))·⟨|∇w|²⟩ hebt jede Mode an, ω_k² = ω_k0² + N·k_k²/(ρh). ⟨|∇w|²⟩ wird pro Sample
aus allen modalen Auslenkungen berechnet und mit 45 Hz geglättet. Daraus folgen zwei Effekte:

- Tonhöhengleiten: Direkt nach dem Schlag liegen die Moden höher und gleiten beim Ausklingen nach
  unten. Tiefe Moden gleiten am stärksten, weil ΔΩ²/ω₀² = N/(D·k²) mit k fällt.
- Wobble: Die tiefsten Moden (2 bis 20 Hz) sind unhörbar, bewegen das Blech aber am weitesten. Ihr
  Beitrag zur Spannung schwankt mit doppelter Frequenz und moduliert alle hörbaren Moden.

Ein echtes Blech ist nicht eben. Die Anfangsverformung w_i (zufällig je Seed, Amplitude 3 mm,
fallend mit 1/k) macht aus der Spannung zusätzlich eine Kraft auf jede Mode,
F_k ∝ −N(t)·k_k²·w_i,k. Die Spannung wird dafür konsistent aus der Dehnung gegenüber der
Ausgangsform berechnet (⟨|∇(w + w_i)|²⟩ − ⟨|∇w_i|²⟩), beide Terme stammen also aus demselben
Potential. Diese quadratische Kopplung schiebt Energie in Summen- und Differenzfrequenzen, ähnlich
der Energiekaskade in Gongs und Becken (Chaigne, Touzé, Thomas 2005).

Ändert sich die Frequenz einer Mode, bleibt ihre Geschwindigkeit erhalten: Re(z) wird mit
ω_alt/ω_neu umgerechnet, und Impulse wirken mit b = φ/(m·ω) bei der aktuellen Frequenz. Weil die
Spannung geglättet und pro Block von 32 Samples gehalten wird, ist das Verfahren trotzdem nicht
exakt energieerhaltend. Ein kleines, dünnes Blech kann sich bei hartem Schlag sonst selbst
aufschaukeln. Deshalb wacht die Modalbank über die Energie
H = Σ M·(v² + ω₀²·q²)/2 + λ·S²/4 (S die Dehnung, λ so gewählt, dass die Berger-Kraft der Gradient
dieses Terms ist; ausgedünnte Moden zählen mit der Masse der Moden, für die sie stehen). Das freie
Blech verliert nur Energie. H darf daher nur um die Arbeit der Schläge wachsen, mit 1 dB Spielraum
für den Austausch, den die Glättung verwischt, und die Grenze fällt pro Block mindestens so schnell
wie die am längsten klingende Mode. Liegt H darüber, wird der Zustand zurückskaliert. Bei size 1
ändert das den Verlauf meist um weniger als ein bis zwei Dezibel. Nur Seeds, die sich ohne diese
Grenze aufschaukeln würden, klingen sichtbar früher ab.

Der Faktor κ = 5·10⁻⁴ ist angepasst. Bergers Näherung gilt für unverschiebliche Ränder, ein
hängendes Blech hat freie Ränder und dehnt sich viel weniger. Gemessen bei velocity 0,8 und Seed 1:
Eine Mode bei 221 Hz liegt nach dem Schlag bis 17 % höher und ist nach 1 s wieder bei ihrer linearen
Frequenz, eine Mode bei 27 Hz startet doppelt so hoch, eine bei 1,1 kHz knapp 4 %. Im Spektrogramm
biegen sich die Linien zwischen 400 und 1000 Hz in der ersten halben Sekunde nach unten, und im
Bereich 40 bis 100 Hz baut sich die Energie erst nach 0,2 bis 0,3 s voll auf.

Abstrahlung: Bei 0,6 mm liegt die Koinzidenzfrequenz um 20 kHz, das Blech strahlt darunter mit
einem Wirkungsgrad, der mit f steigt (Amplitude etwa ∝ √f). Schlägel: 0,5 kg, weicher Belag.

### barrel: Stahlfass, 200 l

Durchmesser 572 mm, Höhe 850 mm, Mantel 1,0 mm, Deckel 1,2 mm (übliche Maße nach ISO 15750).
Getroffen wird der Mantel zwischen den Sicken.

- Mantel: Donnell-Mushtari wie beim Rohr, m bis 10, n bis 45. Die tiefsten Mantelmoden liegen bei
  n ≈ 6 um 135 Hz, darüber wird es schnell dicht.
- Deckel: eingespannte Kreisplatte, λ²-Werte der tiefsten Moden aus Leissa (10,22; 21,26; 34,88;
  39,77; …), darüber asymptotisch λ ≈ π(s + n/2). Der Grundton liegt bei 36 Hz. Die Deckel werden
  über den Rand mitgerissen, ihre Anregung ist deshalb kleiner.
- Luftraum: geschlossener Zylinder, f = c/(2π)·√((α/R)² + (pπ/L)²), schwach gekoppelt.
- Berger-Dehnung auf den Deckeln (eingespannte Ränder, dort passt die Näherung besser): Ein harter
  Schlag gibt das typische kurze „Boing“, der Deckelgrundton startet bei voller velocity etwa 12 % höher.

Messung: −20 dB nach 0,4 s, −40 dB nach 1,7 s. Die hohen Mantelmoden sind nach 0,3 s weg, der
tiefe Teil zwischen 36 und 300 Hz trägt den Ausklang.

### chain: fallende Kette

Eine hängende Kette (34 Glieder, Teilung 40 mm, Draht 10 mm) wird oben losgelassen. Alle Glieder
fallen frei, das Glied i (von unten gezählt) landet also bei t_i = √(2(h₀ + i·l)/g) mit
v_i = √(2g(h₀ + i·l)). Die Aufprallrate und die Aufprallgeschwindigkeit steigen bis zum letzten
Glied, danach ist schlagartig Schluss. Hamm und Géminard (2010) zeigen, dass ein Teil der Kette
sogar schneller als im freien Fall ankommt. Für die Zeitstruktur genügt der freie Fall. Die
Fallhöhe h₀ hängt an `velocity`.

Jede Landung ist ein Hertz-Stoß (Drahtradius gegen Ebene) auf das Glied und auf eine dicke
Stahlbodenplatte (8 mm, stark bedämpft). Danach folgen ein bis drei Stöße des Glieds gegen
Nachbarn auf dem Haufen, mit 8 bis 38 % der Geschwindigkeit. Am Ende kommen einige leise
Nachklapperer. Die Glieder schwingen mit den Biegemoden eines dünnen Rings (Hoppe, Rayleigh),
ω_n = (c·r_g/R²)·n(n²−1)/√(n²+1) in der Ebene und mit √(n²+1+ν) aus der Ebene. Die ovale Form
spaltet jede Mode in ein Paar. Jedes Glied hat leicht andere Maße. Gemessen liegen die
Gliedmoden bei 4,5 bis 6 kHz (n = 2) und 13 bis 15 kHz (n = 3). Weil die Glieder auf dem Haufen
aneinander liegen, ist ihre T60 auf 0,06 bis 0,31 s begrenzt.

### scrape: Metall über Metall

Ein Flachstahl (0,3 m × 25 × 5 mm, in der Hand) wird über eine Stahlplatte (0,7 × 0,5 m, 3 mm)
gezogen. Beide sind Modalsysteme, gekoppelt über Reibung am Kontaktpunkt, der pro Sample implizit
gelöst wird:

- Aus dem freien Fortschritt aller Moden folgt die Relativgeschwindigkeit v_rel = v_Zug + v_Stab − s·v_Platte.
  Die Punktnachgiebigkeit ist Y = Σφ²/m (Stab plus s²-mal Platte).
- Haften, wenn die Kraft, die v_rel auf null bringt, unter μ_s·N bleibt.
- Sonst Gleiten mit Stribeck-Kurve μ(v) = μ_d + (μ_s − μ_d)·e^{−|v|/v_s}, μ_s = 0,7, μ_d = 0,3,
  v_s = 0,02 m/s. Die Kraft wird per Bisektion bestimmt, die Lösung ist damit stabil.

Die tangentiale Reibkraft erreicht die Biegemoden der Platte über die Neigung des Stabs
(Projektion s = 0,55). Die Zuggeschwindigkeit schwankt unregelmäßig (geglättetes Zufallssignal
bei 7 und 23 Hz), der Andruck langsam. Die Oberflächenrauheit ist ein räumliches Profil
(Rauheitsspitzen alle 0,2 mm, Riefen alle 3 mm). Sie moduliert die Normalkraft entlang des Wegs,
ihr Spektrum folgt also der Geschwindigkeit. Der Kontaktpunkt wandert, die Modenformen werden alle
32 Samples neu berechnet. Die Platte strahlt unter ihrer Koinzidenzfrequenz (rund 4 kHz bei 3 mm)
mit einem Wirkungsgrad proportional zu f/f_c. Der Stab wird von der Hand bedämpft, vor allem
unterhalb von 400 Hz.

Im Spektrogramm wechseln sich ab: Phasen mit Haftgleiten, in denen die Stabmoden (etwa 2,5 kHz,
5 kHz, 6,9 kHz, 8,7 kHz) als Quietschen mit Obertönen auftauchen, und ruhigere Phasen mit
breitbandigem Schleifen. Welche Phase wann kommt, hängt an der Geschwindigkeit und damit am Seed.

## Demo

`node demos/metal.mjs` schreibt `out/metal.wav` (Stereo, 29,2 s, Rechenzeit rund 4,5 s). Zuerst
jede Stimme allein, dann acht Takte bei 145 BPM:

- Amboss als kurz gegateter Offbeat-Tick in zwei Tonhöhen (Original und 0,94)
- Fass auf 2 und 4, gegatet
- Rohr offen in den ersten vier Takten, danach eine Oktave tiefer und gegatet
- kurze gegatete Kettenrassler, volle Kettenfälle als Fill in Takt 4 und 8
- Donnerblech eine Oktave tiefer auf Takt 1, normal auf Takt 5, groß am Ende
- Schaben als Aufzug vor Takt 5 und vor dem Schluss

Tonhöhe wird nur nach unten verschoben (langsamer lesen mit kubischer Hermite-Interpolation), so
kann nichts zurückfalten. Gates haben Raised-Cosine-Rampen. Normalisiert auf −1 dBFS.

Messwerte der Demo: Spitze −1,0 dBFS, True Peak −0,9 dBTP (ffmpeg ebur128), −17,3 LUFS
integriert, DC unter 10⁻⁵, erstes und letztes Sample null. Der größte Sprung von Sample zu Sample
liegt bei 0,40. Das ist kein Knacken: Er sitzt im Anschlag des Ambosses, in einer glatten
Schwingung um 5 kHz. Eine Sinusschwingung der Amplitude A bei 5 kHz springt bis 0,64·A pro Sample.

## Grenzen

- Der Kontakt nimmt eine lokal starre Fläche an. Beim dünnen Blech würde die Nachgiebigkeit der
  Platte den Stoß weicher machen, das ist über eine kleinere Kontaktsteifigkeit nur grob nachgebildet.
- Plattenränder sind als gelenkig gelagert genähert, das echte Blech hängt frei. Die Berger-Stärke
  ist dafür angepasst und nicht hergeleitet.
- Ambosshorn und -körper sind getrennte Balken ohne Kopplung, die echte Geometrie ist viel komplexer.
- Die radiale Form der Deckelmoden im Fass ist eine Näherung (Bessel-ähnliche Schwingung, am Rand null).
- Amboss und Rohr werden nach 5 bzw. 6 s ausgeblendet (bei damping 1), auch wenn die Grundmode
  noch klingt.
- Die Glieder der Kette stoßen nur mit zufälligen Nachbarn zusammen, es gibt keine echte
  Mehrkörpersimulation.

## Quellen

- H. Hertz: Über die Berührung fester elastischer Körper. J. reine angew. Math. 92 (1882), 156-171.
- K. H. Hunt, F. R. E. Crossley: Coefficient of restitution interpreted as damping in vibroimpact.
  J. Appl. Mech. 42 (1975), 440-445.
- S. P. Timoshenko: On the correction for shear of the differential equation for transverse
  vibrations of prismatic bars. Phil. Mag. 41 (1921), 744-746.
- N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments, 2. Aufl., Springer 1998
  (Kap. 2, 3 und 19: Stäbe, Platten, Röhrenglocken).
- W. Soedel: Vibrations of Shells and Plates, 3. Aufl., Marcel Dekker 2004 (Donnell-Mushtari).
- A. W. Leissa: Vibration of Plates. NASA SP-160, 1969 (eingespannte Kreisplatte).
- H. M. Berger: A new approach to the analysis of large deflections of plates. J. Appl. Mech. 22
  (1955), 465-472.
- A. Chaigne, C. Touzé, O. Thomas: Nonlinear vibrations and chaos in gongs and cymbals. Acoust.
  Sci. & Tech. 26 (2005), 403-409.
- Lord Rayleigh: The Theory of Sound, Bd. 1, 1877 (Ringschwingungen).
- L. Cremer, M. Heckl, B. A. T. Petersson: Structure-Borne Sound, 3. Aufl., Springer 2005
  (Verlustfaktoren, Abstrahlung, Koinzidenz).
- A. Akay: Acoustics of friction. J. Acoust. Soc. Am. 111 (2002), 1525-1548.
- R. Stribeck: Die wesentlichen Eigenschaften der Gleit- und Rollenlager. Z. VDI 46 (1902).
- E. Hamm, J.-C. Géminard: The weight of a falling chain, revisited. Am. J. Phys. 78 (2010), 828-833.
- ISO 15750 (Stahlfässer), EN 39 (Gerüstrohre 48,3 mm) für typische Abmessungen.

Der Code ist vollständig eigenständig geschrieben. Es wurde kein Code aus Bibliotheken,
Synthese-Toolkits oder Veröffentlichungen übernommen oder portiert.
