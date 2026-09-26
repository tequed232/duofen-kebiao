/**
 * 导入教程：本地封面识别，以及用多模态大模型把课表截图转成 **HTML / JSON 文件**。
 *
 * 为什么要有这个组件：这两条路都不直观 ——
 *   ① 本地识别要先把模型放到本机（npm run setup:ocr），用户得知道去哪看状态；
 *   ② 「图片 → 可导入的文件」需要把课表截图交给 DeepSeek / Gemini / ChatGPT 这类多模态工具，
 *      让它按固定格式吐 HTML 或 JSON，再把结果**存成文件**用「导入课表文件」选中。
 *      没有提示词模板，用户很难一次问对。
 * 所以这里既讲步骤，也给**可直接复制**的提示词；提示词本体在 `web/src/lib/importPrompts.ts`，
 * 那份示例由 `scripts/check-import-guide.mjs` 喂给真实解析器验证过（示例必须真能导入）。
 */
import { useRef, useState } from 'react';
import { ExpandableSheet } from '../components/overlays';
import { SectionHeader } from '../components/layout';
import { MdIcon } from '../components/md';
import {
  SCHEDULE_HTML_PROMPT,
  SCHEDULE_IMPORT_STEPS,
  SCHEDULE_JSON_PROMPT,
  TEXTBOOK_PROMPT,
} from '../lib/importPrompts';

export { SCHEDULE_HTML_PROMPT, SCHEDULE_JSON_PROMPT, TEXTBOOK_PROMPT };

interface Props {
  open: boolean;
  onClose: () => void;
  /** 打开哪一个页签 */
  initialTab?: 'textbook' | 'schedule';
}

function CopyablePrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="tutorial-prompt">
      <pre className="tutorial-prompt-body">{text}</pre>
      <button
        type="button"
        className="credit-link"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        <MdIcon name={copied ? 'check' : 'content_copy'} size={14} />
        {copied ? '已复制' : '复制提示词'}
      </button>
    </div>
  );
}

const TOOLS = [
  { name: 'DeepSeek', note: '网页/App 均可上传图片' },
  { name: 'Gemini', note: '支持多图与长截图' },
  { name: 'ChatGPT', note: '上传截图后直接要 HTML' },
];

