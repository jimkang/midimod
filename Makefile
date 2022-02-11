SEED = yngwie
SECTIONS = 8

pushall:
	git push origin main

try-rhythm:
	node tools/micromodes.js \
    --sections $(SECTIONS) \
    --output out/micromodes-rhythm.mid \
    --role rhythm \
    --seed $(SEED)

try-lead:
	node tools/micromodes.js \
    --sections $(SECTIONS) \
    --output out/micromodes-lead.mid \
    --role lead \
    --seed $(SEED)
