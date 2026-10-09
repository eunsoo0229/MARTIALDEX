# MMA relation judgement — criteria (read fully)

You decide, for each MARTIALDEX technique below (currently NOT linked to MMA), whether it should be linked to the art "MMA" (mixed-martial-arts). You are judging technique identity/usage, nothing else. Be conservative and honest.

## Evidence you may use (cite it)
S1 — MARTIALDEX's own MMA records (file mma-pack.txt). They show which KINDS of technique MMA uses: boxing punches & combinations ("MMA Boxing Combination": 잽-크로스-훅 등 복싱 콤비네이션), kickboxing kicks ("MMA 킥복싱": calf kick, oblique kick, 로우킥), Muay Thai clinch knees + dirty boxing (short hooks/uppercuts, neck/arm control), clinch grips (underhook/overhook), takedowns (double leg, ankle pick, clinch takedowns, cage wrestling), sprawl / takedown defense, ground control (mount, back with hooks, half guard, closed guard, guard recovery, framing, scrambles, leg entanglements/leg-lock entries), ground & pound with elbows from top, submissions (armbar, guillotine, triangle, kimura, RNC), spinning backfist, check hook, overhand. Some items also carry "mmaDataMentions" = an MMA record names them directly (strongest evidence).
S2 — MMA Unified Rules (external-sources.json): fouls list (e.g. downward pointing elbow strike, small joint manipulation, kneeing/kicking the head of a grounded opponent, holding gloves/shorts, spiking on head/neck, throat strikes, groin, back of head/spine strikes, fingers to eyes) and attire: "Shirts (except in women categories), gis or long pants (including gi pants) are not allowed" — so ANY technique that needs gripping a gi (collar/lapel/sleeve/belt/pants grips, gi chokes using the lapel, throws that depend on gi grips) cannot be done in MMA.

## Decision per technique
- "add" — it IS a technique used in MMA competition. Requires BOTH: it belongs to a kind of technique S1 shows MMA uses (or an MMA record names it) AND it is legal & gi-free under S2 AND you are confident it is genuinely used in MMA fights/training (not merely "not forbidden"). confidence "A" if an MMA record names it (mmaDataMentions), else "B".
- "none" — not an MMA technique. Typical reasons: needs a gi; a foul under S2; a traditional form/kata/poomsae/breaking/demonstration/ceremonial item; self-defense-only drill (e.g. responses to collar grabs); a rule-system / scoring / competition-format concept (e.g. "K-1 Rules", amateur vs pro scoring, point sparring); a pure sport-specific scoring maneuver with no use in MMA (e.g. folkstyle tilts for back points, judo-only scoring holds that are not positions); a heading / not a technique; a stance/footwork concept so specific to another sport's rules that it does not transfer (explain).
- "review" — you are NOT sure whether it is genuinely used in MMA (e.g. rare/flashy, borderline legality like downward elbows, techniques whose identity in MMA differs). Never guess "add".

Do not add something just because "MMA is mixed so everything applies". Do not add a technique because a similar one is used. Lead/rear/side/target variants are separate techniques: judge each on its own.

## Output
Write ONE JSON file (path given in your task) = an array, one object per input technique, SAME ORDER, no omissions:
{"id": "<technique id>", "decision": "add"|"none"|"review", "confidence": "A"|"B"|"C", "reason": "<one short Korean sentence: why>", "evidence": "<which S1 record/category and S2 rule you relied on, or what disqualifies it>"}
confidence for "none": "A" when a clear disqualifier applies (gi, foul, kata/poomsae, rules concept), "B" otherwise. For "review" use "C".
Then reply with counts per decision only.
