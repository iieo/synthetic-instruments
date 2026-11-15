# Holzbläser: Flöte und Klarinette

Beide Instrumente sind physikalische Modelle mit digitalen Wellenleitern. Das Rohr ist eine Verzögerungsleitung, in der Druckwellen hin und her laufen. An einem Ende sitzt der Erreger: bei der Klarinette ein Rohrblatt mit nichtlinearer Strömungskennlinie, bei der Flöte ein Luftstrahl, der an der Schneide (Labium) hin und her schlägt. Der Ton entsteht, weil diese Rückkopplung schwingt, nicht weil Sinusse addiert werden. Ob ein Ton anspricht, wie hell er ist und wie er einschwingt, folgt aus dem Modell. Keine Samples, keine aufgenommenen Impulsantworten.

Dateien:

- `instruments/winds/dsp.mjs`: Verzögerungsleitung mit Lagrange-Interpolation dritter Ordnung, Einpolfilter mit Phasenlaufzeit, DC-Sperre, Resonator, Zufallsdrift, Atemhüllkurve, Randblenden
- `instruments/winds/room.mjs`: kleiner algorithmischer Raum (zwei Allpässe, Rückkopplungsnetz aus vier Leitungen), nur für die Demos
- `instruments/winds/score.mjs`: setzt eine Notenliste zu einer Spur zusammen (Bindung, Zunge, Staccato)
- `instruments/flute.mjs`, `instruments/clarinet.mjs`
- `demos/flute.mjs` schreibt `out/flute.wav`, `demos/clarinet.mjs` schreibt `out/clarinet.wav`

Jedes Modul exportiert `meta = { name, range }` und `render({ midi, velocity, duration, seed, vibrato, articulation })`. Das Ergebnis ist ein `Float64Array` in Mono bei 48 kHz. Es enthält auch das Ende: Der Atem setzt ab, das Rohr klingt aus, das letzte Sample ist null. `articulation` ist `'tongue'` (Standard) oder `'legato'`. Gleiche Argumente ergeben dasselbe Signal.

## Klarinette

### Rohr

Die Klarinettenbohrung ist zylindrisch und am Mundstück praktisch geschlossen. Am Mundstück wird eine Druckwelle also ohne Vorzeichenwechsel reflektiert, am offenen Ende mit Vorzeichenwechsel. Eine Welle braucht deshalb zwei Umläufe für eine Periode, die Grundfrequenz ist `c / 4L`, und die Resonanzen liegen bei ungeraden Vielfachen. Das ist der Grund für die schwachen geraden Teiltöne im tiefen Register.

Das Modell hat vier Verzögerungsleitungen: hin und zurück zwischen Mundstück und Registerloch und hin und zurück zwischen Registerloch und Ende. Die Gesamtlaufzeit für einen Umlauf ist

```
D = m · fs / (2 f) · k − τ_LP(f)
```

mit `m = 1` im Chalumeau und `m = 3` im Clarion, der Phasenlaufzeit `τ_LP` des Endfilters bei der Spielfrequenz und einem kleinen Korrekturfaktor `k` (siehe Stimmung).

### Offenes Ende und Tonlochgitter

Die Reflexion am offenen Ende ist `R = −g · LP(z)`. Der Tiefpass steht für zwei Effekte. Am Rohrende strahlt hoher Schall besser ab und wird schwächer reflektiert. Wichtiger ist das Gitter der offenen Tonlöcher: Unterhalb seiner Grenzfrequenz reflektiert es fast vollständig, oberhalb läuft die Welle durch und strahlt ab. Benade gibt für die Klarinette etwa 1500 Hz an. Das Modell nimmt `1500 Hz + 20 Hz` je Halbton über D3. `g` sammelt die Wandverluste: 0,9835 im tiefen Register (Chalumeau) und 0,9805 im Clarion, also `0,985 − 0,0015 · m` mit der Nummer `m` der Resonanz, auf der der Ton läuft (1 oder 3).

