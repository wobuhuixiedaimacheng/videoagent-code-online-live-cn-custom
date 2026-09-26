import { getLocalSkillBody, loadLocalSkills } from './localSkills';
import { GENRE_OPTIONS, genreLabel, isGenreId } from './genreOptions';
import type { LocalSkill } from './localSkills';
import type { GenreId, ProductionStageId, ToolEvent } from './types';

export { GENRE_OPTIONS, genreLabel, isGenreId };
export type { GenreOption } from './genreOptions';

/**
 * required 会把 skill 正文整段注进 prompt，candidates 只进清单、等模型自己用 read_skill 取。
 * skill id 用 lib/localSkills 的 id，也就是 skills/ 下到 SKILL.source.md 的目录相对路径。
 *
 * required 可以是一个 id 也可以是一组：一组时按书写顺序累计注入，累计长度超过
 * MAX_REQUIRED_SKILL_CHARS 的那一个（及其后面的）自动降级成候选。所以把最不能丢的写在前面。
 */
type StageSkillRoute = { required?: string | string[]; candidates?: string[] };

/**
 * video 阶段刻意不设 required：那一格的 dynamic-director 已经由 motion_director workflow
 * 通过 getRuntimeSkillDetail 整段注入过了（lib/skillRuntime.ts），这里再写一次就是白花 17k 字符。
 */
const GENRE_STAGE_SKILLS: Record<GenreId, Partial<Record<ProductionStageId, StageSkillRoute>>> = {
  /**
   * 「自动派发」没有确定的片种，所以一条片种正文都不注入——注错了比不注更糟。
   * 但 director-craft 那几个技能是片种无关的摄影与剪辑通则，挂成候选让模型按需取，
   * 否则用户不选片种（这是默认值）时这几个阶段完全裸奔。
   */
  auto: {
    scene: { candidates: ['director-craft/lighting-design'] },
    storyboard: {
      candidates: [
        'director-craft/shot-grammar',
        'director-craft/camera-move',
        'director-craft/edit-rhythm',
        'multimodal-prompt-craft/soundscape-layers'
      ]
    },
    video: {
      candidates: [
        'director-craft/physics-fx',
        'director-craft/depth-and-lens',
        'multimodal-prompt-craft/reference-slots',
        'multimodal-prompt-craft/retention-brief'
      ]
    }
  },
  drama: {
    // 技能库目前没有中文短剧向的选题脚本 skill，viral-hook 只管开头留人，所以它只做候选。
    script: { candidates: ['seedance-genre-pack/skills/01-viral-hook', 'content-risk-detector'] },
    scene: { candidates: ['director-craft/lighting-design'] },
    storyboard: {
      // 剧情分镜 3.0k + 镜头语法 2.9k + 运镜 2.2k + 剪辑节奏 2.5k ≈ 10.6k，压在 12k 上限内。
      required: [
        'lanshu-video-kit/skills/seedance-storyboard',
        'director-craft/shot-grammar',
        'director-craft/camera-move',
        'director-craft/edit-rhythm'
      ],
      candidates: ['video-prompt-engineer', 'multimodal-prompt-craft/soundscape-layers']
    },
    video: {
      candidates: [
        'director-craft/physics-fx',
        'director-craft/depth-and-lens',
        'multimodal-prompt-craft/reference-slots',
        'multimodal-prompt-craft/retention-brief',
        'lanshu-video-kit/skills/kling-prompter',
        'lanshu-video-kit/skills/seedance-debugger'
      ]
    }
  },
  product: {
    script: {
      candidates: [
        'seedance-genre-pack/skills/02-saas-launch',
        'seedance-genre-pack/skills/08-testimonial-story',
        'seedance-genre-pack/skills/07-before-after',
        'content-risk-detector'
      ]
    },
    scene: { candidates: ['director-craft/lighting-design'] },
    storyboard: {
      required: 'video-prompt-engineer',
      candidates: [
        'director-craft/shot-grammar',
        'director-craft/camera-move',
        'lanshu-video-kit/skills/seedance-storyboard',
        'multimodal-prompt-craft/soundscape-layers'
      ]
    },
    video: {
      candidates: [
        'director-craft/depth-and-lens',
        'multimodal-prompt-craft/reference-slots',
        'multimodal-prompt-craft/retention-brief',
        'lanshu-video-kit/skills/seedance-prompter',
        'lanshu-video-kit/skills/model-selector'
      ]
    }
  },
  rewrite: {
    script: { candidates: ['seedance-genre-pack/skills/01-viral-hook', 'content-risk-detector'] }
  },
  note: {
    script: { candidates: ['seedance-genre-pack/skills/03-personal-brand', 'content-risk-detector'] }
  },
  weekly: {
    script: { candidates: ['seedance-genre-pack/skills/01-viral-hook'] }
  },
  multi: {
    script: {
      candidates: ['seedance-genre-pack/skills/01-viral-hook', 'seedance-genre-pack/skills/05-faceless-channel']
    }
  },
  videogen: {
    scene: { candidates: ['director-craft/lighting-design'] },
    storyboard: {
      required: [
        'lanshu-video-kit/skills/seedance-storyboard',
        'director-craft/shot-grammar',
        'director-craft/camera-move',
        'director-craft/edit-rhythm'
      ],
      candidates: ['multimodal-prompt-craft/soundscape-layers']
    },
    video: {
      candidates: [
        'director-craft/physics-fx',
        'director-craft/depth-and-lens',
        'multimodal-prompt-craft/reference-slots',
        'multimodal-prompt-craft/retention-brief',
        'lanshu-video-kit/skills/model-selector',
        'lanshu-video-kit/skills/prompt-translator',
        'lanshu-video-kit/skills/seedance-debugger'
      ]
    }
  }
};

