/**
 * 整理设置页：把原先用绝对定位「叠」在列表行上的开关/滑块，改成
 *   - 开关 → 放进 md-list-item 的 end 插槽（M3 官方做法）
 *   - 滑块 → 作为列表项下面的独立控制行（正常文档流，不再绝对定位）
 * 这样任何屏幕高度/字号下都不会错位或重叠。
 *
 * Usage: node scripts/tidy-settings.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const FILE = 'web/src/screens/SettingsScreen.tsx';
let source = await readFile(FILE, 'utf8');

/* 1) 深色模式：开关移入 end 插槽，行不再可点 */
source = source.replace(
  /<md-list-item type="button" className="rounded-outer-top" onClick=\{toggleDarkMode\}>([\s\S]*?)<\/md-list-item>/,
  (all, inner) => {
    const cleaned = inner.replace(/\s*<div slot="supporting-text">[\s\S]*?<\/div>\s*$/, '\n');
    return `<md-list-item type="text" className="rounded-outer-top">${cleaned}              <div slot="supporting-text">\n                {settings.darkMode ? '当前为深色模式' : '当前为浅色模式（默认设计目标）'}\n              </div>\n              <div slot="end">\n                <MdSwitch\n                  selected={settings.darkMode}\n                  onSelectedChange={toggleDarkMode}\n                  ariaLabel="深色模式开关"\n                />\n              </div>\n            </md-list-item>`;
  },
);

/* 2) 语音强度 / 相机清晰度：列表项改成纯文本行，滑块另起一行 */
source = source.replace(
  /<md-list-item type="button" className="rounded-middle">([\s\S]*?识别置信度门限[\s\S]*?)<\/md-list-item>/,
  (all, inner) =>
    `<md-list-item type="text" className="rounded-middle">${inner}</md-list-item>\n\n            <div className="list-control-row">\n              <MdSlider\n                className="expressive-slider flex-1 detented"\n                value={speechValue}\n                min={0}\n                max={100}\n                step={1}\n                ticks\n                ariaLabel="语音输入强度"\n                onInput={(value) => setSpeechValue(value)}\n                onChange={(value) => {\n                  const next = settle(value);\n                  setSpeechValue(next);\n                  pulse('speech');\n                  updateSettings({ speechIntensity: next }, { message: '已保存语音输入强度 ' + next + '%' });\n                }}\n              />\n              <button\n                type="button"\n                className={\`overlay-value editable md-label-medium\${snapPulse.speech ? ' detent' : ''}\`}\n                aria-label="编辑语音输入强度"\n                onClick={() => {\n                  setValueDraft(String(Math.round(speechValue)));\n                  setValueDialog('speech');\n                }}\n              >\n                {Math.round(speechValue)}%\n              </button>\n            </div>`,
);

source = source.replace(
  /<md-list-item type="button" className="rounded-middle">([\s\S]*?拍摄分辨率与画质[\s\S]*?)<\/md-list-item>/,
  (all, inner) =>
    `<md-list-item type="text" className="rounded-middle">${inner}</md-list-item>\n\n            <div className="list-control-row">\n              <MdSlider\n                className="expressive-slider flex-1 detented"\n                value={cameraValue}\n                min={0}\n                max={100}\n                step={1}\n                ticks\n                ariaLabel="相机清晰度"\n                onInput={(value) => setCameraValue(value)}\n                onChange={(value) => {\n                  const next = settle(value);\n                  setCameraValue(next);\n                  pulse('camera');\n                  updateSettings({ cameraSharpness: next }, { message: '已保存相机清晰度 ' + next + '%' });\n                }}\n              />\n              <button\n                type="button"\n                className={\`overlay-value editable md-label-medium\${snapPulse.camera ? ' detent' : ''}\`}\n                aria-label="编辑相机清晰度"\n                onClick={() => {\n                  setValueDraft(String(Math.round(cameraValue)));\n                  setValueDialog('camera');\n                }}\n              >\n                {Math.round(cameraValue)}%\n              </button>\n            </div>`,
);

/* 3) 删掉所有绝对定位的 overlay 块（含旧开关与旧滑块） */
source = source.replace(/\n\s*\{\/\*[^*]*\*\/\}\n?\s*<div className="group-overlay"[\s\S]*?<\/div>\n/g, '\n');
source = source.replace(/\n\s*<div className="group-overlay"[\s\S]*?<\/div>\n(\s*<\/div>)/g, '\n$1');

await writeFile(FILE, source, 'utf8');

const left = (source.match(/group-overlay/g) ?? []).length;
console.log(`整理完成，剩余 group-overlay 数量：${left}`);