Der abgestrahlte Schall ist die Ableitung des Volumenflusses, der das Rohr verlässt, also der Differenz aus ankommender und reflektierter Welle. Ein Tiefpass zweiter Ordnung bei 4,5 kHz außerhalb der Schleife bildet Mundstück und Raumdämpfung nach.

### Rohrblatt

Das Rohrblatt ist ein druckgesteuertes Ventil. In dimensionslosen Größen (Druck geteilt durch den Schließdruck `p_M`, Wellenwiderstand = 1) gilt die quasistatische Kennlinie

```
Δp = γ − p          (Munddruck minus Druck im Mundstück)
u  = ζ · (1 − Δp) · √Δp       für 0 ≤ Δp < 1
u  = 0                         für Δp ≥ 1   (Blatt liegt auf, "beating reed")
u  = −ζ · (1 − Δp) · √(−Δp)   für Δp < 0
```

`γ` ist der Blasdruck, `ζ` die Öffnung des Blatts (Ansatz). Mit `p = 2p⁻ + u` und `p⁺ = p⁻ + u` muss für jedes Sample die implizite Gleichung `u = F(γ − 2p⁻ − u)` gelöst werden. `u − F(a − u)` steigt streng monoton, solange `ζ < 1`. Deshalb genügt eine Bisektion in einem festen Intervall, 26 Schritte pro Sample. Die Schwingung setzt bei `γ ≈ 1/3` ein, ab `γ ≈ 1/2` schlägt das Blatt auf. Das Modell spielt `γ = 0,40 … 0,66` und `ζ = 0,28 … 0,36` je nach Anschlagstärke. Leise Töne sind dadurch nicht nur leiser, sondern auch runder, laute bekommen mehr Obertöne.

Turbulenz am Blattspalt ist gefärbtes Rauschen, das den Fluss um wenige Prozent moduliert. Der Atemdruck bekommt Rauschen und eine langsame Drift dazu.

### Zunge und Atem

Beim gestoßenen Ton liegt die Zunge zunächst auf dem Blatt (`ζ = 0`), der Druck steht schon an. Beim Lösen öffnet sich `ζ` in etwa 12 ms. Gebundene Töne beginnen ohne Zunge mit einem weicheren Druckanstieg (45 ms). Am Ende fällt der Druck in 60 ms ab, das Rohr klingt danach frei aus.

### Register

Ab A4 (MIDI 69) spielt das Modell im Clarion. Physikalisch bleibt das Rohr so lang wie für den Ton eine Duodezime tiefer, das Registerloch ist offen und der Ton läuft auf der dritten Resonanz. Das Registerloch ist eine Querverbindung mit Massenträgheit (Admittanz `Y ∝ 1/(jωm)`), als Streuknoten zwischen den beiden Rohrabschnitten:

```
p_j = (a₁ + a₂ − u_h/2) / (1 + K/2),    u_h ← u_h + K · p_j
```

Es sitzt nahe beim ersten Druckknoten der dritten Mode, bei 0,9 · λ/4 vom Mundstück. Dort stört es diese Mode kaum, dämpft und verstimmt aber die Grundresonanz des langen Rohrs. Die Lochgröße wurde durch einen Parameterlauf bestimmt: Zu kleine Löcher lassen das Rohr auf der Grundresonanz weiterspielen, zu große bauen ein eigenes kurzes Rohr. Der gewählte Wert spricht von A4 bis F6 sauber auf der Duodezime an, bei allen Anschlagstärken. Das Altissimo wird mit derselben Duodezime gespielt, echte Gabelgriffe sind nicht modelliert.

## Flöte

### Rohr

Die Flöte ist an beiden Enden offen. Beide Reflexionen kehren das Vorzeichen um, nach einem Umlauf ist die Welle wieder gleichphasig. Die Resonanzen liegen deshalb bei allen ganzzahligen Vielfachen, gerade Teiltöne sind erlaubt. Eine einzige Verzögerungsleitung mit Tiefpass (4 kHz plus 40 Hz je Halbton) und Verlustfaktor 0,92 bildet den Umlauf nach. Der Verlust ist deutlich höher als bei der Klarinette, weil das Mundloch zusätzlich abstrahlt. Eine DC-Sperre in der Schleife fängt den Gleichanteil des Strahls ab, ihre (negative) Phasenlaufzeit wird bei der Rohrlänge berücksichtigt.

