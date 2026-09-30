/**
 * 「台词管理」页 —— 通知栏桌宠的语料与播放设置。
 *
 * 对照参考图（`docs/notification-phrases/lines-manager-reference.png`、
 * `playback-settings-reference.png`）：上面是台词列表（逐条删除 + 添加 + 恢复默认 + 收起），
 * 下面是播放设置（播放模式 / 间隔时长 / 波动幅度 / 自动播放）。
 *
 * 作者补的两条也在这里落地：
 *   · 「常驻通知」开关 —— 打开即启动前台服务，通知栏出现那条不可滑动清除的常驻通知；
 *   · 保活自检 —— 通知权限、电池优化白名单（Android 对后台服务的两道主要限制），
 *     能读就显示真实状态，并给一个直达系统设置的入口。
 *
 * 语料配置存在独立的 KV 键（`phrases`），**不动 AppSettings 的形状**（任务书 §4）；
 * 任何改动都会立刻下发给原生服务，避免"服务还拿着旧配置"。
 */
import { useCallback, useEffect, useState } from 'react';
import { SectionHeader, TopAppBar } from '../components/layout';
import { MdDialog, MdIcon, MdSlider, MdSwitch } from '../components/md';
import { readKv, writeKv } from '../lib/db';
import {
  DEFAULT_PHRASE_CONFIG,
  PHRASE_KEY,
  PHRASE_LIMITS,
  addPhrase,
  clampFluctuation,
  clampInterval,
  loadPhraseConfig,
  normalizePhrases,
  removePhrase,
  restoreDefaultPhrases,
  type PhraseConfig,
} from '../lib/phrases';
import {
  hasNativePhrases,
  nativePhrasePoke,
  nativePhrasesConfig,
  nativePhrasesStatus,
  nativeSetPhraseBaseState,
  nativeStartPhraseService,
  nativeStopPhraseService,
} from '../lib/native';
import { useAppState } from '../state/AppState';

/** 常驻通知的服务开关单独存一个键，不塞进 PhraseConfig（任务书 §4 的形状是固定的） */
const ENABLED_KEY = 'phrasesEnabled';

interface KeepAliveStatus {
  notifications: boolean;
  batteryUnrestricted: boolean;
}

