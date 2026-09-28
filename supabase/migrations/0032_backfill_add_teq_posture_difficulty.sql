-- One-time DATA backfill (not a schema change) — MARTIALDEX 긴급 안정화
-- section B/C: fills real, evidence-backed posture + criteria-based
-- difficulty for the 18 add_teq techniques (wushu/taekkyon, registered
-- via martialArtDiscovery before it generated these fields) that had
-- none. No UPDATE policy exists for regular users on add_teq by design
-- (0014_add_teq.sql), so this one-off correction runs as a migration,
-- the same elevated-privilege path schema changes already use — never
-- exposed to the client. Only touches posture/difficulty; every other
-- field (verification, duplicateCheck, status, etc.) is preserved as-is.

update public.add_teq set
  posture = null,
  difficulty = 'intermediate',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce(null, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('intermediate'::text), 'null'::jsonb), true)
where id = 'wushu__ce-shou-fan';

update public.add_teq set
  posture = null,
  difficulty = 'beginner',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce(null, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('beginner'::text), 'null'::jsonb), true)
where id = 'wushu__frontal-heel-kick';

update public.add_teq set
  posture = '{"overview":"오른쪽 다리를 앞으로 차올릴 때 발목을 완전히 펼쳐 발가락 끝이 정면을 향하도록 고정하며, 무릎을 먼저 올린 뒤 다리를 뻗는다.","startingPosition":null,"bodyPosition":null,"steps":["무릎을 위로 올려 차기를 준비한다.","발목을 곧게 뻗어 발가락 끝이 정면을 향하게 하면서 다리를 앞으로 차낸다."],"keyPoints":["발목을 완전히 확장하여 발끝이 앞을 향하게 해야 한다."],"commonMistakes":[]}'::jsonb,
  difficulty = 'beginner',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce('{"overview":"오른쪽 다리를 앞으로 차올릴 때 발목을 완전히 펼쳐 발가락 끝이 정면을 향하도록 고정하며, 무릎을 먼저 올린 뒤 다리를 뻗는다.","startingPosition":null,"bodyPosition":null,"steps":["무릎을 위로 올려 차기를 준비한다.","발목을 곧게 뻗어 발가락 끝이 정면을 향하게 하면서 다리를 앞으로 차낸다."],"keyPoints":["발목을 완전히 확장하여 발끝이 앞을 향하게 해야 한다."],"commonMistakes":[]}'::jsonb, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('beginner'::text), 'null'::jsonb), true)
where id = 'wushu__frontal-toe-kick';

update public.add_teq set
  posture = '{"overview":"몸을 낮게 낮추고 회전력을 이용하여 뒤쪽으로 길게 뻗은 다리를 원형으로 휘둘러 하단을 쓸어냅니다."}'::jsonb,
  difficulty = 'intermediate',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce('{"overview":"몸을 낮게 낮추고 회전력을 이용하여 뒤쪽으로 길게 뻗은 다리를 원형으로 휘둘러 하단을 쓸어냅니다."}'::jsonb, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('intermediate'::text), 'null'::jsonb), true)
where id = 'wushu__hou-sao';

update public.add_teq set
  posture = null,
  difficulty = 'beginner',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce(null, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('beginner'::text), 'null'::jsonb), true)
where id = 'wushu__lateral-kick';

update public.add_teq set
  posture = '{"overview":"한쪽 다리는 굽히고 다른 쪽 다리는 옆으로 펴서 낮게 앉는 자세입니다.","bodyPosition":{"legs":"한쪽 다리는 완전히 굽히고 다른 쪽 다리는 옆으로 곧게 뻗음"}}'::jsonb,
  difficulty = 'beginner',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce('{"overview":"한쪽 다리는 굽히고 다른 쪽 다리는 옆으로 펴서 낮게 앉는 자세입니다.","bodyPosition":{"legs":"한쪽 다리는 완전히 굽히고 다른 쪽 다리는 옆으로 곧게 뻗음"}}'::jsonb, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('beginner'::text), 'null'::jsonb), true)
where id = 'wushu__pu-bu';

update public.add_teq set
  posture = null,
  difficulty = 'beginner',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce(null, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('beginner'::text), 'null'::jsonb), true)
where id = 'wushu__qian-sao';

