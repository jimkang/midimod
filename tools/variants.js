#!/usr/bin/env node

/* global process, __dirname, Buffer */

const sixteenthNoteTicks = 240;
const beatsPerBar = 5;

var fs = require('fs');
var path = require('path');
var { writeMidi } = require('midi-file');
var seedrandom = require('seedrandom');
var randomId = require('@jimkang/randomid')();
var Probable = require('probable').createProbable;
var { range } = require('d3-array');
var minimist = require('minimist');
var curry = require('lodash.curry');

var {
  sections: sectionCount,
  barsPerSection,
  output: outputPath,
  seed
} = minimist(process.argv.slice(2));

if (!outputPath || !sectionCount) {
  console.error(
    `Usage: node variants
      --sections <number of sections>
      [--barsPerSection <bars in each section>]
      --output <output file path>'
      [--seed seed]`
  );
  process.exit(1);
}

if (!seed) { 
  seed = randomId(5);
}
if (!barsPerSection) {
  barsPerSection = 4;
}

console.log('Seed:', seed);
var random = seedrandom(seed);
var probable = Probable({ random });

var header = {
  'format': 1,
  'numTracks': 1,
  'ticksPerBeat': 960
};

var infoTrack = [
  {
    'deltaTime': 0,
    'meta': true,
    'type': 'timeSignature',
    'numerator': 5,
    'denominator': 4,
    'metronome': 1,
  },
  {
    'deltaTime': 0,
    'meta': true,
    'type': 'setTempo',
    'microsecondsPerBeat': 1000000
  },
  {
    'deltaTime': 0,
    'meta': true,
    'type': 'endOfTrack'
  }
];

var modesTable = probable.createTableFromSizes([
  [0,//5,
    {
      name: 'Ionian',
      intervals: [0, 2, 4, 5, 7, 9, 11, 12],
    }],
  [6,
    {
      name: 'Dorian',
      intervals: [0, 2, 3, 5, 7, 9, 10],
    }],
  [2, {
    name: 'Phrygian',
    intervals: [0, 1, 3, 5, 6, 8, 10],
  }],
  // It's having a hard time making this work.
  [0,//1,
    {
      name: 'Lydian',
      intervals: [0, 2, 4, 6, 7, 9, 11],
    }],
  [0,//2, 
    {
      name: 'Mixolydian',
      intervals: [0, 2, 4, 5, 7, 9, 10],
    }],
  [0,//7, 
    {
      name: 'Aeolian',
      intervals: [0, 2, 3, 5, 7, 8, 10],
    }],
  [2,
    {
      name: 'Locrian',
      intervals: [0, 1, 3, 5, 6, 8, 10]
    }],
]);

var theme = [
  { degree: 0, length: sixteenthNoteTicks * 3 },
  { degree: 0, length: sixteenthNoteTicks * 2 },
  { degree: 2, length: sixteenthNoteTicks * 3 },
  { degree: 0, length: sixteenthNoteTicks * 3 },
  { degree: 0, length: sixteenthNoteTicks * 2 },
  { degree: 2, length: sixteenthNoteTicks * 3 },
  { degree: -1, length: sixteenthNoteTicks * 4 },
];

var leadBeatPatternTable = probable.createTableFromSizes([
  //[1, runUp],
  //[1, runDown],
  [1, arpeggioUp],
  [1, arpeggioDown],
  [2, randomNotes],
  [8, variantOnTheme]
]);

var phraseLengthTable = probable.createTableFromSizes([
  [3, 1],
  [5, 2],
  [1, 4]
]);

var riffModeDegreeTable = probable.createTableFromSizes([
  [30, 0],
  [3, 1],
  [4, 2],
  [5, 3],
  [8, 4],
  [3, 5],
  [5, 6],
  [12, 7],
]);

var riffs = range(sectionCount).map(() => range(8).map(() => riffModeDegreeTable.roll()));
var leadTrack = [];
var pieceRoot = probable.roll(12);
var rootsMode = modesTable.roll();

console.log('riffs', riffs);
console.log('rootsMode', rootsMode);

var currentSectionMode;