### Luftstrahl

Der Strahl verlässt die Lippen mit der Geschwindigkeit `U = √(2P/ρ)`, im Modell `U = √P`. Störungen laufen mit etwa der halben Strahlgeschwindigkeit zur Schneide, das ergibt eine Laufzeit `τ ∝ W / U`. Am Labium teilt der ausgelenkte Strahl den Fluss zwischen innen und außen auf. Das Profil eines Freistrahls ergibt dafür eine S-Kurve:

```
q = U · tanh(s · η(t − τ) + b)
```

`η` ist die akustische Auslenkung am Mundloch, zeitverzögert um `τ` und durch zwei Tiefpässe bei `3f` geglättet (Scherwellen auf dem Strahl werden bei hohen Frequenzen gedämpft). Der Versatz `b` setzt den Strahl leicht neben die Schneide. Ohne ihn entstünden nur ungerade Teiltöne. Der eingespeiste Druck ist zum Teil proportional zu `q` und zum Teil zu `dq/dt` (Jet-Drive-Modell nach Verge und Fabre). Der Anteil der Ableitung (0,3) hebt den zweiten Teilton an, ein größerer Anteil lässt die Schleife auf hohen Resonanzen pfeifen.

### Register über die Strahllaufzeit

Welche Mode anspricht, entscheidet das Verhältnis von Strahllaufzeit zu Periode. Ein Parameterlauf über `τ / T` zeigt beim Modell: um 0,4 bis 0,6 spricht der gewünschte Ton an, unter 0,3 springt die Flöte in eine höhere Mode, wie beim Überblasen. Die Griffe folgen dem echten Instrument: erste Oktave auf der Grundmode (bis C♯5), zweite Oktave mit derselben Rohrlänge auf der zweiten Mode (D5 bis C♯6), dritte Oktave auf der dritten Mode (ab D6). Für die dritte Oktave verkürzt der Spieler den Abstand zur Schneide, im Modell `τ = 0,45 T` statt `0,55 T`. Lauteres Blasen beschleunigt den Strahl und verkürzt `τ`. Das ändert Klangfarbe und Stimmung ein wenig mit, wie beim echten Instrument.

### Atem, Rauschen, Vibrato

- Turbulenz: Rauschen, im Bandpass gefärbt und mit dem Druck skaliert, lenkt den Strahl zusätzlich aus und läuft so durch die Rohrresonanzen. Ein zweiter, direkter Rauschanteil steht für das hörbare Anblasgeräusch.
- Zunge: Beim gestoßenen Ton gibt es einen kurzen Druckstoß (60 % für etwa 40 ms), einen Druckpuls ins Rohr und einen Rauschstoß ("Chiff"), der in etwa 18 ms abklingt. Gebundene Töne haben nur einen kleinen Puls.
- Vibrato ist Druckvibrato: 4,9 bis 5,3 Hz, ±6 % Druck, es setzt nach 0,25 s ein und wächst über 0,4 s. Über die Strahlgeschwindigkeit moduliert es Lautstärke, Klangfarbe und etwas Tonhöhe. `vibrato: false` schaltet es ab, eine Zahl skaliert die Tiefe.
- Drift: Druck und Strahllaufzeit wandern langsam zufällig (gefiltertes Rauschen, deterministisch über `seed`).

Abgestrahlt wird die Ableitung des Flusses am Mundloch, mit zwei Tiefpässen bei 3 kHz. Ein Pegelausgleich `(262/f)^0,4` mildert den Abstand zwischen leisem tiefen und lautem hohen Register.

## Stimmung

