#!/usr/bin/env node

/* global process, __dirname, Buffer */

var fs = require('fs');
var path = require('path');
var { parseMidi, writeMidi } = require('midi-file');

if (process.argv.length < 5) {
  console.error(
    `Usage: node slowdown <time change factor> <path to input> <path to output>
A time change factor of 2 makes things twice as slow, whereas 0.5 makes it twice as fast.`
  );
  process.exit(1);
}

const timeChangeFactor = +process.argv[2];
const inputPath = process.argv[3];
const outputPath = process.argv[4];

var inputMidi = fs.readFileSync(path.join(__dirname, '..', inputPath));
var parsed = parseMidi(inputMidi);

// Note: Not sure every DAW respects ticksPerBeat.
//parsed.header.ticksPerBeat = parsed.header.ticksPerBeat / timeChangeFactor;
parsed.tracks.forEach(events => events.forEach(updateEvent));

console.log(JSON.stringify(parsed, null, 2));

var outputMidi = writeMidi(parsed);
var outputBuffer = Buffer.from(outputMidi);
fs.writeFileSync(path.join(__dirname, '..', outputPath), outputBuffer);


function updateEvent(midiEvent) {
  if (isNaN(midiEvent.deltaTime)) {
    return;
  }
  midiEvent.deltaTime = midiEvent.deltaTime * timeChangeFactor;
}