/**
 * 硬注入的字符上限。超了就降级成候选，而不是把两万多字符的题材包整段灌进每一次请求——
 * 路由表以后指到 seedance-genre-pack 里那几个 29k 的技能上时，这道闸能兜住。
 */
export const MAX_REQUIRED_SKILL_CHARS = 12000;

const GENRE_SKILL_BOUNDARY = `# 题材技能运行边界

- 下面这份技能来自技能库，是按片种自动加载的写作参考，不是本工具的接口说明。
- 技能里与特定视频模型有关的数量、格式、时长和能力限制只作为提示词设计参考；除非当前视频规格明确确认，否则不得当成本工具的真实能力。
- 不得把来源仓库名或模型供应商名当作产品名称写进面向用户的内容。
- 技能只影响写法，不改变阶段产物的文件结构和审批链；输出仍必须落在当前阶段声明的 outputFiles 上。
- 面向用户的内容一律简体中文，即使技能正文是英文。`;

export type GenreSkillPlan = {
  genre: GenreId;
  stage: ProductionStageId;
  /** 按注入顺序排列。空数组表示这一格没有必读技能，全靠候选。 */
  required: { skill: LocalSkill; body: string }[];
  candidates: LocalSkill[];
  notes: string[];
};

function findSkill(id: string): LocalSkill | null {
  return loadLocalSkills().find((skill) => skill.id === id) || null;
}

/**
 * 算出这个 (片种, 阶段) 该加载什么。返回 null 表示这一格没有配任何技能，
 * 调用方应该完全不改动 prompt——「没配」和「配了但读不到」是两件事，后者会进 notes。
 */
