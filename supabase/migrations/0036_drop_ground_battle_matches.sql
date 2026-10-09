-- Ground Battle (그라운드 배틀) was removed from the app; nothing reads or
-- writes this table anymore (see 0033_ground_battle_matches.sql). Training
-- history entries the feature wrote live in public.training_history and are
-- NOT affected.
drop table if exists public.ground_battle_matches;
