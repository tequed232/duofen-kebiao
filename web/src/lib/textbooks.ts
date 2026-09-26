/**
 * 教材库与教材识别。
 *
 * 数据来源：用户提供的 12 张教材封面照片（2026-09-19 拍摄），整理为
 * web/src/data/textbooks.json。其中《IT终端设备的配置与维护》与「国产化设备基础」
 * 属于推断匹配，标记为 reference，界面上会提示可修改。
 *
 * **这份 JSON 是唯一数据源**：Android 侧没有对应拷贝 —— 曾经有一条
 * `scripts/import-textbooks.mjs` 把它生成成 Kotlin 的 `TextbookData.kt`，
 * 但在「Web 是每个功能的唯一设计基线」之后那个文件已被删除、也没有任何 Kotlin 引用它，
 * 生成器随之作废（连同它一起在 2026-09 清掉，需要时可在 git 历史里找到）。
 * 提醒里要显示「带：某教材」时，书名由 WebView 传给原生，原生不需要自己存一份。
 *
 * 识别流程（web/src/components/schedule.tsx）：
 *   选封面图 → 多模态接口识别（本地 OpenCV + Tesseract 已于 2026-09-27 下线）；
 *   也可粘贴/输入封面文字，同样本地匹配。结果写入 IndexedDB，
 *   在「课程详情 → 教材」里显示。
 */
import library from '../data/textbooks.json';

export interface TextbookEntry {
  /** 课表里的课程名（与 schedule 数据一致） */
  course: string;
  title: string;
  publisher: string;
  edition?: string;
  /** 封面识别得到的补充信息，例如教材系列 */
  series?: string;
  /** true 表示课程归属是推断的，界面上会提示可修改 */
  reference?: boolean;
}

/** 内置教材库：课程名 → 教材，与 12 张封面照片一一对应。 */
export const TEXTBOOK_LIBRARY: TextbookEntry[] = library as TextbookEntry[];

export interface Textbook extends TextbookEntry {
  /** 用户拍照/选择的封面（data URL，缩略图） */
  cover?: string;
  /** library = 内置库；recognized = 封面识别；manual = 手动填写 */
  source: 'library' | 'recognized' | 'manual';
}

const LIBRARY_BY_COURSE = new Map(TEXTBOOK_LIBRARY.map((entry) => [entry.course, entry]));

/** 去掉「（一）」「(二)」「第2版」等后缀，便于比较课程名。 */
export function normalizeCourseName(name: string): string {
  return name
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s·・、,，.。:：-]/g, '')
    .toLowerCase();
}

/** 课程名 → 内置教材（查不到返回 undefined）。 */
export function libraryTextbook(courseName: string): Textbook | undefined {
  const exact = LIBRARY_BY_COURSE.get(courseName);
  if (exact) return { ...exact, source: 'library' };
  const normalized = normalizeCourseName(courseName);
  const hit = TEXTBOOK_LIBRARY.find((entry) => {
    const other = normalizeCourseName(entry.course);
    return other === normalized || other.startsWith(normalized) || normalized.startsWith(other);
  });
  return hit ? { ...hit, source: 'library' } : undefined;
}

/**
 * 用识别出来的封面文字匹配课程：书名/课程名的关键词重合度打分。
 */
export function matchCourseByText(text: string, courseNames: string[]): { course: string; score: number } | null {
  const haystack = text.replace(/\s+/g, '');
  if (!haystack) return null;
  let best: { course: string; score: number } | null = null;
  for (const course of courseNames) {
    const base = normalizeCourseName(course);
    let score = 0;
    // 课程名整体出现，权重最高
    if (base && haystack.includes(base)) score += 6;
    // 逐段（2 字以上）命中
    const stem = course.replace(/[（(][^）)]*[）)]/g, '');
    for (let i = 0; i < stem.length - 1; i += 1) {
      const gram = stem.slice(i, i + 2);
      if (gram.trim().length === 2 && haystack.includes(gram)) score += 1;
    }
    // 内置教材书名也参与匹配（例如照片上是《新时代大学生劳动教育》对应「劳动教育（一）」）
    const libraryEntry = libraryTextbook(course);
    if (libraryEntry) {
      const title = normalizeCourseName(libraryEntry.title);
      if (title && haystack.includes(title)) score += 6;
      for (const word of libraryEntry.title.split(/[\s：:·、，,（）()—-]+/).filter((part) => part.length >= 2)) {
        if (haystack.includes(word)) score += 2;
      }
    }
    if (!best || score > best.score) best = { course, score };
  }
  return best && best.score >= 4 ? best : null;
}

/** 从识别文本里猜出版名（用于自动填充）。 */
export function guessPublisher(text: string): string {
  const known = [
    '高等教育出版社',
    '人民出版社',
    '东北财经大学出版社',
    '上海交通大学出版社',
    '国防科技大学出版社',
    '时事报告杂志社',
    '东北师范大学出版社',
    '清华大学出版社',
    '武汉大学出版社',
    '教育科学出版社',
    '西安电子科技大学出版社',
  ];
  const compact = text.replace(/\s+/g, '');
  return known.find((publisher) => compact.includes(publisher)) ?? '';
}

/**
 * 定价行的特征。封面右下角必印「定价：45.00 元」，OCR 一定读得到。
 */
const PRICE_LINE = /(定价|价格|售价|￥|¥)/;

/**
 * 去掉封面文字里的**定价行**。
 *
 * 为什么专门滤它：定价既不参与匹配课程（matchCourseByText 靠课程名与内置书名打分），
 * 也不帮助判断是哪一本书 —— 每本书都有个价格。但它一定会被 OCR 读出来，于是
 * 「定价：45.00 元」就跟着预填进「封面文字」，让人以为识别结果里带着这行信息。
 * 书名、出版社、ISBN 这些**真正有用**的行一律保留：它们还要用来匹配课程。
 */
export function stripPriceLines(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !PRICE_LINE.test(line))
    .join('\n');
}
