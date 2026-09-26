# Automation and public API matrix — 2026-07-12

> 本文件记录首次基线执行，里面的 `qa:flow` 失败已修复并被后续全量复测取代。最终结果：180 / 180 测试通过、typecheck 通过、生产构建通过、`qa:flow` 通过。最终结论见 `qa-report-localhost-3000-2026-07-12.md`。

Run completed: 2026-07-12 12:26:21 +08:00  
Target: `http://localhost:3000`  
Method: black-box HTTP only; response bodies were reduced to non-secret status metadata. No API keys, tokens, base URLs, prompts, generated copy, or patch bodies are stored here.

## Automation

| Check | Result | Duration | Stable result |
|---|---:|---:|---|
| `npm run typecheck` | PASS | 0.90 s | Exit 0 |
| Project tests via `node --test` | PASS | 1.64 s runner time | 168 passed, 0 failed |
| `npm run build` | PASS | 10.87 s | Exit 0; Next compile and integrated lint/type validity passed |
| `npm run qa:flow` | FAIL | 50.74 s | Exit 1; `Timed out waiting for demo script stage; last value: false` |
| Standalone `lint` package script | PASS | N/A | Not defined; equivalent lint/type validity ran inside `next build` and passed |
| Standalone `test` package script | PASS | N/A | Not defined; all 15 project test files were run directly |

Overall automation: **FAIL**. The regression flow timeout is the only product-check failure observed.

## Public API smoke

| Request | Expected | Result | Time | HTTP / stable error | Safe observations |
|---|---|---:|---:|---|---|
| `GET /api/health` | Service health response | PASS | 39 ms | `200` | `ok=true`; selected text provider reported as configured |
| `GET /api/model-config` | Read-only configuration status | PASS | 75 ms | `200` | Returned `ok`, `writable`, `authRequired`, `mode`, `provider`; secrets were not retained |
| `POST /api/agent/run` with `{}` | Reject missing required fields | PASS | 189 ms | `400` — `instruction and workspace are required` | No model generation requested |
| `POST /api/agent/run` with legal minimal body | Accept valid request | PASS | 9,281 ms | `200` | `mode=live`, provider=`custom`, 9 patch operations and 1 tool event; no image/video endpoint was called |
| `POST /api/image/render` with `{}` | Reject missing prompt | PASS | 190 ms | `400` — `prompt is required` | Validation stopped before image generation |
| `GET /api/video/render` without `video_id` | Reject missing task ID | PASS | 109 ms | `400` — `video_id is required` | Validation-only request |
| `POST /api/video/render` with `{}` | Reject missing prompt | PASS | 41 ms | `400` — `prompt is required` | Validation stopped before video generation |

Overall public API smoke: **PASS**. All success and validation paths returned stable non-5xx statuses. No real image or video generation was submitted.

## Notes

- The legal minimal Agent request exercised the configured text provider once because the target service reported a live custom provider. The response was inspected only for status, mode, provider, key set, and counts; generated content was discarded.
- The request explicitly prohibited image generation, video generation, publishing, and external tools. Image/video routes were tested only with missing-parameter inputs.
- The Agent request returned nine patch operations despite the answer-only smoke instruction. This does not fail the HTTP smoke contract, but it is a behavioral observation worth covering with a separate intent/no-patch test if answer-only requests are expected to remain read-only.
- Full automation command output is in `automation-20260712.log`.
