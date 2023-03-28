SEED = sweep
SECTIONS = 12
SECTIONBARS = 12

pushall:
	git push origin main

try-rhythm:
	node tools/micromodes.js \
    --sections $(SECTIONS) \
    --barsPerSection $(SECTIONBARS) \
    --output out/micromodes-rhythm.mid \
    --role rhythm \
    --seed $(SEED)

try-lead:
	node tools/micromodes.js \
    --sections $(SECTIONS) \
    --barsPerSection $(SECTIONBARS) \
    --output out/micromodes-lead.mid \
    --role lead \
    --seed $(SEED)

gs-bass:
	node tools/gear-shift.js --sections 12 --barsPerSection 4 --output out/gear-shift-bass.mid --role bass --seed itislate

gs-rhythm-gtr:
	node tools/gear-shift.js --sections 12 --barsPerSection 4 --output out/gear-shift-gtr2.mid --role rhythm --seed itislate

gs-gtr:
	node tools/gear-shift.js --sections 12 --barsPerSection 4 --output out/gear-shift-gtr.mid --role lead --seed itislate

pressure-gtr:
	node tools/pressure.js --sections 4 --barsPerSection 4 --output out/pressure.mid --role lead --seed moyses
