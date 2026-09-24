/**
 * 守卫：设置页的**分组结构**（作者 2026-09-24 要求把条目按主题归拢）。
 *
 * 为什么要有它：分组是"看着对不对"的东西，谁都能顺手把一行挪回上面 ——
 * 而这类改动**不会报任何错**：页面照常渲染，只是作者要的归类散了。
 * 所以把「哪一组、什么顺序、谁属于谁、每组卡片圆角成套」都钉成可判定的断言。
 *
 * 判定方式：直接读 `SettingsScreen.tsx` 的源码文本，取每个 `SectionHeader title=` 的**行号**、
 * 每个 `slot="headline"` 的行号，然后用"行号落在哪两个 header 之间"来判断归属 ——
 * 不依赖渲染，也不需要浏览器。同一份断言在真机/浏览器上等于"从上往下看的样子"。
 *
 * 用法：node scripts/check-settings-groups.mjs
 */
import { readFile } from 'node:fs/promises';

const FILE = 'web/src/screens/SettingsScreen.tsx';

/** 分组口径（改这里 = 改产品决定；守卫与实现共用同一份顺序） */
const GROUPS = [
  { title: '外观', rows: ['深色模式', '界面缩放', '底栏色散', '底栏散射', '底栏扭曲', '性能模式', '等高线背景'] },
  { title: '实时通知', rows: ['上课提醒（灵动岛）', '台词管理', '实时通知（流体云）自检'] },
  { title: '屏幕安全区', rows: ['上端安全区', '下端安全区'] },
  { title: '导航与学校', rows: ['默认跳转地图', '学校名称'] },
  { title: '图像识别与资源', rows: ['本地识别', '允许联网取识别资源', '接口配置'] },
  { title: '关于', rows: ['关于本软件', '开源相关'] },
];

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` —— ${detail}`}`);
};

const source = await readFile(FILE, 'utf8');
const lines = source.split(/\r?\n/);

/** header 行号（1 基）与标题 */
const headers = [];
lines.forEach((line, index) => {
  const hit = /<SectionHeader[^>]*title="([^"]+)"/.exec(line);
  if (hit) headers.push({ title: hit[1], line: index + 1 });
});

/** 条目行号 + 圆角类 */
const rows = [];
lines.forEach((line, index) => {
  const headline = /slot="headline">([^<]+)</.exec(line);
  if (!headline) return;
  // 圆角类在开标签里；`<md-list-item` 可能跨行，所以先往回找到开标签，再在标签闭合前找类名
  let radius = '';
  let tagStart = -1;
  for (let i = index; i >= 0 && i > index - 14; i -= 1) {
    if (lines[i].includes('<md-list-item')) {
      tagStart = i;
      break;
    }
  }
  if (tagStart >= 0) {
    for (let i = tagStart; i <= index; i += 1) {
      const hit = /rounded-(outer-top|outer-bottom|middle)/.exec(lines[i]);
      if (hit) {
        radius = hit[1];
        break;
      }
      if (i > tagStart && lines[i].includes('>')) break;
    }
  }
  rows.push({ title: headline[1], line: index + 1, radius });
});
console.log(`设置页：${headers.length} 个分组标题、${rows.length} 个条目\n`);

const missingHeaders = GROUPS.filter((group) => !headers.some((header) => header.title === group.title));
check(
  `六个分组标题都在（${GROUPS.map((g) => g.title).join(' / ')}）`,
  missingHeaders.length === 0,
  `缺少：${missingHeaders.map((g) => g.title).join(' / ')}`,
);

const groupOrder = headers
  .map((header) => header.title)
  .filter((title) => GROUPS.some((group) => group.title === title));
check(
  '分组顺序与口径一致',
  JSON.stringify(groupOrder) === JSON.stringify(GROUPS.map((g) => g.title)),
  `实际顺序：${groupOrder.join(' → ')}`,
);

console.log('\n=== 每条设置项必须落在自己那一组里 ===');
const headerLineOf = (title) => headers.find((header) => header.title === title)?.line ?? -1;
for (let i = 0; i < GROUPS.length; i += 1) {
  const group = GROUPS[i];
  const from = headerLineOf(group.title);
  const nextTitle = GROUPS[i + 1]?.title;
  const to = nextTitle ? headerLineOf(nextTitle) : Number.MAX_SAFE_INTEGER;
  const inside = rows.filter((row) => row.line > from && row.line < to).map((row) => row.title);
  const wanted = group.rows;
  const ok = wanted.every((row) => inside.includes(row)) && inside.every((row) => wanted.includes(row));
  check(
    `「${group.title}」= ${wanted.join('、')}`,
    ok,
    `实际是：${inside.join('、') || '(空)'}`,
  );
  // 每组卡片圆角成套：首条 outer-top、末条 outer-bottom
  const groupRows = rows.filter((row) => row.line > from && row.line < to);
  if (groupRows.length) {
    check(
      `「${group.title}」圆角成套（首 top / 末 bottom）`,
      groupRows[0].radius === 'outer-top' && groupRows[groupRows.length - 1].radius === 'outer-bottom',
      `首=${groupRows[0].radius || '(无)'} 末=${groupRows[groupRows.length - 1].radius || '(无)'}`,
    );
  }
}

console.log('\n=== 控件行（滑块 / 按钮）必须绑在自己那一条上 ===');
/**
 * 真实回归：作者反馈「流体云自检跑到其他位置去了😡」——
 * 发送实况测试的按钮被一次重排脚本从「实时通知」拽到了「图像识别与资源」的**组头**上，
 * 页面照常渲染、不报错，肉眼要滚到设置页中段才看得出来。
 * 所以控件行不能只存在，还必须：①属于声明的分组 ②上方最近的那一条正好是它的主人。
 * 控件行本身没有文案（`slot="headline"`），只能靠内容特征 + 行号锚定。
 */
const CONTROL_OWNERS = [
  { id: '提前量按钮', match: 'setLeadDialogOpen(true)', owner: '上课提醒（灵动岛）', group: '实时通知' },
  { id: '上端安全区滑块', match: 'ariaLabel="上端安全区"', owner: '上端安全区', group: '屏幕安全区' },
  { id: '下端安全区滑块', match: 'ariaLabel="下端安全区"', owner: '下端安全区', group: '屏幕安全区' },
  { id: '流体云自检按钮', match: 'nativeTestLiveUpdate()', owner: '实时通知（流体云）自检', group: '实时通知' },
];

/** 控件行的行区间：靠 div 深度配平，不依赖缩进 */
const controlRows = [];
lines.forEach((line, index) => {
  if (!line.includes('list-control-row')) return;
  let depth = 0;
  let end = index + 1;
  for (let i = index; i < lines.length; i += 1) {
    depth += (lines[i].match(/<div\b/g) ?? []).length;
    depth -= (lines[i].match(/<\/div>/g) ?? []).length;
    if (depth <= 0) {
      end = i + 1;
      break;
    }
  }
  controlRows.push({ line: index + 1, end, text: lines.slice(index, end).join('\n') });
});

check(
  `控件行共 ${CONTROL_OWNERS.length} 个（无重复、无迁移残留）`,
  controlRows.length === CONTROL_OWNERS.length,
  `实际 ${controlRows.length} 个，行号 ${controlRows.map((row) => row.line).join('、') || '(无)'}`,
);

for (const spec of CONTROL_OWNERS) {
  const hits = controlRows.filter((row) => row.text.includes(spec.match));
  if (hits.length !== 1) {
    check(`${spec.id} 存在且唯一`, false, `匹配到 ${hits.length} 个`);
    continue;
  }
  const row = hits[0];
  const index = GROUPS.findIndex((group) => group.title === spec.group);
  const from = headerLineOf(spec.group);
  const nextTitle = GROUPS[index + 1]?.title;
  const to = nextTitle ? headerLineOf(nextTitle) : Number.MAX_SAFE_INTEGER;
  check(`${spec.id} 留在「${spec.group}」内`, row.line > from && row.line < to, `行 ${row.line}，组区间 ${from}–${to}`);
  const above = rows.filter((item) => item.line < row.line).sort((a, b) => b.line - a.line)[0];
  check(`${spec.id} 紧跟在「${spec.owner}」之后`, above?.title === spec.owner, `实际跟在「${above?.title ?? '(无)'}」之后`);
  const owner = rows.find((item) => item.title === spec.owner);
  check(`「${spec.owner}」本身在「${spec.group}」内`, Boolean(owner) && owner.line > from && owner.line < to, `主人行 ${owner?.line ?? '(缺)'}`);
}

console.log('\n=== JSX 结构：条目不得相互嵌套 ===');
/**
 * 真实事故：等高线背景那一整块被插进了「性能模式」的 `<md-list-item>` **内部**（插在了图标 div 之后、
 * 标题之前）。源码看着"有条目、行号也对"，React 也不报错 —— 但渲染出来是一张卡片套在另一张卡片里，
 * 而且两个 onClick 都会触发：点一次等高线会同时弹出「性能模式」和「等高线背景」两个对话框。
 * 文本行号断不出来，所以这里补一条 JSX 配平/嵌套断言。
 */
let itemDepth = 0;
let itemOpens = 0;
let itemCloses = 0;
const nestedAt = [];
lines.forEach((line, index) => {
  const opens = (line.match(/<md-list-item\b/g) ?? []).length;
  const closes = (line.match(/<\/md-list-item>/g) ?? []).length;
  for (let i = 0; i < opens; i += 1) {
    itemDepth += 1;
    itemOpens += 1;
    if (itemDepth > 1) nestedAt.push(index + 1);
  }
  for (let i = 0; i < closes; i += 1) {
    itemCloses += 1;
    itemDepth -= 1;
    if (itemDepth < 0) nestedAt.push(index + 1);
  }
});
check(`条目标签配平（开 ${itemOpens} / 闭 ${itemCloses}）`, itemOpens === itemCloses && itemDepth === 0, `收尾深度 ${itemDepth}`);
check(
  '没有条目套条目（否则一次点击弹两个对话框）',
  nestedAt.length === 0,
  `疑似嵌套/越界行号：${[...new Set(nestedAt)].join('、')}`,
);

console.log('\n=== 控件行的样式必须真的存在（否则真机上说明文字会排出屏幕）===');
/**
 * 真实事故：`.list-control-row` 在**任何 CSS 里都没有定义**，全靠 inline 默认排布。
 * 浏览器 460dp 宽时看着没问题；真机 366dp 上按钮后面那行说明（「仅 Android 16 / ColorOS 生效」）
 * 直接排到屏幕外被裁掉。所以除了结构，连"这条行有没有布局规则"也要钉住。
 */
const componentsCss = await readFile('web/src/theme/components.css', 'utf8');
const rule = /\.list-control-row\s*\{([^}]*)\}/.exec(componentsCss);
const ruleBody = rule?.[1] ?? '';
check('.list-control-row 有样式定义', Boolean(rule), 'components.css 里找不到这条规则');
check('控件行是可换行的 flex（窄屏不裁字）', /display:\s*flex/.test(ruleBody) && /flex-wrap:\s*wrap/.test(ruleBody), `规则内容：${ruleBody.replace(/\s+/g, ' ').trim() || '(空)'}`);
check(
  '控件行里的说明文字可收缩（min-width: 0）',
  /\.list-control-row\s*>\s*\.md-body-small\s*\{[^}]*min-width:\s*0/.test(componentsCss),
  '缺少 `.list-control-row > .md-body-small { min-width: 0 }`，文字不会换行',
);

console.log('\n=== 设置首页只放「分类入口」（Clash Verge 式）===');
/**
 * 作者 2026-09-25 的要求：照着 Clash Verge 的设置界面改 —— 首页只放**入口**，
 * 点进去才是那一类的设置屏；滑块这类控件只许存在于它自己的屏里。
 * 静态部分钉两件事：① 六个入口与 `show('<id>')` 的门是一一对应的（漏一个就是"点进去空白"）；
 * ② 入口必须通过路由推 `settingsSection` 子屏，而不是在原地展开。
 */
const HUB_IDS = ['appearance', 'notify', 'safearea', 'nav', 'ocr', 'about'];
const missingGate = HUB_IDS.filter((id) => !new RegExp(`show\\('${id}'\\)`).test(source));
check(`六个分类都有对应的子屏门（show('id')）`, missingGate.length === 0, `缺少：${missingGate.join('、')}`);
check('入口通过 settingsSection 路由跳子屏', /nav\.push\('settingsSection',\s*\{\s*section:\s*id\s*\}/.test(source), '没有推子屏路由');
const hubIds = [...source.matchAll(/\['(appearance|notify|safearea|nav|ocr|about)',\s*'([a-z_]+)',\s*'([^']+)'/g)].map((m) => m[1]);
check(
  `入口表就是那六类（实际 ${hubIds.join('、') || '(空)'}）`,
  HUB_IDS.every((id) => hubIds.includes(id)) && hubIds.length === HUB_IDS.length,
  '入口与分类对不上',
);
check('子屏标题表覆盖六个分类', HUB_IDS.every((id) => new RegExp(`${id}:\\s*'`).test(source)), 'SECTION_TITLES 缺项');
check('子屏顶栏有返回（点了能回去）', /onBack=\{atHub \? undefined : \(\) => nav\.pop\(\)\}/.test(source), '子屏没有返回按钮');

