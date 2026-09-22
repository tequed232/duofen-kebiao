/**
 * 开源相关（Open source licenses）
 *
 * 样式对齐酷安《开源相关》列表：每条显示「名称 + 版本 / 许可 / 版权·开发者」，
 * 但**按用途分门别类**（界面组件、设计系统、构建工具、测试、Android、部署、参考实现）。
 * 数据由 scripts/collect-licenses.mjs 从 package.json + node_modules 自动生成。
 */
import { useMemo, useState } from 'react';
import { SectionHeader, TopAppBar } from '../components/layout';
import { MdIcon, MdTextField } from '../components/md';
import { useNav } from '../nav/navigation';
import { LICENSE_GROUPS, REFERENCE_LIBS, type LicenseEntry } from '../data/licenses';

function LicenseRow({ item }: { item: LicenseEntry }) {
  return (
    <div className="license-row">
      <div className="col flex-1" style={{ gap: 2 }}>
        <span className="md-title-small-emphasized">
          {item.title}
          {item.version && item.version !== '—' ? ` ${item.version}` : ''}
        </span>
        <span className="md-body-small muted">许可：{item.license || '未提供许可信息'}</span>
        <span className="md-body-small muted">版权 / 开发者：{item.holder || '未提供版权方信息'}</span>
        {item.note ? <span className="md-body-small muted">{item.note}</span> : null}
      </div>
      <a
        className="license-link"
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`打开 ${item.title} 的仓库`}
      >
        <MdIcon name="open_in_new" size={18} />
      </a>
    </div>
  );
}

export default function LicensesScreen() {
  const nav = useNav();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return LICENSE_GROUPS;
    return LICENSE_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.title.toLowerCase().includes(keyword) ||
          item.license.toLowerCase().includes(keyword) ||
          item.holder.toLowerCase().includes(keyword),
      ),
    })).filter((group) => group.items.length);
  }, [query]);

  const total = LICENSE_GROUPS.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="screen-inner">
      <TopAppBar title="开源相关" onBack={() => nav.pop()} backLabel="返回设置" />

      <div className="screen-content">
        <div className="md-body-small muted mb-12">
          本项目共引入 <strong>{total}</strong> 个开源依赖，按用途分类列出。感谢每一位作者与维护者；
          参考了实现思路但未引入代码的库单列在最后。
        </div>

        <div className="mb-12">
          <MdTextField
            label="搜索名称 / 许可 / 开发者"
            value={query}
            onValueChange={setQuery}
            leadingIcon={<MdIcon name="search" />}
          />
        </div>

        {groups.map((group) => (
          <div key={group.id} className="mb-16">
            <SectionHeader
              icon="category"
              title={`${group.title}（${group.items.length}）`}
              trailing={<span className="md-label-medium muted">{group.note}</span>}
            />
            <div className="col gap-8">
              {group.items.map((item) => (
                <LicenseRow key={`${group.id}-${item.title}`} item={item} />
              ))}
            </div>
          </div>
        ))}

        <div className="mb-16">
          <SectionHeader
            icon="lightbulb"
            title={`参考实现（未引入代码）（${REFERENCE_LIBS.length}）`}
            trailing={<span className="md-label-medium muted">仅参考实现思路</span>}
          />
          <div className="col gap-8">
            {REFERENCE_LIBS.map((item) => (
              <LicenseRow key={`ref-${item.title}`} item={item} />
            ))}
          </div>
        </div>

        {query && !groups.length ? (
          <div className="md-body-medium muted">没有匹配的条目。</div>
        ) : null}
      </div>
    </div>
  );
}