update public.add_teq set
  posture = '{"overview":"공중에서 360도 회전하며 수행하는 발차기 기술입니다.","startingPosition":"오른발로 지면을 박차고 도약합니다.","bodyPosition":{"legs":"공중에서 다리를 곧게 펴고 안쪽으로 원을 그리며 찹니다."},"steps":["오른발로 도약","공중에서 360도 회전","안쪽으로 원을 그리는 발차기 수행","오른발로 착지"],"keyPoints":["앞으로 뛰는 것이 아니라 위로 높이 도약하는 것에 집중해야 함","다리를 곧게 펴고 수행해야 함"]}'::jsonb,
  difficulty = 'intermediate',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce('{"overview":"공중에서 360도 회전하며 수행하는 발차기 기술입니다.","startingPosition":"오른발로 지면을 박차고 도약합니다.","bodyPosition":{"legs":"공중에서 다리를 곧게 펴고 안쪽으로 원을 그리며 찹니다."},"steps":["오른발로 도약","공중에서 360도 회전","안쪽으로 원을 그리는 발차기 수행","오른발로 착지"],"keyPoints":["앞으로 뛰는 것이 아니라 위로 높이 도약하는 것에 집중해야 함","다리를 곧게 펴고 수행해야 함"]}'::jsonb, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('intermediate'::text), 'null'::jsonb), true)
where id = 'wushu__spinning-kick';

update public.add_teq set
  posture = '{"overview":"허리 위치에서 시작하여 팔을 회전시키며 정면으로 직선 타격을 가하는 동작입니다.","startingPosition":"양 주먹을 허리 옆에 위치시키고 팔꿈치를 뒤로 당긴 상태","bodyPosition":{"arms":"주먹을 회전시키며 전방으로 뻗음","weightDistribution":"하체는 기마식(Ma Bu) 또는 궁보(Gong Bu) 등의 안정적인 자세 유지"},"keyPoints":["주먹을 허리에서부터 회전시키며 뻗을 것","힘이 주먹 앞부분(너클)에 전달되도록 할 것"]}'::jsonb,
  difficulty = 'beginner',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce('{"overview":"허리 위치에서 시작하여 팔을 회전시키며 정면으로 직선 타격을 가하는 동작입니다.","startingPosition":"양 주먹을 허리 옆에 위치시키고 팔꿈치를 뒤로 당긴 상태","bodyPosition":{"arms":"주먹을 회전시키며 전방으로 뻗음","weightDistribution":"하체는 기마식(Ma Bu) 또는 궁보(Gong Bu) 등의 안정적인 자세 유지"},"keyPoints":["주먹을 허리에서부터 회전시키며 뻗을 것","힘이 주먹 앞부분(너클)에 전달되도록 할 것"]}'::jsonb, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('beginner'::text), 'null'::jsonb), true)
where id = 'wushu__thrust-punch';

update public.add_teq set
  posture = '{"overview":"마보(Ma Bu), 공보(Gong Bu), 포보(Pu Bu), 사보/협보(Xie Bu), 허보(Xu Bu)의 5가지 기본 보법과 권(주먹), 장(손바닥), 구수(갈고리) 등 손기술을 연결하여 수행한다."}'::jsonb,
  difficulty = 'beginner',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce('{"overview":"마보(Ma Bu), 공보(Gong Bu), 포보(Pu Bu), 사보/협보(Xie Bu), 허보(Xu Bu)의 5가지 기본 보법과 권(주먹), 장(손바닥), 구수(갈고리) 등 손기술을 연결하여 수행한다."}'::jsonb, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('beginner'::text), 'null'::jsonb), true)
where id = 'wushu__wu-bu-quan';

update public.add_teq set
  posture = null,
  difficulty = null,
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce(null, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb(null::text), 'null'::jsonb), true)
where id = 'taekkyon__baljil';

update public.add_teq set
  posture = null,
  difficulty = null,
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce(null, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb(null::text), 'null'::jsonb), true)
where id = 'taekkyon__hwalgaejit';

