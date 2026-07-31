import { z } from 'zod';

const SchemaVersionSchema = z.literal(1);

const NonEmptyStringSchema = z.string().min(1);

const IdSchema = NonEmptyStringSchema;

const AgentRulePrincipleSchema = z
  .object({
    id: IdSchema,
    label: NonEmptyStringSchema,
    statement: NonEmptyStringSchema,
    enforcement: NonEmptyStringSchema,
  })
  .strict();

const AgentRuleConventionSchema = z
  .object({
    id: IdSchema,
    label: NonEmptyStringSchema,
    statement: NonEmptyStringSchema,
  })
  .strict();

const AgentRuleReadingSchema = z
  .object({
    id: IdSchema,
    label: NonEmptyStringSchema,
    path: NonEmptyStringSchema,
  })
  .strict();

const AgentRuleResidentRoleSchema = z
  .object({
    id: IdSchema,
    label: NonEmptyStringSchema,
    responsibility: NonEmptyStringSchema,
    applies_to: z.array(NonEmptyStringSchema),
    operating_principle: NonEmptyStringSchema,
  })
  .strict();

const AgentRuleOutputSchema = z
  .object({
    key: NonEmptyStringSchema,
    type: NonEmptyStringSchema,
  })
  .strict();

const AgentRuleSopSchema = z
  .object({
    id: IdSchema,
    name: NonEmptyStringSchema,
    trigger: NonEmptyStringSchema,
    goal: NonEmptyStringSchema,
    steps: z.array(
      z.union([
        NonEmptyStringSchema,
        z
          .record(z.string(), NonEmptyStringSchema)
          .refine((value) => Object.keys(value).length > 0, {
            message: 'Step mappings must not be empty.',
          }),
      ]),
    ),
    outputs: z.array(AgentRuleOutputSchema),
  })
  .strict();

const AgentRuleBoundedContextSchema = z
  .object({
    name: NonEmptyStringSchema,
    responsibility: NonEmptyStringSchema,
    in_scope: z.array(NonEmptyStringSchema),
    out_of_scope: z.array(NonEmptyStringSchema),
  })
  .strict();

const AgentRuleInheritanceSchema = z
  .object({
    extends: NonEmptyStringSchema.optional(),
    mode: z.enum(['root', 'override']),
    precedence: z.enum(['child_overrides_parent']),
    child_rule_files: z.array(NonEmptyStringSchema).optional(),
  })
  .strict();

const AgentRuleOverridePolicySchema = z
  .object({
    allow_child_specialization: z.boolean(),
    do_not_repeat_child_conventions: z.boolean().optional(),
    root_is_authoritative_for: z.array(NonEmptyStringSchema).optional(),
    root_rules_still_apply: z.boolean().optional(),
    package_must_not: z.array(NonEmptyStringSchema).optional(),
  })
  .strict();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertUniqueIdArray(
  items: readonly { id: string }[] | undefined,
  path: (string | number)[],
  ctx: z.RefinementCtx,
): void {
  if (!items) return;

  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate id "${item.id}" found in ${path[0] ?? 'collection'}.`,
        path: [...path, index, 'id'],
      });
      continue;
    }

    seen.add(item.id);
  }
}

function assertUniqueOutputKeys(
  outputs: readonly { key: string }[],
  sopIndex: number,
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, output] of outputs.entries()) {
    if (seen.has(output.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate output key "${output.key}" found in sops[${sopIndex}].`,
        path: ['sops', sopIndex, 'outputs', index, 'key'],
      });
      continue;
    }

    seen.add(output.key);
  }
}

export const AgentRulesSchema = z
  .object({
    schema_version: SchemaVersionSchema,
    kind: z.enum(['root', 'package']),
    metadata: z
      .object({
        name: NonEmptyStringSchema,
        description: NonEmptyStringSchema,
      })
      .strict(),
    bounded_context: AgentRuleBoundedContextSchema.optional(),
    inheritance: AgentRuleInheritanceSchema.optional(),
    principles: z.array(AgentRulePrincipleSchema).optional(),
    conventions: z.array(AgentRuleConventionSchema).optional(),
    resident_roles: z.array(AgentRuleResidentRoleSchema).optional(),
    required_reading: z.array(AgentRuleReadingSchema).optional(),
    sops: z.array(AgentRuleSopSchema),
    override_policy: AgentRuleOverridePolicySchema.optional(),
  })
  .strict()
  .superRefine((rules, ctx) => {
    assertUniqueIdArray(rules.principles, ['principles'], ctx);
    assertUniqueIdArray(rules.conventions, ['conventions'], ctx);
    assertUniqueIdArray(rules.resident_roles, ['resident_roles'], ctx);
    assertUniqueIdArray(rules.required_reading, ['required_reading'], ctx);
    assertUniqueIdArray(rules.sops, ['sops'], ctx);

    for (const [sopIndex, sop] of rules.sops.entries()) {
      assertUniqueOutputKeys(sop.outputs, sopIndex, ctx);
    }

    if (rules.kind === 'package') {
      if (!rules.inheritance?.extends) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Package rules must define inheritance.extends.',
          path: ['inheritance', 'extends'],
        });
      }
    }

    const overridePolicy = rules.override_policy;
    if (overridePolicy) {
      const hasWorkspacePolicy =
        overridePolicy.do_not_repeat_child_conventions !== undefined ||
        overridePolicy.root_is_authoritative_for !== undefined;
      const hasPackagePolicy =
        overridePolicy.root_rules_still_apply !== undefined ||
        overridePolicy.package_must_not !== undefined;

      if (!hasWorkspacePolicy && !hasPackagePolicy) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'override_policy must define workspace or package policy fields when present.',
          path: ['override_policy'],
        });
      }
    }
  });

export type AgentRules = z.infer<typeof AgentRulesSchema>;
export type AgentRulePrinciple = z.infer<typeof AgentRulePrincipleSchema>;
export type AgentRuleConvention = z.infer<typeof AgentRuleConventionSchema>;
export type AgentRuleResidentRole = z.infer<typeof AgentRuleResidentRoleSchema>;
export type AgentRuleReading = z.infer<typeof AgentRuleReadingSchema>;
export type AgentRuleOutput = z.infer<typeof AgentRuleOutputSchema>;
export type AgentRuleStep = z.infer<typeof AgentRuleSopSchema>['steps'][number];
export type AgentRuleSop = z.infer<typeof AgentRuleSopSchema>;
export type AgentRuleBoundedContext = z.infer<typeof AgentRuleBoundedContextSchema>;
export type AgentRuleInheritance = z.infer<typeof AgentRuleInheritanceSchema>;
export type AgentRuleOverridePolicy = z.infer<typeof AgentRuleOverridePolicySchema>;

export function isAgentRules(value: unknown): value is AgentRules {
  return AgentRulesSchema.safeParse(value).success;
}

export function isAgentRuleRecord(value: unknown): value is AgentRules {
  return isRecord(value) && isAgentRules(value);
}
