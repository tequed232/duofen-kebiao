/** Record card, carousel, mind map and the QA / key point views. */
import { useState } from 'react';
import type { NoteRecord, QaBranch } from '../lib/types';
import { relativeTime, truncate } from '../lib/utils';
import { MdIcon } from './md';

export function RecordCard({
  record,
  onOpen,
  onMenu,
}: {
  record: NoteRecord;
  onOpen: () => void;
  onMenu?: (anchor: HTMLElement) => void;
}) {
  const preview = record.note || record.imageSummary || record.transcript;
  return (
    <md-filled-card className="record-card">
      <div className="card-media tap" style={{ height: 168, cursor: 'pointer' }} onClick={onOpen}>
        {record.images[0] ? (
          <img src={record.images[0]} alt={record.title} />
        ) : (
          <div className="image-placeholder" style={{ height: '100%', borderRadius: 0 }}>
            <MdIcon name="image" size={48} />
          </div>
        )}
      </div>
      <div className="card-text" onClick={onOpen} style={{ cursor: 'pointer' }}>
        <div className="row" style={{ gap: 4 }}>
          <span className="card-title md-title-medium-emphasized flex-1">{record.title}</span>
          {onMenu ? (
            <md-icon-button
              aria-label="更多操作"
              onClick={(event: React.MouseEvent<HTMLElement>) => {
                event.stopPropagation();
                onMenu(event.currentTarget);
              }}
            >
              <MdIcon name="more_vert" />
            </md-icon-button>
          ) : null}
        </div>
        {preview ? (
          <div className="card-supporting md-body-medium">{truncate(preview.replace(/\s+/g, ' '), 84)}</div>
        ) : null}
        {record.tags.length ? (
          <div className="chip-row mt-8">
            {record.tags.slice(0, 3).map((tag) => (
              <span className="chip" key={tag}>
                <MdIcon name="label" size={16} />
                <span className="md-label-large">{tag}</span>
              </span>
            ))}
          </div>
        ) : null}
        <div className="row gap-8 mt-8 muted">
          <MdIcon name="schedule" size={16} />
          <span className="md-label-medium">{relativeTime(record.createdAt)}</span>
          {record.images.length > 1 ? (
            <>
              <MdIcon name="photo_library" size={16} />
              <span className="md-label-medium">{record.images.length} 张图片</span>
            </>
          ) : null}
          {record.transcript ? (
            <>
              <MdIcon name="graphic_eq" size={16} />
              <span className="md-label-medium">含语音转文字</span>
            </>
          ) : null}
        </div>
      </div>
    </md-filled-card>
  );
}

