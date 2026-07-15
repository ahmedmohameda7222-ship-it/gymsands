from pathlib import Path

script_path = Path("scripts/pr60-final-rls-correction.py")
script = script_path.read_text(encoding="utf-8")
start = script.index("old_assertion = (\n")
end = script.index("if integration.count(old_assertion)", start)
replacement = '''old_assertion = r"""expect(sql("select to_regprocedure('public.is_admin()') is null, to_regprocedure('private.is_admin()') is not null")).toBe("t\\tt");"""
new_assertion = r"""expect(sql("select to_regprocedure('public.is_admin()') is null, to_regprocedure('private.is_admin()') is not null, to_regprocedure('private.can_access_workout_plan(uuid)') is not null")).toBe("t\\tt\\tt");"""
'''
script_path.write_text(script[:start] + replacement + script[end:], encoding="utf-8")
