import { z } from "zod";
import {
  buildSquadMemberAddArgs,
  buildSquadMemberRemoveArgs,
  buildSquadMemberSetRoleArgs,
} from "../lib/cli-arg-builders.js";
import { runMulticaJson } from "../lib/multica-cli.js";
import type { SquadMember } from "../lib/types.js";

const MEMBER_TYPES = ["agent", "member"] as const;

export const multicaSquadMemberAddSchema = z.object({
  squad_id: z.string().min(1),
  member_id: z.string().min(1),
  member_type: z.enum(MEMBER_TYPES).optional(),
  role: z.string().optional(),
});

export type MulticaSquadMemberAddInput = z.infer<
  typeof multicaSquadMemberAddSchema
>;

export async function multicaSquadMemberAdd(input: MulticaSquadMemberAddInput) {
  const member = await runMulticaJson<SquadMember>(
    buildSquadMemberAddArgs(input),
  );
  return member;
}

export const multicaSquadMemberRemoveSchema = z.object({
  squad_id: z.string().min(1),
  member_id: z.string().min(1),
  member_type: z.enum(MEMBER_TYPES).optional(),
});

export type MulticaSquadMemberRemoveInput = z.infer<
  typeof multicaSquadMemberRemoveSchema
>;

export async function multicaSquadMemberRemove(
  input: MulticaSquadMemberRemoveInput,
) {
  await runMulticaJson(buildSquadMemberRemoveArgs(input));
  return {
    squad_id: input.squad_id,
    member_id: input.member_id,
    removed: true,
  };
}

export const multicaSquadMemberSetRoleSchema = z.object({
  squad_id: z.string().min(1),
  member_id: z.string().min(1),
  member_type: z.enum(MEMBER_TYPES).optional(),
  role: z.string().min(1),
});

export type MulticaSquadMemberSetRoleInput = z.infer<
  typeof multicaSquadMemberSetRoleSchema
>;

export async function multicaSquadMemberSetRole(
  input: MulticaSquadMemberSetRoleInput,
) {
  const member = await runMulticaJson<SquadMember>(
    buildSquadMemberSetRoleArgs(input),
  );
  return member;
}