for (let sectionIndex = 0; sectionIndex < sectionCount; ++sectionIndex) {
  var sectionMode;
  if (sectionIndex > 0 && sectionIndex === sectionCount - 1) {
    sectionMode = rootsMode;
  } else {
    do {
      sectionMode = modesTable.roll();
    }
    while (currentSectionMode && sectionMode.name === currentSectionMode.name);
  }
  currentSectionMode = sectionMode;
  var sectionRoot = pieceRoot + probable.pick(rootsMode.intervals) + 12;
      
  let { leadSection } = tracksForSection({
    sectionBarCount: barsPerSection, 
    allowLooseLeadMode: false, //sectionIndex/sectionCount > 0.6 && sectionIndex/sectionCount < 0.8,
    sectionRoot,
    sectionMode
  });

  if (sectionIndex === sectionCount - 1) {
    // Add final note.
    const endBaseNote = sectionRoot + 24;
    leadSection = leadSection.concat(notePair(
      {
        length: sixteenthNoteTicks * 16,
        noteNumber: endBaseNote + 7
      }
    ));
  }

  leadTrack = leadTrack.concat(leadSection);
}

var midiObject = {
  header,
  // I can't figure out how to get DAWs to accept three tracks in a file.
  // Also can't seem to make things in channel 1 work.
  tracks: [ infoTrack, leadTrack ]
};

console.log(JSON.stringify(midiObject, null, 2));

var outputMidi = writeMidi(midiObject);
var outputBuffer = Buffer.from(outputMidi);
fs.writeFileSync(path.join(__dirname, '..', outputPath), outputBuffer);

function tracksForSection({ sectionBarCount, sectionRoot, allowLooseLeadMode = false, sectionMode }) {
  console.log('sectionMode', sectionMode.name, 'sectionRoot', sectionRoot);

  const progressionOctave = probable.roll(2);
  const rootsOffset = sectionRoot + progressionOctave * 12;

  var measureModeDegrees = range(sectionBarCount).map(() => 0);
  console.log('measureModeDegrees', measureModeDegrees);

  var leadSection = measureModeDegrees.map(curry(eventsForLeadBar)(allowLooseLeadMode)).flat();
  return { leadSection };

  function eventsForLeadBar(useLooseLeadMode, degreeRoot) {
    const octave = 0;
    const barMode = useLooseLeadMode ? modesTable.roll() : sectionMode;
    const niceRoot = octave * 12 + sectionRoot + rootsOffset;
    //const root = useLooseLeadMode ? getPitchInMode(niceRoot, degreeRoot, barMode) : niceRoot;
    const root = niceRoot;
    var events = [];
    for (let beatsFilled = 0; beatsFilled < beatsPerBar; ) {
      let phraseLength = phraseLengthTable.roll();
      const beatsRemaining = beatsPerBar - beatsFilled;
      if (phraseLength > beatsRemaining) {
        phraseLength = beatsRemaining;
      } 
      let eventsForPhrase = leadBeatPatternTable.roll()({
        root, 
        mode: barMode,
        startDegree: degreeRoot,
        beats: phraseLength
      });

      events = events.concat(eventsForPhrase);
      beatsFilled += phraseLength;
      if (phraseLength <= beatsPerBar - beatsFilled && probable.roll(3) === 0) {
        // Repeat the phrase.
        events = events.concat(eventsForPhrase);
        beatsFilled += phraseLength;
      }
    }

    var badEvent = events.find(e => isNaN(e.noteNumber)); 
    if (badEvent) {
      throw new Error(`Bad event: ${JSON.stringify(badEvent, null, 2)}`);
    }
    return events;
  }
}

function runUp({ root, startDegree, mode, beats }) {
  return range(beats * beatsPerBar).map(i => 
    notePair({
      creator: 'runUp',
      mode: mode.name,
      length: sixteenthNoteTicks,
      noteNumber: getPitchInMode(root, startDegree + i, mode),
      velocity: getLeadBeatVelocity(i % beatsPerBar)
    })
  ).flat();
}

function runDown({ root, startDegree, mode, beats }) {
  return range(0, -beats * beatsPerBar, -1).map(getNotePair).flat();

  function getNotePair(i) {
    const noteNumber = getPitchInMode(root, startDegree + i, mode);
    //console.log('runDown', root, startDegree, i, noteNumber);
    return notePair({
      creator: 'runDown',
      mode: mode.name,
      length: sixteenthNoteTicks,
      noteNumber,
      velocity: getLeadBeatVelocity(beatsPerBar - (i % i))
    });
  } 
}

function arpeggioUp({ root, startDegree, mode, beats }) {
  return range(beats * beatsPerBar).map(i => 
    notePair({
      creator: 'arpeggioUp',
      mode: mode.name,
      length: sixteenthNoteTicks,
      noteNumber: getPitchInMode(
        root,
        getDegreeForArpeggio({
          modeLength: mode.intervals.length,
          startDegree,
          // arpeggioStep will go 0 1 2 3 1 2 3 4...
          arpeggioStep: i % beatsPerBar + Math.floor(i/beatsPerBar)
        }),
        mode
      ),
      velocity: getLeadBeatVelocity(i % beatsPerBar)
    })
  ).flat();
}

