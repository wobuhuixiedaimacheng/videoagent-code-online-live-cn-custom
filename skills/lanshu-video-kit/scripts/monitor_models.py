#!/usr/bin/env python3
"""
11 模型版本监控脚本

每周由 GitHub Action 调度运行。抓取各模型官方页面内容,对比已知 hash baseline。
检测到变化时,输出 markdown 报告 + GH issue body。

依赖:
    pip install requests pyyaml

用法:
    # 本地测试
    python3 scripts/monitor_models.py

    # CI 模式(只输出 GH Action 可消费的 JSON)
    python3 scripts/monitor_models.py --ci

    # 刷新 baseline(初次或维护者主动校准)
    python3 scripts/monitor_models.py --rebaseline
"""

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path

try:
    import yaml
    import requests
except ImportError:
    print("缺少依赖:pip install requests pyyaml", file=sys.stderr)
    sys.exit(1)

SCRIPT_DIR = Path(__file__).parent
ENDPOINTS_FILE = SCRIPT_DIR / "model_endpoints.yaml"
BASELINE_FILE = SCRIPT_DIR / "known_hashes.json"


def load_endpoints():
    with open(ENDPOINTS_FILE, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_baseline():
    if BASELINE_FILE.exists():
        with open(BASELINE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_baseline(baseline):
    with open(BASELINE_FILE, "w", encoding="utf-8") as f:
        json.dump(baseline, f, indent=2, ensure_ascii=False, sort_keys=True)


def normalize_content(content, noise_patterns):
    """去除已知噪音(timestamps/nonces/etc)再计算 hash。"""
    for pattern in noise_patterns:
        content = re.sub(pattern, "", content, flags=re.DOTALL)
    # 去除多余空白
    content = re.sub(r"\s+", " ", content).strip()
    return content


def fetch_url(url, config):
    """抓取 URL 内容,返回 (hash, content_size, error)。"""
    headers = {"User-Agent": config.get("user_agent", "lanshu-monitor/1.0")}
    timeout = config.get("timeout_seconds", 20)
    retries = config.get("retry_attempts", 3)
    noise_patterns = config.get("noise_patterns", [])

    last_err = None
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
            if r.status_code >= 400:
                last_err = f"HTTP {r.status_code}"
                continue
            normalized = normalize_content(r.text, noise_patterns)
            h = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]
            return h, len(r.text), None
        except Exception as e:
            last_err = str(e)
            time.sleep(2**attempt)
    return None, 0, last_err


def detect_version_hints(url, content):
    """在页面里粗略查找版本号关键词,辅助 issue body 生成。"""
    if not content:
        return []
    patterns = [
        r"\bv?\d+\.\d+(?:\.\d+)?\b",
        r"\b(?:Gen|version|version|版本)\s*[-_]?\s*\d+\.?\d*",
        r"\b(?:Sora|Veo|Kling|Wan|Hailuo|Hunyuan|Pika|Runway)[-_\s]\d+\.?\d*",
    ]
    hints = set()
    for p in patterns:
        for m in re.findall(p, content, flags=re.IGNORECASE):
            if isinstance(m, tuple):
                m = m[0]
            if 2 <= len(m) <= 30:
                hints.add(m.strip())
    return sorted(hints)[:10]


def monitor(rebaseline=False, ci=False):
    spec = load_endpoints()
    baseline = {} if rebaseline else load_baseline()
    config = spec.get("config", {})
    models = spec.get("models", {})

    changes = []  # list of dicts: model, url, old_hash, new_hash, version_hints
    errors = []
    new_baseline = dict(baseline)

    for model_id, info in models.items():
        for url in info.get("endpoints", []):
            print(f"[{model_id}] checking {url}", file=sys.stderr)
            new_hash, size, err = fetch_url(url, config)
            if err:
                errors.append({"model": model_id, "url": url, "error": err})
                continue
            old_hash = baseline.get(url)
            new_baseline[url] = new_hash
            if rebaseline:
                continue
            if old_hash is None:
                # 新加入的端点,首次记录,不算作变化
                continue
            if old_hash != new_hash:
                # 抓取一次完整内容用来找版本提示
                try:
                    r = requests.get(url, headers={"User-Agent": config.get("user_agent", "")}, timeout=10)
                    hints = detect_version_hints(url, r.text) if r.status_code < 400 else []
                except Exception:
                    hints = []
                changes.append({
                    "model": model_id,
                    "vendor": info.get("vendor", ""),
                    "current_version": info.get("current_version", ""),
                    "url": url,
                    "old_hash": old_hash,
                    "new_hash": new_hash,
                    "version_hints": hints,
                })

    # 保存新 baseline
    save_baseline(new_baseline)

    # 输出
    if ci:
        # GitHub Action 消费的结构化 JSON
        output = {
            "changes_count": len(changes),
            "errors_count": len(errors),
            "changes": changes,
            "errors": errors,
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        # 人工查看的 markdown
        print("\n" + "=" * 60)
        print(f"📊 监控完成 | 变化: {len(changes)} | 错误: {len(errors)}")
        print("=" * 60)
        if changes:
            print("\n## 🚨 发现变化的端点\n")
            for c in changes:
                print(f"### {c['model']} ({c['vendor']}) — 当前记录版本: {c['current_version']}")
                print(f"- URL: {c['url']}")
                print(f"- Hash: `{c['old_hash']}` → `{c['new_hash']}`")
                if c["version_hints"]:
                    print(f"- 页面发现版本关键词: {', '.join(f'`{h}`' for h in c['version_hints'])}")
                print()
        if errors:
            print("\n## ⚠️ 抓取失败\n")
            for e in errors:
                print(f"- [{e['model']}] {e['url']} → {e['error']}")

    return changes


def make_issue_body(changes):
    """生成 GH issue body 文本(供 workflow 调用)。"""
    if not changes:
        return None
    lines = [
        "## 🚨 模型官方页面发现变化",
        "",
        f"本周 GitHub Action 监控发现 **{len(changes)}** 个端点变化,可能意味着新版本/新文档/新功能。",
        "",
        "**请人工 review 这些链接**,如有新版本,提交 [新版本/新模型 issue](/.github/ISSUE_TEMPLATE/new-version-or-model.yml) 跟进。",
        "",
        "---",
        "",
    ]
    for c in changes:
        lines += [
            f"### {c['model']} · {c['vendor']}",
            "",
            f"- **当前记录版本**: `{c['current_version']}`",
            f"- **URL**: {c['url']}",
            f"- **Hash 变化**: `{c['old_hash']}` → `{c['new_hash']}`",
        ]
        if c["version_hints"]:
            lines.append(f"- **页面发现版本关键词**: {', '.join(f'`{h}`' for h in c['version_hints'])}")
        lines += ["", "---", ""]
    lines += [
        "",
        "> 这是自动生成的 issue。校准 baseline 请运行 `python3 scripts/monitor_models.py --rebaseline`。",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--ci", action="store_true", help="输出 JSON 供 CI 消费")
    p.add_argument("--rebaseline", action="store_true", help="重新校准 hash baseline(本次不报变化)")
    p.add_argument("--issue-body", action="store_true", help="输出 GH issue body 后退出")
    args = p.parse_args()
    changes = monitor(rebaseline=args.rebaseline, ci=args.ci)
    if args.issue_body:
        body = make_issue_body(changes)
        if body:
            print(body)
            sys.exit(0)
        else:
            sys.exit(1)  # 无变化,workflow 不创建 issue
    sys.exit(0)
