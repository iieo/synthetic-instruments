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
};

export const CATEGORY_ORDER = ['Tasten', 'Saiten', 'Blas', 'Schlagwerk', 'Elektronisch', 'Sonstiges'];

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
};
