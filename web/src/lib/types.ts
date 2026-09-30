/** Shared domain types. */

export interface AppSettings {
  darkMode: boolean;
  /** 0..100 - 选图/拍照识别的压缩质量与分辨率（教材封面识别用） */
  cameraSharpness: number;
  /** 教材封面识别用的视觉接口 */
  visionApiUrl: string;
  visionApiKey: string;
  /** default map provider id used when navigating to a course address ('' = ask every time) */
  mapProvider: string;
  /** teaching week 1 Monday, yyyy-mm-dd; '' = use the value embedded in the schedule */
  termStart: string;
  /** 地图导航时拼在教室前面的学校名称，例如「某某学院 16栋203」 */
  schoolName: string;
  /**
   * 主页浮动按钮区是否显示「导航课程」（2026-09-29 作者要求：给它一个开关）。
   * 关掉之后浮动区只剩左侧的「筛选课程」相关的按钮，主页更干净。
   */
  navCourse: boolean;
  /** 底边栏使用液态玻璃（liquid glass）效果 */
  liquidGlass: boolean;
  /** 底边栏材质：液态玻璃 / Material 3 实心（默认）/ 半透明 */
  barMaterial: 'glass' | 'solid' | 'translucent';
  /**
   * 底栏液态玻璃的**色散档位**（作者 2026-09-24 要求单开一个选择项）：
   *   · 'off'      —— 不做色散，只留折射与高光；
   *   · 'concise'  —— 默认。三通道（R/G/B）只在边缘带分离出"一侧偏冷、一侧偏暖"的一丝彩边；
   *   · 'ultimate' —— 恢复 commit 0801cb9 那套落差口径 + **六段光谱**（紫蓝青绿黄红），数得出七色。
   * 参数见 web/src/lib/lens.ts 的 dockLensParams（几何来自 dockWarp，颜色来自 dispersion）。
   */
  dispersion: 'off' | 'concise' | 'ultimate';
  /**
   * 底栏液态玻璃的**扭曲档位**（作者 2026-09-25 要求把"能看出掰弯"的那版找回来）：
   *   · 'thick'   —— **默认**。commit `6aeae6d`「底栏换厚透镜」那版口径：
   *                  bezel 0.85 / strength 1.6 / backdrop 位移封顶 26px。
   *                  当时作者的验收话术是"能明显看到文字被横向拉开 + 蓝橙色边"。
   *   · 'concise' —— 收窄（`7973ced` 六项整改后的口径）：bezel 0.30、封顶 7px，
   *                  "只留在边缘一线"，即作者后来嫌"看不出来"的那一档。
   *   · 'off'     —— 不做折射位移，只留边缘高光（与色散档无关）。
   * 与色散档**正交**：扭曲管几何（掰弯多少、分布多宽），色散管颜色分离。
   * 想要 `0801cb9` 那种"大落差 + 七彩虹"= 厚透镜 + 极致色散。
   */
  dockWarp: 'off' | 'concise' | 'thick';
  /** 单色等高线背景（模仿《终末地》）：off 不画 / subtle 默认 / bold 更密 */
  contour: 'off' | 'subtle' | 'bold';
  /**
   * 底栏**散射（磨砂）强度**档位：
   *   · 'concise' —— 默认。本体图内 ~2.4px 轻磨砂 + 底色 alpha 0%，看得见折射、透得出列表；
   *   · 'strong'  —— 把 v3.0.1（09-23 04:11 那个 release）的散射口径投射回来：
   *                  本体 blur(18px) saturate(1.6) + 底色 surface-container 58%。
   * 实测（build/check-dock-scatter.cjs）：散射层自身 8↔11px 几乎量不出差别，
   * "看着更毛"基本来自本体那 18px，所以这一档投的是本体。
   */
  dockScatter: 'concise' | 'strong';
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
  mapProvider: '',
  termStart: '',
  schoolName: '',
  navCourse: true,
  liquidGlass: true,
  barMaterial: 'solid',
  dispersion: 'concise',
  dockWarp: 'thick',
  contour: 'subtle',
  dockScatter: 'concise',
  classReminder: true,
  uiScale: 'normal',
  insetTop: -1,
  perfMode: 'auto',
  insetBottom: -1,
  classReminderLead: 10,
  transition: 'm3',
};