Ein nichtlinearer Oszillator schwingt nicht exakt auf der linearen Rohrresonanz. Bei der Klarinette ziehen die leicht unharmonischen höheren Resonanzen den Ton nach oben (im Chalumeau 4 bis 12 Cent, im Clarion um 25 Cent). Bei der Flöte zieht die Phase des Strahls ihn nach unten (8 bis 15 Cent). Zuerst wird die Phasenlaufzeit aller Filter in der Schleife bei der Zielfrequenz analytisch von der Rohrlänge abgezogen. Den Rest hat ein Messlauf über den ganzen Tonumfang und mehrere Anschlagstärken ermittelt (Grundfrequenz per FFT mit Parabelinterpolation). Er ist als kleine lineare Formel in `tuningOffsetCents` hinterlegt.

Ergebnis nach der Korrektur, gemessen im stationären Teil:

| | Abweichung |
|---|---|
| Flöte, C4 bis C7, Anschlag 0,2 bis 1 | ±0,8 Cent |
| Klarinette, D3 bis F6, Anschlag 0,2 bis 1 | ±2,3 Cent |

## Vergleich mit einer Referenz

Als Referenz dienten FluidSynth-Renderings des Soundfonts FluidR3_GM (GM 74 Flöte, GM 72 Klarinette), je zwei Sekunden pro Ton. Die Renderings selbst sind nicht Teil des Repos. Gemessen wurde zwischen 0,5 s und 1,8 s jedes Tons, Klarinette mit Anschlag 0,8.

| Klarinette | Ungerade/gerade (H1 bis H8) | Schwerpunkt | Rauschanteil | Anstieg 10→90 % |
|---|---|---|---|---|
| D3 Modell | 19 dB | 814 Hz | −29 dB | 35 ms |
| D3 Referenz | 23 dB | 1046 Hz | −32 dB | 120 ms |
| E4 Modell | 19 dB | 934 Hz | −33 dB | 20 ms |
| E4 Referenz | 11 dB | 1457 Hz | −34 dB | 40 ms |
| G5 Modell | 19 dB | 1411 Hz | −35 dB | 15 ms |
| G5 Referenz | 9 dB | 1992 Hz | −54 dB | 30 ms |

| Flöte (ohne Vibrato) | Ungerade/gerade | Schwerpunkt | Rauschanteil | Anstieg 10→90 % |
|---|---|---|---|---|
| C4 Modell | 6 dB | 475 Hz | −30 dB | 90 ms |
| C4 Referenz | 3 dB | 507 Hz | −36 dB | 130 ms |
| D5 Modell | 15 dB | 1202 Hz | −38 dB | 70 ms |
| D5 Referenz | 18 dB | 826 Hz | −34 dB | 240 ms |
| E6 Modell | 21 dB | 1497 Hz | −40 dB | 60 ms |
| E6 Referenz | 37 dB | 1324 Hz | −41 dB | 575 ms |

Was passt: Die Klarinette hat im tiefen Register klar dominante ungerade Teiltöne, die geraden liegen 20 bis 25 dB darunter. Rauschanteil und Einschwingen liegen bei beiden Instrumenten im Bereich der Referenz, die Flöte wird nach oben reiner und weniger rauschig. Alle Töne beider Instrumente sprechen an, im ganzen Umfang und bei Anschlag 0,2 bis 1, ohne Quietschen.

Was abweicht: Die Klarinette ist im Clarion zu "ungerade". Die echte Klarinette (und die Referenz) hat dort nur 9 bis 12 dB Abstand, weil höhere Resonanzen oberhalb der Gittergrenze kaum noch harmonisch liegen. Die Flöte hat im tiefen Register einen schwächeren zweiten Teilton als die Referenz (−8 statt −2 bis −4 dB) und in der Höhe einen etwas stärkeren dritten.

## Messwerte der Demos

| Datei | Länge | Spitze | Max. Sprung | Lautheit |
|---|---|---|---|---|
| `out/flute.wav` | 28,9 s | −3,0 dBFS | 0,19 | −13,6 LUFS |
| `out/clarinet.wav` | 30,1 s | −3,0 dBFS | 0,20 | −19,9 LUFS |

