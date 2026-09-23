/**
 * 导入教程：本地封面识别，以及用多模态大模型把课表截图转成 HTML。
 *
 * 为什么要有这个组件：这两条路都不直观 ——
 *   ① 本地识别要先把模型放到本机（npm run setup:ocr），用户得知道去哪看状态；
 *   ② 「图片转 HTML 课表」需要把课表截图交给 DeepSeek / Gemini / ChatGPT 这类多模态工具，
 *      再把它吐出来的 HTML 粘回本应用。没有提示词模板，用户很难一次问对。
 * 所以这里既讲步骤，也给**可直接复制**的提示词。
 */
import { useRef, useState } from 'react';
import { ExpandableSheet } from '../components/overlays';
import { SectionHeader } from '../components/layout';
import { MdIcon } from '../components/md';

/** 「图片 → HTML 课表」的提示词模板：把格式约束写死，避免模型自由发挥 */
export const SCHEDULE_HTML_PROMPT = `你是一个课表结构化助手。我会上传一张教务系统课表的截图。

请只输出一个 HTML <table>，不要任何解释、不要 Markdown 代码块标记、不要 <style> 与 <script>。

格式要求：
1. 第一行是表头，7 个 <th> 依次为：节次、星期一、星期二、星期三、星期四、星期五、星期六、星期日
2. 之后每个 <tr> 的第一个 <td> 写节次与时间，例如：第1-2节 08:30-09:55
3. 其余 <td> 每格写一门课，用换行分隔这四项：
   课程名称
   教师：xxx
   教室：xxx
   周次：1-16周
4. 没有课的格子写 <td></td>
5. 单元格里不要合并（不用 rowspan / colspan），一门课一个格子

严格按上面的结构输出，我会直接把结果粘进课表应用。`;

/** 「图片 → 教材信息」的提示词模板：本地识别认不准时用 */
export const TEXTBOOK_PROMPT = `请识别这张教材封面上的信息，并按下面的格式逐行输出，不要输出多余内容：

书名：
出版社：
作者：
版次：
ISBN：

要求：只填封面上确实印着的内容；看不清的字段留空，不要猜测。`;

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
          课表：图片转 HTML
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
          <SectionHeader icon="image" title="第 1 步 · 截一张完整课表" />
          <p className="md-body-small muted">
            在教务系统里把课表截全（含表头与节次列）。分屏截图也行，但要保证
            <strong>星期表头</strong>和<strong>节次/时间</strong>都在图里。
          </p>

          <SectionHeader icon="article" title="第 2 步 · 交给多模态模型转 HTML" />
          <p className="md-body-small muted">
            把截图发给下面任一工具，连提示词一起发过去：
          </p>
          <div className="row gap-8 wrap tutorial-tools">
            {TOOLS.map((tool) => (
              <span key={tool.name} className="credit-license">
                {tool.name}
              </span>
            ))}
          </div>
          <CopyablePrompt text={SCHEDULE_HTML_PROMPT} />

          <SectionHeader icon="upload" title="第 3 步 · 粘回应用" />
          <p className="md-body-small muted">
            把模型输出的 HTML 整段复制，回到「课表 → 导入」，粘贴即可。
            解析器兼容这些情况，不用手工修：
          </p>
          <ul className="md-body-small muted tutorial-list">
            <li>带 <code>```html</code> 围栏或前后带说明文字的回复</li>
            <li>表头写「星期一 / 周一 / 一 / Mon」等不同写法</li>
            <li>一门课一格，或一格多门课（换行分隔）</li>
            <li>节次写成「第1-2节」「1-2」「08:30-09:55」</li>
          </ul>

          <SectionHeader icon="check_circle" title="小提示" />
          <ul className="md-body-small muted tutorial-list">
            <li>模型可能把「周三」认成「周二」，导入后请扫一眼课程名与星期。</li>
            <li>本地解析在校验不过时会给出诊断信息（识别到几门课、哪张表被跳过）。</li>
            <li>课表数据只存本机；导出的 HTML 里如果带教师姓名，可在设置里一键清理。</li>
          </ul>
        </div>
      )}
    </ExpandableSheet>
  );
}
