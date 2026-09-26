const assert = require('node:assert/strict');
const fs = require('node:fs');
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

function shot(id, sceneId, overrides = {}) {
  const { continuity, ...rest } = overrides;
  return {
    id,
    sourceSceneId: sceneId,
    title: `${id} 标题`,
    durationSeconds: 3,
    ...rest,
    continuity: continuity === undefined ? undefined : continuity
  };
}

function cast(characterId, overrides = {}) {
  return { characterId, ...overrides };
}

// ── 状态传递 ─────────────────────────────────────────────────────────

test('模型只在第一镜写了造型，后面的镜头自动沿用同一套 wardrobeId', () => {
  const restore = installTypeScriptLoader();
  try {
    const { carryStoryboardContinuity } = require('./shotContinuity.ts');
    const carried = carryStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_daily', hairstyle: '低马尾' })] } }),
      shot('s2', 'scene_01', { continuity: { cast: [cast('lin_yan')] } }),
      shot('s3', 'scene_01', { continuity: { cast: [cast('lin_yan')] } })
    ]);

    // 这一条就是「人物换装」这类事故的根：模型第二镜起不再重复写造型，
    // 不继承的话下游拿到的是空字符串，只能让图像模型自由发挥。
    assert.deepEqual(
      carried.map((item) => item.continuity.cast[0].wardrobeId),
      ['look_daily', 'look_daily', 'look_daily']
    );
    assert.deepEqual(
      carried.map((item) => item.continuity.cast[0].hairstyle),
      ['低马尾', '低马尾', '低马尾']
    );
  } finally {
    restore();
  }
});

test('中间整场没出现的角色再登场时，造型仍然接得上', () => {
  const restore = installTypeScriptLoader();
  try {
    const { carryStoryboardContinuity } = require('./shotContinuity.ts');
    const carried = carryStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_coat' })] } }),
      // 第二场整场只有另一个人。只看「上一镜」的实现会在这里把 lin_yan 的造型忘掉。
      shot('s2', 'scene_02', { continuity: { cast: [cast('zhou_xu', { wardrobeId: 'look_suit' })] } }),
      shot('s3', 'scene_03', { continuity: { cast: [cast('lin_yan')] } })
    ]);

    assert.equal(carried[2].continuity.cast[0].wardrobeId, 'look_coat');
  } finally {
    restore();
  }
});

test('走位和视线只在同一场次内继承，换场次归零', () => {
  const restore = installTypeScriptLoader();
  try {
    const { carryStoryboardContinuity } = require('./shotContinuity.ts');
    const carried = carryStoryboardContinuity([
      shot('s1', 'scene_01', {
        continuity: {
          timeOfDay: '傍晚',
          lightDirection: '画面右后方',
          cast: [cast('lin_yan', { wardrobeId: 'look_a', screenPosition: '画面左三分之一', eyeline: '看向画面右侧' })]
        }
      }),
      shot('s2', 'scene_01', { continuity: { cast: [cast('lin_yan')] } }),
      shot('s3', 'scene_02', { continuity: { cast: [cast('lin_yan')] } })
    ]);

    // 同一场次内：人还站在原地，模型不写就是没动。
    assert.equal(carried[1].continuity.cast[0].screenPosition, '画面左三分之一');
    assert.equal(carried[1].continuity.timeOfDay, '傍晚');
    assert.equal(carried[1].continuity.lightDirection, '画面右后方');

    // 换了场次：位置、时间和光线都该由新场次重新决定，硬继承是错的。
    assert.equal(carried[2].continuity.cast[0].screenPosition, '');
    assert.equal(carried[2].continuity.timeOfDay, '');
    assert.equal(carried[2].continuity.lightDirection, '');
    // 但造型跨场次继承——换装是剧情事件，不是换个场景就该换。
    assert.equal(carried[2].continuity.cast[0].wardrobeId, 'look_a');
  } finally {
    restore();
  }
});

