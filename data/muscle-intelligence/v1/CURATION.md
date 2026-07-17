# Plaivra Muscle Intelligence Phase 2
## Final Curated Exercise Registry and Research Package

**Status:** Approved planning input; not implemented or inserted into Supabase
**Repository baseline:** `99df1c97d7acbd7ab77c597cd859533d20ad9981`
**Canonical exercises:** 60
**Verified provider links:** 9
**Explicit current-provider non-matches:** 51

## 1. Final decisions

- The cohort remains exactly 60 exercises.
- Two pre-seed identity corrections were made:
  - `Barbell Overhead Press` → `Standing Barbell Overhead Press`.
  - `Romanian Deadlift` → `Barbell Romanian Deadlift`.
- These corrections create exact canonical definitions and exact matches to the live Activity Catalog.
- Shoulder-press mappings were made more conservative: lateral deltoid is secondary `0.50`, not primary `0.75`.
- The leg-press gastrocnemius entry was removed because it was not sufficiently product-relevant as a dynamic contributor.
- Every exercise now has EN/DE/AR canonical names, controlled aliases, English instructions, evidence keys, limitations, deterministic identities, and a reviewed mapping.

## 2. Provider identity audit

The live Activity Catalog contains 12 activities. Nine are exact matches to this cohort:

| Plaivra exercise | Provider activity ID | Provider slug | Version |
|---|---|---|---:|
| Barbell Bench Press | `cc1f1371-7d26-4bc8-b7df-7d2a6d1830bb` | `barbell_bench_press` | 1 |
| Standing Barbell Overhead Press | `6a37a573-0b3e-4ec7-8917-94da410eab4f` | `standing_barbell_overhead_press` | 1 |
| Dumbbell Lateral Raise | `3fa578c9-d2ad-4c48-8f96-2967c490881e` | `dumbbell_lateral_raise` | 1 |
| Lat Pulldown | `0ee93d25-ad3a-46a1-b3d8-d94a7d04ecb2` | `lat_pulldown` | 1 |
| Seated Cable Row | `de77ae88-55a4-4d7d-bcb7-379024da97f5` | `seated_cable_row` | 1 |
| Cable Triceps Pushdown | `3f310a14-8b2f-4614-8b78-d4ed33181c12` | `cable_triceps_pushdown` | 1 |
| Barbell Back Squat | `f2fe7153-b6f7-415b-b15c-a23a43a5c7d2` | `barbell_back_squat` | 1 |
| Barbell Romanian Deadlift | `54ab0a17-eca8-4129-80ef-37fca5e5b618` | `barbell_romanian_deadlift` | 1 |
| Front Plank | `dfe154d4-a3bb-40fb-a80c-41a4a484ca75` | `front_plank` | 1 |

The other 51 canonical exercises intentionally receive no provider row. Similar names or related movements are not enough to create a canonical link.

## 3. Registry validation

- `exercise_count`: **60**
- `localization_count`: **180**
- `alias_count`: **180**
- `relationship_count`: **32**
- `verified_provider_link_count`: **9**
- `no_verified_provider_match_count`: **51**
- `canonical_muscles_with_any_coverage`: **24**
- `canonical_muscles_with_primary_coverage`: **24**
- `invalid_role_contribution_pairs`: **0**
- `alias_collisions`: **0**
- `relationship_duplicates`: **0**

## 4. Complete localized cohort

