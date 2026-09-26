import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSkillByWorkflow } from './workspace';
import type { AIGCSkill, ToolEvent, WorkflowKind } from './types';

type RuntimeSkillDetail = AIGCSkill & {
  instructions?: string;
  provenance?: {
    repository: string;
    license: string;
    sourceFile: string;
  };
};

const DYNAMIC_DIRECTOR_BOUNDARY = `# 动态导演运行边界

- 创意总监自动调用动态导演：当任务进入视频生成准备，或用户要求视频提示词、运镜、动作编排、多模态参考、音乐卡点、视频续写与编辑时启用。
- 只读取已经确认的 script.md、characters.json、scenes.json、storyboard.json 和用户明确提供的参考素材，不改写上游资产。
- 只生成可审查的视频任务提示词，并写入 asset_prompts.json；不得声称已经渲染视频、调用外部模型或完成发布。
- 面向用户的技能名称固定为“动态导演”，不得把来源仓库或具体模型供应商当作产品名称。
- 来源 Skill 中与特定模型有关的数量、格式和能力限制仅作为提示词设计参考；除非当前视频规格明确确认，否则不得冒充本工具的真实接口能力。
- 主提示词使用简体中文。每个素材引用必须说明用途，每个镜头必须包含主体、场景、动作、运镜、时间段、声音、风格和避免项中的适用部分。
- 输出必须兼容现有 asset_prompts.json 和审批链，不新增视频供应商配置。

以下为动态导演使用的完整 PE 参考规则：`;

const FALLBACK_INSTRUCTIONS = `

## 核心语法：@ 引用系统
每个图片、视频和音频引用都必须编号并说明用途。

## 分时段提示词
按镜头时长拆分开场、发展、关键动作与收尾，明确每段动作、运镜和声音。

## 运镜语言参考
使用推、拉、摇、移、跟随、环绕、主观视角、一镜到底等可执行镜头语言。

## AI短剧
保持角色设定、空间关系、对白、表情和动作连续，不用抽象形容词代替可见表演。`;

function dynamicDirectorInstructions() {
  try {
    const sourcePath = join(process.cwd(), 'skills', 'dynamic-director', 'SKILL.source.md');
    return `${DYNAMIC_DIRECTOR_BOUNDARY}\n\n${readFileSync(sourcePath, 'utf8')}`;
  } catch (_) {
    return `${DYNAMIC_DIRECTOR_BOUNDARY}${FALLBACK_INSTRUCTIONS}`;
  }
}

export function getRuntimeSkillDetail(workflow: WorkflowKind): RuntimeSkillDetail | null {
  const skill = getSkillByWorkflow(workflow);
  if (!skill) return null;
  if (workflow !== 'motion_director') return skill;
  return {
    ...skill,
    instructions: dynamicDirectorInstructions(),
    provenance: {
      repository: 'https://github.com/dexhunter/seedance2-skill',
      license: 'MIT',
      sourceFile: 'skills/dynamic-director/SKILL.source.md'
    }
  };
}

export function skillAutoloadEvent(workflow: WorkflowKind): Omit<ToolEvent, 'id'> | null {
  if (workflow !== 'motion_director') return null;
  return {
    toolName: 'read_skill',
    status: 'success',
    title: '创意总监调用动态导演',
    summary: '已自动加载动态导演的完整 PE 规则，开始整理可审查的视频任务提示词。'
  };
}