test('时期和关系一路传下去，直到剧情显式翻篇', () => {
  const restore = installTypeScriptLoader();
  try {
    const { carryStoryboardContinuity } = require('./shotContinuity.ts');
    const carried = carryStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { timelineStage: '大学时期', relationshipId: 'rel_01' } }),
      shot('s2', 'scene_02', { continuity: {} }),
      shot('s3', 'scene_03', { continuity: { timelineStage: '工作三年后', relationshipId: 'rel_02' } }),
      shot('s4', 'scene_04', { continuity: {} })
    ]);

    assert.deepEqual(
      carried.map((item) => item.continuity.timelineStage),
      ['大学时期', '大学时期', '工作三年后', '工作三年后']
    );
    // 三段恋情靠这个字段区分。丢了它，成片里三段恋情长着同一张脸。
    assert.deepEqual(
      carried.map((item) => item.continuity.relationshipId),
      ['rel_01', 'rel_01', 'rel_02', 'rel_02']
    );
  } finally {
    restore();
  }
});

test('previousEndFrame 由系统按上一镜回填，跨场次不接', () => {
  const restore = installTypeScriptLoader();
  try {
    const { carryStoryboardContinuity } = require('./shotContinuity.ts');
    const carried = carryStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { endFrame: '她坐在沙发左侧，右手握着杯子' } }),
      // 模型写的 previousEndFrame 一律不采信：它看不到上一镜，写的只能是编的。
      shot('s2', 'scene_01', { continuity: { previousEndFrame: '瞎编的上一镜' } }),
      shot('s3', 'scene_02', { continuity: {} })
    ]);

    assert.equal(carried[0].continuity.previousEndFrame, '');
    assert.equal(carried[1].continuity.previousEndFrame, '她坐在沙发左侧，右手握着杯子');
    // 换场次时上一镜的尾帧是另一个空间的画面，接过来等于把上一场的房间带进这一场。
    assert.equal(carried[2].continuity.previousEndFrame, '');
  } finally {
    restore();
  }
});

test('模型没写尾帧时从动作派生一句，不留空断链', () => {
  const restore = installTypeScriptLoader();
  try {
    const { carryStoryboardContinuity } = require('./shotContinuity.ts');
    const carried = carryStoryboardContinuity([
      shot('s1', 'scene_01', { action: '她放下杯子，看向门口' }),
      shot('s2', 'scene_01', {})
    ]);

    assert.match(carried[0].continuity.endFrame, /她放下杯子，看向门口/);
    // 链不能断在这里：断了下游完全看不出来，用户只会在成片里看到画面跳。
    assert.match(carried[1].continuity.previousEndFrame, /她放下杯子，看向门口/);
  } finally {
    restore();
  }
});

test('上一镜在场但这一镜没被点名的人会被补回 cast，已离场的不补', () => {
  const restore = installTypeScriptLoader();
  try {
    const { carryStoryboardContinuity } = require('./shotContinuity.ts');
    const carried = carryStoryboardContinuity([
      shot('s1', 'scene_01', {
        continuity: {
          cast: [
            cast('lin_yan', { wardrobeId: 'look_a' }),
            cast('zhou_xu', { wardrobeId: 'look_b' }),
            cast('su_wan', { wardrobeId: 'look_c', exited: true })
          ]
        }
      }),
      // 模型常见的写法：这一镜只写正在说话的那个人。
      shot('s2', 'scene_01', { continuity: { cast: [cast('lin_yan')] } })
    ]);

    const ids = carried[1].continuity.cast.map((item) => item.characterId);
    assert.deepEqual(ids.sort(), ['lin_yan', 'zhou_xu']);
    // 离场的人不补：他的消失是剧情，不是遗漏。
    assert.ok(!ids.includes('su_wan'));
  } finally {
    restore();
  }
});

test('换场次时不把上一场的人凭空补进新场次', () => {
  const restore = installTypeScriptLoader();
  try {
    const { carryStoryboardContinuity } = require('./shotContinuity.ts');
    const carried = carryStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { cast: [cast('lin_yan'), cast('zhou_xu')] } }),
      shot('s2', 'scene_02', { continuity: { cast: [cast('lin_yan')] } })
    ]);

    assert.deepEqual(carried[1].continuity.cast.map((item) => item.characterId), ['lin_yan']);
  } finally {
    restore();
  }
});

