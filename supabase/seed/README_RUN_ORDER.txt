RUN ORDER IN SUPABASE SQL EDITOR

The full 3105-row import is split because Supabase SQL Editor rejects one huge query.

Run these files one by one in this exact order:

1. 005_full_workout_video_import_part_01.sql
2. 005_full_workout_video_import_part_02.sql
3. 005_full_workout_video_import_part_03.sql
4. 005_full_workout_video_import_part_04.sql
5. 005_full_workout_video_import_part_05.sql
6. 005_full_workout_video_import_part_06.sql
7. 005_full_workout_video_import_part_07.sql
8. 005_full_workout_video_import_part_08.sql
9. 005_full_workout_video_import_part_09.sql
10. 002_sample_workouts_and_videos.sql
11. 006_check_workout_import.sql
12. Run ../migrations/009_workout_template_recommendations.sql
13. 007_muscle_strength_templates.sql
14. Run ../migrations/010_exercise_metadata_and_order.sql
15. 008_muscle_strength_exercise_metadata.sql

Expected count in exercise_videos: 3105.
Expected count from 008_muscle_strength_exercise_metadata.sql: 679 metadata-backed exercise rows.
Expected count in workout_templates from Muscle & Strength: 328.
Expected count in workout_template_exercises from Muscle & Strength: 8799.
Expected category_type counts:
- Equipment: 939
- Mechanics: 857
- Muscle Group: 1309

Put the chunk files in GitHub under: supabase/seed/workout_import_chunks/
Keep 002_sample_workouts_and_videos.sql under: supabase/seed/