update public.add_teq set
  posture = '{"overview":"삼각형의 궤적을 따라 발을 내디디며 몸의 중심을 이동하는 보법입니다.","startingPosition":"양발을 어깨너비 정도로 벌리고 자연스럽게 서서 중심을 잡습니다.","steps":["한 발을 앞으로 내디디며 삼각형의 꼭짓점 방향으로 이동합니다.","뒤에 있는 발을 따라 옮기며 리듬을 유지합니다.","좌우로 부드럽게 체중을 이동하며 원형 또는 삼각형의 흐름을 만듭니다."],"keyPoints":["부드럽고 유연한 움직임 유지","리듬감 있는 발놀림","상대와의 거리를 조절하며 중심 유지"]}'::jsonb,
  difficulty = 'beginner',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce('{"overview":"삼각형의 궤적을 따라 발을 내디디며 몸의 중심을 이동하는 보법입니다.","startingPosition":"양발을 어깨너비 정도로 벌리고 자연스럽게 서서 중심을 잡습니다.","steps":["한 발을 앞으로 내디디며 삼각형의 꼭짓점 방향으로 이동합니다.","뒤에 있는 발을 따라 옮기며 리듬을 유지합니다.","좌우로 부드럽게 체중을 이동하며 원형 또는 삼각형의 흐름을 만듭니다."],"keyPoints":["부드럽고 유연한 움직임 유지","리듬감 있는 발놀림","상대와의 거리를 조절하며 중심 유지"]}'::jsonb, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('beginner'::text), 'null'::jsonb), true)
where id = 'taekkyon__pumbalki';

update public.add_teq set
  posture = null,
  difficulty = null,
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce(null, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb(null::text), 'null'::jsonb), true)
where id = 'taekkyon__sonjil';

update public.add_teq set
  posture = null,
  difficulty = null,
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce(null, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb(null::text), 'null'::jsonb), true)
where id = 'taekkyon__taejil';

update public.add_teq set
  posture = null,
  difficulty = 'intermediate',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce(null, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('intermediate'::text), 'null'::jsonb), true)
where id = 'taekkyon__ttanjuk';

update public.add_teq set
  posture = '{"overview":"몸을 둥글게 말아 앞으로 구르는 아크로바틱 동작입니다.","startingPosition":"서 있는 자세 또는 낮은 자세에서 시작"}'::jsonb,
  difficulty = 'intermediate',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce('{"overview":"몸을 둥글게 말아 앞으로 구르는 아크로바틱 동작입니다.","startingPosition":"서 있는 자세 또는 낮은 자세에서 시작"}'::jsonb, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('intermediate'::text), 'null'::jsonb), true)
where id = 'wushu__qiang-bei';

update public.add_teq set
  posture = '{"overview":"상체를 곧게 유지한 채 다리를 곧게 펴서 정면으로 차 올리는 동작입니다.","startingPosition":"양발을 모으고 정면을 바라보고 선 자세.","bodyPosition":{"upperBody":"상체는 움직이지 않고 곧게 유지합니다.","arms":"양팔을 수평으로 뻗거나 고정하여 균형을 잡습니다.","legs":"무릎을 굽히지 않고 곧게 펴서 이마 높이까지 차 올립니다."},"steps":["왼발을 앞으로 내디디며 준비 자세를 취합니다.","오른발을 곧게 펴서 이마를 향해 빠르게 차 올립니다.","상체와 머리가 흔들리지 않도록 주의하며 다리를 내립니다."],"keyPoints":["무릎을 굽히지 않음","상체 고정","이마 높이까지 차기"],"commonMistakes":["무릎을 굽힘","상체가 앞으로 숙여짐","발차기 시 머리가 움직임"]}'::jsonb,
  difficulty = 'beginner',
  data = jsonb_set(jsonb_set(data, '{technique,posture}', coalesce('{"overview":"상체를 곧게 유지한 채 다리를 곧게 펴서 정면으로 차 올리는 동작입니다.","startingPosition":"양발을 모으고 정면을 바라보고 선 자세.","bodyPosition":{"upperBody":"상체는 움직이지 않고 곧게 유지합니다.","arms":"양팔을 수평으로 뻗거나 고정하여 균형을 잡습니다.","legs":"무릎을 굽히지 않고 곧게 펴서 이마 높이까지 차 올립니다."},"steps":["왼발을 앞으로 내디디며 준비 자세를 취합니다.","오른발을 곧게 펴서 이마를 향해 빠르게 차 올립니다.","상체와 머리가 흔들리지 않도록 주의하며 다리를 내립니다."],"keyPoints":["무릎을 굽히지 않음","상체 고정","이마 높이까지 차기"],"commonMistakes":["무릎을 굽힘","상체가 앞으로 숙여짐","발차기 시 머리가 움직임"]}'::jsonb, 'null'::jsonb), true), '{technique,difficulty}', coalesce(to_jsonb('beginner'::text), 'null'::jsonb), true)
where id = 'wushu__zheng-ti-tui';