Der größte Sprung liegt jeweils in lauten hohen Tönen mit vielen Obertönen, nicht an Notenanfängen oder -enden. Erstes und letztes Sample sind null, es gibt keine NaN. Jede Demo rendert in unter einer Sekunde. Auf dem Ausgang liegt keine Sättigung, nur eine lineare Normierung auf −3 dBFS. Nichtlinear sind allein Rohrblatt und Strahl.

## Bekannte Schwächen

- Das Rohrblatt ist quasistatisch, seine Eigenresonanz (2 bis 3 kHz) fehlt. Quietschen über die Blattresonanz und Effekte wie Subtone gibt es deshalb nicht.
- Tonlöcher sind nicht einzeln modelliert. Die Tonhöhe wird über die Rohrlänge gesetzt, das Tonlochgitter nur über den Endfilter. Gabelgriffe und Altissimo-Griffe fehlen.
- Jeder Ton ist ein eigenes Modell. Gebundene Töne werden überblendet, statt dass ein laufendes Rohr umgegriffen wird. Der Wechsel klingt dadurch weicher als echte Bindungen.
- Die Flöte braucht beim gestoßenen Ton 60 bis 100 ms, bis sie voll anspricht. Sehr schnelle Zungenstöße klingen deshalb etwas weich.
- Zum Teil wurde der Pegel über die Anschlagstärke zusätzlich linear skaliert, weil Ansatz und Lippenöffnung im Modell fehlen.

## Quellen

- M. E. McIntyre, R. T. Schumacher, J. Woodhouse: On the oscillations of musical instruments. J. Acoust. Soc. Am. 74 (5), 1983. Grundmodell aus linearem Resonator und nichtlinearem Erreger.
- J. O. Smith III: Physical modeling using digital waveguides. Computer Music Journal 16 (4), 1992.
- J. Kergomard: Elementary considerations on reed-instrument oscillations. In: A. Hirschberg, J. Kergomard, G. Weinreich (Hrsg.), Mechanics of Musical Instruments, Springer 1995. Dimensionslose Rohrblattkennlinie, Schwellen bei γ = 1/3 und 1/2.
- J.-P. Dalmont, J. Gilbert, S. Ollivier: Nonlinear characteristics of single-reed instruments: Quasistatic volume flow and reed opening measurements. J. Acoust. Soc. Am. 114 (4), 2003. Messung der Kennlinie.
- A. H. Benade: On the mathematical theory of woodwind finger holes. J. Acoust. Soc. Am. 32, 1960, und Fundamentals of Musical Acoustics, Oxford University Press 1976. Tonlochgitter und Grenzfrequenz um 1500 Hz bei der Klarinette.
- C. J. Nederveen: Acoustical Aspects of Woodwind Instruments. Northern Illinois University Press 1998. Registerloch, Mündungskorrekturen.
- N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments, 2. Aufl., Springer 1998. Kapitel 15 bis 16 (Flöten, Rohrblattinstrumente).
- J. W. Coltman: Sounding mechanism of the flute and organ pipe. J. Acoust. Soc. Am. 44, 1968. Strahllaufzeit und Registerwahl.
- M.-P. Verge, A. Hirschberg, R. Caussé: Sound production in recorderlike instruments II. A simulation model. J. Acoust. Soc. Am. 101 (5), 1997. Jet-Drive-Modell.
- B. Fabre, A. Hirschberg, A. P. J. Wijnands: Vortex shedding in steady oscillation of a flue organ pipe. Acta Acustica 82, 1996.
- J. Wolfe, J. Smith, J. Tann, N. H. Fletcher: Acoustic impedance spectra of classical and modern flutes. Journal of Sound and Vibration 243 (1), 2001.
- T. I. Laakso, V. Välimäki, M. Karjalainen, U. K. Laine: Splitting the unit delay. IEEE Signal Processing Magazine 13 (1), 1996. Fraktionale Verzögerung mit Lagrange-Interpolation.
- J.-M. Jot, A. Chaigne: Digital delay networks for designing artificial reverberators. 90. AES Convention, 1991. Rückkopplungsnetz für den Demo-Raum.

Der gesamte Code ist eigenständig geschrieben. Aus den Quellen stammen nur Gleichungen und Messwerte, kein Code.
