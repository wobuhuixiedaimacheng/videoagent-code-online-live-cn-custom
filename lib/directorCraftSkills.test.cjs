const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function installTypeScriptLoader() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    module._compile(output, filePath);
  };
  return () => {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  };
}

const EXPECTED = {
  'director-craft/shot-grammar': '分镜',
  'director-craft/camera-move': '分镜',
  'director-craft/edit-rhythm': '分镜',
  'director-craft/lighting-design': '素材提示词',
  'director-craft/depth-and-lens': '素材提示词',
  'director-craft/physics-fx': '生产准备'
};

test('六个导演调度技能都能被技能库扫到，阶段分类和 STAGE_OVERRIDE 对得上', () => {
  const restore = installTypeScriptLoader();
  try {
    const { loadLocalSkills, SKILL_STAGES } = require('./localSkills.ts');
    const skills = loadLocalSkills().filter((skill) => skill.pack === 'director-craft');

    assert.equal(skills.length, Object.keys(EXPECTED).length);
    for (const [id, stage] of Object.entries(EXPECTED)) {
      const found = skills.find((skill) => skill.id === id);
      assert.ok(found, `技能库里没扫到 ${id}`);
      assert.equal(found.stage, stage, `${id} 的阶段分类不对`);
      assert.ok(SKILL_STAGES.includes(found.stage), `${id} 的阶段不在 SKILL_STAGES 里，面板筛选会漏掉它`);
    }
  } finally {
    restore();
  }
});

test('每个技能的 frontmatter 都有 name 和 description，否则面板和候选清单是空白', () => {
  const restore = installTypeScriptLoader();
  try {
    const { loadLocalSkills } = require('./localSkills.ts');
    for (const skill of loadLocalSkills().filter((item) => item.pack === 'director-craft')) {
      assert.ok(skill.name && skill.name !== 'director-craft', `${skill.id} 缺 frontmatter name`);
      assert.ok(skill.description.length > 20, `${skill.id} 的 description 太短，模型选型时看不出该不该用`);
    }
  } finally {
    restore();
  }
});

test('正文长度都在硬注入上限以内，不会被悄悄降级成候选', () => {
  const restore = installTypeScriptLoader();
  try {
    const { getLocalSkillBody } = require('./localSkills.ts');
    const { MAX_REQUIRED_SKILL_CHARS } = require('./genreSkillRouter.ts');

    for (const id of Object.keys(EXPECTED)) {
      const loaded = getLocalSkillBody(id);
      assert.ok(loaded, `读不到 ${id} 的正文`);
      assert.ok(
        loaded.body.length <= MAX_REQUIRED_SKILL_CHARS,
        `${id} 正文 ${loaded.body.length} 字符，超过 ${MAX_REQUIRED_SKILL_CHARS}，设成 required 会被降级`
      );
    }
  } finally {
    restore();
  }
});

test('包元数据标成自有实现：repo 留空，面板才会显示「自有实现」而不是死链', () => {
  const restore = installTypeScriptLoader();
  try {
    const { loadLocalSkills } = require('./localSkills.ts');
    for (const skill of loadLocalSkills().filter((item) => item.pack === 'director-craft')) {
      assert.equal(skill.repo, '', `${skill.id} 不该有源仓库——这个包是自有实现`);
      assert.equal(skill.license, '自有');
      assert.equal(skill.packTitle, '导演调度');
    }
  } finally {
    restore();
  }
});

test('片种路由能取到导演调度技能，分镜和场景阶段都挂上了', () => {
  const restore = installTypeScriptLoader();
  try {
    const { genreSkillPlan } = require('./genreSkillRouter.ts');

    const storyboard = genreSkillPlan('drama', 'storyboard');
    assert.ok(storyboard);
    const storyboardIds = storyboard.required.map((item) => item.skill.id);
    for (const id of ['director-craft/shot-grammar', 'director-craft/camera-move', 'director-craft/edit-rhythm']) {
      assert.ok(storyboardIds.includes(id), `短剧分镜阶段没把 ${id} 设成必读`);
    }

    // scene 阶段以前没有任何片种配技能，instance.lighting 全靠模型自由发挥。
    const scene = genreSkillPlan('drama', 'scene');
    assert.ok(scene, '短剧场景阶段应该有候选技能');
    assert.deepEqual(scene.required, []);
    assert.ok(scene.candidates.some((skill) => skill.id === 'director-craft/lighting-design'));

    const video = genreSkillPlan('videogen', 'video');
    assert.ok(video);
    assert.ok(video.candidates.some((skill) => skill.id === 'director-craft/physics-fx'));
  } finally {
    restore();
  }
});

test('正文里不出现被排除来源的痕迹，守住 PROVENANCE 里的 clean-room 声明', () => {
  const root = path.join(process.cwd(), 'skills', 'director-craft');
  const forbidden = [/pai[-\s]?pro/i, /utopai/i, /higgsfield/i, /seedance/i];

  for (const id of Object.keys(EXPECTED)) {
    const file = path.join(root, id.split('/')[1], 'SKILL.source.md');
    const body = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      assert.equal(pattern.test(body), false, `${id} 的正文里出现了 ${pattern}，这个包必须保持零第三方来源`);
    }
  }
});
