// Display data the instrument modules don't carry themselves. Unknown instruments still work:
// every lookup has a fallback derived from the module's own meta.

export const CATALOG = {
  piano: { title: 'Klavier', category: 'Tasten',
    desc: 'Ein Konzertflügel. Ein Filzhammer schlägt zwei oder drei leicht verstimmte Saiten an, die über den Steg einen gerippten Resonanzboden in Schwingung versetzen.' },
  epiano: { title: 'E-Piano', category: 'Tasten',
    desc: 'Ein elektromechanisches Piano, wie man es aus Soul und Lofi kennt. Ein Hammer schlägt eine Stahlzunge mit Klangstab an, ein elektromagnetischer Tonabnehmer nimmt die Schwingung ab und schickt sie durch Verstärker und Lautsprecher.' },
  organ: { title: 'Pfeifenorgel', category: 'Tasten',
    desc: 'Eine Kirchenorgel mit mehreren Registern. In jeder Pfeife regt der Wind ein Luftband am Kernspalt oder eine schlagende Zunge an, die Luftsäule im Rohr bestimmt die Tonhöhe.' },
  accordion: { title: 'Akkordeon', category: 'Tasten', docs: ['harmonica.md'], demoScript: 'harmonica.mjs',
    desc: 'Ein Piano-Akkordeon mit Musette-Diskant und Stradella-Bass. Der Balg drückt Luft durch Schlitze, in denen Messingzungen schwingen, und im Musette-Register schweben drei leicht verstimmte Zungen gegeneinander.' },
  guitar: { title: 'Akustikgitarre', category: 'Saiten', docs: ['plucked-strings.md'],
    desc: 'Eine Gitarre mit Nylon- oder Stahlsaiten. Finger oder Plektrum zupfen die Saite, ihre Wellen laufen zwischen Steg und Sattel hin und her und bringen über den Steg den hölzernen Korpus zum Klingen.' },
  bass: { title: 'Bass', category: 'Saiten', docs: ['plucked-strings.md'],
    desc: 'Ein E-Bass, mit den Fingern gezupft, oder ein Kontrabass im Pizzicato. Die dicken, steifen Saiten schwingen wie bei der Gitarre, ihre Obertöne liegen aber etwas höher als die reinen Vielfachen des Grundtons.' },
  harp: { title: 'Harfe', category: 'Saiten',
    desc: 'Eine Doppelpedalharfe mit 47 Saiten. Ein Finger zupft die Saite an, die über den Steg einen Resonanzkasten antreibt. Länge und Spannung jeder Saite folgen aus einer physikalischen Tabelle.' },
  violin: { title: 'Violine', category: 'Saiten', docs: ['bowed-strings.md'],
    desc: 'Eine gestrichene Violine. Das Kolophonium am Bogen hält die Saite fest, bis sie abreißt und zurückschnellt, und dieses Haften und Gleiten wiederholt sich mit jeder Schwingung.' },
  cello: { title: 'Cello', category: 'Saiten', docs: ['bowed-strings.md'],
    desc: 'Ein gestrichenes Cello. Der Bogen nimmt die Saite durch Haftreibung mit und lässt sie wieder los, der große Holzkorpus strahlt den Klang ab.' },
  flute: { title: 'Querflöte', category: 'Blas', docs: ['winds.md'],
    desc: 'Eine Querflöte. Ein Luftstrahl schlägt an der Kante des Mundlochs hin und her und wird dabei von den Druckwellen im Rohr gesteuert. Aus dieser Rückkopplung entsteht der Ton.' },
  clarinet: { title: 'Klarinette', category: 'Blas', docs: ['winds.md'],
    desc: 'Eine Klarinette. Das Rohrblatt öffnet und schließt den Luftweg nach einer nichtlinearen Strömungskennlinie, die Druckwellen im zylindrischen Rohr halten es in Schwingung.' },
  trumpet: { title: 'Trompete', category: 'Blas', docs: ['trumpet.md'],
    desc: 'Eine B-Trompete. Die Lippen schwingen als Ventil vor der Luftsäule, und bei lauten Tönen steilen sich die Druckwellen im langen Rohr zu Stoßwellen auf, das gibt den schmetternden Klang.' },
  harmonica: { title: 'Mundharmonika', category: 'Blas', docs: ['harmonica.md'],
    desc: 'Eine diatonische Mundharmonika mit zehn Kanälen in Richter-Stimmung. Der Atem strömt durch einen Schlitz und bringt die Messingzunge darin zum Schwingen, die kleine Luftkammer davor färbt den Ton.' },
  marimba: { title: 'Marimba', category: 'Schlagwerk', docs: ['mallets.md'], demoScript: 'mallets.mjs',
    desc: 'Palisanderstäbe, angeschlagen mit weichen Schlägeln. Ein ausgesägter Bogen unter jedem Stab stimmt die Obertöne, ein Resonanzrohr darunter verstärkt den Grundton.' },
  vibraphone: { title: 'Vibraphon', category: 'Schlagwerk', docs: ['mallets.md'], demoScript: 'mallets.mjs',
    desc: 'Aluminiumstäbe über Resonanzrohren, die lange nachklingen, bis der Dämpfer anliegt. Mit laufendem Motor öffnen und schließen Scheiben die Rohre, das gibt dem Grundton sein Vibrato.' },
  glockenspiel: { title: 'Glockenspiel', category: 'Schlagwerk', docs: ['mallets.md'], demoScript: 'mallets.mjs',
    desc: 'Rechteckige Stahlstäbe, mit hartem Schlägel nahe der Mitte angeschlagen. Die Obertöne liegen unharmonisch und klingen sekundenlang nach.' },
  kalimba: { title: 'Kalimba', category: 'Schlagwerk', docs: ['mallets.md'], demoScript: 'mallets.mjs',
    desc: 'Ein Daumenklavier mit einseitig eingespannten Stahlzungen. Der Daumen drückt die Zunge herunter und lässt sie abrutschen, der Holzkasten mit Schallloch färbt den Klang.' },
  bells: { title: 'Röhrenglocken', category: 'Schlagwerk', docs: ['mallets.md'], demoScript: 'mallets.mjs',
    desc: 'Messingrohre, am oberen Ende angeschlagen. Drei Obertöne liegen fast im Verhältnis 2 : 3 : 4, deshalb hört das Ohr einen Schlagton, den es im Rohr gar nicht gibt.' },
  steelpan: { title: 'Steel Pan', category: 'Schlagwerk',
    desc: 'Eine Tenor-Pan aus tiefgezogenem Stahl, gespielt mit gummiumwickelten Stöcken. Jede Note ist eine gewölbte Fläche, die nach dem Anschlag Energie vom Grundton in die Oktave schiebt.' },
  drums: { title: 'Schlagzeug', category: 'Schlagwerk',
    desc: 'Ein akustisches Schlagzeug mit elf Stimmen, von der Bassdrum bis zum Shaker. Felle und Becken werden aus ihren Eigenschwingungen gerechnet, ein Zufallsanteil lässt jeden Schlag etwas anders klingen.' },
  metal: { title: 'Metall', category: 'Schlagwerk',
    desc: 'Metall für Industrial Techno, vom Hammer auf dem Amboss bis zur fallenden Kette. Die Eigenschwingungen folgen aus Geometrie und Material, angeregt werden sie durch Modelle für Schlag und Reibung.' },
  acid: { title: 'Acid Bass', category: 'Elektronisch',
    desc: 'Der quietschende Monobass aus Acid House. Nachgebaut ist die Schaltung: Sägezahn oder Rechteck laufen durch einen resonanten Diodenleiter-Tiefpass, gesteuert von Filterhüllkurve und Akzent.' },
  rave: { title: 'Rave Synth', category: 'Elektronisch', range: [36, 84],
    desc: 'Synthesizerklänge aus Rave und Hardcore, von Akkord-Stabs aus verstimmten Sägezähnen bis zur dunklen Fläche. Oszillatoren und Filter sind Modelle analoger Schaltungen, der Klang ist stereo.' },
  'techno-kick': { title: 'Techno Kick', category: 'Elektronisch',
    desc: 'Eine harte, verzerrte Bassdrum für Techno und Gabber, dazu der Rumble als dunkler, gepumpter Hall unter der Kick. Alles kommt aus Schaltungsmodellen.' },
  'drum-machine': { title: 'Drum Machine', category: 'Elektronisch',
    desc: 'Analoge Drumcomputer-Percussion für Techno, von Hi-Hats bis Clap. Jede Stimme ist ein Modell ihrer Schaltung, die Bassdrum kommt aus der Techno Kick.' },
  reese: { title: 'Reese-Bass', category: 'Elektronisch',
    desc: 'Der schwebende Bass aus Drum\'n\'Bass. Zwei oder drei Sägezähne sind gegeneinander verstimmt, und weil die Verstimmung langsam atmet, wandert die Schwebung, während ein Filter und ein Sinus darunter für Druck sorgen.' },
  sub808: { title: '808-Sub-Bass', category: 'Elektronisch',
    desc: 'Ein langer, gestimmter Sinusbass im Stil der 808-Bassdrum, wie er unter Trap und Partyrap liegt. Die Tonhöhe stürzt beim Anschlag kurz ab, auf Wunsch zerrt der Ton und gleitet von Note zu Note.' },
  'rolling-bass': { title: 'Rolling Bass', category: 'Elektronisch',
    desc: 'Der kurze, druckvolle Bass aus Eurodance und Hardtekk, der zwischen den Kicks auf dem Offbeat sitzt. Sägezahn und Puls laufen durch einen Tiefpass mit schneller Hüllkurve, das gibt jedem Schlag seinen Plopp.' },
  'chord-stab': { title: 'Chord Stab', category: 'Elektronisch',
    desc: 'Ein ganzer Akkord auf einer Taste, kurz und perkussiv wie in House und Rave. Zur Wahl stehen Synth-Stabs aus verstimmten Sägezähnen, eine Orgel mit gestapelten Quinten und ein angeschlagener Klavierklang aus Sinustönen.' },
  supersaw: { title: 'Supersaw', category: 'Elektronisch',
    desc: 'Der breite, euphorische Lead aus Trance und Hardstyle. Viele leicht verstimmte Sägezähne mit freilaufenden Phasen schweben links und rechts ineinander, dazu Filterhüllkurve, Gleiten und auf Wunsch Oktave, Quinte oder harte Verzerrung.' },
  pluck: { title: 'Pluck', category: 'Elektronisch',
    desc: 'Kurze, helle Synthesizer-Töne für Trance, House und Eurodance, vom Sägezahn-Pluck mit zuschnappendem Filter bis zur Glocke und zum Rechteck-Lead früher Spielkonsolen. Jede Note bringt ihr eigenes Stereo-Echo mit.' },
  vox: { title: 'Vox', category: 'Elektronisch',
    desc: 'Eine synthetische Gesangsstimme für Vocal-Hooks, gebaut aus Stimmlippen und Vokaltrakt statt aus Aufnahmen. Sie singt Vokale, auf Wunsch hochgepitcht wie ein schneller abgespielter Gesangsschnipsel oder als Chor.' },
  'hardstyle-kick': { title: 'Hardstyle Kick', category: 'Elektronisch',
    desc: 'Eine gestimmte Bassdrum für Hardstyle und Rave. Nach einem sauberen Punch steht der verzerrte Tail genau auf dem gespielten Ton, so spielt die Kick selbst die Basslinie.' },
  breakbeat: { title: 'Breakbeat', category: 'Schlagwerk',
    desc: 'Ein Kit für Drum\'n\'Bass und Jungle, ganz aus Oszillatoren und Rauschen gebaut. Enge Snare mit Körper, Ghost Notes, Hats und Ride, dazu ein eigenes synkopiertes Two-Step-Pattern.' },
  fx: { title: 'FX', category: 'Elektronisch',
    desc: 'Übergänge für den Drop: Riser, Downlifter, Impact, Snare-Roll, Laser und Sweep. Die Länge folgt dem Tempo in Vierteln, der Klang ist stereo.' },

  'electric-guitar': { title: 'E-Gitarre', category: 'Saiten',
    labels: { clean: 'Clean', crunch: 'Crunch', lead: 'Lead', muted: 'Abgedämpft' },
    desc: 'Eine E-Gitarre mit massivem Korpus und Stahlsaiten. Magnetische Tonabnehmer wandeln die Schwingung in Spannung um, ein Röhrenverstärker mit Lautsprecherbox färbt und verzerrt den Ton von glasklar bis stark übersteuert.' },
  banjo: { title: 'Banjo', category: 'Saiten',
    labels: { finger: 'Fingerpicks', pick: 'Plektrum', muted: 'Gedämpft' },
    desc: 'Ein fünfsaitiges Banjo. Der Steg steht auf einem gespannten Fell wie bei einer Trommel, deshalb springt der Ton hell und knackig an und verklingt schnell.' },
  'string-ensemble': { title: 'Streicherensemble', category: 'Saiten',
    labels: { legato: 'Legato', staccato: 'Staccato', tremolo: 'Tremolo', pizzicato: 'Pizzicato' },
    desc: 'Eine Streichergruppe im Orchester mit Violinen, Bratschen und Celli. Jede Stimme ist eine eigene gestrichene Saite mit leicht anderer Stimmung, eigenem Vibrato und eigenem Einsatz, zusammen klingen sie in einem kleinen Konzertsaal.' },
  saxophone: { title: 'Saxophon', category: 'Blas',
    labels: { alto: 'Altsaxophon', tenor: 'Tenorsaxophon', soft: 'Subtone (weich)', growl: 'Growl' },
    desc: 'Ein Saxophon mit einfachem Rohrblatt auf einem konischen Messingrohr. Weil der Kegel wie ein beidseitig offenes Rohr schwingt, hat es alle Obertöne und überbläst in die Oktave, anders als die zylindrische Klarinette.' },
  oboe: { title: 'Oboe', category: 'Blas',
    labels: { oboe: 'Oboe', 'english-horn': 'Englischhorn' },
    desc: 'Eine Oboe mit Doppelrohrblatt auf einer engen, kegelförmigen Bohrung. Die beiden Blätter öffnen und schließen den Luftweg im Takt der Druckwellen im Kegel, deshalb klingen alle Obertöne mit und das Instrument überbläst in die Oktave.' },
  trombone: { title: 'Posaune', category: 'Blas',
    labels: { open: 'Offen', mute: 'Gerader Dämpfer', bucket: 'Filzdämpfer' },
    desc: 'Eine Tenorposaune in B. Die Lippen schwingen als Ventil vor der Luftsäule, und der Zug verlängert das Rohr stufenlos, deshalb kann die Posaune als einziges Blechblasinstrument echte Glissandi spielen.' },
  tuba: { title: 'Tuba', category: 'Blas',
    labels: { tuba: 'Tuba', euphonium: 'Euphonium' },
    desc: 'Eine B-Tuba oder ein Euphonium mit weiter, konischer Bohrung und vier Ventilen. Die großen Lippen schwingen als Ventil vor der langen Luftsäule, der weite Schalltrichter strahlt einen runden, dunklen Ton ab, der auch im Fortissimo kaum schmettert.' },
  timpani: { title: 'Pauken', category: 'Schlagwerk',
    labels: { normal: 'Normal', soft: 'Weiche Schlägel', hard: 'Harte Schlägel', roll: 'Wirbel' },
    desc: 'Konzertpauken mit Fell über einem Kupferkessel. Die Luft über und im Kessel belastet das Fell und rückt seine Eigenschwingungen fast in eine Obertonreihe, deshalb hat die Pauke einen klaren Ton.' },
  // The gong rings on its own; when the hand damps it is an option, not the note length.
  gong: { title: 'Gong', category: 'Schlagwerk', ring: true, maxSeconds: 30,
    labels: { tamtam: 'Tamtam', chau: 'Buckelgong', small: 'Kleiner Gong' },
    desc: 'Ein großer Tamtam, ein gestimmter Buckelgong und ein kleiner Gong aus gehämmerter Bronze. Nach einem kräftigen Schlag wandert Energie von den tiefen in die hohen Schwingungen, und der Klang blüht zu einem hellen Schimmern auf.' },
  'music-box': { title: 'Spieluhr', category: 'Schlagwerk', maxSeconds: 8,
    desc: 'Ein Kamm aus gestimmten Stahlzungen in einem kleinen Holzkasten. Stifte auf einer sich drehenden Walze reißen die Zungen an, die tiefen Zungen tragen Bleigewichte unter der Spitze.' },
  harpsichord: { title: 'Cembalo', category: 'Tasten',
    labels: { '8ft': '8 Fuß', '4ft': '4 Fuß', lute: 'Lautenzug', '8ft+8ft': '8 Fuß gekoppelt' },
    desc: 'Ein Cembalo mit zwei Chören. Ein Kiel zupft die Messing- oder Eisensaite nahe am Ende an, ein dünner Resonanzboden macht den Klang hell, und beim Loslassen legt sich ein Filzdämpfer auf die Saite.' },
  'tonewheel-organ': { title: 'Drawbar-Orgel', category: 'Tasten',
    labels: { jazz: 'Jazz', gospel: 'Gospel', rock: 'Rock', ballad: 'Ballade', full: 'Volles Register', clean: 'Trocken' },
    desc: 'Eine elektromechanische Orgel mit Zugriegeln. Eine Welle treibt Zahnräder an, deren Zähne vor Magnetspulen Sinustöne erzeugen, und ein Lautsprecher mit rotierendem Horn und rotierender Trommel lässt den Klang schweben.' },
  sitar: { title: 'Sitar', category: 'Welt',
    desc: 'Eine Langhalslaute mit Kürbiskorpus. Die Saite liegt auf einem breiten, flach gewölbten Steg und streift ihn bei jeder Schwingung, das gibt das helle Schnarren, und darunter klingen gestimmte Resonanzsaiten mit.' },
  koto: { title: 'Koto', category: 'Welt',
    labels: { pick: 'Plektrum', silk: 'Seide', finger: 'Finger' },
    desc: 'Eine lange Wölbbrettzither mit 13 Saiten, gezupft mit Plektren an den Fingern. Jede Saite liegt auf einem beweglichen Steg, und wer sie dahinter niederdrückt, macht den Ton höher, auch während er klingt.' },
  handpan: { title: 'Handpan', category: 'Welt',
    labels: { soft: 'Weich', bright: 'Hell', ding: 'Ding (Mittelnote)' },
    desc: 'Zwei verklebte Stahlschalen, in die oben gestimmte Notenfelder um eine große Mittelnote, das Ding, eingehämmert sind. Mit Fingern angeschlagen klingen in jedem Feld Grundton, Oktave und Duodezime zusammen, und die Luft im Inneren schwingt durch das Loch in der Unterseite mit.' },
  didgeridoo: { title: 'Didgeridoo', category: 'Welt',
    labels: { drone: 'Bordun', wow: 'Wow', pulse: 'Atempuls', toot: 'Toot (überblasen)' },
    desc: 'Ein bis zu zwei Meter langes Holzrohr, meist ein von Termiten ausgehöhlter Eukalyptusstamm. Die Lippen summen im Mundstück einen tiefen Dauerton, den der Spieler mit Zunge, Wangen und Stimme formt und durch Zirkularatmung ohne Pause weiterklingen lässt.' },
  tabla: { title: 'Tabla', category: 'Welt',
    labels: { na: 'Na (Rand)', tin: 'Tin (freies Fell)', tun: 'Tun (Mitte, offen)', te: 'Te (Mitte, gedämpft)', ge: 'Ge (Bass offen)',
      'ge-glide': 'Ge mit Gleiten', ka: 'Ka (Bass flach)', dha: 'Dha (Na und Ge)', dhin: 'Dhin (Tin und Ge)' },
    desc: 'Ein Trommelpaar aus Nordindien, gespielt mit Fingern und Handballen. Die schwarze Pastenauflage auf dem rechten Fell stimmt seine Obertöne fast harmonisch, auf der großen linken Trommel lässt der Handballen den Bass gleiten.' },
  cajon: { title: 'Cajon', category: 'Welt',
    labels: { bass: 'Bass', tone: 'Ton', slap: 'Slap', tip: 'Fingerspitze', ghost: 'Ghost' },
    desc: 'Eine Kistentrommel aus Holz, auf der man sitzt und mit den Händen spielt. Die vordere Sperrholzplatte schwingt mit der Luft im Kasten und dem Schallloch in der Rückwand, innen liegende Snare-Drähte rasseln gegen die Platte.' },
  'fm-synth': { title: 'FM-Synthesizer', category: 'Elektronisch',
    labels: { epiano: 'E-Piano', bell: 'Glocke', bass: 'Bass', brass: 'Bläser', marimba: 'Marimba' },
    desc: 'Ein Synthesizer, der Sinustöne gegenseitig in der Phase moduliert. Aus vier Operatoren entstehen so glockige, metallische und perkussive Klänge wie das helle E-Piano der Achtziger.' },
  theremin: { title: 'Theremin', category: 'Elektronisch',
    labels: { classic: 'Klassisch', scifi: 'Science-Fiction', soft: 'Sanft' },
    desc: 'Ein elektronisches Instrument, das ohne Berührung gespielt wird. Eine Hand an der Antenne steuert stufenlos die Tonhöhe, die andere die Lautstärke, und der Ton entsteht aus der Schwebung zweier Hochfrequenzoszillatoren.' },
  chiptune: { title: 'Chiptune (8-Bit)', category: 'Elektronisch',
    labels: { lead: 'Lead', arp: 'Arpeggio', bass: 'Bass', pulse12: 'Puls 12,5 %', pulse25: 'Puls 25 %', pulse50: 'Rechteck 50 %',
      triangle: 'Dreieck', wave: 'Wellenspeicher', noise: 'Rauschen', 'noise-short': 'Rauschen metallisch',
      kick: 'Kick', snare: 'Snare', hat: 'Hi-Hat', laser: 'Laser', coin: 'Münze' },
    desc: 'Die Soundchips der 8-Bit-Spielkonsolen und Heimcomputer der Achtziger. Pulskanäle mit wenigen Tastverhältnissen, ein Dreieck in groben 4-Bit-Stufen und ein Rauschgenerator aus einem Schieberegister, gesteuert von einem Treiber, der 60-mal pro Sekunde Tonhöhe und Lautstärke neu setzt.' },
  'square-chip': { title: 'Rechteck-Chip', category: 'Elektronisch',
    labels: { square: 'Rechteck', 'echo-lead': 'Lead mit Echo', arp: 'Arpeggio-Akkord', 'buzz-saw': 'Buzzer-Bass Säge',
      'buzz-tri': 'Buzzer-Bass Dreieck', 'env-pluck': 'Hüllkurven-Zupfer', 'noise-hat': 'Hi-Hat (Rauschen)',
      'noise-snare': 'Snare (Rauschen)', kick: 'Kick' },
    desc: 'Der Soundchip vieler Heimcomputer der Achtziger mit drei Rechteckkanälen, einem Rauschgenerator und einer Hüllkurve in Hardware. Läuft die Hüllkurve schnell genug, wird sie selbst zur Wellenform und brummt als typischer Buzzer-Bass.' },
  beeper: { title: 'Beeper', category: 'Elektronisch',
    labels: { square: 'Rechteck', pwm: 'Pulsbreite (dünn nach fett)', chord: 'Akkord (Multiplex)', 'pin-pulse': 'Pulsstimmen',
      'drum-kick': 'Kick', 'drum-noise': 'Rauschen', piezo: 'Piezo-Summer' },
    desc: 'Der eingebaute Lautsprecher früher PCs und Heimcomputer, der nur an und aus kannte. Töne, Akkorde und Schlagzeug entstehen allein daraus, wann die CPU das eine Bit umschaltet, dazu kommt der Piezo-Summer der LCD-Handspiele.' },
  'delta-drums': { title: 'Delta-Drums', category: 'Elektronisch',
    labels: { kick: 'Bassdrum', snare: 'Snare', 'tom-high': 'Tom hoch', 'tom-low': 'Tom tief', clap: 'Clap', cowbell: 'Kuhglocke',
      crash: 'Becken', shout: 'Ruf „Hey“', slap: 'Slap-Bass' },
    desc: 'Der 1-Bit-Sample-Kanal einer Spielkonsole der Achtziger, über den Spiele Schlagzeug, Slap-Bass und kurze Rufe abspielten. Ein 7-Bit-Zähler kann pro Bit nur um zwei Stufen steigen oder fallen, deshalb klingen die Schläge bei niedriger Rate körnig und gebremst.' },
  sampler8: { title: '8-Bit-Sampler', category: 'Elektronisch',
    labels: { bass: 'Synth-Bass', strings: 'Streicher', choir: 'Chor', piano: 'Klavier', lead: 'Lead mit Vibrato', chip: 'Chip (32 Byte)',
      'orchestra-hit': 'Orchesterschlag', 'drum-kick': 'Bassdrum', 'drum-snare': 'Snare' },
    desc: 'Der vierstimmige Sample-Chip eines Heimcomputers der späten Achtziger, auf dem die Tracker-Musik entstand. Er spielt 8-Bit-Samples mit ganzzahligen Perioden ab und hält jeden Wert bis zum nächsten. Das gibt den rauen, glasigen Klang, den ein fester Tiefpass und der zuschaltbare LED-Filter weicher machen.' },
  'speech-chip': { title: 'Sprachchip', category: 'Elektronisch',
    labels: { aah: 'Aah', ooh: 'Uuh', eee: 'Iih', robot: 'Roboter', choir: 'Chor', vocoder: 'Vocoder-artig',
      ba: 'Silbe ba', da: 'Silbe da', ka: 'Silbe ka', sa: 'Silbe sa' },
    desc: 'Die Roboterstimme der Sprachchips aus Spielzeug, Spielautomaten und Heimcomputern der frühen Achtziger. Ein Kreuzgliedfilter zehnter Ordnung formt aus Chirp-Pulsen oder Rauschen bei 8 kHz die Vokale, alle 25 ms kommt ein grob gerundeter Rahmen aus Energie, Tonhöhe und Koeffizienten.' },
  'arcade-sfx': { title: 'Arcade-Effekte', category: 'Elektronisch',
    labels: { laser: 'Laser', explosion: 'Explosion', siren: 'Sirene', ufo: 'Ufo', march: 'Marsch', coin: 'Münze', powerup: 'Power-up',
      hit: 'Treffer', alarm: 'Alarm', engine: 'Motor', fanfare: 'Fanfare', lose: 'Verloren' },
    desc: 'Soundeffekte der Spielautomaten aus den späten Siebzigern, gebaut aus einzelnen Schaltungen statt aus einem Soundchip. Kippstufen, von Kondensatorkurven gefahrene Oszillatoren, Rauschen aus Schieberegister oder Transistor und RC-Filter machen Schüsse, Explosionen, Sirenen und kurze Melodien.' },
  'toy-keyboard': { title: 'Spielzeug-Keyboard', category: 'Elektronisch',
    labels: { piano: 'Klavier', organ: 'Orgel', flute: 'Flöte', violin: 'Geige', trumpet: 'Trompete', 'synth-drum': 'Synth-Drum',
      bells: 'Glocken', fantasy: 'Fantasy' },
    desc: 'Eine billige Kindertastatur der Achtziger. Ein einziger Takt wird durch zwölf ganzzahlige Teiler auf die Töne gebracht, einfache RC-Filter machen aus den Rechtecken Klavier, Flöte oder Trompete, und ein Kondensator formt jeden Ton.' },
  'wavetable-chip': { title: 'Wellenkanal', category: 'Elektronisch',
    labels: { 'soft-bass': 'Weicher Bass', organ: 'Orgel', saw: 'Sägezahn', 'square-ish': 'Fast Rechteck', vocal: 'Vokal', bell: 'Glocke',
      'bit-harp': 'Bit-Harfe', 'pwm-sweep': 'Pulsdurchlauf' },
    desc: 'Der 4-Bit-Wellenkanal tragbarer Spielkonsolen. Eine Welle aus 32 Werten läuft in einer Schleife, die Lautstärke kennt nur vier Stufen, und der Spieltreiber tauscht die Welle Bild für Bild aus, damit sich der Klang bewegt.' },
  'homecomputer-synth': { title: 'Heimcomputer-Synth', category: 'Elektronisch',
    labels: { bass: 'Bass', lead: 'Puls-Lead', 'sync-lead': 'Sync-Lead', 'ring-bell': 'Ringmod-Glocke', arp: 'Arpeggio', pad: 'Fläche',
      combo: 'Kombi-Welle', 'drum-kick': 'Bassdrum', 'drum-snare': 'Snare' },
    desc: 'Der dreistimmige Klangchip der Heimcomputer aus den Achtzigern. Digitale Oszillatoren mit Sägezahn, Dreieck, Puls und Rauschen laufen durch ein analoges, resonantes Filter, und die Abspielroutine schreibt 50 Mal pro Sekunde Tonhöhe, Pulsbreite und Filter neu.' },
  'fm-chip': { title: 'FM-Soundkarte', category: 'Elektronisch',
    labels: { piano: 'Klavier', organ: 'Orgel', brass: 'Bläser', bass: 'Bass', strings: 'Streicher', bell: 'Glocke', guitar: 'Gitarre',
      'drum-kick': 'Bassdrum', 'drum-snare': 'Snare', 'drum-hat': 'Hi-Hat' },
    desc: 'Der FM-Chip der Soundkarten früher PCs, der die Musik vieler Spiele der frühen Neunziger spielte. Jede Stimme hat nur zwei Sinus-Operatoren mit groben Tabellen und vier Wellenformen. Das gibt den rauen, leicht blechernen Klang.' },
};

