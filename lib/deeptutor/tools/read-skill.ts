/**
 * ReadSkillTool — Read the full content of a skill by name
 *
 * Loads a SKILL.md file through the SkillService and returns
 * its body content. Skills contain specialized instructions that
 * can augment the AI's capabilities for specific domains.
 *
 * Migrated from DeepTutor Python: deeptutor/tools/read_skill.py
 */

import {
  BaseTool,
  type ToolDefinition,
  type ToolResult,
  type ToolPromptHints,
  createToolResult,
  createToolParameter,
  createToolPromptHints,
} from '@/lib/deeptutor/core/tool-protocol';
import { createLogger } from '@/lib/logger';
import type { SkillServiceImpl } from '@/lib/deeptutor/services/skill';

const log = createLogger('ReadSkillTool');

// ---------------------------------------------------------------------------
// Module-level context (set before use)
// ---------------------------------------------------------------------------

let _skillService: SkillServiceImpl | null = null;

/**
 * Set the SkillServiceImpl instance for this tool.
 * Call once during app bootstrap before any tool execution.
 */
export function setReadSkillContext(skill: SkillServiceImpl): void {
  _skillService = skill;
}

// ---------------------------------------------------------------------------
// ReadSkillTool
// ---------------------------------------------------------------------------

export class ReadSkillTool extends BaseTool {
  getDefinition(): ToolDefinition {
    return {
      name: 'read_skill',
      description:
        'Read the full content of a skill by name. Use to load specialized instructions.',
      parameters: [
        createToolParameter({
          name: 'skill_name',
          type: 'string',
          description:
            'The name of the skill to read. Corresponds to a directory under data/skills/.',
          required: true,
        }),
      ],
    };
  }

  getPromptHints(_language: string = 'en'): ToolPromptHints {
    return createToolPromptHints({
      shortDescription: 'Read a skill by name.',
      whenToUse:
        'When you need to load specialized instructions, domain knowledge, or task-specific guidelines stored as a skill.',
      inputFormat:
        'skill_name: the directory name of the skill (e.g. "math-tutor", "code-review").',
      guideline:
        'Use the skills manifest in the system prompt to discover available skill names. Only load skills that are relevant to the current task.',
      phase: 'retrieval',
    });
  }

  async execute(kwargs: Record<string, unknown>): Promise<ToolResult> {
    const skillName = kwargs.skill_name as string;

    if (!skillName || skillName.trim().length === 0) {
      return createToolResult({
        content: 'Error: skill_name parameter is required.',
        success: false,
      });
    }

    if (!_skillService) {
      return createToolResult({
        content: 'Skill service is not available.',
        success: false,
      });
    }

    try {
      const skill = await _skillService.getSkill(skillName.trim());

      if (!skill) {
        // Provide helpful context about available skills
        const available = await _skillService.listSkills();
        const names = available.map((s) => s.name);

        return createToolResult({
          content:
            `Skill "${skillName}" not found. ` +
            `Available skills: ${names.length > 0 ? names.join(', ') : '(none)'}`,
          success: false,
          metadata: { skill_name: skillName, available_skills: names },
        });
      }

      log.info(`Read skill: ${skill.name} (${skill.body.length} chars)`);

      return createToolResult({
        content: skill.body,
        metadata: {
          skill_name: skill.name,
          description: skill.description,
          tags: skill.tags,
          char_count: skill.body.length,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Failed to read skill "${skillName}": ${message}`);

      return createToolResult({
        content: `Failed to read skill "${skillName}": ${message}`,
        success: false,
        metadata: { skill_name: skillName },
      });
    }
  }
}
