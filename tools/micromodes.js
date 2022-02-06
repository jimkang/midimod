#!/usr/bin/env node

/* global process, __dirname, Buffer */

var fs = require('fs');
var path = require('path');
var { writeMidi } = require('midi-file');
var seedrandom = require('seedrandom');
var randomId = require('@jimkang/randomid')();
var Probable = require('probable').createProbable;
var { range } = require('d3-array');

if (process.argv.length < 5) {
  console.error(
    'Usage: node micromodes <length in bars> <output file> <rhythm or lead> [seed]'
  );
  process.exit(1);
}

const lengthInBars = +process.argv[2];
const outputPath = process.argv[3];
const role = process.argv[4];
const seed = process.argv.length > 5 ? process.argv[5] : randomId(5);

console.log('Seed:', seed);
var random = seedrandom(seed);
var probable = Probable({ random });

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

const floor = 24;

var modes = [
  // Ionian
  [0, 2, 4, 5, 7, 9, 11, 12],
  // Dorian
  [0, 2, 3, 5, 7, 9, 10, 12],
  // Phrygian
  [0, 1, 3, 5, 6, 8, 10, 12],
  // Lydian
  [0, 2, 4, 6, 7, 9, 11, 12],
  // Mixolydian
  [0, 2, 4, 5, 7, 9, 10, 12],
  // Aeolian
  [0, 2, 3, 5, 7, 8, 10, 12],
  // Locrian
  [0, 1, 3, 5, 6, 8, 10, 12]
];

var leadBeatPatterns = [
  runUp,
  runDown,
  arpeggioUp,
  arpeggioDown,
  randomNotes
];

var progressionMode = probable.pick(modes);
console.log('progressionMode', progressionMode);

var measureRoots = range(lengthInBars/8).map(() => probable.shuffle(progressionMode)).flat();
console.log('measureRoots', measureRoots);
const progressionOctave = probable.roll(3);

var rhythmTrack = measureRoots.map(eventsForRhythmBar).flat();
var leadTrack = measureRoots.map(eventsForLeadBar).flat();

var midiObject = {
  header,
  // I can't figure out how to get DAWs to accept three tracks in a file.
  // Also can't seem to make things in channel 1 work.
  tracks: [ infoTrack, role === 'rhythm' ? rhythmTrack : leadTrack ]
};

console.log(JSON.stringify(midiObject, null, 2));

var outputMidi = writeMidi(midiObject);
var outputBuffer = Buffer.from(outputMidi);
fs.writeFileSync(path.join(__dirname, '..', outputPath), outputBuffer);

function eventsForRhythmBar(offset) {
  const noteNumber = floor + progressionOctave * 12 + offset;
  return notePair({ noteNumber, velocity: 80 })
    .concat(
      range(7).map(() => notePair({ noteNumber })).flat()
    );
}

function eventsForLeadBar(offset) {
  const octave = 2 + probable.roll(5);
  const root = floor + octave * 12 + offset;
  const barMode = probable.pick(modes);
  var events = probable.pick(leadBeatPatterns)({ root, mode: barMode });
  var badEvent = events.find(e => isNaN(e.noteNumber)); 
  if (badEvent) {
    throw new Error(`Bad event: ${JSON.stringify(badEvent, null, 2)}`);
  }
  return events;
}

function runUp({ root, mode }) {
  const startPitch = root + probable.pick(mode);
  return range(16).map(i => 
    notePair({
      creator: 'runUp',
      deltaTime: 32,
      noteNumber: getPitchInMode(startPitch, i, mode),
      velocity: getLeadBeatVelocity(i % 4)
    })
  ).flat();
}

// Code duplication crime
function runDown({ root, mode }) {
  const startPitch = root + probable.pick(mode);
  return range(16, -1, -1).map(i => 
    notePair({
      creator: 'runDown',
      deltaTime: 32,
      noteNumber: getPitchInMode(startPitch, i, mode),
      velocity: getLeadBeatVelocity(4 - (i % i))
    })
  ).flat();
}

function arpeggioUp({ root, mode }) {
  const startPitch = root + probable.pick(mode);
  return range(16).map(i => 
    notePair({
      creator: 'arpeggioUp',
      deltaTime: 32,
      noteNumber: getPitchInMode(startPitch, i * 2, mode),
      velocity: getLeadBeatVelocity(i % 4)
    })
  ).flat();
}

function arpeggioDown({ root, mode }) {
  const startPitch = root + probable.pick(mode);
  return range(16, -1, -1).map(i => 
    notePair({
      creator: 'arpeggioDown',
      deltaTime: 32,
      noteNumber: getPitchInMode(startPitch, i * 2, mode),
      velocity: getLeadBeatVelocity(4 - (i % 4))
    })
  ).flat();
}

function randomNotes({ root, mode }) {
  return range(16).map(i => 
    notePair({
      creator: 'randomNotes',
      deltaTime: 32,
      noteNumber: getPitchInMode(root, probable.roll(mode.length), mode),
      velocity: probable.roll(32) + 48 + i === 0 ? 32 : 0,
      channel: 1
    })
  ).flat();
}

function notePair({ deltaTime = 64, channel = 0, noteNumber, velocity = 64 }) {
  return [
    {
      deltaTime,
      channel,
      type: 'noteOn',
      noteNumber,
      velocity
    },
    {
      deltaTime: deltaTime/2,
      channel,
      type: 'noteOff',
      noteNumber,
      velocity: 0
    }
  ];
}

function getPitchInMode(root, degree, mode) {
  const octave = Math.floor(degree / mode.length);
  if (degree < 0) {
    degree = mode.length + degree;
  }
  const offset = degree % mode.length;
  const noteNumber = root + octave * 12 + mode[offset];
  return noteNumber;
}

function getLeadBeatVelocity(positionInBeat) {
  const boost = positionInBeat === 0 ? 32 : 0;
  return probable.roll(32) + 48 + boost;
}

