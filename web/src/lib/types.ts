/** Shared domain types. */

export interface QaEntry {
  id: string;
  question: string;
  answer: string;
  /** where the answer came from: api | local match | no match */
  source: 'api' | 'local' | 'none';
  createdAt: number;
}

/** One mind-map branch: a topic with all the answers that belong to it. */
export interface QaBranch {
  id: string;
  topic: string;
  entries: QaEntry[];
}

export interface NoteRecord {
  id: string;
  title: string;
  /** short supporting text shown on cards */
  note: string;
  /** data URLs, newest first */
  images: string[];
  /** live speech-to-text raw transcript */
  transcript: string;
  /** summary produced by the image-to-text API */
  imageSummary: string;
  /** key points distilled from transcript + image summary */
  keyPoints: string[];
  branches: QaBranch[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  darkMode: boolean;
  /** 0..100 - speech recognition confidence threshold */
  speechIntensity: number;
  /** 0..100 - capture resolution / JPEG quality */
  cameraSharpness: number;
  sttApiUrl: string;
  sttApiKey: string;
  visionApiUrl: string;
  visionApiKey: string;
  qaApiUrl: string;
  qaApiKey: string;
  /** default map provider id used when navigating to a course address ('' = ask every time) */
  mapProvider: string;
  /** teaching week 1 Monday, yyyy-mm-dd; '' = use the value embedded in the schedule */
  termStart: string;
  /** 地图导航时拼在教室前面的学校名称，例如「某某学院 16栋203」 */
  schoolName: string;
  /** 底边栏使用液态玻璃（liquid glass）效果 */
  liquidGlass: boolean;
  /** 底边栏材质：液态玻璃 / Material 3 实心（默认）/ 半透明 */
  barMaterial: 'glass' | 'solid' | 'translucent';
  /** 录音时发送实时通知（Android 16 实况通知 / ColorOS 流体云） */
  liveNotify: boolean;
  /** 上课提醒：临近上课时用实况通知（灵动岛 / 流体云）提醒 */
  classReminder: boolean;
  /** 界面缩放：小 / 标准 / 大（窄屏设备可调小以免拥挤） */
  uiScale: 'small' | 'normal' | 'large';
  /** 上端安全区（dp）：-1 = 自动跟随系统状态栏/刘海 */
  insetTop: number;
  /** 性能模式：high = 全特效；low = 关闭玻璃滤镜与流体拉伸；auto = 自动检测 */
  perfMode: 'auto' | 'high' | 'low';
  /** 下端安全区（dp）：-1 = 自动跟随系统手势条 */
  insetBottom: number;
  /** 提前多少分钟提醒（可调） */
  classReminderLead: number;
  /** 页面切换的过渡模式：M3 规范 / 仅淡入淡出 / 横向滑移 / 无动画 */
  transition: 'm3' | 'fade' | 'slide' | 'none';
}

export const DEFAULT_SETTINGS: AppSettings = {
  darkMode: false,
  speechIntensity: 1,
  cameraSharpness: 1,
  sttApiUrl: '',
  sttApiKey: '',
  visionApiUrl: '',
  visionApiKey: '',
  qaApiUrl: '',
  qaApiKey: '',
  mapProvider: '',
  termStart: '',
  schoolName: '',
  liquidGlass: true,
  barMaterial: 'solid',
  liveNotify: true,
  classReminder: true,
  uiScale: 'normal',
  insetTop: -1,
  perfMode: 'auto',
  insetBottom: -1,
  classReminderLead: 10,
  transition: 'm3',
};

/** The live capture/draft session shown on the Home screen. */
export interface Draft {
  transcript: string;
  interim: string;
  imageSummary: string;
  keyPoints: string[];
  branches: QaBranch[];
  images: string[];
  tags: string[];
  updatedAt: number;
}

export const EMPTY_DRAFT: Draft = {
  transcript: '',
  interim: '',
  imageSummary: '',
  keyPoints: [],
  branches: [],
  images: [],
  tags: [],
  updatedAt: 0,
};
