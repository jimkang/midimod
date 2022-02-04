#!/usr/bin/env node

/* global process, __dirname, Buffer */

var fs = require('fs');
var path = require('path');
var { writeMidi } = require('midi-file');

if (process.argv.length < 4) {
  console.error(
    'Usage: node faux-sinusoid <length in bars> <output file>'
  );
  process.exit(1);
}

const lengthInBars = +process.argv[2];
const outputPath = process.argv[3];

var header = {
  'format': 1,
  'numTracks': 2,
  'ticksPerBeat': 960
};

var infoTrack = [
  {
    'deltaTime': 0,
    'meta': true,
    'type': 'timeSignature',
    'numerator': 4,
    'denominator': 4,
    'metronome': 1,
    'thirtyseconds': 96
  },
  {
    'deltaTime': 0,
    'meta': true,
    'type': 'setTempo',
    'microsecondsPerBeat': 1500000
  },
  {
    'deltaTime': 0,
    'meta': true,
    'type': 'endOfTrack'
  }
];

const range = 96;
const floor = 24;
const noteTotal = lengthInBars * 4;

var normalizedPitches = [1.0];

for (let i = 1; i < noteTotal; ++i) {
  const x = i/noteTotal;
  const y = 1/(100 * x) *
    Math.cos(2 * Math.PI *
      40 * (x - 0.2)) +
      0.5 - 0.5 * x * x;
  normalizedPitches.push(Math.min(1.0, Math.max(y, 0)));
}

console.log(normalizedPitches);

var mainTrack = normalizedPitches.map(eventFromScaledPitch).flat();

var midiObject = {
  header,
  tracks: [ infoTrack, mainTrack ]
};

//console.log(JSON.stringify(midiObject, null, 2));

var outputMidi = writeMidi(midiObject);
var outputBuffer = Buffer.from(outputMidi);
fs.writeFileSync(path.join(__dirname, '..', outputPath), outputBuffer);


function eventFromScaledPitch(normalizedPitch) {
  const pitch = Math.round(range * normalizedPitch + floor);
  return [
    {
      'deltaTime': 64,
      'channel': 0,
      'type': 'noteOn',
      'noteNumber': pitch,
      'velocity': 64
    },
    {
      'deltaTime': 32,
      'channel': 0,
      'type': 'noteOff',
      'noteNumber': pitch,
      'velocity': 0
    }
  ];
}