export const CATEGORY_ORDER = ['Tasten', 'Saiten', 'Blas', 'Schlagwerk', 'Welt', 'Elektronisch', 'Sonstiges'];

export const PAD_LABELS = {
  kick: 'Kick', snare: 'Snare', rim: 'Rimshot', hihatClosed: 'Hi-Hat zu', hihatOpen: 'Hi-Hat offen',
  ride: 'Ride', crash: 'Crash', tomLow: 'Tom tief', tomMid: 'Tom mittel', tomHigh: 'Tom hoch', shaker: 'Shaker',
  hatClosed: 'Hi-Hat zu', hatOpen: 'Hi-Hat offen', clap: 'Clap', perc: 'Perc',
  anvil: 'Amboss', pipe: 'Rohr', sheet: 'Blech', barrel: 'Fass', chain: 'Kette', scrape: 'Kratzen',
  hard: 'Hart', industrial: 'Industrial', gabber: 'Gabber', rumble: 'Rumble',
  stab: 'Stab', whoop: 'Whoop', screech: 'Screech', pad: 'Fläche',
  clean: 'Clean', dark: 'Dunkel', growl: 'Growl', distorted: 'Verzerrt', slide: 'Slide',
  offbeat: 'Offbeat', rolling: 'Rollend', howl: 'Heuler',
  minor7: 'Moll 7', major: 'Dur', sus: 'Sus', organ: 'Orgel', piano: 'Klavier',
  lead: 'Lead', anthem: 'Hymne', hardlead: 'Hardstyle', pluck: 'Pluck', bell: 'Glocke', mallet: 'Mallet', chip: 'Chip',
  pitched: 'Hochgepitcht', choir: 'Chor', ghost: 'Ghost', hat: 'Hi-Hat',
  euphoric: 'Euphoric', raw: 'Raw', 'reverse-bass': 'Reverse Bass',
  riser: 'Riser', downlifter: 'Downlifter', impact: 'Impact', snareRoll: 'Snare-Roll', laser: 'Laser', sweep: 'Sweep',
};