test('场次母版 id 落到每个镜头上', () => {
  const restore = installTypeScriptLoader();
  try {
    const { carryStoryboardContinuity } = require('./shotContinuity.ts');
    const carried = carryStoryboardContinuity(
      [shot('s1', 'scene_01'), shot('s2', 'scene_02')],
      { sceneMasterById: new Map([['scene_01', 'master_living'], ['scene_02', 'master_office']]) }
    );

    assert.deepEqual(carried.map((item) => item.sceneMasterId), ['master_living', 'master_office']);
  } finally {
    restore();
  }
});

// ── 批次交接 ─────────────────────────────────────────────────────────

test('批次收尾状态带上整批出现过的角色，不只是最后一镜里的那个', () => {
  const restore = installTypeScriptLoader();
  try {
    const { carryStoryboardContinuity, storyboardContinuityTail } = require('./shotContinuity.ts');
    const carried = carryStoryboardContinuity([
      shot('s1', 'scene_01', {
        continuity: {
          timelineStage: '大学时期',
          relationshipId: 'rel_01',
          cast: [cast('lin_yan', { wardrobeId: 'look_a' }), cast('zhou_xu', { wardrobeId: 'look_b' })]
        }
      }),
      shot('s2', 'scene_02', { continuity: { cast: [cast('lin_yan')], endFrame: '她站在门口回头' } })
    ]);
    const tail = storyboardContinuityTail(carried);

    assert.equal(tail.shotId, 's2');
    assert.equal(tail.sceneId, 'scene_02');
    assert.equal(tail.endFrame, '她站在门口回头');
    assert.equal(tail.timelineStage, '大学时期');
    assert.equal(tail.relationshipId, 'rel_01');
    // 分批是按场景切的，最后一镜往往只有一两个人。只取最后一镜，
    // zhou_xu 的造型下一批就查不到了——他再出场时就会换一身衣服。
    assert.deepEqual(tail.cast.map((item) => item.characterId).sort(), ['lin_yan', 'zhou_xu']);
    assert.equal(tail.cast.find((item) => item.characterId === 'zhou_xu').wardrobeId, 'look_b');

    assert.equal(storyboardContinuityTail([]), null);
  } finally {
    restore();
  }
});

test('下一批的提示词里写着上一批把人物留在什么状态', () => {
  const restore = installTypeScriptLoader();
  try {
    const { continuityHandoffInstruction } = require('./shotContinuity.ts');
    const text = continuityHandoffInstruction({
      shotId: 'scene_03_shot_04',
      sceneId: 'scene_03',
      timelineStage: '分手三年后',
      relationshipId: 'rel_02',
      timeOfDay: '深夜',
      lightDirection: '画面左前方',
      axisSide: 'left',
      endFrame: '她背对镜头站在窗前，右手垂着',
      cast: [{
        characterId: 'lin_yan',
        wardrobeId: 'look_night',
        hairstyle: '披发',
        screenPosition: '画面右三分之一',
        eyeline: '看向窗外',
        facing: '背对镜头',
        movementDirection: '',
        handProp: '手机',
        hand: 'right',
        exited: false
      }]
    });

    assert.match(text, /scene_03_shot_04/);
    assert.match(text, /她背对镜头站在窗前/);
    assert.match(text, /分手三年后/);
    assert.match(text, /rel_02/);
    assert.match(text, /lin_yan/);
    assert.match(text, /look_night/);
    assert.match(text, /右手拿着手机/);
    assert.match(text, /逐字沿用/);

    // 第一批没有上一批，不该凭空多出一段交接话术。
    assert.equal(continuityHandoffInstruction(null), '');
    assert.equal(continuityHandoffInstruction(undefined), '');
  } finally {
    restore();
  }
});