function arpeggioDown({ root, startDegree, mode, beats }) {
  return range(0, -beats * beatsPerBar, -1).map(i => 
    notePair({
      creator: 'arpeggioDown',
      mode: mode.name,
      length: sixteenthNoteTicks,
      noteNumber: getPitchInMode(
        root,
        getDegreeForArpeggio({
          modeLength: mode.intervals.length,
          startDegree,
          // arpeggioStep will go 0 -1 -2 -3 -1 -2 -3 -4...
          arpeggioStep: i % beatsPerBar + Math.ceil(i/beatsPerBar)
        }),
        mode
      ),
      velocity: getLeadBeatVelocity(beatsPerBar - (i % beatsPerBar))
    })
  ).flat();
}

function randomNotes({ root, mode, beats }) {
  return range(beats * beatsPerBar).map(i => 
    notePair({
      creator: 'randomNotes',
      mode: mode.name,
      length: sixteenthNoteTicks,
      noteNumber: getPitchInMode(root, probable.roll(mode.intervals.length), mode),
      velocity: probable.roll(32) + 48 + (i === 0 ? 32 : 0),
    })
  ).flat();
}

function variantOnTheme({ root, mode }) {
  var timeRemaining = 20 * sixteenthNoteTicks;
  return theme.map(getThemeEvent).flat();

  function getThemeEvent({ degree, length }, i) {
    if (i !== 0 && probable.roll(3) === 0) {
      const goUp = probable.roll(2); 
      if (probable.roll(4) === 0) {
        degree += goUp ? 1 : -1;
      } else {
        degree += (goUp ? 1 : -1) * probable.pick([2, 4, 7]);
      }
    }
    if (i !== 0 && probable.roll(3) === 0) {
      length += (probable.roll(2) === 0 ? -1 : 1) * (probable.roll(3) === 0 ? 2 : 1) * sixteenthNoteTicks;
      if (length < sixteenthNoteTicks) {
        length = sixteenthNoteTicks;
      }
      if (length > timeRemaining) {
        length = timeRemaining;
      }
      if (i === theme.length - 1 && length < timeRemaining) {
        length = timeRemaining;
      }
    }
    timeRemaining -= length;
        
    return notePair({
      creator: 'variantOnTheme',
      mode: mode.name,
      length,
      noteNumber: getPitchInMode(root, degree, mode),
      velocity: probable.roll(32) + 48 + (i === 0 ? 32 : 0),
    });
  }
}

function notePair({ length = sixteenthNoteTicks, channel = 0, noteNumber, velocity = 64, creator, mode }) {
  return [
    {
      creator,
      mode,
      deltaTime: 0,
      channel,
      type: 'noteOn',
      noteNumber,
      velocity
    },
    {
      deltaTime: length,
      channel,
      type: 'noteOff',
      noteNumber,
      velocity: 0
    }
  ];
}

function getPitchInMode(root, degree, mode) {
  // If the degree is negative, convert it to a
  // negative octave and a positive degree.
  // For example, a degree of -15 should become
  // octave -2, degree 1 if the mode has 8 degrees.
  // (Down two octaves, then up one degree.
  const octave = Math.floor(degree / mode.intervals.length);
  if (degree < 0) {
    degree = (mode.intervals.length + degree % mode.intervals.length);
  }
  const offset = degree % mode.intervals.length;
  const noteNumber = root + octave * 12 + mode.intervals[offset];
  if (isNaN(noteNumber)) {
    throw new Error(`Bad note number from root ${root}, degree ${degree}, offset ${offset}, mode ${mode}.`);
  }
  return noteNumber;
}

function getLeadBeatVelocity(positionInBeat) {
  const boost = positionInBeat === 0 ? 32 : 0;
  return probable.roll(32) + 48 + boost;
}

function getDegreeForArpeggio({ modeLength, startDegree, arpeggioStep }) {
  var octave = Math.floor(arpeggioStep/3);
  // Subtract from 3 in case of a negative arpeggioStep.
  var offset = arpeggioStep % 3; 
  if (offset < 0) {
    offset = 3 + offset;
  }
  return startDegree + octave * modeLength + [0, 2, 4][offset];
}
