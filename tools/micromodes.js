#!/usr/bin/env node

/* global process, __dirname, Buffer */

var fs = require('fs');
var path = require('path');
var { writeMidi } = require('midi-file');
var seedrandom = require('seedrandom');
var randomId = require('@jimkang/randomid')();
var Probable = require('probable').createProbable;
var { range } = require('d3-array');
var minimist = require('minimist');

var {
  sections: sectionCount,
  output: outputPath,
  role,
  seed
} = minimist(process.argv.slice(2));

if (!outputPath || !sectionCount || !role) {
  console.error(
    `Usage: node micromodes
      --sections <number of sections>
      --output <output file path>'
      --role <rhythm or lead>
      [--seed seed]`
  );
  process.exit(1);
}

if (!seed) { 
  seed = process.argv.length > 5 ? process.argv[5] : randomId(5);
}

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

var leadBeatPatternTable = probable.createTableFromSizes([
  [2, runUp],
  [2, runDown],
  [1, arpeggioUp],
  [1, arpeggioDown],
  [8, randomNotes]
]);


var rhythmTrack = [];
var leadTrack = [];

for (let sectionIndex = 0; sectionIndex < sectionCount; ++sectionIndex) {
  let { rhythmSection, leadSection } = tracksForSection(4);
  rhythmTrack = rhythmTrack.concat(rhythmSection);
  leadTrack = leadTrack.concat(leadSection);
}

// TODO: Write out two files.
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

function tracksForSection(sectionBarCount) {
  var progressionMode = probable.pick(modes);
  console.log('progressionMode', progressionMode);

  const progressionOctave = probable.roll(3) + 24;
  const sectionRoot = progressionOctave + probable.roll(12);
  var measureRoots = range(sectionBarCount)
    .map(
      () => probable.shuffle(progressionMode)
        .map(n => sectionRoot + progressionOctave + n))
    .flat();
  console.log('measureRoots', measureRoots);

  var rhythmSection = measureRoots.map(eventsForRhythmBar).flat();
  var leadSection = range(measureRoots.length/2).map(eventsForLeadBar).flat();
  return { rhythmSection, leadSection };

  function eventsForRhythmBar(barRoot) {
    return notePair({ noteNumber: barRoot, velocity: 80 })
      .concat(
        range(7).map(() => notePair({ noteNumber: barRoot })).flat()
      );
  }

  function eventsForLeadBar() {
    const octave = 2 + probable.roll(4);
    const root = octave * 12 + sectionRoot;
    const barMode = probable.pick(modes);
    var events = leadBeatPatternTable.roll()({ root, mode: barMode });
    var badEvent = events.find(e => isNaN(e.noteNumber)); 
    if (badEvent) {
      throw new Error(`Bad event: ${JSON.stringify(badEvent, null, 2)}`);
    }
    return events;
  }
}

function runUp({ root, mode }) {
  const startPitch = root + probable.pick(mode);
  return range(16).map(i => 
    notePair({
      creator: 'runUp',
      deltaTime: 64,
      noteNumber: getPitchInMode(startPitch, i, mode),
      velocity: getLeadBeatVelocity(i % 4)
    })
  ).flat();
}

// Code duplication crime
function runDown({ root, mode }) {
  const startPitch = root + probable.pick(mode);
  return range(0, -16, -1).map(i => 
    notePair({
      creator: 'runDown',
      deltaTime: 64,
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
      deltaTime: 64,
      noteNumber: getPitchInMode(
        startPitch + Math.floor(i/4),
        getDegreeForArpeggio(mode.length, i % 4),
        mode
      ),
      velocity: getLeadBeatVelocity(i % 4)
    })
  ).flat();
}

function arpeggioDown({ root, mode }) {
  const startPitch = root + probable.pick(mode);
  return range(0, -16, -1).map(i => 
    notePair({
      creator: 'arpeggioDown',
      deltaTime: 64,
      noteNumber: getPitchInMode(
        startPitch + Math.ceil(i / 4),
        getDegreeForArpeggio(mode.length, i % 4),
        mode
      ),
      velocity: getLeadBeatVelocity(4 - (i % 4))
    })
  ).flat();
}

function randomNotes({ root, mode }) {
  return range(16).map(i => 
    notePair({
      creator: 'randomNotes',
      deltaTime: 64,
      noteNumber: getPitchInMode(root, probable.roll(mode.length), mode),
      velocity: probable.roll(32) + 48 + (i === 0 ? 32 : 0),
    })
  ).flat();
}

function notePair({ deltaTime = 64, channel = 0, noteNumber, velocity = 64, creator }) {
  return [
    {
      creator,
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

// TODO: 7 degrees in modes, not 8.
function getPitchInMode(root, degree, mode) {
  // If the degree is negative, convert it to a
  // negative octave and a positive degree.
  // For example, a degree of -15 should become
  // octave -2, degree 1 if the mode has 8 degrees.
  // (Down two octaves, then up one degree.
  const octave = Math.floor(degree / mode.length);
  if (degree < 0) {
    degree = (mode.length + degree % mode.length);
  }
  const offset = degree % mode.length;
  const noteNumber = root + octave * 12 + mode[offset];
  if (isNaN(noteNumber)) {
    throw new Error(`Bad note number from root ${root}, degree ${degree}, offset ${offset}, mode ${mode}.`);
  }
  return noteNumber;
}

function getLeadBeatVelocity(positionInBeat) {
  const boost = positionInBeat === 0 ? 32 : 0;
  return probable.roll(32) + 48 + boost;
}

function getDegreeForArpeggio(modeLength, arpeggioStep) {
  const octave = Math.floor(arpeggioStep/3);
  const offset = (3 + arpeggioStep) % 3;
  return octave * modeLength + [0, 2, 4][offset];
}
