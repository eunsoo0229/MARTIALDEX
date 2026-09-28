-- One-off cleanup: while testing 0014's discovery pipeline, an abbreviation
-- dedup bug (fixed in the same work — see runVerificationStage's new
-- canonical-name duplicate check in userTechniques/service.ts) let "RNC"
-- and "Rear Naked Choke Submission" register as separate add_teq rows
-- instead of resolving to the official bjj__rear-naked-choke technique.
-- Removes those two test-only rows so the shared library doesn't ship with
-- known-duplicate junk; does not touch any of the 1,253 official
-- techniques (a completely different table) or any other add_teq row.
delete from public.add_teq where id in ('bjj__rnc', 'bjj__rear-naked-choke-submission');
