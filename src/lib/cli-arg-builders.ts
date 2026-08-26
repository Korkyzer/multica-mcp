type AgentVisibility = "workspace" | "private";
type AgentStatus = "active" | "paused" | "archived";

function stringifyFlag(value: unknown): string {
  return JSON.stringify(value);
}

export type AgentCreateArgsInput = {
  name: string;
  runtime_id: string;
  description?: string;
  instructions?: string;
  custom_args?: string[];
  runtime_config?: Record<string, unknown>;
  visibility?: AgentVisibility;
  max_concurrent_tasks?: number;
};

export function buildAgentCreateArgs(input: AgentCreateArgsInput): string[] {
  const args = [
    "agent",
    "create",
    "--name",
    input.name,
    "--runtime-id",
    input.runtime_id,
  ];

  if (input.description) args.push("--description", input.description);
  if (input.instructions) args.push("--instructions", input.instructions);
  if (input.visibility) args.push("--visibility", input.visibility);
  if (input.max_concurrent_tasks !== undefined) {
    args.push("--max-concurrent-tasks", String(input.max_concurrent_tasks));
  }
  if (input.custom_args) {
    args.push("--custom-args", stringifyFlag(input.custom_args));
  }
  if (input.runtime_config) {
    args.push("--runtime-config", stringifyFlag(input.runtime_config));
  }

  return args;
}

export type AgentUpdateArgsInput = {
  agent_id: string;
  name?: string;
  description?: string;
  instructions?: string;
  custom_args?: string[];
  runtime_config?: Record<string, unknown>;
  visibility?: AgentVisibility;
  runtime_id?: string;
  status?: AgentStatus;
  max_concurrent_tasks?: number;
};

export function buildAgentUpdateArgs(input: AgentUpdateArgsInput): string[] {
  const args = ["agent", "update", input.agent_id];

  if (input.name) args.push("--name", input.name);
  if (input.description !== undefined) args.push("--description", input.description);
  if (input.instructions !== undefined) args.push("--instructions", input.instructions);
  if (input.visibility) args.push("--visibility", input.visibility);
  if (input.runtime_id) args.push("--runtime-id", input.runtime_id);
  if (input.status) args.push("--status", input.status);
  if (input.max_concurrent_tasks !== undefined) {
    args.push("--max-concurrent-tasks", String(input.max_concurrent_tasks));
  }
  if (input.custom_args) {
    args.push("--custom-args", stringifyFlag(input.custom_args));
  }
  if (input.runtime_config) {
    args.push("--runtime-config", stringifyFlag(input.runtime_config));
  }

  if (args.length === 3) {
    throw new Error("No fields provided to update.");
  }

  return args;
}

export type AutopilotTriggerAddArgsInput = {
  autopilot_id: string;
  cron: string;
  label?: string;
  timezone?: string;
};

export function buildAutopilotTriggerAddArgs(
  input: AutopilotTriggerAddArgsInput,
): string[] {
  const args = [
    "autopilot",
    "trigger-add",
    input.autopilot_id,
    "--cron",
    input.cron,
  ];
  if (input.label) args.push("--label", input.label);
  if (input.timezone) args.push("--timezone", input.timezone);
  return args;
}

export type AutopilotTriggerUpdateArgsInput = {
  autopilot_id: string;
  trigger_id: string;
  cron?: string;
  label?: string;
  timezone?: string;
  enabled?: boolean;
};

export function buildAutopilotTriggerUpdateArgs(
  input: AutopilotTriggerUpdateArgsInput,
): string[] {
  const args = [
    "autopilot",
    "trigger-update",
    input.autopilot_id,
    input.trigger_id,
  ];
  if (input.cron) args.push("--cron", input.cron);
  if (input.label) args.push("--label", input.label);
  if (input.timezone) args.push("--timezone", input.timezone);
  if (input.enabled !== undefined) {
    args.push(`--enabled=${String(input.enabled)}`);
  }
  if (args.length === 4) {
    throw new Error("No fields provided to update.");
  }
  return args;
}

export type AutopilotTriggerDeleteArgsInput = {
  autopilot_id: string;
  trigger_id: string;
};

export function buildAutopilotTriggerDeleteArgs(
  input: AutopilotTriggerDeleteArgsInput,
): string[] {
  return ["autopilot", "trigger-delete", input.autopilot_id, input.trigger_id];
}

export type IssueRunMessagesArgsInput = {
  task_id: string;
  since?: number;
};

export function buildIssueRunMessagesArgs(
  input: IssueRunMessagesArgsInput,
): string[] {
  const args = ["issue", "run-messages", input.task_id];
  if (input.since !== undefined) args.push("--since", String(input.since));
  return args;
}

export type SquadCreateArgsInput = {
  name: string;
  leader_id: string;
  description?: string;
};

export function buildSquadCreateArgs(input: SquadCreateArgsInput): string[] {
  const args = ["squad", "create", "--name", input.name, "--leader", input.leader_id];
  if (input.description) args.push("--description", input.description);
  return args;
}

export type SquadUpdateArgsInput = {
  squad_id: string;
  name?: string;
  description?: string;
  instructions?: string;
  leader_id?: string;
  avatar_url?: string;
};

export function buildSquadUpdateArgs(input: SquadUpdateArgsInput): string[] {
  const args = ["squad", "update", input.squad_id];
  if (input.name !== undefined) args.push("--name", input.name);
  if (input.description !== undefined) args.push("--description", input.description);
  if (input.instructions !== undefined) args.push("--instructions", input.instructions);
  if (input.leader_id !== undefined) args.push("--leader", input.leader_id);
  if (input.avatar_url !== undefined) args.push("--avatar-url", input.avatar_url);

  if (args.length === 3) {
    throw new Error("No fields provided to update.");
  }

  return args;
}

export type SquadMemberAddArgsInput = {
  squad_id: string;
  member_id: string;
  member_type?: "agent" | "member";
  role?: string;
};

export function buildSquadMemberAddArgs(input: SquadMemberAddArgsInput): string[] {
  const args = ["squad", "member", "add", input.squad_id, "--member-id", input.member_id];
  if (input.member_type) args.push("--type", input.member_type);
  if (input.role) args.push("--role", input.role);
  return args;
}

export type SquadMemberRemoveArgsInput = {
  squad_id: string;
  member_id: string;
  member_type?: "agent" | "member";
};

export function buildSquadMemberRemoveArgs(
  input: SquadMemberRemoveArgsInput,
): string[] {
  const args = ["squad", "member", "remove", input.squad_id, "--member-id", input.member_id];
  if (input.member_type) args.push("--type", input.member_type);
  return args;
}

export type SquadMemberSetRoleArgsInput = {
  squad_id: string;
  member_id: string;
  role: string;
  member_type?: "agent" | "member";
};

export function buildSquadMemberSetRoleArgs(
  input: SquadMemberSetRoleArgsInput,
): string[] {
  const args = [
    "squad",
    "member",
    "set-role",
    input.squad_id,
    "--member-id",
    input.member_id,
    "--role",
    input.role,
  ];
  if (input.member_type) args.push("--member-type", input.member_type);
  return args;
}

export type AttachmentDownloadArgsInput = {
  attachment_id: string;
  output_dir?: string;
};

export function buildAttachmentDownloadArgs(
  input: AttachmentDownloadArgsInput,
): string[] {
  const args = ["attachment", "download", input.attachment_id];
  if (input.output_dir) args.push("-o", input.output_dir);
  return args;
}