test('分批生成时批次指令带上交接段落，合并时贯通连续性', () => {
  const restore = installTypeScriptLoader();
  try {
    const { storyboardBatchInstruction, mergeStoryboardBatches } = require('./storyboardBatch.ts');

    const instruction = storyboardBatchInstruction({
      sceneIds: ['scene_03'],
      index: 2,
      total: 3,
      continuityTail: {
        shotId: 'scene_02_shot_05',
        sceneId: 'scene_02',
        timelineStage: '大学时期',
        relationshipId: 'rel_01',
        timeOfDay: '',
        lightDirection: '',
        axisSide: 'unset',
        endFrame: '他把伞递过来',
        cast: [{
          characterId: 'lin_yan',
          wardrobeId: 'look_a',
          hairstyle: '',
          screenPosition: '',
          eyeline: '',
          facing: '',
          movementDirection: '',
          handProp: '',
          hand: 'none',
          exited: false
        }]
      }
    });
    assert.match(instruction, /第 2\/3 批/);
    assert.match(instruction, /他把伞递过来/);
    assert.match(instruction, /look_a/);

    // 合并之后，第 2 批第一镜没写造型也能接上第 1 批的记忆。
    const merged = mergeStoryboardBatches(
      [
        {
          sceneIds: ['scene_01'],
          shots: [{ id: 's1', sourceSceneId: 'scene_01', durationSeconds: 3, continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_a' })] } }]
        },
        {
          sceneIds: ['scene_02'],
          shots: [{ id: 's2', sourceSceneId: 'scene_02', durationSeconds: 4, continuity: { cast: [cast('lin_yan')] } }]
        }
      ],
      ['scene_01', 'scene_02']
    );

    assert.equal(merged[1].continuity.cast[0].wardrobeId, 'look_a');
    assert.deepEqual(merged.map((item) => item.start), [0, 3]);
  } finally {
    restore();
  }
});

// ── 连续性检查 ───────────────────────────────────────────────────────

test('同一场次内无来由换装判 error，有换装动作就不报', () => {
  const restore = installTypeScriptLoader();
  try {
    const { checkStoryboardContinuity } = require('./shotContinuity.ts');

    const issues = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_a' })] } }),
      shot('s2', 'scene_01', { continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_b' })] } })
    ]);
    const wardrobe = issues.filter((issue) => issue.field === 'wardrobe');
    assert.equal(wardrobe.length, 1);
    assert.equal(wardrobe[0].severity, 'error');
    assert.match(wardrobe[0].message, /look_a/);

    // 剧情里真的换了衣服就不该报。护栏一旦噪音太大就会被整体忽略。
    const explained = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_a' })] } }),
      shot('s2', 'scene_01', { action: '她换上外套', continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_b' })] } })
    ]);
    assert.equal(explained.filter((issue) => issue.field === 'wardrobe').length, 0);
  } finally {
    restore();
  }
});

test('跨场次换装只判 warning，不挡住确认', () => {
  const restore = installTypeScriptLoader();
  try {
    const { checkStoryboardContinuity } = require('./shotContinuity.ts');
    const issues = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_a' })] } }),
      shot('s2', 'scene_02', { continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_b' })] } })
    ]);
    const wardrobe = issues.filter((issue) => issue.field === 'wardrobe');
    assert.equal(wardrobe.length, 1);
    // 跨场次换装可能是合理的剧情，卡死会让用户没法往下走。
    assert.equal(wardrobe[0].severity, 'warning');
  } finally {
    restore();
  }
});

test('已经离场的人又出现在下一镜判 error', () => {
  const restore = installTypeScriptLoader();
  try {
    const { checkStoryboardContinuity } = require('./shotContinuity.ts');

    const issues = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { cast: [cast('zhou_xu', { exited: true })] } }),
      shot('s2', 'scene_01', { continuity: { cast: [cast('zhou_xu')] } })
    ]);
    assert.equal(issues.filter((issue) => issue.field === 'exited_cast' && issue.severity === 'error').length, 1);

    const explained = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { cast: [cast('zhou_xu', { exited: true })] } }),
      shot('s2', 'scene_01', { action: '他推门回来', continuity: { cast: [cast('zhou_xu')] } })
    ]);
    assert.equal(explained.filter((issue) => issue.field === 'exited_cast').length, 0);
  } finally {
    restore();
  }
});

