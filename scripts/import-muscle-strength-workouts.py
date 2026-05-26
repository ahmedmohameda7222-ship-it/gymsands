#!/usr/bin/env python3
"""Build an idempotent Supabase seed file for Muscle & Strength workout templates.

Examples:
  python scripts/import-muscle-strength-workouts.py --workbook C:/path/muscleandstrength_workouts_clean.xlsx
  python scripts/import-muscle-strength-workouts.py --workouts-csv workouts.csv --exercises-csv program_exercises.csv
"""

from __future__ import annotations

import argparse
import csv
import math
import re
from collections import OrderedDict
from pathlib import Path
from typing import Any, Iterable


DEFAULT_OUTPUT = Path("supabase/seed/007_muscle_strength_templates.sql")
WORKOUT_COLUMNS = [
    "Title",
    "Main Goal",
    "Workout Type",
    "Training Level",
    "Program Duration",
    "Days Per Week",
    "Time Per Workout",
    "Equipment Required",
    "Target Gender",
]
EXERCISE_COLUMNS = ["Title", "Day title", "Exercise order", "Exercise", "Sets", "Reps"]


def read_rows_from_workbook(path: Path, sheet_name: str) -> list[dict[str, Any]]:
    try:
      import pandas as pd
    except ImportError as exc:
      raise SystemExit("Reading .xlsx files requires pandas and openpyxl. Export CSV files or install those packages.") from exc

    frame = pd.read_excel(path, sheet_name=sheet_name)
    return frame.replace({float("nan"): None}).to_dict(orient="records")


