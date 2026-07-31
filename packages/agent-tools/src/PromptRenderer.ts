import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import type { AgentRuleReading, AgentRuleStep, AgentRules } from './AgentRulesSchema.js';

function formatStep(step: AgentRuleStep): string {
  if (typeof step === 'string') {
    return step;
  }

  return Object.entries(step)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
}

function formatReading(reading: AgentRuleReading): string {
  return `${reading.label} (${reading.path})`;
}

function resolveTemplatePath(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDir, 'templates/base_prompt.hbs'),
    resolve(moduleDir, '../src/templates/base_prompt.hbs'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate base_prompt.hbs from ${moduleDir}.`);
}

export class PromptRenderer {
  private readonly template: Handlebars.TemplateDelegate<AgentRules>;

  public constructor(templatePath = resolveTemplatePath()) {
    const templateSource = readFileSync(templatePath, 'utf8');
    const handlebars = Handlebars.create();
    handlebars.registerHelper('formatStep', (step: AgentRuleStep) => formatStep(step));
    handlebars.registerHelper('formatReading', (reading: AgentRuleReading) =>
      formatReading(reading),
    );
    this.template = handlebars.compile<AgentRules>(templateSource, {
      noEscape: true,
    });
  }

  public render(rules: AgentRules): string {
    return this.template(rules).trimEnd();
  }
}