export default function PhraseManagerScreen() {
  const { showSnackbar } = useAppState();
  const [config, setConfig] = useState<PhraseConfig>(DEFAULT_PHRASE_CONFIG);
  const [enabled, setEnabled] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [keepAlive, setKeepAlive] = useState<KeepAliveStatus | null>(null);
  const native = hasNativePhrases();

  /* 载入：语料配置 + 服务开关 */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [rawConfig, rawEnabled] = await Promise.all([readKv<unknown>(PHRASE_KEY), readKv<boolean>(ENABLED_KEY)]);
      if (cancelled) return;
      const loaded = loadPhraseConfig(rawConfig);
      setConfig(loaded);
      setEnabled(Boolean(rawEnabled));
      if (hasNativePhrases()) {
        nativePhrasesConfig(loaded);
        if (rawEnabled) {
          nativeStartPhraseService();
          // 服务起来后立刻说一句：作者真机反馈「只看到后台运行」，等自动播放要 5 分钟太静了
          window.setTimeout(() => nativePhrasePoke(), 1200);
        }
        const status = nativePhrasesStatus() as { keepAlive?: KeepAliveStatus } | null;
        if (status && status.keepAlive) setKeepAlive(status.keepAlive);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 任何配置变化：① 落 KV ② 立刻下发给原生服务 */
  const apply = useCallback(
    (next: PhraseConfig, message?: string) => {
      setConfig(next);
      void writeKv(PHRASE_KEY, next);
      if (hasNativePhrases()) nativePhrasesConfig(next);
      if (message) showSnackbar({ message, duration: 2600 });
    },
    [showSnackbar],
  );

  const toggleService = (on: boolean) => {
    setEnabled(on);
    void writeKv(ENABLED_KEY, on);
    if (!on) {
      nativeStopPhraseService();
      showSnackbar({ message: '已关闭常驻通知', duration: 2600 });
      return;
    }
    nativePhrasesConfig(config);
    // 常驻通知开机即是「空闲」基础状态：语料展示完要还原回来的就是它
    nativeSetPhraseBaseState({ kind: 'idle' });
    const started = nativeStartPhraseService();
    /* 立刻说一句：否则用户开了开关只看到「正在后台运行」，会以为没生效（作者真机反馈） */
    if (started) window.setTimeout(() => nativePhrasePoke(), 600);
    showSnackbar({
      message: started ? `已开启常驻通知（${config.phrases.length} 条台词）` : '当前环境不支持常驻通知（仅安卓版）',
      duration: 3200,
    });
  };

  const submitAdd = () => {
    const text = draft.trim();
    if (!text) {
      showSnackbar({ message: '台词不能为空', duration: 2000 });
      return;
    }
    const next = addPhrase(config, text);
    if (next.phrases.length === config.phrases.length) {
      showSnackbar({ message: '这条台词已经在了', duration: 2000 });
      return;
    }
    apply(next, `已添加：${text}`);
    setDraft('');
    setAddOpen(false);
  };

  return (
    <>
      <div className="screen-inner">
        <TopAppBar title="台词管理" />
        <div className="screen-content">
          <SectionHeader title="台词管理" />
          <div className="list-group">
            <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
              <md-filled-button className="btn-s" onClick={() => setAddOpen(true)}>
                <MdIcon slot="icon" name="add" />
                添加台词
              </md-filled-button>
              <md-outlined-button className="btn-s" onClick={() => setRestoreOpen(true)}>
                恢复默认台词
              </md-outlined-button>
              <md-outlined-button className="btn-s" onClick={() => setCollapsed((value) => !value)}>
                {collapsed ? '展开' : '收起'}
              </md-outlined-button>
            </div>

            {!collapsed ? (
              <div className="col mt-12">
                {config.phrases.length === 0 ? (
                  <div className="md-body-small muted">还没有台词。点「添加台词」写几条，或点「恢复默认台词」。</div>
                ) : (
                  config.phrases.map((text, index) => (
                    <div className="row gap-8" style={{ padding: '6px 0' }} key={`${text}-${index}`}>
                      <span className="flex-1 md-body-medium">{text}</span>
                      <md-outlined-button
                        className="btn-xs"
                        onClick={() => apply(removePhrase(config, index), `已删除：${text}`)}
                      >
                        删除
                      </md-outlined-button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="md-body-small muted mt-8">已收起 · 共 {config.phrases.length} 条</div>
            )}
          </div>

          <SectionHeader title="播放设置" />
          <div className="list-group">
            <div className="col gap-8">
              <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
                {([
                  ['random', '随机'],
                  ['sequential', '顺序'],
                ] as const).map(([value, label]) => (
                  <md-outlined-button
                    key={value}
                    className="btn-s"
                    onClick={() => apply({ ...config, mode: value }, `播放模式：${label}`)}
                  >
                    {config.mode === value ? '✓ ' : ''}
                    {label}
                  </md-outlined-button>
                ))}
              </div>

              <div className="row gap-8" style={{ alignItems: 'center' }}>
                <span className="md-body-medium flex-1">间隔时长（分钟）</span>
                <md-outlined-text-field
                  style={{ width: '96px' }}
                  value={String(config.intervalMin)}
                  onInput={(event: React.FormEvent<HTMLElement>) => {
                    const next = clampInterval(Number((event.target as HTMLInputElement).value));
                    apply({ ...config, intervalMin: next });
                  }}
                />
              </div>

              <div className="row gap-8" style={{ alignItems: 'center' }}>
                <span className="md-body-medium flex-1">波动幅度 {config.fluctuationPct}%</span>
                <MdSlider
                  className="expressive-slider flex-1"
                  value={config.fluctuationPct}
                  min={PHRASE_LIMITS.fluctuationPct[0]}
                  max={PHRASE_LIMITS.fluctuationPct[1]}
                  step={5}
                  ariaLabel="波动幅度"
                  onInput={(value: number) => {
                    // MdSlider 的 onInput 传的是**数值**（见 components/md.tsx：
                    // inputHandler.current?.(Number(element.value))）。这里以前按 Event 用，
                    // 于是 event.target 是 undefined → 波动幅度恒为 NaN。
                    apply({ ...config, fluctuationPct: clampFluctuation(value) });
                  }}
                />
              </div>

              <div className="row gap-8" style={{ alignItems: 'center' }}>
                <span className="md-body-medium flex-1">自动播放（每 {config.intervalMin} 分钟随机/顺序换一条）</span>
                <MdSwitch
                  selected={config.autoPlay}
                  onSelectedChange={(value: boolean) => apply({ ...config, autoPlay: value }, value ? '已开启自动播放' : '已关闭自动播放')}
                  ariaLabel="自动播放"
                />
              </div>

              <div className="row gap-8" style={{ alignItems: 'center' }}>
                <span className="md-body-medium flex-1">常驻通知（通知栏里那条不可滑动清除的状态条）</span>
                <MdSwitch selected={enabled} onSelectedChange={toggleService} ariaLabel="常驻通知" />
              </div>

              {native ? (
                <md-outlined-button
                  className="btn-s"
                  onClick={() => {
                    const ok = nativePhrasePoke();
                    showSnackbar({ message: ok ? '已戳一下：看通知栏' : '「戳一下」需要安卓版', duration: 2600 });
                  }}
                >
                  戳一下试试
                </md-outlined-button>
              ) : (
                <div className="md-body-small muted">
                  网页版没有系统通知栏接口：台词管理、播放设置照常可用，常驻通知只在安卓版生效。
                </div>
              )}
            </div>
          </div>

          <SectionHeader title="保活自检" />
          <div className="list-group">
            <div className="col gap-4 md-body-small">
              <div>
                通知权限：{keepAlive ? (keepAlive.notifications ? '已允许' : '被关闭（常驻通知不会出现，需到系统设置里打开）') : '未检测（仅安卓版）'}
              </div>
              <div>
                电池优化：{keepAlive ? (keepAlive.batteryUnrestricted ? '已加入白名单（后台不易被杀）' : '仍受优化（可能被系统清理，建议加入白名单）') : '未检测（仅安卓版）'}
              </div>
              <div className="muted">
                自启动（各 OEM 的叫法不同：自启动 / 后台运行 / 关联启动）只能由用户在系统设置里开，
                应用无法自行申请 —— 这也是「桌宠式保活」与「日历模式提醒」的取舍点：日历提醒省电、不常驻；
                常驻通知更即时，但会占一条通知栏位置。
              </div>
            </div>
          </div>
        </div>
      </div>

      <MdDialog
        open={addOpen}
        headline="添加台词"
        onClosed={() => setAddOpen(false)}
        actions={
          <>
            <md-text-button onClick={() => setAddOpen(false)}>取消</md-text-button>
            <md-text-button onClick={submitAdd}>添加</md-text-button>
          </>
        }
      >
        <md-outlined-text-field
          label="新台词"
          value={draft}
          onInput={(event: React.FormEvent<HTMLElement>) => setDraft((event.target as HTMLInputElement).value)}
        />
        <div className="md-body-small muted mt-8">
          建议写短一点：通知栏一行放不下太长的话（最多 {PHRASE_LIMITS.maxPhrases} 条）。
        </div>
      </MdDialog>

      <MdDialog
        open={restoreOpen}
        headline="恢复默认台词"
        onClosed={() => setRestoreOpen(false)}
        actions={
          <>
            <md-text-button onClick={() => setRestoreOpen(false)}>取消</md-text-button>
            <md-text-button
              onClick={() => {
                setRestoreOpen(false);
                apply(restoreDefaultPhrases(config), '已恢复默认台词');
              }}
            >
              恢复
            </md-text-button>
          </>
        }
      >
        这会用内置默认台词覆盖当前 {config.phrases.length} 条（自制的课表主题文案）。确定吗？
      </MdDialog>
    </>
  );
}
