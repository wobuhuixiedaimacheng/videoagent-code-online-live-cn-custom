#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script ledger parser for AI video prompt preparation.

The parser does not replace human script review. It builds a local structured
ledger so the LLM can work from a compact view and still trace every item back
to the original line.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


RESERVED_SPEAKERS = {"场景", "人物", "出字幕", "字幕", "时间", "地点"}
VOICEOVER_NAMES = {"旁白", "画外音", "解说", "VO", "V.O.", "voiceover"}
INNER_OS_NAMES = {"内心", "内心OS", "OS", "心声", "独白"}


class ScriptParser:
    def __init__(self, canonical_map: Optional[Dict[str, Any]] = None) -> None:
        self.alias_maps = self._build_alias_maps(canonical_map or {})
        self.scene_pattern = re.compile(
            r"^\s*[【\[]?\s*场景\s*[:：]\s*(.+?)\s*[】\]]?\s*$|"
            r"^\s*(?:第?\d+[.-]\d*|[0-9]{1,3})\s*[-、.．]?\s*(.+?[，,].*)$"
        )
        self.dialogue_pattern = re.compile(
            r"^\s*([^\s:：]{1,18})\s*[（(]([^）)]+)[）)]\s*[:：]\s*(.+)$|"
            r"^\s*([^\s:：]{1,18})\s*[:：]\s*(.+)$"
        )

    def parse(self, script_text: str) -> Dict[str, Any]:
        lines = self._logical_lines(script_text)
        records: List[Dict[str, Any]] = []
        audio_ledger: List[Dict[str, Any]] = []
        action_ledger: List[Dict[str, Any]] = []
        warnings: List[Dict[str, Any]] = []

        current_scene: Optional[str] = None
        current_scene_canonical: Optional[str] = None

        for index, raw_line in enumerate(lines, start=1):
            raw = raw_line.rstrip("\n")
            stripped = raw.strip()
            if not stripped:
                continue

            record: Dict[str, Any] = {
                "line_id": index,
                "raw": raw,
                "type": "unknown",
                "confidence": 0.3,
                "scene": current_scene,
                "scene_canonical": current_scene_canonical,
            }

            scene_name = self._match_scene(stripped)
            if scene_name:
                current_scene = scene_name
                current_scene_canonical = self._canonical("scenes", scene_name)
                record.update(
                    {
                        "type": "scene",
                        "confidence": 0.9,
                        "scene": current_scene,
                        "scene_canonical": current_scene_canonical,
                    }
                )
                if self.alias_maps.get("scenes") and not current_scene_canonical:
                    warnings.append(self._warning(index, "unknown_scene_name", scene_name))
                records.append(record)
                continue

            special_type = self._match_special(stripped)
            if special_type:
                record.update({"type": special_type, "confidence": 0.85, "content": self._strip_special(stripped)})
                if special_type in {"flashback", "caption", "transition"}:
                    action_ledger.append(
                        {
                            "line_id": index,
                            "scene": current_scene,
                            "scene_canonical": current_scene_canonical,
                            "content": record["content"],
                            "type": special_type,
                        }
                    )
                records.append(record)
                continue

            dialogue = self._match_dialogue(stripped)
            if dialogue:
                speaker, emotion, content = dialogue
                inline_emotion, content = self._extract_leading_parenthetical(content)
                emotion = emotion or inline_emotion
                audio_type = self._audio_type(speaker, emotion)
                speaker_canonical = self._canonical("characters", speaker)
                duration = self.estimate_audio_duration(content, audio_type, emotion)
                record.update(
                    {
                        "type": audio_type,
                        "confidence": 0.88,
                        "speaker": speaker,
                        "speaker_canonical": speaker_canonical,
                        "emotion": emotion,
                        "content": content,
                        "duration_estimate": duration,
                    }
                )
                audio_ledger.append(
                    {
                        "line_id": index,
                        "scene": current_scene,
                        "scene_canonical": current_scene_canonical,
                        "speaker": speaker,
                        "speaker_canonical": speaker_canonical,
                        "type": audio_type,
                        "content": content,
                        "emotion": emotion,
                        "duration_estimate": duration,
                    }
                )
                if self.alias_maps.get("characters") and not speaker_canonical and audio_type == "dialogue":
                    warnings.append(self._warning(index, "unknown_character_name", speaker))
                if duration >= 15:
                    warnings.append(self._warning(index, "long_audio_unit", f"{duration}s: {content}"))
                records.append(record)
                continue

            if self._looks_like_action(stripped):
                clean_action = self._clean_action(stripped)
                record.update({"type": "action", "confidence": 0.75, "content": clean_action})
                action_ledger.append(
                    {
                        "line_id": index,
                        "scene": current_scene,
                        "scene_canonical": current_scene_canonical,
                        "content": clean_action,
                    }
                )
                records.append(record)
                continue

            record.update({"content": stripped})
            warnings.append(self._warning(index, "unclassified_line", stripped))
            records.append(record)

        validation_report = self._build_validation_report(records, audio_ledger, warnings)
        return {
            "lines": records,
            "audio_ledger": audio_ledger,
            "action_ledger": action_ledger,
            "work_view": self._build_work_view(audio_ledger, action_ledger),
            "validation_report": validation_report,
            "metadata": {
                "total_source_lines": len(lines),
                "parsed_lines": len(records),
                "audio_count": len(audio_ledger),
                "action_count": len(action_ledger),
                "scene_count": len({r.get("scene") for r in records if r.get("scene")}),
                "warning_count": len(warnings),
            },
        }

    def _logical_lines(self, script_text: str) -> List[str]:
        physical_lines = [line.strip() for line in script_text.splitlines()]
        logical: List[str] = []
        for line in physical_lines:
            if not line:
                continue
            if logical and not self._starts_new_record(line):
                logical[-1] = f"{logical[-1]}{line}"
            else:
                logical.append(line)
        return logical

    def _starts_new_record(self, line: str) -> bool:
        if self._match_scene(line):
            return True
        if line.startswith(("人物：", "人物:", "出字幕：", "出字幕:", "字幕：", "字幕:", "转场：", "转场:", "切至：", "切至:", "镜头闪回：", "镜头闪回:")):
            return True
        if line.startswith(("△", "▲", "※", "*", "-")):
            return True
        if re.match(r"^[（(【\[].+[）)】\]]$", line):
            return True
        if self.dialogue_pattern.match(line):
            return True
        return False

    def _match_scene(self, line: str) -> Optional[str]:
        match = self.scene_pattern.match(line)
        if not match:
            return None
        scene = match.group(1) or match.group(2)
        return scene.strip(" \t[]【】") if scene else None

    def _match_special(self, line: str) -> Optional[str]:
        if line.startswith(("人物：", "人物:")):
            return "character_list"
        if line.startswith(("出字幕：", "出字幕:", "字幕：", "字幕:")):
            return "caption"
        if line.startswith(("转场：", "转场:", "切至：", "切至:")):
            return "transition"
        if line.startswith(("镜头闪回：", "镜头闪回:")):
            return "flashback"
        return None

    def _strip_special(self, line: str) -> str:
        return re.sub(r"^[^:：]+[:：]\s*", "", line).strip()

    def _match_dialogue(self, line: str) -> Optional[Tuple[str, Optional[str], str]]:
        match = self.dialogue_pattern.match(line)
        if not match:
            return None
        if match.group(1):
            speaker = match.group(1).strip().rstrip("@")
            emotion = match.group(2).strip()
            content = match.group(3).strip()
        else:
            speaker = match.group(4).strip().rstrip("@")
            emotion = None
            content = match.group(5).strip()
        if speaker in RESERVED_SPEAKERS:
            return None
        return speaker, emotion, content

    def _extract_leading_parenthetical(self, content: str) -> Tuple[Optional[str], str]:
        match = re.match(r"^[（(]([^）)]+)[）)]\s*(.+)$", content)
        if not match:
            return None, content
        return match.group(1).strip(), match.group(2).strip()

    def _looks_like_action(self, line: str) -> bool:
        if line.startswith(("△", "▲", "※", "*", "-")):
            return True
        if re.match(r"^[（(【\[].+[）)】\]]$", line):
            return True
        if "：" not in line and ":" not in line:
            return True
        return False

    def _clean_action(self, line: str) -> str:
        return line.strip().lstrip("△▲※*- ").strip("（）()[]【】")

    def _audio_type(self, speaker: str, emotion: Optional[str]) -> str:
        speaker_key = speaker.strip()
        emotion_key = emotion or ""
        if speaker_key in VOICEOVER_NAMES:
            return "voiceover"
        if speaker_key in INNER_OS_NAMES or any(key in emotion_key for key in ("内心", "OS", "心声")):
            return "inner_os"
        if any(key in emotion_key for key in ("旁白", "画外音", "解说", "VO")):
            return "voiceover"
        return "dialogue"

    def estimate_audio_duration(self, content: str, audio_type: str, emotion: Optional[str]) -> int:
        chinese_chars = re.findall(r"[\u4e00-\u9fff]", content)
        latin_words = re.findall(r"[A-Za-z0-9]+", content)
        weighted_count = len(chinese_chars) + len(latin_words)

        speed = 4.5
        emotion_text = emotion or ""
        if audio_type == "inner_os" or any(key in emotion_text for key in ("低声", "轻声", "沉重", "缓慢")):
            speed = 3.5
        if any(key in emotion_text for key in ("急促", "高声", "怒吼", "大喊", "尖叫")):
            speed = 5.5

        pause_time = 0.0
        pause_time += len(re.findall(r"[。！？!?]", content)) * 1.0
        pause_time += len(re.findall(r"[，,；;]", content)) * 0.5
        pause_time += len(re.findall(r"…|\.{3,}", content)) * 1.5

        duration = weighted_count / speed + pause_time
        return max(2, int(round(duration + 0.49)))

    def _build_work_view(
        self, audio_ledger: List[Dict[str, Any]], action_ledger: List[Dict[str, Any]]
    ) -> Dict[str, List[Dict[str, Any]]]:
        grouped: Dict[str, Dict[str, List[Dict[str, Any]]]] = defaultdict(lambda: {"audio": [], "actions": []})
        for item in audio_ledger:
            key = item.get("scene_canonical") or item.get("scene") or "未标场景"
            grouped[key]["audio"].append(
                {
                    "line_id": item["line_id"],
                    "speaker": item["speaker_canonical"] or item["speaker"],
                    "type": item["type"],
                    "content": item["content"],
                    "duration_estimate": item["duration_estimate"],
                }
            )
        for item in action_ledger:
            key = item.get("scene_canonical") or item.get("scene") or "未标场景"
            grouped[key]["actions"].append({"line_id": item["line_id"], "content": item["content"]})
        return [{"scene": scene, **payload} for scene, payload in grouped.items()]

    def _build_validation_report(
        self,
        records: List[Dict[str, Any]],
        audio_ledger: List[Dict[str, Any]],
        warnings: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        scene_names = [r.get("scene") for r in records if r.get("type") == "scene" and r.get("scene")]
        speaker_names = [a.get("speaker") for a in audio_ledger if a.get("speaker")]
        duplicate_scene_names = [name for name, count in Counter(scene_names).items() if count > 1]

        return {
            "warnings": warnings,
            "duplicate_scene_names": duplicate_scene_names,
            "speakers": sorted(set(speaker_names)),
            "audio_total_duration_estimate": sum(a["duration_estimate"] for a in audio_ledger),
        }

    def _warning(self, line_id: int, code: str, detail: str) -> Dict[str, Any]:
        return {"line_id": line_id, "code": code, "detail": detail}

    def _canonical(self, category: str, name: Optional[str]) -> Optional[str]:
        if not name:
            return None
        return self.alias_maps.get(category, {}).get(name)

    def _build_alias_maps(self, raw_map: Dict[str, Any]) -> Dict[str, Dict[str, str]]:
        result: Dict[str, Dict[str, str]] = {"characters": {}, "scenes": {}, "props": {}}
        for category in result:
            entries = raw_map.get(category, {})
            if not isinstance(entries, dict):
                continue
            for canonical, value in entries.items():
                result[category][canonical] = canonical
                if isinstance(value, list):
                    aliases = value
                elif isinstance(value, dict):
                    aliases = value.get("aliases", [])
                elif isinstance(value, str):
                    result[category][canonical] = value
                    continue
                else:
                    aliases = []
                for alias in aliases:
                    result[category][str(alias)] = canonical
        return result


def load_canonical_map(path: Optional[str]) -> Dict[str, Any]:
    if not path:
        return {}
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def render_jsonl(records: List[Dict[str, Any]]) -> str:
    return "\n".join(json.dumps(record, ensure_ascii=False) for record in records)


def main() -> None:
    cli = argparse.ArgumentParser(description="Parse a script into a local production ledger.")
    cli.add_argument("script", nargs="?", help="Script file path. Use --stdin to read stdin.")
    cli.add_argument("--stdin", action="store_true", help="Read script text from stdin.")
    cli.add_argument("--canonical-map", help="Optional reviewed naming table JSON.")
    cli.add_argument(
        "--format",
        choices=["full", "work-view", "audio-ledger", "lines-jsonl"],
        default="full",
        help="Output format.",
    )
    args = cli.parse_args()

    if args.stdin:
        script_text = sys.stdin.read()
    elif args.script:
        script_text = Path(args.script).read_text(encoding="utf-8")
    else:
        cli.error("provide a script path or --stdin")

    parser = ScriptParser(load_canonical_map(args.canonical_map))
    parsed = parser.parse(script_text)

    if args.format == "lines-jsonl":
        print(render_jsonl(parsed["lines"]))
    elif args.format == "work-view":
        print(json.dumps(parsed["work_view"], ensure_ascii=False, indent=2))
    elif args.format == "audio-ledger":
        print(json.dumps(parsed["audio_ledger"], ensure_ascii=False, indent=2))
    else:
        print(json.dumps(parsed, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
