const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadCharacterRoster() {
  const source = fs.readFileSync(require('node:path').join(__dirname, 'characterRoster.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

// 真实事故脚本：人物设定只写了 4 个配角，正文一路用到前任G。
const XIAOPENG_SCRIPT = `# 小澎的恋爱史

## 项目信息
- 平台：TikTok

## 人物设定

**小澎**：26岁，性格直率，恋爱经历丰富但总遇奇葩

**配角群**：
- 前任A：控制欲强
- 前任B：妈宝男
- 前任C：海王
- 现任：温柔但有点笨拙

## 脚本正文

### 第5节：第四段恋爱
**前任D**：你太作了！

### 第6节：第五段恋爱
**前任E**：游戏。
`;

const ALL_CHARACTERS = ['小澎', '前任A', '前任B', '前任C', '前任D', '前任E', '前任F', '前任G', '现任'];

test('认得出正文里多出来的人物', () => {
  const { missingFromRoster } = loadCharacterRoster();

  assert.deepEqual(missingFromRoster(XIAOPENG_SCRIPT, ALL_CHARACTERS), ['前任D', '前任E', '前任F', '前任G']);
});

test('人物设定小节到下一个同级标题为止，不会把正文里的人名算进名册', () => {
  const { characterRosterSection } = loadCharacterRoster();
  const section = characterRosterSection(XIAOPENG_SCRIPT);

  assert.match(section, /前任A/);
  // 前任D 只出现在「脚本正文」小节里。截取范围错了的话它会被误判成已声明。
  assert.doesNotMatch(section, /前任D/);
});

test('脚本没有人物小节时不报不一致——无从比较不是错误', () => {
  const { missingFromRoster, characterRosterSection } = loadCharacterRoster();

  assert.equal(characterRosterSection('# 标题\n\n## 正文\n随便写点什么'), null);
  assert.deepEqual(missingFromRoster('# 标题\n\n## 正文\n随便写点什么', ALL_CHARACTERS), []);
  assert.deepEqual(missingFromRoster(undefined, ALL_CHARACTERS), []);
});

test('声明了人物小节但里面是空的，要报出来', () => {
  const { missingFromRoster, characterRosterSection } = loadCharacterRoster();
  const script = '# 片名\n\n## 人物设定\n\n## 脚本正文\n小澎说话';

  // 返回空字符串而不是 null：这是「声明了名册但没写人」，和「没有名册」不是一回事。
  assert.equal(characterRosterSection(script), '');
  assert.notEqual(characterRosterSection(script), null);
  assert.deepEqual(missingFromRoster(script, ['小澎']), ['小澎']);
});

test('名册齐全时不产生警告', () => {
  const { missingFromRoster, rosterGapWarning } = loadCharacterRoster();
  const missing = missingFromRoster(XIAOPENG_SCRIPT, ['小澎', '前任A', '前任B', '前任C', '现任']);

  assert.deepEqual(missing, []);
  assert.equal(rosterGapWarning(missing), '');
});

test('警告文案指向脚本，而不是让用户删角色', () => {
  const { rosterGapWarning } = loadCharacterRoster();
  const warning = rosterGapWarning(['前任D', '前任E']);

  assert.match(warning, /2 个人物/);
  assert.match(warning, /前任D、前任E/);
  // 多出来的角色是正文要求的，该改的是脚本。
  assert.match(warning, /回到剧本补全人物设定/);
});

test('识别多种角色小节标题写法', () => {
  const { characterRosterSection } = loadCharacterRoster();

  for (const heading of ['人物设定', '## 角色表', '### 出场人物', '**人物**']) {
    const script = `# 片名\n\n## ${heading.replace(/[#*\s]/g, '')}\n- 小澎\n\n## 正文\n内容`;
    assert.match(characterRosterSection(script) || '', /小澎/, `应识别标题：${heading}`);
  }
});

/**
 * 真实事故：脚本人物设定写了陈女士 28 岁、前任A、现任B 三个人，
 * 角色阶段只产出 1 个（而且是内置模板编的），界面上一句提醒都没有。
 * 上面 missingFromRoster 查的是「多出来的人」，这一半一直没人查。
 */
const CHEN_SCRIPT = `# 陈女士的恋爱史

## 项目信息
- 平台：抖音
- 时长：180秒（12小节×15秒）
- 主要露脸角色：陈女士、前任A（背影/侧影）、现任（背影/侧影）

## 人物设定

- 陈女士：女主角，28岁，职场女性，性格独立但恋爱路上屡遇波折
- 前任A：陈女士第一段恋爱的对象，29岁，性格温和但缺乏主见
- **现任B**：陈女士第三段恋爱的对象，30岁，成熟稳重

## 脚本正文

### 第1节
陈女士：我今年28了。
`;

test('认得出人物设定里声明、但角色资产里缺席的人', () => {
  const { rosterNamesFromScript, rosterNamesMissingFromAssets } = loadCharacterRoster();

  assert.deepEqual(rosterNamesFromScript(CHEN_SCRIPT), ['陈女士', '前任A', '现任B']);
  // 只生成了 1 个角色时，另外两个必须被点名
  assert.deepEqual(rosterNamesMissingFromAssets(CHEN_SCRIPT, ['陈女士']), ['前任A', '现任B']);
  // 三个都生成了就不该报
  assert.deepEqual(rosterNamesMissingFromAssets(CHEN_SCRIPT, ['陈女士', '前任A', '现任B']), []);
});

test('兜底模板编出来的角色名不会掩盖缺席：三个人一个都没匹配上', () => {
  const { rosterNamesMissingFromAssets, rosterShortfallWarning } = loadCharacterRoster();
  const missing = rosterNamesMissingFromAssets(CHEN_SCRIPT, ['对这个主题感兴趣的目标观众中的一个真实用户或讲述者']);

  assert.deepEqual(missing, ['陈女士', '前任A', '现任B']);
  const warning = rosterShortfallWarning(missing, 1);
  assert.match(warning, /声明了 4 个人物/);
  assert.match(warning, /只产出了 1 个/);
  assert.match(warning, /陈女士、前任A、现任B/);
});

/**
 * 角色阶段现在给脚本没起名的人随机起名。只按 name 比对的话，同一个「前任A」会同时
 * 触发两条互相矛盾的警告：一条说他漏做了，一条说凭空多做了「周叙」。
 * scriptAlias 是这两条核对唯一的对照线索。
 */
test('随机起的名字带上 scriptAlias 后，两个方向的名册核对都不再误报', () => {
  const { missingFromRoster, rosterNamesMissingFromAssets } = loadCharacterRoster();
  const renamed = [
    { name: '陈女士' },
    { name: '周叙', scriptAlias: '前任A' },
    { name: '苏晚', scriptAlias: '现任B' }
  ];

  assert.deepEqual(rosterNamesMissingFromAssets(CHEN_SCRIPT, renamed), []);
  assert.deepEqual(missingFromRoster(CHEN_SCRIPT, renamed), []);
  // 没填 scriptAlias 时照旧报——不能因为兼容随机起名就把真的漏做也放过去。
  assert.deepEqual(missingFromRoster(CHEN_SCRIPT, [{ name: '周叙' }]), ['周叙']);
  assert.deepEqual(rosterNamesMissingFromAssets(CHEN_SCRIPT, [{ name: '周叙' }]), ['陈女士', '前任A', '现任B']);
});

test('不把年龄、外貌这类小标题当成人名', () => {
  const { rosterNamesFromScript } = loadCharacterRoster();
  const script = `# 片名

## 人物设定

- 陈女士：女主角
  - 年龄：28岁
  - 外貌：中等身高，干练短发
  - 性格：独立

## 正文
内容
`;
  assert.deepEqual(rosterNamesFromScript(script), ['陈女士']);
});

test('没有人物设定小节时不报缺席——无从比较，不是错误', () => {
  const { rosterNamesFromScript, rosterNamesMissingFromAssets, rosterShortfallWarning } = loadCharacterRoster();

  assert.deepEqual(rosterNamesFromScript('# 片名\n\n## 正文\n随便写点'), []);
  assert.deepEqual(rosterNamesMissingFromAssets('# 片名\n\n## 正文\n随便写点', []), []);
  assert.equal(rosterShortfallWarning([], 3), '');
});
