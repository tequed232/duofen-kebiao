/** Shared domain types. */

export interface AppSettings {
  darkMode: boolean;
  /** 0..100 - 选图/拍照识别的压缩质量与分辨率（教材封面识别用） */
  cameraSharpness: number;
  /** 教材封面识别用的视觉接口 */
  visionApiUrl: string;
  visionApiKey: string;
  /**
   * 本地识别（OpenCV + Tesseract）缺资源时，是否允许从公网 CDN 取模型。
   * 默认 false —— 全部走 localhost，只有用户明确同意才联网。
   */
  localOcrCdn: boolean;
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
  /** 页面切换：m3 = 中间弹出（默认，唯一动效）；none = 无动画（兼容旧的 fade / slide 值） */
  transition: 'm3' | 'fade' | 'slide' | 'none';
}

export const DEFAULT_SETTINGS: AppSettings = {
  darkMode: false,
  cameraSharpness: 1,
  visionApiUrl: '',
  visionApiKey: '',
  localOcrCdn: false,
  mapProvider: '',
  termStart: '',
  schoolName: '',
  liquidGlass: true,
  barMaterial: 'solid',
  classReminder: true,
  uiScale: 'normal',
  insetTop: -1,
  perfMode: 'auto',
  insetBottom: -1,
  classReminderLead: 10,
  transition: 'm3',
};