/* 「滑块只存在于它自己的屏里」——作者原话是「滑块选项什么的都不许出错」。
   静态可判定的部分：设置页里每个滑块都必须挂在一行**带 show(...) 门**的控件行里，
   而入口区（atHub 那一块）里一个滑块都不许有。 */
console.log('\n=== 滑块只许待在自己的屏里 ===');
const sliderIdx = [...source.matchAll(/<MdSlider/g)].map((m) => m.index ?? 0);
const enclosingGroupGated = sliderIdx.every((idx) => {
  const groupStart = source.lastIndexOf('<div className="list-group"', idx);
  if (groupStart < 0) return false;
  const tag = source.slice(groupStart, source.indexOf('>', groupStart) + 1);
  return /style=\{show\('/.test(tag);
});
check(
  `两个滑块都待在"带门的分类容器"里（${sliderIdx.length} 个）`,
  sliderIdx.length === 2 && enclosingGroupGated,
  '有滑块不在带门的容器里，会漏到别的屏上',
);
const sliderCount = (source.match(/<MdSlider/g) ?? []).length;
check(`设置页里只有安全区那两个滑块（实际 ${sliderCount}）`, sliderCount === 2, '多出来的滑块要收进各自的屏');
const hubBlock = source.slice(source.indexOf('{atHub ? ('), source.indexOf(') : null}', source.indexOf('{atHub ? (')));
check('入口区（首页）里没有任何滑块', Boolean(hubBlock) && !/MdSlider/.test(hubBlock), '首页出现了滑块');
check('两个安全区滑块都在这一个屏里（不再嵌套子屏）', /safearea: '屏幕安全区'/.test(source) && !/insetTop: '上端安全区'/.test(source), '安全区结构不对');
/* 同路由去重：`nav.push` 里 `top.route === route` 会直接 return，
   所以"子屏再点一层进子屏"根本推不动 —— 这条断言把这个平台限制钉住。 */
check(
  '没有"子屏套子屏"的写法（同路由 push 会被去重掉）',
  !/nav\.push\('settingsSection',\s*\{\s*section:\s*'[a-z]+'\s*\},\s*'slide'\)[\s\S]{0,400}nav\.push\('settingsSection'/.test(source),
  '存在子屏套子屏，点不动',
);

/* 渲染层（给了 APP_URL 才跑，CI 的 dev server 阶段再跑一遍这个脚本）：
   首页与「屏幕安全区」屏上**一个可见滑块都没有**，点进「上端安全区」才有且只有一个。 */
if (process.env.APP_URL) {
  console.log('\n=== 真实渲染：首页不许出现滑块 ===');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ channel: 'chromium' });
  const page = await browser.newPage({ viewport: { width: 460, height: 940 }, deviceScaleFactor: 2 });
  await page.goto(process.env.APP_URL, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  const openSettings = async () => {
    await page.evaluate(() => {
      const tab = document.querySelectorAll('.m3e-dock-tab')[2];
      const r = tab.getBoundingClientRect();
      tab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true }));
    });
    await page.waitForTimeout(110);
    await page.evaluate(() => {
      const tab = document.querySelectorAll('.m3e-dock-tab')[2];
      const r = tab.getBoundingClientRect();
      tab.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true }));
    });
    await page.waitForTimeout(900);
  };
  const visibleSliders = () =>
    page.evaluate(() =>
      /* 只数**当前这一屏**里的滑块：导航栈会把上一屏留在 DOM 里（aria-hidden），
         它的滑块同样有矩形 —— 不限定的话会把"幽灵屏"一起数进来。 */
      [...document.querySelectorAll('.screen:not([aria-hidden="true"]) md-slider')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
      }).length,
    );
  const clickRow = async (title) => {
    /* 必须限定在**当前这一屏**里点：导航栈会把上一屏留在 DOM 里（aria-hidden），
       直接点旧屏的元素，坐标会落到新屏上，于是点出第二次同样的跳转。 */
    await page
      .locator(`.screen:not([aria-hidden="true"]) md-list-item:has([slot="headline"]:text-is("${title}"))`)
      .first()
      .click({ timeout: 5000, force: true });
    await page.waitForTimeout(900);
  };
  await openSettings();
  check(`设置首页可见滑块 = 0（实际 ${await visibleSliders()}）`, (await visibleSliders()) === 0, '首页有滑块');
  await clickRow('屏幕安全区');
  const onSafeArea = await visibleSliders();
  check(`「屏幕安全区」屏可见滑块 = 2（实际 ${onSafeArea}）`, onSafeArea === 2, '滑块没跟着进自己的屏');
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--inset-top').trim() || '(未设置)');  await page.evaluate(() => {
    /* 按 MdSlider 的真实契约触发：先写 value，再派发 change（handler 读的是 target.value） */
    const slider = [...document.querySelectorAll('.screen:not([aria-hidden="true"]) md-slider')].find(
      (el) => el.getBoundingClientRect().width > 4,
    );
    if (slider) {
      slider.value = 52;
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--inset-top').trim() || '(未设置)');
  check(`拖动滑块真的写进了 --inset-top（${before} → ${after}）`, after === '52px', '滑块没生效');
  await page.screenshot({ path: 'build/settings-safearea.png' });

  /* 选项屏：另开一页，走 设置 → 外观 → 底栏色散，应该进它自己的一屏并能选档 */
  const p4 = await browser.newPage({ viewport: { width: 460, height: 940 }, deviceScaleFactor: 2 });
  await p4.goto(process.env.APP_URL, { waitUntil: 'load' });
  await p4.waitForTimeout(2600);
  for (const type of ['pointerdown', 'pointerup']) {
    await p4.evaluate((t) => {
      const tab = document.querySelectorAll('.m3e-dock-tab')[2];
      const r = tab.getBoundingClientRect();
      tab.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true }));
    }, type);
    await p4.waitForTimeout(110);
  }
  await p4.waitForTimeout(900);
  const clickOn = async (title) => {
    await p4
      .locator(`.screen:not([aria-hidden="true"]) md-list-item:has([slot="headline"]:text-is("${title}"))`)
      .first()
      .click({ force: true });
    await p4.waitForTimeout(900);
  };
  await clickOn('外观');
  await clickOn('底栏色散');
  const optionScreen = await p4.evaluate(() => {
    const screen = document.querySelector('.screen:not([aria-hidden="true"])');
    return {
      title: screen?.querySelector('.app-bar-title')?.textContent?.trim() ?? '',
      rows: [...screen.querySelectorAll('md-list-item')]
        .filter((el) => el.getBoundingClientRect().height > 4)
        .map((el) => el.querySelector('[slot="headline"]')?.textContent?.trim())
        .filter(Boolean),
      hasDialog: Boolean(document.querySelector('md-dialog[open]')),
    };
  });
  check(`点「底栏色散」进了它自己的屏（标题「${optionScreen.title}」）`, optionScreen.title === '底栏色散', '没进选项屏');
  check(`选项屏里有三档（${optionScreen.rows.length} 行）`, optionScreen.rows.length === 3, JSON.stringify(optionScreen.rows));
  check('选项屏不是弹层', !optionScreen.hasDialog, '还在用弹层');
  await p4.locator('.screen:not([aria-hidden="true"]) md-list-item:has([slot="headline"]:text-is("极致：六段光谱（紫蓝青绿黄红），边缘虹带拉到最宽"))').first().click({ force: true });
  await p4.waitForTimeout(900);
  const applied = await p4.evaluate(() => ({
    bands: document.querySelector('.m3e-dock')?.dataset.lensDispersion ?? '(无)',
    checked: [...document.querySelectorAll('.screen:not([aria-hidden="true"]) md-list-item')]
      .filter((el) => el.getBoundingClientRect().height > 4 && /radio_button_checked/.test(el.querySelector('md-icon')?.textContent ?? ''))
      .map((el) => el.querySelector('[slot="headline"]')?.textContent?.trim()),
  }));
  check(`选「极致」真的生效（滤镜链 = ${applied.bands}）`, applied.bands === 'bands-6', '设置没写进去');
  await p4.screenshot({ path: 'build/settings-option-screen.png' });
  await browser.close();
}

