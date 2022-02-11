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
