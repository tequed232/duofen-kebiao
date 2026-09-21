/**
 * ① 设置页清理：删除「语音输入强度调整」「相机清晰度调整」两个列表项 + 其滑块控制行 + 数值编辑对话框
 * ② API 页合并：六个输入框 → **一个**「导入 / 识别 API 地址」（同一地址写入语音、图片、问答三个配置项）
 *
 * 上一版失败原因：标记匹配写错（把判断字符串当图标名/行号算错）。这里改为
 * 逐行扫描 + 括号配平 + 删除后强校验，任何一项不干净就**不写文件**。
 *
 * Usage: node scripts/settings-v2-cleanup.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

/* ---------------------------------------------------------- ① 设置页清理 */
const S = 'web/src/screens/SettingsScreen.tsx';
const original = await readFile(S, 'utf8');
const lines = original.split(/\r?\n/);
const drop = new Set();

function spanOf(predicate) {
  const start = lines.findIndex(predicate);
  if (start < 0) return null;
  return start;
}

/** 删除以 label 文案命名的列表项（含紧随的 list-control-row） */
function dropRowWithControl(label) {
  const hit = lines.findIndex((line) => line.includes(label));
  if (hit < 0) return null;
  let s = hit;
  while (s > 0 && !/^\s*<md-list-item/.test(lines[s])) s -= 1;
  let e = s;
  while (e < lines.length && !/^\s*<\/md-list-item>/.test(lines[e])) e += 1;
  const removed = [];
  for (let i = s; i <= e; i += 1) {
    drop.add(i);
    removed.push(i);
  }
  let c = e + 1;
  while (c < lines.length && lines[c].trim() === '') c += 1;
  if (lines[c]?.includes('list-control-row')) {
    let ce = c;
    while (ce < lines.length && !/^\s*<\/div>\s*$/.test(lines[ce])) ce += 1;
    for (let i = c; i <= ce; i += 1) {
      drop.add(i);
      removed.push(i);
    }
  }
  return removed.length;
}

const removedVoice = dropRowWithControl('语音输入强度调整');
const removedCamera = dropRowWithControl('相机清晰度调整');

// 数值编辑对话框整块
const dlgStart = lines.findIndex((line) => line.includes('valueDialog !== null'));
if (dlgStart > 0) {
  let s = dlgStart;
  while (s > 0 && !/^\s*<MdDialog/.test(lines[s])) s -= 1;
  let e = s;
  while (e < lines.length && !/^\s*<\/MdDialog>\s*$/.test(lines[e])) e += 1;
  for (let i = s; i <= e; i += 1) drop.add(i);
}

let settingsOut = lines.filter((_, index) => !drop.has(index)).join('\n');
const residue = {
  语音行: (settingsOut.match(/语音输入强度/g) ?? []).length,
  相机行: (settingsOut.match(/相机清晰度/g) ?? []).length,
  控制行: (settingsOut.match(/list-control-row/g) ?? []).length,
  数值对话框: (settingsOut.match(/valueDialog/g) ?? []).length,
};

/* ------------------------------------------------------- ② API 页合并 */
const A = 'web/src/screens/ApiEditScreen.tsx';
let api = await readFile(A, 'utf8');
// 用单个地址字段替换所有 <MdTextField …/>（保留一个）
const matches = [...api.matchAll(/<MdTextField[\s\S]*?\/>/g)];
const first = matches[0];
let apiOut = api;
if (first) {
  const single = `<MdTextField
              label="导入 / 识别 API 地址"
              value={sttUrl}
              onValueChange={(value) => {
                // 一个地址同时用于语音转文字、图片识别与问答（同一个多模态服务）
                setSttUrl(value);
                setVisionUrl(value);
                setQaUrl(value);
              }}
              placeholder="https://api.deepseek.com/v1/chat/completions"
              supportingText="支持视觉多模态的模型接口：用于识别教材封面、课表图片与语音转写"
              leadingIcon={<MdIcon name="bolt" />}
              type="url"
            />`;
  apiOut = api.replace(/<MdTextField[\s\S]*?\/>/g, '');
  apiOut = apiOut.replace(/(\s*<div className="mt-12">\s*<\/div>)/, '');
  // 把单字段插到第一个 mt-12 容器里
  apiOut = apiOut.replace(/(\n\s*<div className="mt-12">)/, `$1\n            ${single}`);
}

const report = {
  设置页: { 删除语音项: removedVoice, 删除相机项: removedCamera, ...residue },
  API页: { 原字段数: matches.length, 现字段数: (apiOut.match(/<MdTextField/g) ?? []).length },
};

const ok = residue.语音行 === 0 && residue.相机行 === 0 && residue.数值对话框 === 0 && report.API页.现字段数 === 1;
console.log(report);
if (!ok) {
  console.error('❌ 校验未通过，未写入任何文件（保持原样）');
  process.exit(1);
}
await writeFile(S, settingsOut, 'utf8');
await writeFile(A, apiOut, 'utf8');
console.log('✅ 设置页清理 + API 单输入框完成');