console.log('\n=== 选项屏：点一个选项进它自己一屏（Clash Verge 的"语言/主题"那种）===');
check('底栏色散那一行改成推「选项屏」而不是开弹层', /nav\.push\('settingsSection',\s*\{\s*option:\s*'dispersion'\s*\}/.test(source), '还是走弹层');
/* 外观里那六项都应该各自一屏（作者那句「每个选项点进去是独立屏幕」的严格口径） */
const OPTION_IDS = ['dispersion', 'scatter', 'warp', 'scale', 'perf', 'contour'];
const missingOption = OPTION_IDS.filter((id) => !new RegExp(`option:\\s*'${id}'`).test(source));
check(
  `六个外观选项都推各自的屏（缺：${missingOption.join('、') || '无'}）`,
  missingOption.length === 0,
  '还有选项留在弹层里',
);
check(
  `选项表覆盖六项（${(source.match(/id: '(dispersion|scatter|warp|scale|perf|contour)'/g) ?? []).length}/6）`,
  OPTION_IDS.every((id) => new RegExp(`id: '${id}'`).test(source)),
  'OPTION_CHOICES 缺项',
);
check(
  '外观里不再有"开弹层"的选项行（全迁到选项屏）',
  !/set(Dispersion|Scatter|Warp|Scale|Perf|Contour)DialogOpen\(true\)/.test(source),
  '还有行在开弹层',
);
check(
  '选项屏标题表由选项表派生（不另写一份）',
  /const OPTION_TITLES: Record<string, string> = Object\.fromEntries\(/.test(source) && /OPTION_CHOICES\.map/.test(source),
  'OPTION_TITLES 不是从 OPTION_CHOICES 派生的',
);
check(
  '底栏色散那屏有三档（关/简洁/极致）',
  /id: 'dispersion'[\s\S]{0,700}\['off'[\s\S]{0,300}\['concise'[\s\S]{0,300}\['ultimate'/.test(source),
  '三档没在选项表里',
);
check('底栏色散的旧弹层已删除（不留死代码）', !/dispersionDialogOpen/.test(source), '旧的 dispersionDialogOpen 还在');
check(
  '同路由不同参数要能入栈（push 的去重键含参数）',
  /JSON\.stringify\(top\.params[\s\S]{0,80}JSON\.stringify\(params/.test(await readFile('web/src/nav/navigation.tsx', 'utf8')),
  'push 只比 route，选项屏推不动',
);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
