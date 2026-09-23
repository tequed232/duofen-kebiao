/** 本地识别的共享类型：进度、结果、以及设置项的形状。 */

export type OcrPhase = 'decode' | 'opencv' | 'recognize' | 'match' | 'done';

export interface OcrProgress {
  phase: OcrPhase;
  /** 0..1；未知进度时给 0 */
  ratio: number;
  /** 给用户看的一句话 */
  text: string;
}

/** 一张封面图经过 OpenCV 预处理后的几个「候选视图」 */
export interface TextRegion {
  /** 候选区域在原图里的位置与大小 */
  box: { x: number; y: number; width: number; height: number };
  /** 为什么选它（用于界面说明与排错） */
  reason: string;
  /** 便于在界面上展示预处理效果 */
  previewUrl: string;
}

export interface LocalRecognizeText {
  /** OCR 出来的整段文字（按行） */
  lines: string[];
  /** 各候选视图分别识别出的文字，用于打分 */
  candidates: { source: string; text: string; score: number }[];
  /** 被选中的那段文字 */
  best: string;
  /** 预处理视图（调试与展示） */
  regions: TextRegion[];
}

export interface LocalRecognizeResult extends LocalRecognizeText {
  /** 匹配到的课程名 */
  course?: string;
  /** 书名（优先内置库，其次从封面文字里取最长行） */
  title?: string;
  /** 出版社 */
  publisher?: string;
  /** 从封底/封面文字里提取到且**校验位正确**的 ISBN（最强线索） */
  isbn?: string;
  /** library = 内置库命中；cover = 仅靠封面文字 */
  matchedBy: 'library' | 'cover' | 'none';
}
