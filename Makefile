pushall:
	git push origin main

try-rhythm:
	node tools/micromodes.js \
    --sections 1 \
    --output out/micromodes-rhythm.mid \
    --role rhythm \
    --seed hey
