import { z } from "zod";
import { runMulticaJson } from "../lib/multica-cli.js";
import type { ListResult } from "../lib/types.js";

export const multicaWorkspaceMembersSchema = z.object({
  workspace_id: z.string().optional(),
});

export type MulticaWorkspaceMembersInput = z.infer<
  typeof multicaWorkspaceMembersSchema
>;

type Member = {
  id: string;
  user_id?: string;
  name?: string;
  email?: string;
  role?: string;
};

export async function multicaWorkspaceMembers(
  input: MulticaWorkspaceMembersInput,
): Promise<ListResult<Member>> {
  const args = ["workspace", "member", "list"];
  if (input.workspace_id) args.push(input.workspace_id);
  const members = (await runMulticaJson<Member[]>(args)) ?? [];
  if (members.length === 0) {
    return { items: [], state: "empty", message: "No members found." };
  }
  return { items: members, state: "loaded" };
}
