/**
 * API修改 (API edit)
 *
 * "API编辑" top app bar (back / refresh / delete-all), the three outlined API fields
 * from the sketch (+ an optional QA endpoint), and the 380x380 test image placeholder
 * that actually runs a recognition against the configured image-to-text API.
 */
import { useState } from 'react';
import { SectionHeader, TopAppBar } from '../components/layout';
import { MdIcon, MdIconButton, MdSwitch, MdTextField } from '../components/md';
import { ConfirmDialog } from '../components/overlays';
import { RecordingTrialDialog } from '../components/voice';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import { analyzeImage } from '../lib/api';
import { dataUrlSizeKb, pickImageFile, prepareImageFile } from '../lib/imaging';
import { isProbablyUrl } from '../lib/utils';

/** API 设置页的常见问题（照着填就不会卡住） */
const FAQ: { q: string; a: string }[] = [
  {
    q: '提示 401 / 无效密钥怎么办？',
    a: '先点「显示密钥」核对有没有多余空格或换行；再确认密钥与接口地址属于同一家服务（DeepSeek 的密钥配 DeepSeek 的地址）。密钥只在你的本机浏览器里保存。',
  },
  {
    q: '语音识别一直转不出文字？',
    a: '浏览器端建议直接用内置的实时语音识别（圆圈按钮，单点=长时间录制）；只有在 Chrome/Edge/Android WebView 上才支持。若走接口，请确认地址以 /v1/audio/transcriptions 结尾且服务允许跨域（CORS）。',
  },
  {
    q: '图片识别很慢或超时？',
    a: '图片会先按「图片压缩质量」压缩再上传。把清晰度调低、或换更小的图片即可；也可以在设置里把图片压缩质量调到 50% 左右。',
  },
  {
    q: '接口地址能不能留空？',
    a: '可以。留空表示不使用接口：语音走浏览器内置识别，图片只保存不识别，其他功能不受影响。',
  },
  {
    q: '换个服务商要改什么？',
    a: '只改「接口地址」和「密钥」两项即可，任何兼容 OpenAI 格式的服务都能用（自建、阿里云百炼、硅基流动等）。',
  },
];
export default function ApiEditScreen() {
  const nav = useNav();
  const { settings, updateSettings, showSnackbar } = useAppState();

  const [sttUrl, setSttUrl] = useState(settings.sttApiUrl);
  const [sttKey, setSttKey] = useState(settings.sttApiKey);
  const [visionUrl, setVisionUrl] = useState(settings.visionApiUrl);
  const [visionKey, setVisionKey] = useState(settings.visionApiKey);
  const [qaUrl, setQaUrl] = useState(settings.qaApiUrl);
  const [showKeys, setShowKeys] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testImage, setTestImage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState('');
  const [testing, setTesting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [trialOpen, setTrialOpen] = useState(false);

  const reload = () => {
    setSttUrl(settings.sttApiUrl);
    setSttKey(settings.sttApiKey);
    setVisionUrl(settings.visionApiUrl);
    setVisionKey(settings.visionApiKey);
    setQaUrl(settings.qaApiUrl);
    setErrors({});
    showSnackbar({ message: '已重新载入已保存的配置' });
  };

  const save = () => {
    const nextErrors: Record<string, string> = {};
    if (!isProbablyUrl(sttUrl)) nextErrors.sttUrl = '请输入以 http(s):// 开头的完整地址';
    if (!isProbablyUrl(visionUrl)) nextErrors.visionUrl = '请输入以 http(s):// 开头的完整地址';
    if (!isProbablyUrl(qaUrl)) nextErrors.qaUrl = '请输入以 http(s):// 开头的完整地址';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showSnackbar({ message: '接口地址格式不正确，请检查标红的输入框', duration: 5000 });
      return;
    }
    updateSettings(
      {
        sttApiUrl: sttUrl.trim(),
        sttApiKey: sttKey.trim(),
        visionApiUrl: visionUrl.trim(),
        visionApiKey: visionKey.trim(),
        qaApiUrl: qaUrl.trim(),
      },
      { message: '已保存API配置' },
    );
    // 填好语音转文字接口后先弹出录音试用，确认接口真的可用
    if (sttUrl.trim()) setTrialOpen(true);
  };

  const pickTestImage = async () => {
    const file = await pickImageFile();
    if (!file) return;
    try {
      const dataUrl = await prepareImageFile(file, settings.cameraSharpness);
      setTestImage(dataUrl);
      setTestResult('');
      showSnackbar({ message: `已选择测试图片（${dataUrlSizeKb(dataUrl)} KB）` });
    } catch (error) {
      showSnackbar({ message: `读取图片失败：${error instanceof Error ? error.message : '未知错误'}` });
    }
  };

  const runTest = async () => {
    if (!testImage) {
      showSnackbar({ message: '请先选择一张测试图片', duration: 4000 });
      return;
    }
    if (!visionUrl.trim()) {
      showSnackbar({ message: '请先填写图片转文字API地址', duration: 4000 });
      return;
    }
    setTesting(true);
    setTestResult('');
    try {
      const result = await analyzeImage(testImage, {
        ...settings,
        visionApiUrl: visionUrl.trim(),
        visionApiKey: visionKey.trim(),
      });
      setTestResult([result.summary, ...result.keyPoints.map((point) => `- ${point}`)].join('\n'));
      showSnackbar({ message: '接口调用成功，已返回识别结果' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setTestResult(`调用失败：${message}`);
      showSnackbar({ message: `调用失败：${message}`, duration: 6000 });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <div className="screen-inner">
        <TopAppBar
          title="API编辑"
          onBack={() => nav.pop()}
          backLabel="返回设置"
          actions={
            <>
              <MdIconButton icon="refresh" label="重新载入已保存的配置" onClick={reload} />
              <MdIconButton icon="delete" label="删除全部API配置" onClick={() => setConfirmDelete(true)} />
            </>
          }
        />

        <div className="screen-content">
          {/* 作者要求：只需要一个输入框 —— 填「导入 / 识别 API」，同一地址同时用于
              语音转写、图片识别与问答（同一个多模态服务）。 */}
          <MdTextField
            label="导入 / 识别 API 地址"
            value={visionUrl}
            onValueChange={(value) => {
              setVisionUrl(value);
              setSttUrl(value);
              setQaUrl(value);
            }}
            placeholder="https://api.deepseek.com/v1/chat/completions"
            supportingText={
              errors.visionUrl ??
              '支持视觉多模态的模型接口：识别教材封面、课表截图与语音转写（如 deepseek-vl / qwen-vl-max / gpt-4o）'
            }
            error={Boolean(errors.visionUrl)}
            leadingIcon={<MdIcon name="bolt" />}
            type="url"
          />

          <div className="mt-12">
            <MdTextField
              label="API 密钥"
              value={visionKey}
              onValueChange={(value) => {
                setVisionKey(value);
                setSttKey(value);
                setQaKey(value);
              }}
              placeholder="可留空"
              supportingText="以 Authorization: Bearer 方式发送，仅保存在本机"
              leadingIcon={<MdIcon name="key" />}
              type={showKeys ? 'text' : 'password'}
            />
          </div>

          <div className="mt-12">
            <label className="row gap-8 md-body-medium" style={{ alignItems: 'center' }}>
              <MdSwitch
                selected={showKeys}
                onSelectedChange={(value) => setShowKeys(value)}
                ariaLabel="显示密钥"
              />
              显示密钥
            </label>
          </div>

          <div className="mt-12">
            {/* 教材识别依赖视觉多模态：这里明确提示用户该填什么 */}
            <div className="about-note mt-8">
              <div className="row gap-8">
                <MdIcon name="image_search" size={18} />
                <span className="md-title-small-emphasized flex-1">用来识别教材封面 / 图片内容</span>
              </div>
              <div className="md-body-small muted mt-4">
                必须填写**支持视觉多模态（图片输入）**的模型接口，纯文本模型无法识别图片。常见可用：
                <code>qwen-vl-max</code>、<code>qwen2.5-vl-*</code>（阿里云百炼）、<code>gpt-4o</code>、
                <code>glm-4v</code>、<code>deepseek-vl</code>、<code>internvl</code> 等；自建服务同理，
                只要接口能接收图片（base64 或图片 URL）并返回文字描述即可。
              </div>
              <div className="md-body-small muted mt-4">
                填好后到「课表 → 课程详情 → 教材 → 选图识别封面」，识别出的书名会自动匹配到对应课程；
                若报错提示不支持图片，说明当前填的是纯文本模型，换一个视觉模型即可。
              </div>
            </div>
          </div>

          {/* ---------------------------------------------- 操作指引 / FAQ */}
          <div className="mt-16">
            <SectionHeader icon="help_center" title="怎么填？三步搞定" />
            <div className="col gap-12">
              <div className="about-note">
                <div className="row gap-8">
                  <MdIcon name="looks_one" size={18} />
                  <span className="md-title-small-emphasized flex-1">拿到密钥</span>
                </div>
                <div className="md-body-small muted mt-4">
                  打开 DeepSeek 开放平台 → API keys → 创建密钥（形如 sk-…）。语音识别与图片识别
                  也可以换成任何兼容 OpenAI 接口的服务，填对应地址即可。
                </div>
                <div className="row gap-8 mt-8" style={{ flexWrap: 'wrap' }}>
                  <md-filled-tonal-button
                    className="btn-s"
                    onClick={() => window.open('https://platform.deepseek.com/api_keys', '_blank', 'noopener,noreferrer')}
                  >
                    <MdIcon slot="icon" name="open_in_new" />
                    打开 DeepSeek API 控制台
                  </md-filled-tonal-button>
                  <md-outlined-button
                    className="btn-s"
                    onClick={() => window.open('https://api-docs.deepseek.com/zh-cn/', '_blank', 'noopener,noreferrer')}
                  >
                    <MdIcon slot="icon" name="menu_book" />
                    接口文档
                  </md-outlined-button>
                </div>
              </div>

              <div className="about-note">
                <div className="row gap-8">
                  <MdIcon name="looks_two" size={18} />
                  <span className="md-title-small-emphasized flex-1">填地址与密钥</span>
                </div>
                <div className="md-body-small muted mt-4">
                  语音转文字：填 <code>…/v1/audio/transcriptions</code>；图片转文字：填
                  <code>…/v1/chat/completions</code>（多模态模型）。两者可以是不同服务，互不影响。
                </div>
              </div>

              <div className="about-note">
                <div className="row gap-8">
                  <MdIcon name="looks_3" size={18} />
                  <span className="md-title-small-emphasized flex-1">点保存并试一次</span>
                </div>
                <div className="md-body-small muted mt-4">
                  保存后会弹出录音试用；也可以随时回到这里用「测试图片」跑一遍识别，确认返回正常。
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <SectionHeader icon="quiz" title="常见问题（FAQ）" />
            <div className="col gap-8">
              {FAQ.map((item) => (
                <details className="about-note" key={item.q}>
                  <summary className="md-title-small-emphasized">{item.q}</summary>
                  <div className="md-body-small muted mt-4">{item.a}</div>
                </details>
              ))}
            </div>
            <div className="md-body-small muted mt-8">
              还解决不了？到仓库提 Issue（关于页有入口），或在 Bilibili 空间留言，我会补进这份 FAQ。
            </div>
          </div>

          <div className="mt-16">
            <SectionHeader
              icon="image"
              title="测试图片"
              trailing={
                testImage ? (
                  <md-text-button onClick={() => { setTestImage(null); setTestResult(''); }}>
                    清除
                  </md-text-button>
                ) : null
              }
            />
            <div className="image-placeholder" style={{ height: 380, borderRadius: 20, overflow: 'hidden' }}>
              {testImage ? (
                <img
                  src={testImage}
                  alt="测试图片预览"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', background: 'var(--md-sys-color-surface)' }}
                />
              ) : (
                <div className="col" style={{ alignItems: 'center', gap: 8 }}>
                  <MdIcon name="image" size={48} />
                  <span className="md-body-small">选择一张图片用于测试图片转文字API</span>
                </div>
              )}
            </div>

            <div className="button-group mt-12">
              <md-filled-tonal-button onClick={() => void pickTestImage()}>
                <MdIcon slot="icon" name="add_photo_alternate" />
                选择图片
              </md-filled-tonal-button>
              <md-filled-button onClick={() => void runTest()} disabled={testing ? '' : undefined}>
                <MdIcon slot="icon" name="bolt" />
                {testing ? '识别中…' : '测试识别'}
              </md-filled-button>
            </div>

            {testResult ? (
              <div className="container-box surface-high mt-12" style={{ maxHeight: 220, overflowY: 'auto' }}>
                <div className="md-label-medium muted mb-8">接口返回</div>
                <div className="md-body-medium" style={{ whiteSpace: 'pre-wrap' }}>
                  {testResult}
                </div>
              </div>
            ) : null}
          </div>

          <div className="row gap-12 mt-16 mb-16">
            <md-outlined-button className="flex-1" onClick={() => nav.pop()}>
              取消
            </md-outlined-button>
            <md-filled-button className="flex-1" onClick={save}>
              保存配置
            </md-filled-button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        headline="删除全部API配置？"
        body="语音转文字、图片转文字与问答接口的地址和密钥都会被清空，可用底部提示条撤销。"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          setSttUrl('');
          setSttKey('');
          setVisionUrl('');
          setVisionKey('');
          setQaUrl('');
          updateSettings(
            { sttApiUrl: '', sttApiKey: '', visionApiUrl: '', visionApiKey: '', qaApiUrl: '' },
            { message: '已删除全部API配置' },
          );
          nav.pop();
        }}
      />

      <RecordingTrialDialog open={trialOpen} onClose={() => setTrialOpen(false)} />
    </>
  );
}