// Extra render options shown as selects. `value` is what the instrument receives.
const ORGAN_COMBOS = [
  ['principal8', 'Prinzipal 8\''],
  ['gedackt8', 'Gedackt 8\''],
  ['principal8+octave4', 'Prinzipal 8\' + Oktave 4\''],
  ['gedackt8+octave4', 'Gedackt 8\' + Oktave 4\''],
  ['principal8+octave4+superoctave2+mixture', 'Plenum mit Mixtur'],
  ['trumpet8', 'Trompete 8\''],
  ['subbass16+principal8+octave4+superoctave2+mixture+trumpet8+trombone16', 'Volles Werk'],
];

const STOP_LABELS = {
  principal8: 'Prinzipal 8\'', gedackt8: 'Gedackt 8\'', octave4: 'Oktave 4\'', superoctave2: 'Superoktave 2\'',
  mixture: 'Mixtur', trumpet8: 'Trompete 8\'', subbass16: 'Subbass 16\'', trombone16: 'Posaune 16\'',
};

// Choices for numeric parameters. `undefined` lets the instrument take the value from its preset.
const choices = (key, label, list) => ({ key, label, values: list.map(([value, l]) => ({ id: value === undefined ? 'preset' : String(value), label: l, value })) });
const FROM_PRESET = 'Preset-Standard';
// `presets` limits an option (or one of its values) to the presets it changes.
const forPresets = (presets, o) => ({ ...o, presets });
const SQUARE_ONE_SHOT = ['decay', 'attack', 'decay-high', 'attack-hold'];