export default function ImportTutorial({ open, onClose, initialTab = 'textbook' }: Props) {
  const [tab, setTab] = useState<'textbook' | 'schedule'>(initialTab);
  // ExpandableSheet 用它做「从哪冒出来」的转场锚点；这里不需要指定元素
  const anchorRef = useRef<HTMLElement | null>(null);

  return (
    <ExpandableSheet
      open={open}
      onClose={onClose}
      sourceRef={anchorRef}
      title="导入教程"
      icon="help_center"
    >
      <div className="row gap-8 tutorial-tabs">
        <button
          type="button"
          className={tab === 'textbook' ? 'credit-link' : 'credit-link ghost'}
          onClick={() => setTab('textbook')}
        >
          教材封面识别
        </button>
        <button
          type="button"
          className={tab === 'schedule' ? 'credit-link' : 'credit-link ghost'}
          onClick={() => setTab('schedule')}
        >
          课表：图片转 HTML / JSON
        </button>
      </div>

      {tab === 'textbook' ? (
        <div className="mt-12">
          <SectionHeader icon="photo_camera" title="第 1 步 · 拍照或选封面" />
          <p className="md-body-small muted">
            在「课程详情 → 教材」里点选图，把教材封面拍清楚即可。
            <strong>图片只在本机处理，不会上传到任何服务器。</strong>
          </p>

          <SectionHeader icon="bolt" title="第 2 步 · 本地自动识别" />
          <p className="md-body-small muted">
            识别分两步走，全部跑在你的设备上：
          </p>
          <ol className="md-body-small muted tutorial-list">
            <li>
              <strong>OpenCV 预处理</strong>：自动裁出封面、聚出文字区、二值化抗反光 ——
              手机随手拍的照片也能读。
            </li>
            <li>
              <strong>Tesseract 中文 OCR</strong>：把封面上的字读出来，再和内置教材库匹配，
              给出<strong>书名、出版社</strong>；封面印了 ISBN 的话还会做国际标准校验位验证。
            </li>
          </ol>
          <p className="md-body-small muted">
            首次使用需要本机有识别模型（约 40 MB，放在 <code>web/public/ocr/</code>）。
            开发者执行一次 <code>npm run setup:ocr</code> 即可；设置 → 接口配置里能看到是否就绪。
          </p>

          <SectionHeader icon="storage" title="可选 · 认不准时用多模态模型" />
          <p className="md-body-small muted">
            封面太糊、艺术字太多时，可以把封面图交给 DeepSeek / Gemini / ChatGPT，
            用下面的提示词让它读成文字，再把结果粘回应用的输入框：
          </p>
          <CopyablePrompt text={TEXTBOOK_PROMPT} />

          <SectionHeader icon="photo_library" title="导入记录里的照片" />
          <p className="md-body-small muted">
            封面缩略图与识别结果都保存在本机 IndexedDB，换设备不会同步。授权凭据见
            「素材授权台账」，「课堂要带的书」会上课提醒里一并显示。
          </p>
        </div>
      ) : (
        <div className="mt-12">
          {SCHEDULE_IMPORT_STEPS.map((step) => (
            <div key={step.title}>
              <SectionHeader icon={step.icon} title={step.title} />
              <p className="md-body-small muted">{step.body}</p>
            </div>
          ))}

          <div className="row gap-8 wrap tutorial-tools">
            {TOOLS.map((tool) => (
              <span key={tool.name} className="credit-license">
                {tool.name}
              </span>
            ))}
          </div>

          <SectionHeader icon="data_object" title="提示词 A · 让 AI 输出 JSON（推荐）" />
          <p className="md-body-small muted">
            JSON 比 HTML 更不容易被模型写歪：字段名写死了，导入时不用猜。
            把截图 + 下面这段一起发给 AI，然后把回复**存成 <code>.json</code> 文件**。
          </p>
          <CopyablePrompt text={SCHEDULE_JSON_PROMPT} />

          <SectionHeader icon="article" title="提示词 B · 让 AI 输出 HTML 表格" />
          <p className="md-body-small muted">
            有些 AI 对表格更熟，那就用这条；回复**存成 <code>.html</code> 文件**即可。
          </p>
          <CopyablePrompt text={SCHEDULE_HTML_PROMPT} />

          <SectionHeader icon="upload" title="第 3 步 · 用「导入课表文件」选中它" />
          <p className="md-body-small muted">
            回到「课表 → 导入 → 导入课表文件」，选中刚存下的 .html / .json。
            没有存成文件也不要紧，把 AI 的整段回复粘进「粘贴课表文本」一样能导入；解析器自动兼容：
          </p>
          <ul className="md-body-small muted tutorial-list">
            <li>带 <code>```html</code> / <code>```json</code> 围栏或前后带说明文字的回复</li>
            <li>表头写「星期一 / 周一 / 一 / Mon」等不同写法；JSON 里 day 写 <code>3</code> 或 <code>Wednesday</code> 也认</li>
            <li>一门课一格，或一格多门课（换行分隔）</li>
            <li>节次写成「第1-2节」「1-2」「08:30-09:55」都行；周次可以写 <code>[1,2,3,5]</code> 数组</li>
            <li>JSON 少了学期开始日期也没关系，应用会沿用当前课表的设置</li>
          </ul>

          <SectionHeader icon="check_circle" title="小提示" />
          <ul className="md-body-small muted tutorial-list">
            <li>模型可能把「周三」认成「周二」，导入后请扫一眼课程名与星期。</li>
            <li>读不到可用内容时应用会弹出警告窗口并说明原因，当前课表不会被改动。</li>
            <li>课表数据只存本机；导出的 HTML 里如果带教师姓名，可在设置里一键清理。</li>
          </ul>
        </div>
      )}
    </ExpandableSheet>
  );
}
