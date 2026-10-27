from pathlib import Path

import yaml

WORKFLOW = Path(__file__).parents[5] / ".github" / "workflows" / "capacity.yml"


def _workflow():
    return yaml.safe_load(WORKFLOW.read_text())


def test_runs_on_merge_to_main_and_nightly():
    wf = _workflow()
    on = wf[True] if True in wf else wf["on"]  # YAML 1.1 parses the key `on` as True
    assert on["push"]["branches"] == ["main"]
    assert on["schedule"][0]["cron"]


def test_runner_step_must_pass():
    steps = [s for j in _workflow()["jobs"].values() for s in j["steps"]]
    runner = [s for s in steps if "python -m loadtest.runner" in s.get("run", "")]
    assert runner
    assert not any(s.get("continue-on-error") for s in runner)