export function genreSkillPlan(genre: GenreId | undefined, stage: ProductionStageId | undefined): GenreSkillPlan | null {
  if (!genre || !stage || !isGenreId(genre)) return null;
  const route = GENRE_STAGE_SKILLS[genre]?.[stage];
  if (!route) return null;

  const notes: string[] = [];
  const candidateIds = [...(route.candidates || [])];
  const required: GenreSkillPlan['required'] = [];

  // 累计预算：前面的技能先占位，后面的放不下就降级。一格里最不能丢的写在最前面。
  let injected = 0;
  const requiredIds = route.required ? (Array.isArray(route.required) ? route.required : [route.required]) : [];
  for (const id of requiredIds) {
    const loaded = getLocalSkillBody(id);
    if (!loaded) {
      notes.push(`题材技能 ${id} 在技能库里找不到，已跳过。`);
      continue;
    }
    if (injected + loaded.body.length > MAX_REQUIRED_SKILL_CHARS) {
      notes.push(
        `题材技能「${loaded.skill.name}」正文 ${loaded.body.length} 字符，` +
          `加上已注入的 ${injected} 字符会超过 ${MAX_REQUIRED_SKILL_CHARS} 的注入上限，已降级为候选。`
      );
      candidateIds.unshift(id);
      continue;
    }
    injected += loaded.body.length;
    required.push(loaded);
  }

  const seen = new Set<string>(required.map((item) => item.skill.id));
  const candidates: LocalSkill[] = [];
  for (const id of candidateIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const skill = findSkill(id);
    if (skill) candidates.push(skill);
    else notes.push(`候选技能 ${id} 在技能库里找不到，已跳过。`);
  }

  if (!required.length && !candidates.length) return notes.length ? { genre, stage, required: [], candidates: [], notes } : null;
  return { genre, stage, required, candidates, notes };
}

/** 拼进 prompt 的那一段。required 给正文，candidates 只给清单和 read_skill 的用法。 */
export function genreSkillSection(plan: GenreSkillPlan | null): string {
  if (!plan) return '';
  const parts: string[] = [`当前片种：${genreLabel(plan.genre)}（${plan.genre}），当前阶段：${plan.stage}。`];

  if (plan.required.length) {
    // 边界只写一次，后面接所有必读技能的正文——每份之间用分隔行隔开，别让模型把两份读成一份。
    const bodies = plan.required
      .map((item) => `--- ${item.skill.name} / ${item.skill.packTitle} ---\n${item.body}`)
      .join('\n\n');
    parts.push(`\n以下技能已按片种自动加载，本阶段必须遵循：\n\n${GENRE_SKILL_BOUNDARY}\n\n${bodies}`);
  }

  if (plan.candidates.length) {
    const list = plan.candidates.map((skill) => ({
      skillId: skill.id,
      name: skill.name,
      stage: skill.stage,
      description: skill.description,
      chars: skill.chars
    }));
    parts.push(
      `\n本片种在这一阶段还有以下候选技能，正文没有展开。判断确实用得上时，用 read_skill 工具带 skillId 参数取全文，不要凭名字猜内容：\n${JSON.stringify(list, null, 2)}`
    );
  }

  if (plan.notes.length) parts.push(`\n技能加载提示：\n- ${plan.notes.join('\n- ')}`);
  return parts.join('\n');
}

/** 时间线上那条可见事件。没有 required 也要报，否则用户不知道候选清单已经给到模型了。 */
export function genreSkillAutoloadEvent(plan: GenreSkillPlan | null): Omit<ToolEvent, 'id'> | null {
  if (!plan || (!plan.required.length && !plan.candidates.length)) return null;
  const label = genreLabel(plan.genre);
  if (plan.required.length) {
    const names = plan.required.map((item) => item.skill.name).join('、');
    const chars = plan.required.reduce((sum, item) => sum + item.body.length, 0);
    return {
      toolName: 'read_skill',
      status: 'success',
      title: `${label}题材已加载「${names}」`,
      summary: `按片种自动展开技能库正文（${plan.required.length} 个技能，共 ${chars} 字符）${plan.candidates.length ? `，另有 ${plan.candidates.length} 个候选技能可按需读取` : ''}。`
    };
  }
  return {
    toolName: 'read_skill',
    status: 'success',
    title: `${label}题材候选技能已就绪`,
    summary: `本阶段没有必读技能，已把 ${plan.candidates.length} 个候选技能的清单交给 Agent，按需用 read_skill 展开。`
  };
}