test('正反打两镜视线同朝一侧判 error', () => {
  const restore = installTypeScriptLoader();
  try {
    const { checkStoryboardContinuity } = require('./shotContinuity.ts');
    const issues = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { cast: [cast('lin_yan', { eyeline: '看向画面左侧' })] } }),
      shot('s2', 'scene_01', {
        continuity: { reverseShotOf: 's1', cast: [cast('zhou_xu', { eyeline: '看向画面左侧' })] }
      })
    ]);
    assert.equal(issues.filter((issue) => issue.field === 'eyeline' && issue.severity === 'error').length, 1);

    const ok = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { cast: [cast('lin_yan', { eyeline: '看向画面左侧' })] } }),
      shot('s2', 'scene_01', {
        continuity: { reverseShotOf: 's1', cast: [cast('zhou_xu', { eyeline: '看向画面右侧' })] }
      })
    ]);
    assert.equal(ok.filter((issue) => issue.field === 'eyeline').length, 0);
  } finally {
    restore();
  }
});

test('运动方向凭空翻转判 warning，有转身动作就不报', () => {
  const restore = installTypeScriptLoader();
  try {
    const { checkStoryboardContinuity } = require('./shotContinuity.ts');

    const issues = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { cast: [cast('lin_yan', { movementDirection: '从画面左侧走向右侧' })] } }),
      shot('s2', 'scene_01', { continuity: { cast: [cast('lin_yan', { movementDirection: '向左走' })] } })
    ]);
    assert.equal(issues.filter((issue) => issue.field === 'screen_direction').length, 1);

    const explained = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { cast: [cast('lin_yan', { movementDirection: '从画面左侧走向右侧' })] } }),
      shot('s2', 'scene_01', { action: '她转身往回走', continuity: { cast: [cast('lin_yan', { movementDirection: '向左走' })] } })
    ]);
    assert.equal(explained.filter((issue) => issue.field === 'screen_direction').length, 0);
  } finally {
    restore();
  }
});

test('同一场次里时间跳变和光源翻边判 error', () => {
  const restore = installTypeScriptLoader();
  try {
    const { checkStoryboardContinuity } = require('./shotContinuity.ts');
    const issues = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { timeOfDay: '傍晚', lightDirection: '画面右后方' } }),
      shot('s2', 'scene_01', { continuity: { timeOfDay: '深夜', lightDirection: '画面左前方' } })
    ]);

    assert.equal(issues.filter((issue) => issue.field === 'time_light' && issue.severity === 'error').length, 1);
    assert.equal(issues.filter((issue) => issue.field === 'light_direction' && issue.severity === 'error').length, 1);

    // 换了场次就是剧情，不是穿帮。
    const across = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { timeOfDay: '傍晚' } }),
      shot('s2', 'scene_02', { continuity: { timeOfDay: '深夜' } })
    ]);
    assert.equal(across.filter((issue) => issue.field === 'time_light').length, 0);
  } finally {
    restore();
  }
});

test('同一场次里换空间母版或换关系段落判 error', () => {
  const restore = installTypeScriptLoader();
  try {
    const { checkStoryboardContinuity } = require('./shotContinuity.ts');
    const issues = checkStoryboardContinuity([
      shot('s1', 'scene_01', { sceneMasterId: 'master_living', continuity: { relationshipId: 'rel_01' } }),
      shot('s2', 'scene_01', { sceneMasterId: 'master_office', continuity: { relationshipId: 'rel_02' } })
    ]);

    assert.equal(issues.filter((issue) => issue.field === 'scene_master' && issue.severity === 'error').length, 1);
    assert.equal(issues.filter((issue) => issue.field === 'relationship' && issue.severity === 'error').length, 1);
  } finally {
    restore();
  }
});

