/**
 * 主页 (Home)
 *
 * Top container  : live speech-to-text raw transcript   -> tap = fullscreen panel
 * Divider
 * Middle container: transcript + image summary + key points + mind map -> tap = fullscreen panel
 * Bottom         : "长按输入文本" field (drawn in front, long press = question mode)
 *                  + connected button group [拍照][导入图片]
 * Nav bar        : 首页 selected
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppNavBar, SectionHeader, TopAppBar, useLongPress } from '../components/layout';
import { MdDialog, MdIcon, MdIconButton, MdTextField } from '../components/md';
import { GlassMark } from '../components/glass';
import { Waveform } from '../components/waveform';
import { ExpandableSheet } from '../components/overlays';
import { KeyPointList, MindMapView, QaBranchList, TranscriptView } from '../components/content';
import { RecordingProgress, useElapsedSeconds, useSystemNotice } from '../components/voice';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import { useSpeechRecognition } from '../lib/speech';
import { analyzeImage, askQuestion, topicFor } from '../lib/api';
import { pickImageFile, prepareImageFile } from '../lib/imaging';
import { detectIntent, formatDateTime } from '../lib/utils';
import { isNativeShell, nativeLiveUpdate, nativeRequestPermissions, onNativeLiveConfirm } from '../lib/native';
import type { Draft } from '../lib/types';

export default function HomeScreen() {
  const nav = useNav();
  const {
    settings,
    draft,
    effectiveKeyPoints,
    appendTranscript,
    setDraft,
    addBranchAnswer,
    createRecord,
    removeRecord,
    resetDraft,
    markDraftSaved,
    showSnackbar,
  } = useAppState();

  const [topOpen, setTopOpen] = useState(false);
  const [middleOpen, setMiddleOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  /** 圆圈按钮的两种录制模式：长时间录制 / 临时录制 */
  const [recording, setRecording] = useState<'idle' | 'continuous' | 'temporary'>('idle');
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const tempTimer = useRef<number | undefined>(undefined);

  const topRef = useRef<HTMLDivElement>(null);
  const middleRef = useRef<HTMLDivElement>(null);

  const speech = useSpeechRecognition({
    intensity: settings.speechIntensity,
    onFinal: (text) => {
      appendTranscript(text);
      if (recordingRef.current === 'temporary') {
        // 临时录制：识别到一句就结束，结果直接提示出来
        window.clearTimeout(tempTimer.current);
        speechRef.current?.stop();
        setRecording('idle');
        showSnackbar({ message: `临时录制：${text}`, duration: 5000 });
      }
    },
    onError: (message) => {
      setRecording('idle');
      showSnackbar({ message, duration: 6000 });
    },
  });
  const speechRef = useRef(speech);
  speechRef.current = speech;

  /* 录音进度条 + 系统通知（对应 Android 端流体云卡片） */
  const notice = useSystemNotice();
  /** 界面统一以 recording 为准，避免语音引擎提前结束造成状态不一致 */
  const isRecording = recording !== 'idle';
  // 通知每 5 秒刷新一次；进度条自己带 1 秒计时，避免整屏每秒重渲染
  const noticeSeconds = useElapsedSeconds(isRecording, 5000);

  /** 单点圆圈：进入长时间录制（持续实时转写，再点一次结束） */
  const startContinuousRecording = useCallback(async () => {
    if (recordingRef.current !== 'idle' || speech.listening) {
      window.clearTimeout(tempTimer.current);
      speech.stop();
      setRecording('idle');
      notice.close();
      const text = draft.transcript.trim();
      if (text) {
        notice.show('语音识别完成 · 多分课表', text.slice(0, 90));
        window.setTimeout(() => notice.close(), 4000);
      }
      return;
    }
    if (isNativeShell()) nativeRequestPermissions();
    const granted = await notice.request();
    setRecording('continuous');
    speech.start();
    showSnackbar({ message: '进入长时间录制', duration: 3000 });
    notice.show(
      '正在录音 · 多分课表',
      granted ? '长时间录制进行中，再次点按圆圈结束' : '长时间录制进行中（未授予通知权限）',
    );
  }, [draft.transcript, notice, showSnackbar, speech]);

  /** 长按圆圈：临时录制（最多 10 秒，识别到一句即结束） */
  const startTemporaryRecording = useCallback(async () => {
    if (speech.listening) speech.stop();
    window.clearTimeout(tempTimer.current);
    if (!speech.supported) {
      showSnackbar({ message: '当前浏览器不支持实时语音识别，可在右侧输入框手动输入', duration: 5000 });
      return;
    }
    if (isNativeShell()) nativeRequestPermissions();
    const granted = await notice.request();
    setRecording('temporary');
    speech.start();
    showSnackbar({ message: '临时录制（松开后最多录制 10 秒）', duration: 3000 });
    notice.show('临时录制 · 多分课表', granted ? '识别到一句话后自动结束' : '临时录制进行中');
    tempTimer.current = window.setTimeout(() => {
      speechRef.current?.stop();
      setRecording('idle');
      notice.close();
      showSnackbar({ message: '临时录制结束，没有识别到内容', duration: 4000 });
    }, 10000);
  }, [notice, showSnackbar, speech]);

  const micLongPress = useLongPress(
    () => void startTemporaryRecording(),
    () => void startContinuousRecording(),
    500,
  );

  // 定时刷新通知里的计时，让状态卡片保持“活着”
  useEffect(() => {
    if (!isRecording) return;
    const mm = Math.floor(noticeSeconds / 60)
      .toString()
      .padStart(2, '0');
    const ss = (noticeSeconds % 60).toString().padStart(2, '0');
    const liveTitle = recordingRef.current === 'temporary' ? '临时录制 · 多分课表' : '正在录音 · 多分课表';
    const liveBody = ` ${mm}:${ss} · 实时语音转文字进行中 `;
    notice.show(liveTitle, liveBody);
    // 流体云 / Live Updates：按录音时长推进进度（0-100）
    if (liveNotifyRef.current) {
      nativeLiveUpdate(liveTitle, liveBody, Math.min(100, Math.round(noticeSeconds * 1.7)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeSeconds, isRecording]);

  useEffect(
    () => () => {
      window.clearTimeout(tempTimer.current);
      notice.close();
    },
    [notice],
  );

  /** 回车/按钮：提问就发问，普通输入就追加到转写（在 submitQuestion 之后声明） */
  const submitField = () => {
    if (detectIntent(question) === 'ask') void submitQuestion();
    else appendManualText();
  };

  // 实时通知开关（设置里可关）；通知上的「确认」按钮会回到这里触发弹窗
  const liveNotifyRef = useRef(settings.liveNotify);
  liveNotifyRef.current = settings.liveNotify;
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);

  useEffect(() => {
    onNativeLiveConfirm(() => setLiveConfirmOpen(true));
  }, []);

  const sheetOpen = topOpen || middleOpen;

  /* ------------------------------------------------------------- actions */

  const saveRecord = useCallback(async () => {
    const snapshot: Draft = { ...draft };
    const hasImage = draft.images.length > 0;
    const record = await createRecord({
      title: hasImage && !draft.transcript ? `图片记录 · ${formatDateTime(Date.now())}` : `语音记录 · ${formatDateTime(Date.now())}`,
      note: draft.imageSummary || draft.transcript.slice(0, 80),
      images: draft.images,
      transcript: draft.transcript,
      imageSummary: draft.imageSummary,
      keyPoints: draft.keyPoints.length ? draft.keyPoints : effectiveKeyPoints,
      branches: draft.branches,
      tags: draft.tags,
    });
    resetDraft();
    markDraftSaved();
    setTopOpen(false);
    setMiddleOpen(false);
    showSnackbar({
      message: '已保存到历史记录',
      actionLabel: '撤销',
      onAction: () => {
        void removeRecord(record.id);
        setDraft(snapshot);
        showSnackbar({ message: '已撤销保存，内容回到主页草稿' });
      },
    });
  }, [
    createRecord,
    draft,
    effectiveKeyPoints,
    markDraftSaved,
    removeRecord,
    resetDraft,
    setDraft,
    showSnackbar,
  ]);

  const importImage = useCallback(async () => {
    const file = await pickImageFile();
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await prepareImageFile(file, settings.cameraSharpness);
      setDraft({ images: [dataUrl, ...draft.images].slice(0, 8) });
      if (settings.visionApiUrl.trim()) {
        const result = await analyzeImage(dataUrl, settings);
        setDraft({
          imageSummary: result.summary,
          keyPoints: result.keyPoints,
          tags: Array.from(new Set([...draft.tags, ...result.tags])),
        });
        showSnackbar({ message: '图片已识别并生成总结' });
      } else {
        showSnackbar({
          message: '已导入图片。配置“图片转文字API”后可自动识别与总结。',
          duration: 6000,
        });
      }
    } catch (error) {
      showSnackbar({ message: `图片识别失败：${error instanceof Error ? error.message : '未知错误'}`, duration: 6000 });
    } finally {
      setBusy(false);
    }
  }, [draft.images, draft.tags, setDraft, settings, showSnackbar]);

  /** 实时判断用户在提问还是普通输入（见 lib/utils.detectIntent） */
  const fieldIntent = detectIntent(question);
  // 图标名单独取出来，避免图标扫描脚本把判断用的字符串也当成图标名
  const fieldIcon = fieldIntent === 'ask' ? 'send' : 'keyboard_return';
  const fieldIconLabel = fieldIntent === 'ask' ? '发送问题' : '追加到转写文字';

  const appendManualText = useCallback(() => {
    const text = question.trim();
    if (!text) return;
    appendTranscript(text);
    setQuestion('');
    showSnackbar({ message: '已追加到语音转文字内容', duration: 3000 });
  }, [appendTranscript, question, showSnackbar]);

  const submitQuestion = useCallback(async () => {
    const text = question.trim();
    if (!text) return;
    setQuestion('');
    setBusy(true);
    const context = {
      transcript: draft.transcript,
      imageSummary: draft.imageSummary,
      keyPoints: effectiveKeyPoints,
    };
    try {
      const result = await askQuestion(text, context, settings);
      const topic = result.topic || topicFor(text, context);
      addBranchAnswer(text, result.answer, topic, result.source);
      showSnackbar({
        message:
          result.source === 'none'
            ? '记录中没有相关内容，已新建一个分支'
            : result.source === 'api'
              ? '已从问答接口获得回答'
              : '已根据本次记录内容生成回答',
      });
    } finally {
      setBusy(false);
    }
  }, [addBranchAnswer, draft.imageSummary, draft.transcript, effectiveKeyPoints, question, settings, showSnackbar]);

  const selectTab = (tab: 'schedule' | 'search' | 'settings') => {
    // v2：底边栏三项 —— 首页=课表（栈底）、搜索=筛选页、设置
    if (tab === 'schedule') {
      nav.popTo('schedule');
      return;
    }
    nav.push(tab === 'search' ? 'scheduleFilter' : 'settings', {}, 'slide');
  };

  return (
    <>
      <div className={['screen-inner', sheetOpen ? 'stacked' : ''].join(' ').trim()}>
        <div className="screen-content home-stack">
        {/* ---------------------------------------------- live transcript */}
        <div
          className="container-box surface-high clickable"
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          ref={topRef}
          onClick={() => setTopOpen(true)}
          role="button"
          tabIndex={0}
          aria-label="实时语音转文字，点击放大"
        >
          <div className="row gap-8">
            {isRecording ? <span className="live-dot" /> : <MdIcon name="graphic_eq" size={20} />}
            <span className="md-title-small-emphasized flex-1">
              {recording === 'temporary'
                ? '临时录制中…'
                : isRecording
                  ? '长时间录制中…'
                  : '实时语音转文字'}
            </span>
            {/* 麦克风按钮在可点击容器内部：阻止冒泡，避免同时打开全屏面板 */}
            <span onClick={(event) => event.stopPropagation()}>
              <MdIconButton
                icon={isRecording ? 'stop_circle' : 'mic'}
                label={isRecording ? '停止录制' : '开始语音识别'}
                tonal
                onClick={() => void startContinuousRecording()}
              />
            </span>
          </div>

          {/* 快速开始：点击语音后的进度条 + 计时，同时发布系统通知 */}
          <div onClick={(event) => event.stopPropagation()}>
            {/* 录音波形：与进度条同一个统一界面 */}
            <Waveform active={speech.listening} />
            <RecordingProgress
              active={isRecording}
              label={recording === 'temporary' ? '临时录制中' : '正在录音 · 长时间录制'}
              onStop={() => void startContinuousRecording()}
            />
          </div>

          <div className="flex-1 scroll-y">
            <TranscriptView transcript={draft.transcript} interim={speech.interim} />
          </div>
          <div className="row gap-4 muted">
            <MdIcon name="open_in_full" size={16} />
            <span className="md-label-medium">点击容器全屏查看原文</span>
          </div>
        </div>

        <md-divider className="mt-12 mb-12" />

        {/* ------------------------------------ summary / key points / map */}
        <div
          className="container-box tertiary clickable"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          ref={middleRef}
          onClick={() => setMiddleOpen(true)}
          role="button"
          tabIndex={0}
          aria-label="总结与思维导图，点击放大"
        >
          <div className="row gap-8">
            <MdIcon name="summarize" size={20} />
            <span className="md-title-small-emphasized flex-1">重点 · 思维导图</span>
            <MdIcon name="open_in_full" size={18} />
          </div>

          {/* 语音转文字与图片总结不再在这里重复展示，展开全屏面板时才显示 */}
          <div className="row gap-8 md-body-small" style={{ opacity: 0.85 }}>
            <MdIcon name="unfold_more" size={16} />
            <span className="flex-1">
              展开查看语音转文字、图片总结与重点全文
              {draft.transcript || draft.imageSummary ? '（已有内容）' : '（暂无内容）'}
            </span>
          </div>

          {draft.images.length ? (
            <div className="row gap-8">
              {draft.images.slice(0, 3).map((src, index) => (
                <div
                  className="media-thumb"
                  key={`${index}-${src.slice(-12)}`}
                  style={{ width: 72, height: 72, flex: '0 0 auto', borderRadius: 16 }}
                >
                  <img src={src} alt={`草稿图片 ${index + 1}`} />
                </div>
              ))}
              {draft.images.length > 3 ? (
                <span className="md-label-large">+{draft.images.length - 3}</span>
              ) : null}
            </div>
          ) : null}

          <div className="flex-1 scroll-y">
            <div className="md-label-medium mb-8" style={{ opacity: 0.85 }}>
              思维导图
            </div>
            <MindMapView
              topic={draft.transcript ? draft.transcript.slice(0, 14) : '本次记录'}
              keyPoints={effectiveKeyPoints.slice(0, 3)}
              branches={draft.branches}
            />
          </div>
        </div>

        <div className="flex-1" style={{ minHeight: 16 }} />

        <div className="flex-1" style={{ minHeight: 8 }} />
      </div>

      {/* -------------------------------- 固定在页面左右两侧的底部控件 ------ */}
      <div className="home-footer">
        {/* 左边一个圆圈：单点 = 长时间录制，长按 = 临时录制；右边是输入框，
            单点输入文本、长按选中文本（原生行为），两者互不干扰 */}
        <div className="home-input-row">
          <button
            type="button"
            className={[
              'mic-circle',
              recording === 'continuous' ? 'recording' : '',
              recording === 'temporary' ? 'temporary' : '',
            ]
              .join(' ')
              .trim()}
            aria-label="单点进入长时间录制，长按临时录制"
            title="单点：长时间录制 · 长按：临时录制"
            {...micLongPress}
          >
            <MdIcon name={isRecording ? 'stop' : 'mic'} size={26} />
          </button>

          <div className="home-input">
            <MdTextField
              label={fieldIntent === 'ask' ? '提问 · 回车发送' : '输入 · 回车追加到转写'}
              value={question}
              onValueChange={setQuestion}
              onEnter={submitField}
              supportingText={
                fieldIntent === 'ask'
                  ? '实时判断：提问 · 回答会收进思维导图分支'
                  : '实时判断：普通输入 · 回车追加到语音转文字'
              }
              trailingIcon={
                <MdIconButton
                  icon={fieldIcon}
                  label={fieldIconLabel}
                  onClick={submitField}
                />
              }
            />
          </div>
        </div>

        {/* 拍照贴左边缘、导入图片贴右边缘；中间放可点的美术资源（戳一下喵～） */}
        <div className="home-actions">
          <md-filled-button onClick={() => nav.push('camera', {}, 'zoom')}>
            <MdIcon slot="icon" name="photo_camera" />
            拍照
          </md-filled-button>
          <span className="glass-mark-slot" aria-hidden="true">
            <GlassMark size={56} />
          </span>
          <md-filled-button onClick={() => void importImage()} disabled={busy ? '' : undefined}>
            <MdIcon slot="icon" name="add_photo_alternate" />
            导入图片
          </md-filled-button>
        </div>
      </div>

      {/* 实时通知的「直接确认」弹窗：通知上点确认，或录音结束后都会出现 */}
      <MdDialog
        open={liveConfirmOpen}
        headline="实时记录已结束"
        onClosed={() => setLiveConfirmOpen(false)}
        actions={
          <>
            <md-text-button onClick={() => setLiveConfirmOpen(false)}>稍后再说</md-text-button>
            <md-filled-tonal-button
              onClick={() => {
                setLiveConfirmOpen(false);
                showSnackbar({ message: '已确认，记录保存在本机历史里', duration: 3500 });
              }}
            >
              直接确认
            </md-filled-tonal-button>
          </>
        }
      >
        语音识别与图片处理已经完成。
        {draft.transcript.trim() ? '本次识别到的文字已写入草稿。' : '本次没有识别到文字。'}
        你可以点「直接确认」结束这次实时通知，或稍后在历史里查看。
      </MdDialog>
      <AppNavBar active="schedule" onSelect={selectTab} />
      </div>

      {/* ------------------------------------------------ fullscreen panels */}
      <ExpandableSheet
        open={topOpen}
        onClose={() => setTopOpen(false)}
        sourceRef={topRef}
        icon="graphic_eq"
        title="语音转文字原文"
        headerActions={
          <md-filled-tonal-button onClick={() => void saveRecord()}>保存为记录</md-filled-tonal-button>
        }
      >
        <div className="md-label-medium muted mb-12">
          {isRecording ? '正在实时转写…' : '实时转写已暂停'} · {formatDateTime(draft.updatedAt || Date.now())}
        </div>
        <TranscriptView transcript={draft.transcript} interim={speech.interim} />
      </ExpandableSheet>

      <ExpandableSheet
        open={middleOpen}
        onClose={() => setMiddleOpen(false)}
        sourceRef={middleRef}
        icon="summarize"
        title="记录总结与重点"
        headerActions={
          <md-filled-tonal-button onClick={() => void saveRecord()}>保存为记录</md-filled-tonal-button>
        }
      >
        <SectionHeader icon="graphic_eq" title="语音转文字" />
        <TranscriptView transcript={draft.transcript} interim={speech.interim} />

        <div className="mt-16">
          <SectionHeader icon="image" title="图片总结" />
          <div className="md-body-medium" style={{ whiteSpace: 'pre-wrap' }}>
            {draft.imageSummary || '还没有图片总结。可在主页导入一张图片，或前往相机拍摄。'}
          </div>
        </div>

        <div className="mt-16">
          <SectionHeader icon="lightbulb" title="重点内容" />
          <KeyPointList points={effectiveKeyPoints} />
        </div>

        <div className="mt-16">
          <SectionHeader icon="account_tree" title="思维导图" />
          <MindMapView
            topic={draft.transcript ? draft.transcript.slice(0, 14) : '本次记录'}
            keyPoints={effectiveKeyPoints}
            branches={draft.branches}
          />
        </div>

        <div className="mt-16">
          <SectionHeader icon="forum" title="问答分支" />
          <QaBranchList branches={draft.branches} />
        </div>
      </ExpandableSheet>
    </>
  );
}