/** M3 multi-browse carousel: leading item large, following items progressively smaller. */
export function MultiBrowseCarousel({
  images,
  labels,
  onSelect,
}: {
  images: string[];
  labels?: string[];
  onSelect?: (index: number) => void;
}) {
  return (
    <div className="carousel" role="list">
      {images.map((src, index) => {
        const width = index === 0 ? 264 : Math.max(132, 168 - (index - 1) * 12);
        return (
          <div
            className="carousel-card tap"
            role="listitem"
            key={`${index}-${src.slice(-16)}`}
            style={{ width }}
            onClick={() => onSelect?.(index)}
          >
            <img src={src} alt={labels?.[index] ?? `图片 ${index + 1}`} />
            <div className="carousel-card-title md-title-small-emphasized">
              {labels?.[index] ?? `图片 ${index + 1}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function KeyPointList({ points }: { points: string[] }) {
  if (!points.length) {
    return <div className="md-body-medium hint">还没有提取到重点内容。</div>;
  }
  return (
    <div className="col">
      {points.map((point, index) => (
        <div className="row" key={`${index}-${point.slice(0, 8)}`} style={{ alignItems: 'flex-start', gap: 12, padding: '10px 0' }}>
          <MdIcon name="radio_button_checked" size={18} />
          <span className="md-body-medium flex-1">{point}</span>
        </div>
      ))}
    </div>
  );
}

/** Mind-map style map of the final key content and the QA branches. */
export function MindMapView({
  topic,
  keyPoints,
  branches,
}: {
  topic: string;
  keyPoints: string[];
  branches: QaBranch[];
}) {
  return (
    <div className="mindmap">
      <div className="mindmap-root md-title-small-emphasized">{topic || '本次记录'}</div>
      <div className="mindmap-branches">
        {keyPoints.length ? (
          <div className="mindmap-branch">
            <div className="mindmap-branch-body">
              <div className="row gap-8">
                <MdIcon name="lightbulb" size={18} />
                <span className="md-title-small-emphasized">重点内容</span>
              </div>
              {keyPoints.map((point, index) => (
                <div className="mindmap-leaf md-body-small" key={`${index}-${point.slice(0, 8)}`}>
                  {point}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {branches.map((branch) => (
          <div className="mindmap-branch" key={branch.id}>
            <div className="mindmap-branch-body">
              <div className="row gap-8">
                <MdIcon name="account_tree" size={18} />
                <span className="md-title-small-emphasized">{branch.topic}</span>
              </div>
              {branch.entries.map((entry) => (
                <div className="mindmap-leaf" key={entry.id}>
                  <div className="qa-question md-body-small">问：{entry.question}</div>
                  <div className="md-body-small mt-4">{truncate(entry.answer.replace(/\s+/g, ' '), 90)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!keyPoints.length && !branches.length ? (
          <div className="mindmap-branch">
            <div className="mindmap-branch-body md-body-medium hint">长按底部输入框提问后，回答会在这里形成新的分支。</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * QA branches with the answers rendered in the tertiary (purple) container role.
 * 回答默认折叠：标题行显示问题，点开才展开原文，避免长回答刷屏。
 */
export function QaBranchList({ branches }: { branches: QaBranch[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((value) => ({ ...value, [id]: !value[id] }));

  if (!branches.length) {
    return (
      <div className="md-body-medium hint">
        还没有提问记录。在主页底部输入框输入问题并回车，回答会以紫色框显示在这里。
      </div>
    );
  }

  return (
    <div className="col gap-16">
      {branches.map((branch) => (
        <div className="col gap-8" key={branch.id}>
          <div className="row gap-8">
            <MdIcon name="account_tree" size={18} />
            <span className="md-title-small-emphasized flex-1">{branch.topic}</span>
            <span className="md-label-small muted">{branch.entries.length} 条回答</span>
          </div>
          {branch.entries.map((entry) => {
            const expanded = Boolean(open[entry.id]);
            return (
              <div className="qa-entry" key={entry.id}>
                <button
                  type="button"
                  className="qa-entry-header"
                  onClick={() => toggle(entry.id)}
                  aria-expanded={expanded}
                >
                  <MdIcon name="help" size={16} />
                  <span className="qa-question md-body-medium flex-1">{entry.question}</span>
                  <MdIcon name={expanded ? 'expand_less' : 'expand_more'} size={20} />
                </button>
                {expanded ? (
                  <div className="qa-answer md-body-medium">
                    <div className="md-label-medium mb-8" style={{ opacity: 0.85 }}>
                      {entry.source === 'api'
                        ? '来自问答接口'
                        : entry.source === 'local'
                          ? '来自本次记录内容'
                          : '未找到相关内容'}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{entry.answer}</div>
                  </div>
                ) : (
                  <div className="qa-preview md-body-small">{truncate(entry.answer.replace(/\s+/g, ' '), 42)}</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function TranscriptView({
  transcript,
  interim,
  placeholder = '还没有内容。点击麦克风开始实时语音转文字，或手动输入。',
}: {
  transcript: string;
  interim?: string;
  placeholder?: string;
}) {
  if (!transcript && !interim) {
    return <div className="md-body-medium hint">{placeholder}</div>;
  }
  return (
    <div className="transcript-text md-body-medium">
      {transcript}
      {interim ? <span className="transcript-interim"> {interim}</span> : null}
    </div>
  );
}
