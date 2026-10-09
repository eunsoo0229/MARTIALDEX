# Cross-art relation judgement — criteria (read fully)

Each item is a MARTIALDEX technique that is NOT linked to a target art, but the target art's OWN data mentions it (evidence snippets: "doc" = the art's source document line, "record" = one of the art's technique records, "library" = a user-submitted shared-library record filed under that art). Decide whether the technique really is a technique of the TARGET art.

- "add" — the target art's material presents it as a technique practiced/used in that art (listed among its techniques, described as how that art does it, part of its combinations/counters). confidence "A" if the art's source document or record lists/describes it as its own technique; "B" if only indirect (e.g. user library record, or part of a combo name).
- "none" — the mention is not the art using it: comparison with another sport ("unlike boxing", "복싱과 달리"), the opponent's technique being defended/countered (e.g. "defending against a double leg" in a striking art can still mean the art faces it but does not use it), a rule that forbids it, a name that matches by accident (generic word like "Guard", "Base", "Frame", "Check", "Catch" meaning something else), or a different technique with the same word.
- "review" — the snippet is ambiguous.

Rules: same name ≠ same technique; read the snippet meaning. Lead/rear/side/target variants are different techniques. Never add because "it is common in combat sports".

Output: ONE JSON file (path given) = array in input order, one object per item:
{"id": "<technique id>", "art": "<target art>", "decision": "add"|"none"|"review", "confidence": "A"|"B"|"C", "reason": "<one short Korean sentence>", "evidence": "<quote the decisive snippet part>"}
Then reply with counts per decision only.
