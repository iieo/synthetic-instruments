# Synthetic Instruments

Musikinstrumente, von Grund auf aus Physik und Signalverarbeitung synthetisiert. Keine Samples, keine Abhängigkeiten, nur Node.js 22.

- `instruments/`: ein Modul pro Instrument mit `meta` und `render(...)`
- `docs/`: Beschreibung jedes Instruments
- `demos/`: Skripte, die Hörbeispiele nach `out/` schreiben

## UI

```sh
npm start          # oder: node ui/server.mjs
```

Dann http://localhost:5173 öffnen. Der Port lässt sich mit `PORT=8080 npm start` ändern.

- **Instrumente**: Übersicht mit Beschreibung, Hörbeispiel und Dokumentation
- **Keyboard**: jedes Instrument mit Maus, Touch oder Computertastatur spielen
- **Sequencer**: Step-Sequencer mit mehreren Spuren, Export als WAV

Die Töne rechnet der Server in Worker-Threads, jedes Mal frisch aus dem Modell.

## Hörbeispiele

Der Ordner `out/` ist nicht im Repo. Nach dem Klonen fehlen die Hörbeispiele also zunächst. Alle auf einmal erzeugt `npm run demos`, einzelne `npm run demos -- piano harp`. In der UI geht es auch pro Instrument über den Knopf „Demo rendern“. Jedes Skript in `demos/` schreibt in `out/` im Repo, egal aus welchem Verzeichnis es gestartet wird, und legt den Ordner bei Bedarf an.

## Lizenz

MIT, siehe [LICENSE](LICENSE). Der Code ist selbst geschrieben, das Repo enthält keine Samples, Impulsantworten oder Soundfonts.