test('时期倒退没有闪回交代时判 warning', () => {
  const restore = installTypeScriptLoader();
  try {
    const { checkStoryboardContinuity } = require('./shotContinuity.ts');

    const issues = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { timelineStage: '大学时期' } }),
      shot('s2', 'scene_02', { continuity: { timelineStage: '工作三年后' } }),
      shot('s3', 'scene_03', { continuity: { timelineStage: '大学时期' } })
    ]);
    assert.equal(issues.filter((issue) => issue.field === 'timeline_stage').length, 1);

    const explained = checkStoryboardContinuity([
      shot('s1', 'scene_01', { continuity: { timelineStage: '大学时期' } }),
      shot('s2', 'scene_02', { continuity: { timelineStage: '工作三年后' } }),
      shot('s3', 'scene_03', { visual: '闪回：教学楼走廊', continuity: { timelineStage: '大学时期' } })
    ]);
    assert.equal(explained.filter((issue) => issue.field === 'timeline_stage').length, 0);
  } finally {
    restore();
  }
});

test('干净的分镜一条告警都不产生', () => {
  const restore = installTypeScriptLoader();
  try {
    const { carryStoryboardContinuity, checkStoryboardContinuity } = require('./shotContinuity.ts');
    const carried = carryStoryboardContinuity([
      shot('s1', 'scene_01', {
        continuity: {
          timelineStage: '大学时期',
          relationshipId: 'rel_01',
          timeOfDay: '傍晚',
          cast: [cast('lin_yan', { wardrobeId: 'look_a', screenPosition: '画面左三分之一' })]
        }
      }),
      shot('s2', 'scene_01', { continuity: { cast: [cast('lin_yan')] } }),
      shot('s3', 'scene_02', { continuity: { cast: [cast('lin_yan')] } })
    ]);

    // 全量告警等于没有告警：正常推进的分镜必须一条都不报，否则用户会整体忽略这一栏。
    assert.deepEqual(checkStoryboardContinuity(carried), []);
  } finally {
    restore();
  }
});