| # | English | German | Arabic | Provider decision |
|---:|---|---|---|---|
| 1 | **Barbell Bench Press**<br>`barbell-bench-press` | Langhantel-Bankdrücken | ضغط البنش بالبار | verified |
| 2 | **Incline Dumbbell Bench Press**<br>`incline-dumbbell-bench-press` | Schrägbankdrücken mit Kurzhanteln | ضغط دمبل مائل | unlinked |
| 3 | **Push-Up**<br>`push-up` | Liegestütz | تمرين الضغط | unlinked |
| 4 | **Parallel-Bar Chest Dip**<br>`parallel-bar-chest-dip` | Brust-Dip am Barren | متوازي للصدر | unlinked |
| 5 | **Standing Cable Chest Fly**<br>`standing-cable-chest-fly` | Kabelzug-Flys im Stehen | تفتيح صدر بالكابل واقفًا | unlinked |
| 6 | **Pec Deck Fly**<br>`pec-deck-fly` | Butterfly an der Maschine | تفتيح صدر على جهاز البك ديك | unlinked |
| 7 | **Standing Barbell Overhead Press**<br>`standing-barbell-overhead-press` | Schulterdrücken mit Langhantel im Stehen | ضغط كتف بالبار واقفًا | verified |
| 8 | **Seated Dumbbell Shoulder Press**<br>`seated-dumbbell-shoulder-press` | Schulterdrücken mit Kurzhanteln im Sitzen | ضغط كتف بالدمبل جالسًا | unlinked |
| 9 | **Dumbbell Lateral Raise**<br>`dumbbell-lateral-raise` | Seitheben mit Kurzhanteln | رفرفة جانبية بالدمبل | verified |
| 10 | **Reverse Pec Deck Fly**<br>`reverse-pec-deck-fly` | Reverse Butterfly | رفرفة خلفية على جهاز البك ديك | unlinked |
| 11 | **Cable Face Pull**<br>`cable-face-pull` | Face Pull am Kabelzug | سحب الحبل نحو الوجه | unlinked |
| 12 | **Cable External Rotation**<br>`cable-external-rotation` | Außenrotation am Kabelzug | دوران خارجي للكتف بالكابل | unlinked |
| 13 | **Push-Up Plus**<br>`push-up-plus` | Liegestütz Plus | تمرين الضغط بلس | unlinked |
| 14 | **Pull-Up**<br>`pull-up` | Klimmzug im Obergriff | عقلة بقبضة علوية | unlinked |
| 15 | **Chin-Up**<br>`chin-up` | Klimmzug im Untergriff | عقلة بقبضة سفلية | unlinked |
| 16 | **Lat Pulldown**<br>`lat-pulldown` | Latzug | سحب علوي للظهر | verified |
| 17 | **Barbell Bent-Over Row**<br>`barbell-bent-over-row` | Vorgebeugtes Langhantelrudern | تجديف بالبار منحنيًا | unlinked |
| 18 | **One-Arm Dumbbell Row**<br>`one-arm-dumbbell-row` | Einarmiges Kurzhantelrudern | تجديف دمبل بذراع واحدة | unlinked |
| 19 | **Seated Cable Row**<br>`seated-cable-row` | Sitzendes Kabelrudern | تجديف بالكابل جالسًا | verified |
| 20 | **Chest-Supported Dumbbell Row**<br>`chest-supported-dumbbell-row` | Brustgestütztes Kurzhantelrudern | تجديف دمبل مع دعم الصدر | unlinked |
| 21 | **Straight-Arm Cable Pulldown**<br>`straight-arm-cable-pulldown` | Kabelzug-Pulldown mit gestreckten Armen | سحب كابل بذراعين مستقيمتين | unlinked |
| 22 | **Barbell Shrug**<br>`barbell-shrug` | Langhantel-Shrugs | هز الكتفين بالبار | unlinked |
| 23 | **45-Degree Back Extension**<br>`45-degree-back-extension` | Rückenstrecken an der 45-Grad-Bank | تمديد الظهر على مقعد 45 درجة | unlinked |
| 24 | **Farmer's Carry**<br>`farmers-carry` | Farmer’s Walk | مشية المزارع | unlinked |
| 25 | **Barbell Curl**<br>`barbell-curl` | Langhantelcurl | بايسبس بالبار | unlinked |
| 26 | **Dumbbell Hammer Curl**<br>`dumbbell-hammer-curl` | Hammer-Curl mit Kurzhanteln | هامر كيرل بالدمبل | unlinked |
| 27 | **Preacher Curl**<br>`preacher-curl` | Scott-Curl | بايسبس على مقعد سكوت | unlinked |
| 28 | **Cable Curl**<br>`cable-curl` | Kabelcurl | بايسبس بالكابل | unlinked |
| 29 | **Cable Triceps Pushdown**<br>`cable-triceps-pushdown` | Trizepsdrücken am Kabelzug | دفع ترايسبس بالكابل | verified |
| 30 | **Overhead Cable Triceps Extension**<br>`overhead-cable-triceps-extension` | Überkopf-Trizepsstrecken am Kabelzug | تمديد ترايسبس فوق الرأس بالكابل | unlinked |
| 31 | **Lying Triceps Extension**<br>`lying-triceps-extension` | Liegendes Trizepsstrecken | تمديد ترايسبس مستلقيًا | unlinked |
| 32 | **Close-Grip Barbell Bench Press**<br>`close-grip-barbell-bench-press` | Enges Langhantel-Bankdrücken | ضغط بنش بالبار بقبضة ضيقة | unlinked |
| 33 | **Barbell Back Squat**<br>`barbell-back-squat` | Kniebeuge mit Langhantel | سكوات خلفي بالبار | verified |
| 34 | **Barbell Front Squat**<br>`barbell-front-squat` | Frontkniebeuge mit Langhantel | سكوات أمامي بالبار | unlinked |
| 35 | **Goblet Squat**<br>`goblet-squat` | Goblet-Kniebeuge | سكوات غوبلت | unlinked |
| 36 | **Leg Press**<br>`leg-press` | Beinpresse | ضغط الأرجل | unlinked |
| 37 | **Bulgarian Split Squat**<br>`bulgarian-split-squat` | Bulgarische Kniebeuge | سكوات بلغاري | unlinked |
| 38 | **Walking Lunge**<br>`walking-lunge` | Ausfallschritt im Gehen | اندفاع بالمشي | unlinked |
| 39 | **Step-Up**<br>`step-up` | Aufsteigen auf eine Box | صعود على صندوق | unlinked |
| 40 | **Leg Extension**<br>`leg-extension` | Beinstrecken | تمديد الأرجل | unlinked |
| 41 | **Conventional Deadlift**<br>`conventional-deadlift` | Konventionelles Kreuzheben | ديدليفت تقليدي | unlinked |
| 42 | **Barbell Romanian Deadlift**<br>`barbell-romanian-deadlift` | Rumänisches Kreuzheben mit Langhantel | ديدليفت روماني بالبار | verified |
| 43 | **Good Morning**<br>`good-morning` | Good Morning mit Langhantel | جود مورنينغ بالبار | unlinked |
| 44 | **Barbell Hip Thrust**<br>`barbell-hip-thrust` | Hüftstoß mit Langhantel | دفع الورك بالبار | unlinked |
| 45 | **Glute Bridge**<br>`glute-bridge` | Gesäßbrücke | جسر الأرداف | unlinked |
| 46 | **Seated Leg Curl**<br>`seated-leg-curl` | Sitzender Beinbeuger | ثني الأرجل جالسًا | unlinked |
| 47 | **Lying Leg Curl**<br>`lying-leg-curl` | Liegender Beinbeuger | ثني الأرجل مستلقيًا | unlinked |
| 48 | **Hip Abduction Machine**<br>`hip-abduction-machine` | Hüftabduktion an der Maschine | إبعاد الورك على الجهاز | unlinked |
| 49 | **Hip Adduction Machine**<br>`hip-adduction-machine` | Hüftadduktion an der Maschine | ضم الورك على الجهاز | unlinked |
| 50 | **Standing Cable Hip Flexion**<br>`standing-cable-hip-flexion` | Hüftbeugung am Kabelzug im Stehen | ثني الورك بالكابل واقفًا | unlinked |
| 51 | **Standing Calf Raise**<br>`standing-calf-raise` | Wadenheben im Stehen | رفع السمانة واقفًا | unlinked |
| 52 | **Seated Calf Raise**<br>`seated-calf-raise` | Wadenheben im Sitzen | رفع السمانة جالسًا | unlinked |
| 53 | **Tibialis Raise**<br>`tibialis-raise` | Tibialisheben | رفع مشط القدم | unlinked |
| 54 | **Front Plank**<br>`front-plank` | Unterarmstütz | بلانك أمامي | verified |
| 55 | **Side Plank**<br>`side-plank` | Seitstütz | بلانك جانبي | unlinked |
| 56 | **Cable Crunch**<br>`cable-crunch` | Kabel-Crunch | كرنش بالكابل | unlinked |
| 57 | **Reverse Crunch**<br>`reverse-crunch` | Reverse Crunch | كرنش عكسي | unlinked |
| 58 | **Hanging Knee Raise**<br>`hanging-knee-raise` | Hängendes Knieheben | رفع الركبتين مع التعلق | unlinked |
| 59 | **Pallof Press**<br>`pallof-press` | Pallof Press | بالوف برس | unlinked |
| 60 | **Cable Wood Chop**<br>`cable-wood-chop` | Kabelzug-Holzhacker | تدوير الجذع بالكابل | unlinked |

