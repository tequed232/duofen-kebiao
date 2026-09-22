/**
 * 教材识别接口 —— 原「API 编辑」的裁剪版。
 *
 * 只保留教材封面识别用的视觉接口（`analyzeImage`）：填地址 + 密钥，可选一张图试跑。
 * 语音转文字 / 问答接口随语音功能一并删除（v2.6 之后）。
 */
import { useState } from 'react';
import { SectionHeader, TopAppBar } from '../components/layout';
import { MdIcon, MdTextField } from '../components/md';
import { useAppState } from '../state/AppState';
import { useNav } from '../nav/navigation';
import { analyzeImage } from '../lib/api';
import { dataUrlSizeKb, pickImageFile, prepareImageFile } from '../lib/imaging';
import { isProbablyUrl } from '../lib/utils';

export default function ApiEditScreen() {
  const nav = useNav();
  const { settings, updateSettings, showSnackbar } = useAppState();
  const [url, setUrl] = useState(settings.visionApiUrl);
  const [key, setKey] = useState(settings.visionApiKey);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const urlOk = !url.trim() || isProbablyUrl(url);
  const dirty = url.trim() !== settings.visionApiUrl || key.trim() !== settings.visionApiKey;

  const save = () => {
    updateSettings(
      { visionApiUrl: url.trim(), visionApiKey: key.trim() },
      { message: url.trim() ? '已保存教材识别接口' : '已清空教材识别接口' },
    );
  };

  const test = async () => {
    if (!url.trim()) {
      showSnackbar({ message: '先填写接口地址' });
      return;
    }
    const file = await pickImageFile();
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const dataUrl = await prepareImageFile(file, settings.cameraSharpness);
      const summary = await analyzeImage(dataUrl, { ...settings, visionApiUrl: url.trim(), visionApiKey: key.trim() });
      const lines = [
        `图片 ${dataUrlSizeKb(dataUrl)} KB`,
        summary.summary ? `描述：${summary.summary.slice(0, 80)}` : '',
        summary.keyPoints.length ? `要点：${summary.keyPoints.slice(0, 3).join(' / ')}` : '',
        summary.tags.length ? `标签：${summary.tags.join('、')}` : '',
      ].filter(Boolean);
      setResult(lines.join('\n'));
      showSnackbar({ message: '接口可用' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '识别失败';
      setResult(`识别失败：${message}`);
      showSnackbar({ message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen-inner">
      <TopAppBar title="教材识别接口" onBack={() => nav.pop()} backLabel="返回设置" />

      <div className="screen-content">
        <SectionHeader icon="menu_book" title="教材封面识别" />
        <div className="col gap-12">
          <MdTextField
            label="接口地址"
            value={url}
            onValueChange={setUrl}
            placeholder="https://…"
            supportingText="兼容 OpenAI 风格的图片对话接口；留空则关闭识别功能"
            error={!urlOk}
            leadingIcon={<MdIcon name="bolt" size={18} />}
          />
          <MdTextField
            label="密钥"
            value={key}
            onValueChange={setKey}
            type="password"
            supportingText="只保存在本机浏览器（IndexedDB），不会上传"
            leadingIcon={<MdIcon name="key" size={18} />}
          />
        </div>

        <div className="row gap-8 mt-16" style={{ flexWrap: 'wrap' }}>
          <md-filled-button className="btn-s" onClick={save} disabled={!urlOk || (!dirty && Boolean(url.trim()))}>
            <MdIcon slot="icon" name="save" />
            保存
          </md-filled-button>
          <md-outlined-button className="btn-s" onClick={() => void test()} disabled={busy || !urlOk}>
            <MdIcon slot="icon" name="image_search" />
            {busy ? '识别中…' : '选一张图试跑'}
          </md-outlined-button>
        </div>

        {result ? (
          <div className="about-note mt-16">
            <div className="md-body-small muted" style={{ whiteSpace: 'pre-wrap' }}>
              {result}
            </div>
          </div>
        ) : null}

        <SectionHeader icon="help_center" title="怎么填？" />
        <div className="about-note">
          <div className="md-body-small muted">
            在教材页点「识别」时会调用这个接口：把封面图发过去，返回教材名 / 出版社，填进对应课程。
            接口地址与密钥都只存在本机；不填也能用，只是识别按钮会提示未配置。
          </div>
        </div>
      </div>
    </div>
  );
}