def read_rows_from_csv(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def clean_text(value: Any, fallback = "") -> str:
    if value is None:
        return fallback
    if isinstance(value, float) and math.isnan(value):
        return fallback
    return str(value).strip() or fallback


def parse_int(value: Any, fallback: int) -> int:
    text = clean_text(value)
    match = re.search(r"\d+", text)
    return int(match.group(0)) if match else fallback


def parse_duration_weeks(value: Any) -> int:
    return max(1, parse_int(value, 8))


def parse_equipment(value: Any) -> list[str]:
    text = clean_text(value)
    if not text:
        return []
    return [item.strip() for item in text.split(",") if item.strip()]


def sql_string(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return "null"
    return "'" + text.replace("'", "''") + "'"


def sql_int(value: Any, fallback: int) -> str:
    return str(parse_int(value, fallback))


def sql_array(values: Iterable[str]) -> str:
    cleaned = [value for value in values if value]
    if not cleaned:
        return "'{}'::text[]"
    escaped = ",".join('"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"' for value in cleaned)
    return f"'{{{escaped}}}'::text[]"


def chunked(values: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


def validate_columns(rows: list[dict[str, Any]], required: list[str], label: str) -> None:
    if not rows:
        raise SystemExit(f"{label} has no rows.")
    missing = [column for column in required if column not in rows[0]]
    if missing:
        raise SystemExit(f"{label} is missing required columns: {', '.join(missing)}")


def build_seed(workouts: list[dict[str, Any]], exercise_rows: list[dict[str, Any]]) -> str:
    validate_columns(workouts, WORKOUT_COLUMNS, "workouts")
    validate_columns(exercise_rows, EXERCISE_COLUMNS, "program_exercises")

    workout_values = []
    for row in workouts:
        workout_values.append(
            "("
            f"{sql_string(row['Title'])},"
            f"{sql_string(row['Main Goal'])},"
            f"{sql_string(row['Workout Type'])},"
            f"{sql_string(row['Training Level'])},"
            f"{parse_duration_weeks(row['Program Duration'])},"
            f"{parse_int(row['Days Per Week'], 3)},"
            f"{sql_string(row.get('Time Per Workout'))},"
            f"{sql_array(parse_equipment(row['Equipment Required']))},"
            f"{sql_string(row['Target Gender'])}"
            ")"
        )

    day_index_by_title: dict[str, OrderedDict[str, int]] = {}
    exercise_values = []
    for row in exercise_rows:
        title = clean_text(row["Title"])
        day_title = clean_text(row["Day title"], "Workout day")
        if not title:
            continue
        title_days = day_index_by_title.setdefault(title, OrderedDict())
        if day_title not in title_days:
            title_days[day_title] = len(title_days) + 1
        day_index = title_days[day_title]
        exercise_order = sum(1 for value in exercise_values if value[0] == title and value[1] == day_index) + 1
        exercise_values.append(
            (
                title,
                day_index,
                exercise_order,
                clean_text(row["Exercise"], "Exercise"),
                clean_text(row.get("Sets")),
                clean_text(row.get("Reps")),
            )
        )

    day_values = []
    for title, days in day_index_by_title.items():
        for day_title, day_index in days.items():
            day_values.append(f"({sql_string(title)},{day_index},{sql_string(day_title)})")

    exercise_sql_values = [
        "("
        f"{sql_string(title)},"
        f"{day_index},"
        f"{exercise_order},"
        f"{sql_string(exercise_name)},"
        f"{sql_string(sets)},"
        f"{sql_string(reps)}"
        ")"
        for title, day_index, exercise_order, exercise_name, sets, reps in exercise_values
    ]

    lines = [
        "-- Muscle & Strength workout template import",
        "-- Generated from the cleaned workbook by scripts/import-muscle-strength-workouts.py.",
        "-- Run after supabase/migrations/009_workout_template_recommendations.sql.",
        "",
        "create temp table _muscle_strength_workouts (",
        "  title text not null,",
        "  main_goal text not null,",
        "  workout_type text,",
        "  training_level text not null,",
        "  program_duration_weeks int not null,",
        "  days_per_week int not null,",
        "  time_per_workout text,",
        "  equipment_required text[] not null,",
        "  target_gender text not null",
        ") on commit drop;",
        "",
        "create temp table _muscle_strength_days (",
        "  title text not null,",
        "  day_index int not null,",
        "  day_title text not null",
        ") on commit drop;",
        "",
        "create temp table _muscle_strength_exercises (",
        "  title text not null,",
        "  day_index int not null,",
        "  exercise_order int not null,",
        "  exercise_name text not null,",
        "  sets text,",
        "  reps text",
        ") on commit drop;",
        "",
    ]

    for batch in chunked(workout_values, 350):
        lines.append("insert into _muscle_strength_workouts values")
        lines.append(",\n".join(batch) + ";")
        lines.append("")

    for batch in chunked(day_values, 600):
        lines.append("insert into _muscle_strength_days values")
        lines.append(",\n".join(batch) + ";")
        lines.append("")

    for batch in chunked(exercise_sql_values, 500):
        lines.append("insert into _muscle_strength_exercises values")
        lines.append(",\n".join(batch) + ";")
        lines.append("")

    lines.extend([
        "insert into public.workout_templates (",
        "  title, main_goal, workout_type, training_level, program_duration_weeks,",
        "  days_per_week, time_per_workout, equipment_required, target_gender",
        ")",
        "select title, main_goal, workout_type, training_level, program_duration_weeks,",
        "  days_per_week, time_per_workout, equipment_required, target_gender",
        "from _muscle_strength_workouts",
        "on conflict (title) do update set",
        "  main_goal = excluded.main_goal,",
        "  workout_type = excluded.workout_type,",
        "  training_level = excluded.training_level,",
        "  program_duration_weeks = excluded.program_duration_weeks,",
        "  days_per_week = excluded.days_per_week,",
        "  time_per_workout = excluded.time_per_workout,",
        "  equipment_required = excluded.equipment_required,",
        "  target_gender = excluded.target_gender,",
        "  updated_at = now();",
        "",
        "insert into public.workout_template_days (workout_template_id, day_index, day_title)",
        "select t.id, d.day_index, d.day_title",
        "from _muscle_strength_days d",
        "join public.workout_templates t on t.title = d.title",
        "on conflict (workout_template_id, day_index) do update set",
        "  day_title = excluded.day_title,",
        "  updated_at = now();",
        "",
        "insert into public.workout_template_exercises (",
        "  workout_template_day_id, exercise_order, exercise_name, sets, reps",
        ")",
        "select d.id, e.exercise_order, e.exercise_name, e.sets, e.reps",
        "from _muscle_strength_exercises e",
        "join public.workout_templates t on t.title = e.title",
        "join public.workout_template_days d on d.workout_template_id = t.id and d.day_index = e.day_index",
        "on conflict (workout_template_day_id, exercise_order) do update set",
        "  exercise_name = excluded.exercise_name,",
        "  sets = excluded.sets,",
        "  reps = excluded.reps,",
        "  updated_at = now();",
        "",
        "select",
        "  (select count(*) from public.workout_templates) as workout_templates,",
        "  (select count(*) from public.workout_template_days) as workout_template_days,",
        "  (select count(*) from public.workout_template_exercises) as workout_template_exercises;",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", type=Path, help="Path to the cleaned .xlsx workbook.")
    parser.add_argument("--workouts-csv", type=Path, help="CSV export of the workouts sheet.")
    parser.add_argument("--exercises-csv", type=Path, help="CSV export of the program_exercises sheet.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if args.workbook:
        workouts = read_rows_from_workbook(args.workbook, "workouts")
        exercises = read_rows_from_workbook(args.workbook, "program_exercises")
    elif args.workouts_csv and args.exercises_csv:
        workouts = read_rows_from_csv(args.workouts_csv)
        exercises = read_rows_from_csv(args.exercises_csv)
    else:
        raise SystemExit("Provide --workbook or both --workouts-csv and --exercises-csv.")

    sql = build_seed(workouts, exercises)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(sql, encoding="utf-8")
    print(f"Wrote {args.output} from {len(workouts)} workouts and {len(exercises)} exercise rows.")


if __name__ == "__main__":
    main()
