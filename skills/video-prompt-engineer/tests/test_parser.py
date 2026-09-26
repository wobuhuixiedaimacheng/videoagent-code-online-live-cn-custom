import importlib.util
import json
import re
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PARSER_PATH = ROOT / "scripts" / "parser.py"
SCRIPT_PATH = ROOT / "examples" / "urban-reveal" / "script.txt"
ASSET_PATH = ROOT / "examples" / "urban-reveal" / "assets.json"
OUTPUT_PATH = ROOT / "examples" / "urban-reveal" / "expected-output.md"

SPEC = importlib.util.spec_from_file_location("video_prompt_parser", PARSER_PATH)
PARSER_MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(PARSER_MODULE)


class ScriptParserTests(unittest.TestCase):
    def setUp(self) -> None:
        self.script_text = SCRIPT_PATH.read_text(encoding="utf-8")
        self.asset_map = json.loads(ASSET_PATH.read_text(encoding="utf-8"))
        self.parsed = PARSER_MODULE.ScriptParser(self.asset_map).parse(self.script_text)

    def test_demo_preserves_all_voiced_lines(self) -> None:
        self.assertEqual(self.parsed["metadata"]["audio_count"], 6)
        contents = [item["content"] for item in self.parsed["audio_ledger"]]
        self.assertEqual(len(contents), len(set(contents)))
        self.assertIn("供应商走侧门，别在这里添乱。", contents)
        self.assertIn("会议开始前，把临时供应商名单撤下来。", contents)

    def test_demo_detects_scene_and_actions(self) -> None:
        self.assertEqual(self.parsed["metadata"]["scene_count"], 1)
        self.assertGreaterEqual(self.parsed["metadata"]["action_count"], 7)
        self.assertEqual(
            self.parsed["lines"][0]["scene_canonical"],
            "澜庭酒店宴会厅入口，夜",
        )

    def test_reviewed_character_names_resolve(self) -> None:
        warnings = self.parsed["validation_report"]["warnings"]
        unknown_characters = [
            warning for warning in warnings if warning["code"] == "unknown_character_name"
        ]
        self.assertEqual(unknown_characters, [])
        speakers = {item["speaker_canonical"] for item in self.parsed["audio_ledger"]}
        self.assertEqual(speakers, {"林晚", "程峥", "许薇", "陈经理"})

    def test_cli_work_view_is_valid_json(self) -> None:
        completed = subprocess.run(
            [
                sys.executable,
                str(PARSER_PATH),
                str(SCRIPT_PATH),
                "--canonical-map",
                str(ASSET_PATH),
                "--format",
                "work-view",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        work_view = json.loads(completed.stdout)
        self.assertEqual(len(work_view), 1)
        self.assertEqual(work_view[0]["scene"], "澜庭酒店宴会厅入口，夜")

    def test_expected_output_covers_each_audio_unit_once(self) -> None:
        output_text = OUTPUT_PATH.read_text(encoding="utf-8")
        for item in self.parsed["audio_ledger"]:
            self.assertEqual(
                output_text.count(item["content"]),
                1,
                msg=f'Audio unit must appear once: {item["content"]}',
            )

    def test_expected_output_timestamps_match_declared_duration(self) -> None:
        output_text = OUTPUT_PATH.read_text(encoding="utf-8")
        rows = [line for line in output_text.splitlines() if re.match(r"^\| \d{2} \|", line)]
        self.assertEqual(len(rows), 4)
        for row in rows:
            ranges = [
                (int(start), int(end))
                for start, end in re.findall(r"(\d+)[–-](\d+)秒", row)
            ]
            declared = int(re.search(r"\| (\d+)s \|$", row).group(1))
            self.assertTrue(ranges)
            self.assertEqual(max(end for _, end in ranges), declared)


if __name__ == "__main__":
    unittest.main()
