# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-08-26

### Added

- Squad tools (MRR-15): `multica_list_squads`, `multica_get_squad`,
  `multica_create_squad`, `multica_update_squad`, `multica_squad_member_add`,
  `multica_squad_member_remove`, `multica_squad_member_set_role`. All shell
  out through the same `multica` CLI process as every other tool, so
  workspace scoping and auth are unchanged — no new credential surface.
- `multica_create_issue` / `multica_update_issue`: `assignee` now also
  fuzzy-matches squad names (previously agent-only), and a new `assignee_id`
  field takes an exact agent/squad UUID directly (mutually exclusive with
  `assignee`). Assigning to a squad routes execution to that squad's leader
  agent per Multica's routing rules.
- `multica_list_issues`, `multica_get_issue`, `multica_issue_search`: the
  `assignee` field in results now resolves squad-assigned issues to the
  squad's name instead of falling back to a raw UUID.

## [0.3.0] - 2026-04-19

### Added

- New HIGH priority tools:
  - `multica_issue_search` — search issues by text in title or description,
    with a native-CLI path and a fetch+filter fallback.
  - `multica_attachment_download` — download attachment files locally.
  - `multica_autopilot_trigger_add`, `multica_autopilot_trigger_update`,
    `multica_autopilot_trigger_delete` — manage cron triggers for autopilots.
- New MEDIUM priority tools:
  - `multica_issue_runs` — list all execution runs for an issue.
  - `multica_issue_run_messages` — list messages for a run (supports `since`).
  - `multica_list_comments` — paginated comment listing with `since` filter.
  - `multica_workspace_members` — list workspace members (for `@` mentions).
  - `multica_runtime_list` — list runtimes (needed for `agent_create`).
  - `multica_agent_create`, `multica_agent_update` — agent lifecycle.
- `get_issue`: `include_comments` option (default `true`) to skip comments on
  heavily-threaded issues and save tokens.
- `get_runtime_usage`: `window` option (`today` | `30d` | `both`) to return
  only the requested slice.
- `list_issues`: `offset` parameter plus `total`, `has_more`, `next_offset`
  in the response for true pagination beyond 100 results.
- `list_autopilots`: pushes `--limit` to the CLI instead of fetching all and
  slicing client-side.

### Changed

- JSON tool output is now compact (no pretty-printing). Approximately 20%
  fewer tokens per tool call.
- Log path is now `MULTICA_MCP_LOG_PATH` env override, then
  `$XDG_STATE_HOME/multica-mcp/calls.log`, then
  `~/.local/state/multica-mcp/calls.log`. No more hard-coded
  repo-specific log path.
- App URL: removed hard-coded `http://localhost:3002`. Resolved in order:
  `MULTICA_APP_URL` env var → `multica config show` → `null`.
- `create_autopilot` description now references the real
  `multica_autopilot_trigger_add` tool (which now exists).
- README rewritten in English and documents all 27 tools.

### Removed

- Spurious `invalidateAgentsCache()` calls after `create_issue` and
  `update_issue` — issues do not affect the agents cache.

## [0.2.0] - 2026-01

### Added

- Autopilot tools: `list_autopilots`, `get_autopilot`, `create_autopilot`,
  `update_autopilot`, `delete_autopilot`, `trigger_autopilot`.

## [0.1.0] - 2025-12

Initial release.

- Tools: `list_agents`, `list_projects`, `create_project`, `create_issue`,
  `list_issues`, `get_issue`, `add_comment`, `update_issue`,
  `get_runtime_usage`.
- stdio MCP server with JSONL call logging.
- Smoke test covering all initial tools.