export const OPTIONS = {
  organ: (meta) => {
    const known = new Set(meta.stops || []);
    const values = ORGAN_COMBOS
      .filter(([id]) => id.split('+').every((s) => known.has(s)))
      .map(([id, label]) => ({ id, label, value: id.split('+') }));
    for (const s of meta.stops || []) {
      if (!values.some((v) => v.id === s)) values.push({ id: s, label: STOP_LABELS[s] || s, value: [s] });
    }
    return values.length ? [{ key: 'stops', label: 'Register', values }] : [];
  },
  guitar: () => [{ key: 'type', label: 'Saiten', values: [
    { id: 'nylon', label: 'Nylon', value: 'nylon' }, { id: 'steel', label: 'Stahl', value: 'steel' }] }],
  bass: () => [{ key: 'style', label: 'Bauart', values: [
    { id: 'electric', label: 'E-Bass', value: 'electric' }, { id: 'upright', label: 'Kontrabass', value: 'upright' }] }],
  vibraphone: () => [{ key: 'motor', label: 'Motor', values: [
    { id: '0', label: 'Aus', value: 0 }, { id: '4', label: 'Langsam (4 Hz)', value: 4 }, { id: '6', label: 'Schnell (6 Hz)', value: 6 }] }],
  trumpet: () => [{ key: 'mute', label: 'Dämpfer', values: [
    { id: 'none', label: 'Ohne', value: null }, { id: 'cup', label: 'Cup', value: 'cup' }] }],
  accordion: () => [
    { key: 'voice', label: 'Register', values: [
      { id: 'musette', label: 'Musette', value: 'musette' }, { id: 'bass', label: 'Bass', value: 'bass' },
      { id: 'chord', label: 'Akkordknopf', value: 'chord' }] },
    { key: 'chord', label: 'Akkord', values: [
      { id: 'maj', label: 'Dur', value: 'maj' }, { id: 'min', label: 'Moll', value: 'min' },
      { id: '7', label: 'Septakkord', value: '7' }, { id: 'dim', label: 'Vermindert', value: 'dim' }] },
  ],
  flute: () => [{ key: 'vibrato', label: 'Vibrato', values: [
    { id: 'on', label: 'An', value: true }, { id: 'off', label: 'Aus', value: false }] }],
  clarinet: () => [{ key: 'vibrato', label: 'Vibrato', values: [
    { id: 'off', label: 'Aus', value: 0 }, { id: 'on', label: 'An', value: 0.4 }] }],
  vox: () => [{ key: 'vowel', label: 'Vokal', values: [
    ...['a', 'e', 'i', 'o', 'u'].map((v) => ({ id: v, label: v, value: v })), { id: 'ah-oh', label: 'a nach o', value: 'ah-oh' }] }],
  acid: () => [{ key: 'waveform', label: 'Wellenform', values: [
    { id: 'saw', label: 'Sägezahn', value: 'saw' }, { id: 'square', label: 'Rechteck', value: 'square' }] }],
  'electric-guitar': () => [
    choices('pickup', 'Tonabnehmer', [[undefined, FROM_PRESET], ['bridge', 'Steg'], ['middle', 'Mitte'], ['neck', 'Hals'], ['both', 'Steg und Hals']]),
    choices('drive', 'Gain', [[undefined, FROM_PRESET], [0.2, 'Wenig'], [0.5, 'Mittel'], [0.9, 'Viel']]),
  ],
  sitar: () => [
    choices('scale', 'Resonanzsaiten', [['major', 'Dur'], ['minor', 'Moll'], ['pentatonic', 'Pentatonik']]),
    choices('meend', 'Meend (Ziehen)', [[0, 'Ohne'], [1, '1 Halbton hoch'], [2, '2 Halbtöne hoch'], [-1, '1 Halbton tief']]),
  ],
  banjo: () => [],
  koto: () => [choices('oshide', 'Drücken (Halbtöne)', [[0, 'Ohne'], [1, '1 Halbton'], [2, '2 Halbtöne']])],
  saxophone: () => [choices('articulation', 'Artikulation', [['tongue', 'Gestoßen'], ['legato', 'Gebunden']])],
  oboe: () => [choices('articulation', 'Artikulation', [['tongue', 'Gestoßen'], ['legato', 'Gebunden']])],
  trombone: () => [],
  tuba: () => [],
  'string-ensemble': () => [choices('hall', 'Saal', [[0.35, 'Saal'], [0, 'Trocken'], [0.7, 'Großer Anteil']])],
  timpani: () => [],
  gong: () => [choices('duration', 'Abdämpfen', [[8, 'Nach 8 s'], [30, 'Ausklingen lassen'], [3, 'Nach 3 s'], [1, 'Nach 1 s']])],
  harpsichord: () => [],
  handpan: () => [choices('strike', 'Anschlag', [['center', 'Mitte'], ['edge', 'Rand'], ['muted', 'Gedämpft']])],
  didgeridoo: () => [
    choices('vowel', 'Vokal', [[undefined, FROM_PRESET], [0, 'U (dunkel)'], [0.5, 'O'], [1, 'I (hell)']]),
    choices('pulse', 'Puls', [[undefined, FROM_PRESET], [0, 'Aus'], [3, '3 Hz'], [6, '6 Hz']]),
    choices('breathe', 'Zirkularatmung', [[undefined, FROM_PRESET], [0, 'Aus'], [2.8, 'Alle 2,8 s'], [6, 'Alle 6 s']]),
  ],
  // midi tunes the right drum (dayan) and glide only bends the ge-glide stroke; `pads` limits each
  // option to the strokes it changes, so the others are neither re-rendered nor cached per value.
  tabla: () => [
    { ...choices('midi', 'Stimmung', [[62, 'D (Standard)'], [57, 'A tief'], [60, 'C'], [64, 'E'], [67, 'G'], [69, 'A hoch']]),
      pads: ['na', 'tin', 'tun', 'te', 'dha', 'dhin'] },
    { ...choices('glide', 'Gleiten (Bass)', [[4, 'Steigt 4 Halbtöne (Standard)'], [7, 'Steigt 7 Halbtöne'], [0, 'Ohne'], [-4, 'Fällt 4 Halbtöne'], [-7, 'Fällt 7 Halbtöne']]),
      pads: ['ge-glide'] },
  ],
  cajon: () => [
    choices('snare', 'Snare-Drähte', [[0.6, 'Normal'], [0, 'Aus'], [0.3, 'Leicht'], [1, 'Locker']]),
    choices('damping', 'Dämpfung', [[0, 'Offen'], [0.5, 'Halb gedämpft'], [1, 'Gedämpft']]),
    choices('size', 'Größe', [['standard', 'Standard'], ['small', 'Klein'], ['large', 'Groß']]),
  ],
  'tonewheel-organ': () => [
    choices('registration', 'Zugriegel', [[undefined, FROM_PRESET], ['888000000', 'Grundregister 16\' 5⅓\' 8\''], ['008400000', 'Sanft 8\' 4\''], ['888888888', 'Alle Zugriegel']]),
    choices('rotor', 'Rotor', [[undefined, FROM_PRESET], ['off', 'Aus'], ['slow', 'Langsam'], ['fast', 'Schnell'], ['slow-fast', 'Langsam nach schnell'], ['fast-slow', 'Schnell nach langsam']]),
    choices('percussion', 'Perkussion', [[undefined, FROM_PRESET], ['off', 'Aus'], ['2nd', 'Zweite Harmonische'], ['3rd', 'Dritte Harmonische']]),
  ],
  'fm-synth': () => [
    choices('algorithm', 'Algorithmus', [[undefined, FROM_PRESET], ['stack', 'Kette'], ['two-stacks', 'Zwei Ketten'], ['branch', 'Verzweigt'],
      ['stack-plus', 'Kette plus Einzelton'], ['shared-mod', 'Gemeinsamer Modulator'], ['additive', 'Additiv']]),
    choices('brightness', 'Helligkeit', [[0.5, 'Normal'], [0.2, 'Weich'], [0.8, 'Hell']]),
  ],
  theremin: () => [
    choices('vibrato', 'Vibrato', [[undefined, FROM_PRESET], [0, 'Aus'], [0.2, 'Leicht'], [0.6, 'Stark']]),
    choices('swell', 'Anschwellen', [[undefined, FROM_PRESET], [0.03, 'Sofort'], [0.8, 'Langsam']]),
  ],
  chiptune: () => [
    choices('vibrato', 'Vibrato', [[undefined, FROM_PRESET], [0, 'Aus'], [0.4, 'Leicht'], [1, 'Stark']]),
    choices('arp', 'Akkord (Arpeggio)', [['major', 'Dur'], ['minor', 'Moll'], ['power', 'Quinte und Oktave']]),
    choices('crush', 'DAC', [['off', 'Normal'], [8, '8 Bit'], [4, '4 Bit']]),
  ],
  'square-chip': () => {
    const shapes = choices('envelopeShape', 'Hüllkurve', [[undefined, FROM_PRESET], ['decay', 'Abklingen'], ['attack', 'Anschwellen'],
      ['decay-high', 'Abklingen, dann voll'], ['attack-hold', 'Anschwellen und halten'], ['saw-down', 'Säge fallend'],
      ['saw-up', 'Säge steigend'], ['tri-down', 'Dreieck fallend'], ['tri-up', 'Dreieck steigend']]);
    // The buzzer presets need a repeating shape, the one-shot shapes only work on env-pluck.
    shapes.values = shapes.values.map((v) => (SQUARE_ONE_SHOT.includes(v.value) ? { ...v, presets: ['env-pluck'] } : v));
    return [
      forPresets(['arp'], choices('arp', 'Akkord (Arpeggio)', [['major', 'Dur'], ['minor', 'Moll'], ['sus4', 'Sus4'],
        ['power', 'Quinte mit Oktave'], ['octave', 'Oktave'], ['maj7', 'Major 7']])),
      forPresets(['buzz-saw', 'buzz-tri', 'env-pluck'], shapes),
      forPresets(['square', 'echo-lead', 'arp', 'buzz-saw', 'buzz-tri', 'env-pluck'],
        choices('vibrato', 'Vibrato', [[undefined, FROM_PRESET], [0, 'Ohne'], [0.4, 'Leicht'], [1, 'Stark']])),
    ];
  },
  beeper: () => [
    forPresets(['chord', 'pin-pulse'], choices('chord', 'Akkord', [['major', 'Dur'], ['minor', 'Moll'], ['sus4', 'Sus4'],
      ['dim', 'Vermindert'], ['power', 'Quinte'], ['octave', 'Oktave']])),
    forPresets(['pwm'], choices('duty', 'Pulsbreite', [[undefined, 'Durchlauf'], [0.05, 'Sehr dünn'], [0.15, 'Dünn'], [0.3, 'Mittel'], [0.5, 'Rechteck']])),
  ],
  'delta-drums': () => [
    choices('rate', 'Rate', [[15, 'Sauber (33 kHz)'], [12, 'Hell (22 kHz)'], [7, 'Mittel (11 kHz)'], [3, 'Körnig (6,3 kHz)'], [0, 'Grob (4,2 kHz)']]),
    choices('tune', 'Stimmung', [[0, 'Original'], [-12, 'Oktave tiefer'], [-5, 'Quarte tiefer'], [5, 'Quarte höher'], [12, 'Oktave höher']]),
  ],
  sampler8: () => [
    choices('filter', 'Filter', [['off', 'Aus'], ['led', 'LED-Filter']]),
    choices('bits', 'Auflösung', [[8, '8 Bit'], [6, '6 Bit']]),
  ],
  'speech-chip': () => [
    choices('vowel', 'Vokal', [[undefined, FROM_PRESET], ['a', 'A'], ['e', 'E'], ['i', 'I'], ['o', 'O'], ['u', 'U']]),
    choices('rough', 'Rauheit', [[undefined, FROM_PRESET], [0, 'Fein'], [0.5, 'Mittel'], [1, 'Grob']]),
    choices('bend', 'Gleiten', [[0, 'Aus'], [2, 'Ganzton hoch'], [12, 'Oktave hoch'], [-12, 'Oktave tief']]),
  ],
  'arcade-sfx': () => [
    { ...choices('tempo', 'Tempo', [[undefined, 'Standard'], [60, 'Langsam'], [200, 'Schnell'], [480, 'Sehr schnell']]),
      pads: ['siren', 'ufo', 'march', 'alarm'] },
    { ...choices('rpm', 'Drehzahl', [[undefined, '1800 U/min'], [900, 'Leerlauf'], [4500, 'Hoch'], [8000, 'Vollgas']]), pads: ['engine'] },
    choices('length', 'Länge', [[undefined, 'Standard'], [1, '1 s'], [4, '4 s']]),
  ],
  'toy-keyboard': () => [
    choices('vibrato', 'Vibrato', [[undefined, 'Wie Klangfarbe'], ['on', 'An'], ['off', 'Aus']]),
    choices('sustain', 'Sustain', [['off', 'Aus'], ['on', 'An']]),
  ],
  'wavetable-chip': () => [
    choices('volumeShift', 'Auflösung', [[0, '100 %'], [1, '50 %'], [2, '25 %']]),
    forPresets(['vocal', 'bell', 'bit-harp', 'pwm-sweep'], choices('morph', 'Animation', [[0.5, 'Normal'], [0.1, 'Langsam'], [0.9, 'Schnell']])),
  ],
  'homecomputer-synth': () => [
    choices('filter', 'Filter', [[undefined, FROM_PRESET], [0.1, 'Dunkel'], [0.4, 'Mittel'], [0.9, 'Offen']]),
    choices('resonance', 'Resonanz', [[undefined, FROM_PRESET], [0, 'Keine'], [0.5, 'Mittel'], [1, 'Stark']]),
    forPresets(['bass', 'lead', 'arp', 'pad', 'combo'], choices('pw', 'Pulsbreite', [[undefined, FROM_PRESET], [0.1, 'Schmal'], [0.5, 'Quadrat']])),
    forPresets(['arp'], choices('chord', 'Arpeggio-Akkord', [['major', 'Dur'], ['minor', 'Moll'], ['sus4', 'Sus4'], ['power', 'Quinte und Oktave']])),
  ],
  'fm-chip': () => [
    forPresets(['piano', 'organ', 'brass', 'bass', 'strings', 'bell', 'guitar', 'drum-kick'],
      choices('brightness', 'Helligkeit', [[0.5, 'Normal'], [0.2, 'Weich'], [0.85, 'Hell']])),
    choices('waveform', 'Trägerwelle', [[undefined, FROM_PRESET], ['sine', 'Sinus'], ['half', 'Halbsinus'], ['abs', 'Betragssinus'], ['quarter', 'Viertelsinus']]),
  ],
  'music-box': () => [
    choices('ring', 'Ausklingen bis Dämpfer', [[undefined, 'Frei ausklingen'], [2, 'Nach 2 s'], [1, 'Nach 1 s'], [0.4, 'Nach 0,4 s']]),
    choices('damper', 'Dämpfergeräusch', [[0.15, 'Normal'], [0, 'Aus'], [0.4, 'Deutlich']]),
  ],
};
