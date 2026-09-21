/**
 * ① 设置页：删除「语音输入强度调整」「相机清晰度调整」两个列表项（含其下的滑块控制行）
 *    与数值编辑对话框；
 * ② API 页：多个输入框合并为**一个**「导入 / 识别 API 地址」。
 *
 * 与之前失败版本的差别：**用标签配平**定位块边界（数 <md-list-item> 与 </md-list-item>），
 * 不再靠行号或缩进猜测；任何一项校验不过就整体不写入。
 *
 * Usage: node scripts/settings-v2-cleanup.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

/** 从 fromIndex 处的开标签开始，配平到对应的闭标签 */
function cutBlock(text, openTag, closeTag, fromIndex) {
  let depth = 0;
  let i = fromIndex;
  while (i < text.length) {
    const nextOpen = text.indexOf(openTag, i);
    const nextClose = text.indexOf(closeTag, i);
    if (nextClose < 0) return null;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + openTag.length;
    } else {
      depth -= 1;
      i = nextClose + closeTag.length;
      if (depth === 0) return { start: fromIndex, end: i };
    }
  }
  return null;
}

/** 删除包含 label 的 <md-list-item> 块；若其后紧跟 list-control-row 也删掉 */
function removeListItem(text, label) {
  const hit = text.indexOf(label);
  if (hit < 0) return { text, removed: false };
  const start = text.lastIndexOf('<md-list-item', hit);
  if (start < 0) return { text, removed: false };
  const block = cutBlock(text, '<md-list-item', '</md-list-item>', start);
  if (!block) return { text, removed: false };
  let out = text.slice(0, block.start) + text.slice(block.end);

  const rest = out.slice(block.start);
  const controlAt = rest.search(/^\s*<div className="list-control-row">/m);
  if (controlAt >= 0 && controlAt < 500) {
    const abs = block.start + controlAt + rest.slice(controlAt).indexOf('<div');
    const control = cutBlock(out, '<div', '</div>', abs);
    if (control) out = out.slice(0, control.start) + out.slice(control.end);
  }
  return { text: out, removed: true };
}

const S = 'web/src/screens/SettingsScreen.tsx';
let settings = await readFile(S, 'utf8');

const voice = removeListItem(settings, '语音输入强度调整');
settings = voice.text;
const camera = removeListItem(settings, '相机清晰度调整');
settings = camera.text;

let removedDialog = false;
const dlgIndex = settings.indexOf('valueDialog !== null');
if (dlgIndex > 0) {
  const start = settings.lastIndexOf('<MdDialog', dlgIndex);
  const block = cutBlock(settings, '<MdDialog', '</MdDialog>', start);
  if (block) {
    settings = settings.slice(0, block.start) + settings.slice(block.end);
    removedDialog = true;
  }
}
// 清理不再使用的状态
settings = settings.replace(/\n\s*const \[speechValue, setSpeechValue\] = useState\([^\n]*\n/, '\n');
settings = settings.replace(/\n\s*const \[cameraValue, setCameraValue\] = useState\([^\n]*\n/, '\n');
settings = settings.replace(/\n\s*const \[valueDialog, setValueDialog\] = useState[^\n]*\n/, '\n');
settings = settings.replace(/\n\s*useEffect\(\(\) => setSpeechValue[^\n]*\n/, '\n');
settings = settings.replace(/\n\s*useEffect\(\(\) => setCameraValue[^\n]*\n/, '\n');

const residue = {
  语音: (settings.match(/语音输入强度/g) ?? []).length,
  相机: (settings.match(/相机清晰度/g) ?? []).length,
  数值对话框: (settings.match(/valueDialog/g) ?? []).length,
};

/* ------------------------------------------------------------ API 页合并 */
const A = 'web/src/screens/ApiEditScreen.tsx';
const apiOriginal = await readFile(A, 'utf8');
const fields = [...apiOriginal.matchAll(/<MdTextField[\s\S]*?\/>/g)];
let api = apiOriginal;
if (fields.length > 1) {
  const firstStart = fields[0].index;
  const last = fields[fields.length - 1];
  const lastEnd = last.index + last[0].length;
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
              supportingText="支持视觉多模态的模型接口：识别教材封面、课表截图与语音转写"
              leadingIcon={<MdIcon name="bolt" />}
              type="url"
            />`;
  api = apiOriginal.slice(0, firstStart) + single + apiOriginal.slice(lastEnd);
}

const report = {
  设置页: { 删除语音项: voice.removed, 删除相机项: camera.removed, 删除对话框: removedDialog, ...residue },
  API页: { 原字段: fields.length, 现字段: (api.match(/<MdTextField/g) ?? []).length },
};

const ok = residue.语音 === 0 && residue.相机 === 0 && residue.数值对话框 === 0 && report.API页.现字段 === 1;
console.log(report);
if (!ok) {
  console.error('❌ 校验未通过，未写入任何文件');
  process.exit(1);
}
await writeFile(S, settings, 'utf8');
await writeFile(A, api, 'utf8');
console.log('✅ 设置页清理 + API 合并为单输入框 完成');