## 5. Relationship registry

Relationship semantics describe the target relative to the source. Inverse navigation should be derived by the service rather than stored as duplicate rows.

| Source | Type | Target | Transfer | Rationale |
|---|---|---|---|---|
| `barbell-bench-press` | `variation` | `incline-dumbbell-bench-press` | `partial` | Changes bench angle and implement; prescription transfer is partial. |
| `barbell-bench-press` | `regression` | `push-up` | `partial` | Bodyweight horizontal press with lower absolute loading requirements. |
| `push-up` | `progression` | `parallel-bar-chest-dip` | `partial` | Generally increases upper-body loading and shoulder-extension demand. |
| `push-up` | `variation` | `push-up-plus` | `partial` | Adds deliberate end-range scapular protraction. |
| `standing-cable-chest-fly` | `alternative` | `pec-deck-fly` | `full` | Similar horizontal-adduction intent with different stability demands. |
| `standing-barbell-overhead-press` | `variation` | `seated-dumbbell-shoulder-press` | `partial` | Changes body support and unilateral implement control. |
| `reverse-pec-deck-fly` | `alternative` | `cable-face-pull` | `partial` | Both train posterior shoulder/upper back, but face pull adds external rotation. |
| `pull-up` | `variation` | `chin-up` | `partial` | Grip orientation shifts elbow-flexor contribution. |
| `pull-up` | `regression` | `lat-pulldown` | `partial` | Machine-based vertical pull permits adjustable external load. |
| `barbell-bent-over-row` | `regression` | `chest-supported-dumbbell-row` | `partial` | Chest support reduces trunk extensor demand. |
| `one-arm-dumbbell-row` | `alternative` | `seated-cable-row` | `partial` | Both are horizontal pulls with different support and unilateral demands. |
| `seated-cable-row` | `alternative` | `chest-supported-dumbbell-row` | `partial` | Comparable upper-back intent with different resistance and support. |
| `barbell-curl` | `alternative` | `cable-curl` | `full` | Same elbow-flexion pattern with different resistance profile. |
| `barbell-curl` | `variation` | `preacher-curl` | `partial` | Preacher support changes shoulder position and momentum tolerance. |
| `barbell-curl` | `variation` | `dumbbell-hammer-curl` | `partial` | Neutral grip shifts contribution toward forearm/elbow flexors. |
| `cable-triceps-pushdown` | `variation` | `overhead-cable-triceps-extension` | `partial` | Overhead position changes shoulder angle and long-head length. |
| `overhead-cable-triceps-extension` | `alternative` | `lying-triceps-extension` | `partial` | Both emphasize elbow extension with different load paths. |
| `close-grip-barbell-bench-press` | `regression` | `cable-triceps-pushdown` | `partial` | Isolation alternative reduces compound pressing demands. |
| `goblet-squat` | `progression` | `barbell-back-squat` | `partial` | Adds barbell loading and greater technical/loading capacity. |
| `barbell-back-squat` | `variation` | `barbell-front-squat` | `partial` | Changes bar position and torso/knee demands. |
| `barbell-back-squat` | `alternative` | `leg-press` | `partial` | Machine squat pattern reduces balance and trunk demands. |
| `barbell-back-squat` | `variation` | `bulgarian-split-squat` | `partial` | Unilateral squat pattern increases side-specific stability demand. |
| `walking-lunge` | `regression` | `step-up` | `partial` | Step-up generally provides a more constrained unilateral task. |
| `conventional-deadlift` | `variation` | `barbell-romanian-deadlift` | `partial` | Removes the floor start and emphasizes the hip hinge. |
| `conventional-deadlift` | `variation` | `good-morning` | `partial` | Moves the load to the upper back and removes hand/grip demand. |
| `glute-bridge` | `progression` | `barbell-hip-thrust` | `partial` | Adds external load and larger hip-extension loading capacity. |
| `seated-leg-curl` | `alternative` | `lying-leg-curl` | `full` | Both train knee flexion with different hip positions. |
| `standing-calf-raise` | `variation` | `seated-calf-raise` | `partial` | Knee angle changes gastrocnemius and soleus emphasis. |
| `front-plank` | `variation` | `side-plank` | `partial` | Changes the primary anti-movement demand from extension to lateral flexion. |
| `cable-crunch` | `variation` | `reverse-crunch` | `partial` | Both use trunk flexion but differ in segment emphasis and loading. |
| `reverse-crunch` | `progression` | `hanging-knee-raise` | `partial` | Hanging support increases grip, hip-flexion, and trunk-control demands. |
| `pallof-press` | `variation` | `cable-wood-chop` | `none` | Changes from anti-rotation to active rotational movement. |

## 6. Publication policy

An implementation may publish the mappings only when:

1. the machine-readable registry validates without modification;
2. the SQL payload exactly matches the deterministic UUIDs and checksums;
3. localizations, aliases, relationships, evidence, and review records pass all constraints;
4. only the nine verified provider links are inserted;
5. mapping publication uses the existing atomic publication function;
6. historical seed migrations remain unchanged;
7. the full migration chain and golden-plan tests pass;
8. no production migration, merge, or deployment occurs without separate authorization.

## 7. Remaining non-goals

- Train UI or Heat Map changes;
- session/history snapshot integration;
- Activity Catalog serving-policy changes;
- automatic provider matching;
- custom exercise UI;
- production application or PR merge.

## 8. Machine-readable authority

The attached JSON file is the exact implementation authority for the 60 exercises. This Markdown report is explanatory; where they differ, implementation must stop and report the conflict rather than guessing.
