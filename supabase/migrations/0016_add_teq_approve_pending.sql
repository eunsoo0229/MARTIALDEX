-- add_teq no longer uses a separate manual/admin review step — the Google
-- Search grounding verification gate a technique already passed before
-- ever reaching add_teq (verdict 'confirmed' + confidence >= 55 + real
-- evidence/grounding sources — see userTechniques/verification.ts's
-- passesVerificationGate, unchanged) IS the review. New registrations now
-- write 'approved' directly (src/lib/userTechniques/service.ts /
-- src/lib/techniqueDiscovery/service.ts). This one-off backfill brings
-- every row already sitting at the old default ('pending', which nothing
-- in this app ever transitioned out of) in line with that — no technique
-- data is touched, only the status column, and only rows that were
-- 'pending'.
-- Both the real `status` column AND the embedded `data.status` field must
-- be updated: `data jsonb` holds the complete AddTeqRecord object as-is
-- (same convention as every other table here), and the CLIENT reads
-- add_teq rows via `row.data as AddTeqRecord` (src/lib/addTeq/service.ts's
-- pullAddTeqFromCloud), not the standalone column — updating only the
-- column would leave every already-cached/re-synced client still seeing
-- 'pending' inside the object itself.
update public.add_teq
set
  status = 'approved',
  updated_at = now(),
  data = jsonb_set(jsonb_set(data, '{status}', '"approved"'), '{updatedAt}', to_jsonb(now()::text))
where status = 'pending';