test('连续性 error 挡在分镜确认之前，warning 不挡', () => {
  const restore = installTypeScriptLoader();
  try {
    const { validateStageAssets } = require('./productionAssets.ts');
    const workspaceWith = (shots) => ({
      projectId: 'p',
      title: 't',
      branch: 'main',
      mode: 'creator',
      activeWorkflow: 'shot',
      currentTimelineVersion: 1,
      complianceStatus: 'pass',
      files: [{
        path: 'storyboard.json',
        kind: 'json',
        content: JSON.stringify({ scenes: shots }),
        version: 1,
        updatedAt: '2026-08-08T00:00:00.000Z'
      }]
    });

    const blocked = validateStageAssets('storyboard', workspaceWith([
      shot('s1', 'scene_01', { continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_a' })] } }),
      shot('s2', 'scene_01', { continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_b' })] } })
    ]));
    assert.equal(blocked.length, 1);
    assert.match(blocked[0], /连续性冲突（服装造型）/);

    // 跨场次换装是 warning，不该把用户卡在确认这一步。
    const allowed = validateStageAssets('storyboard', workspaceWith([
      shot('s1', 'scene_01', { continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_a' })] } }),
      shot('s2', 'scene_02', { continuity: { cast: [cast('lin_yan', { wardrobeId: 'look_b' })] } })
    ]));
    assert.deepEqual(allowed, []);
  } finally {
    restore();
  }
});

// ── 时长 ─────────────────────────────────────────────────────────────

test('镜头时长由台词长度和动作节拍决定，不是固定值', () => {
  const restore = installTypeScriptLoader();
  try {
    const { dramaticShotDuration } = require('./shotContinuity.ts');
    const { targetShotSeconds, DIALOGUE_SHOT_DURATION_CAP } = require('./shotPhysics.ts');

    // 一句短台词：说完就切，不需要把镜头撑到上限。
    const short = dramaticShotDuration({ dialogue: '林岩：走吧。', physicsMode: 'realistic' });
    // 一句长台词：说不完就切走是最常见的一种「台词被吃掉」。
    const long = dramaticShotDuration({
      dialogue: '林岩：我等了你两个小时，你一句解释都没有，现在还要我笑着说没关系吗？',
      physicsMode: 'realistic'
    });
    assert.ok(long > short, `长台词应该给更长时长，得到 ${long} vs ${short}`);
    // 但仍然卡在有台词镜头的上限内——脸占得大、嘴一直在动，是身份漂移最藏不住的地方。
    assert.ok(long <= DIALOGUE_SHOT_DURATION_CAP);

    // 没有台词时按动作节拍给：一个节拍就是目标时长，多一个节拍多给一点。
    const oneBeat = dramaticShotDuration({ action: '她放下杯子', physicsMode: 'realistic' });
    const threeBeats = dramaticShotDuration({ action: '她站起身，拿起杯子，走向窗边', physicsMode: 'realistic' });
    assert.equal(oneBeat, targetShotSeconds('realistic'));
    assert.ok(threeBeats > oneBeat);

    // 特写信息量小，收得快；全景要交代空间，给得多一点。
    const closeUp = dramaticShotDuration({ action: '她放下杯子', shotSize: '特写', physicsMode: 'realistic' });
    const wide = dramaticShotDuration({ action: '她放下杯子', shotSize: '全景', physicsMode: 'realistic' });
    assert.ok(closeUp < oneBeat && wide > oneBeat);
  } finally {
    restore();
  }
});

test('时长上限仍然由物理护栏卡死，推导值顶不开它', () => {
  const restore = installTypeScriptLoader();
  try {
    const { dramaticShotDuration } = require('./shotContinuity.ts');
    const { physicsDurationCap } = require('./shotPhysics.ts');

    const many = dramaticShotDuration({
      action: '她起身，转身，走向门口，停下，回头，抬手，推开门',
      physicsMode: 'realistic'
    });
    assert.ok(many <= physicsDurationCap('realistic'));
    // 夸张镜头本来就不追求物理连续，上限可以宽一点。
    assert.ok(dramaticShotDuration({ action: '她起身，转身，走向门口，停下，回头，抬手，推开门', physicsMode: 'surreal' })
      <= physicsDurationCap('surreal'));
  } finally {
    restore();
  }
});

test('模型给了有效时长就用它，只在缺失或不合法时才推导', () => {
  const restore = installTypeScriptLoader();
  try {
    const { resolveShotDuration, MIN_SHOT_SECONDS } = require('./shotContinuity.ts');
    const { targetShotSeconds } = require('./shotPhysics.ts');

    // 导演故意留的静默不能被推导覆盖掉——那几秒正是这一镜的全部意义。
    assert.equal(resolveShotDuration({ durationSeconds: 4.5, action: '她放下杯子' }), 4.5);
    // 缺失、0、字符串一律走推导，而不是退回一个写死的默认值。
    assert.equal(resolveShotDuration({ action: '她放下杯子' }), targetShotSeconds('realistic'));
    assert.equal(resolveShotDuration({ durationSeconds: 0, action: '她放下杯子' }), targetShotSeconds('realistic'));
    assert.equal(resolveShotDuration({ durationSeconds: '三秒', action: '她放下杯子' }), targetShotSeconds('realistic'));
    // 0.8 秒的片段渲出来只有二十几帧，是闪帧不是镜头。
    assert.equal(resolveShotDuration({ durationSeconds: 0.8 }), MIN_SHOT_SECONDS);
    // 超上限的照样砍回上限。
    assert.equal(resolveShotDuration({ durationSeconds: 12, physicsMode: 'realistic' }), 5);
  } finally {
    restore();
  }
});

test('分镜提示词里写清了 continuity 契约，且不分批时不出现批次话术', () => {
  const restore = installTypeScriptLoader();
  try {
    const { stageGenerationInstruction } = require('./stageGeneration.ts');
    const instruction = stageGenerationInstruction('storyboard', '');

    for (const field of ['timelineStage', 'relationshipId', 'wardrobeId', 'screenPosition', 'eyeline', 'movementDirection', 'endFrame', 'previousEndFrame']) {
      assert.match(instruction, new RegExp(field), `分镜提示词缺少 ${field} 字段说明`);
    }
    // previousEndFrame 是系统回填的，模型写了也会被覆盖，必须说清楚。
    assert.match(instruction, /previousEndFrame：固定填空字符串/);
    // wardrobeId 必须填 id 而不是服装描述——描述每写一次就漂一次。
    assert.match(instruction, /这里填 id，不要填服装描述/);
  } finally {
    restore();
  }
});
