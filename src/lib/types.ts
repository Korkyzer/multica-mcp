export type Agent = {
  id: string;
  name: string;
  description: string;
  runtime_id: string;
  runtime_mode: string;
  status: string;
  visibility: string;
  custom_args: string[];
  custom_env?: Record<string, string>;
  archived_at: string | null;
};

export type Runtime = {
  id: string;
  name: string;
  provider: string;
  daemon_id: string;
  runtime_mode: string;
  status: string;
  last_seen_at: string;
};

export type Project = {
  id: string;
  title?: string;
  name?: string;
  description?: string | null;
  icon?: string | null;
  lead_id?: string | null;
  status?: string;
  issue_count?: number;
  created_at?: string;
  updated_at?: string;
};

export type Issue = {
  id: string;
  identifier: string;
  number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  assignee_type: string | null;
  project_id: string | null;
  parent_issue_id: string | null;
  creator_id?: string;
  creator_type?: string;
  due_date?: string | null;
  created_at: string;
  updated_at: string;
};

export type IssueListResponse = {
  issues: Issue[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type Comment = {
  id: string;
  issue_id: string;
  author_id: string;
  author_type: "agent" | "member";
  content: string;
  created_at: string;
  updated_at: string;
  parent_id: string | null;
  type?: string;
};

export type AgentTask = {
  id: string;
  agent_id: string;
  issue_id: string;
  runtime_id: string;
  status: string;
  created_at: string;
  dispatched_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  result: {
    output?: string;
    session_id?: string;
    work_dir?: string;
    pr_url?: string;
  } | null;
};

export type ListResult<T> = {
  items: T[];
  state: "loaded" | "empty";
  message?: string;
};

export type Trigger = {
  id: string;
  autopilot_id: string;
  type: string;
  cron: string | null;
  label: string | null;
  timezone: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type Autopilot = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  execution_mode: string;
  priority: string;
  assignee_id: string | null;
  project_id: string | null;
  issue_title_template: string | null;
  last_run_at: string | null;
  workspace_id: string;
  created_at: string;
  updated_at: string;
};

export type AutopilotListResponse = {
  autopilots: Autopilot[];
  total: number;
};

export type AutopilotGetResponse = {
  autopilot: Autopilot;
  triggers: Trigger[];
};

export type UsageEntry = {
  date: string;
  provider: string;
  model: string;
  runtime_id: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
};

export type RuntimeUsageSummary = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
};

export type SquadMemberPreview = {
  member_type: "agent" | "member";
  member_id: string;
  role?: string;
};

export type Squad = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  avatar_url: string | null;
  leader_id: string;
  creator_id?: string;
  archived_at: string | null;
  archived_by?: string | null;
  member_count?: number;
  member_preview?: SquadMemberPreview[];
  created_at?: string;
  updated_at?: string;
};

export type SquadMember = {
  member_type: "agent" | "member";
  member_id: string;
  role: string;
};
