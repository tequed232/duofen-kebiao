/* 内置课表：**已按作者要求清空**。
 *
 * 原内置数据来自「学生课表.doc」，包含班级名称、任课教师姓名、教室号与班级人数等
 * 个人信息，不应随开源项目分发，因此整体移除，仅保留课表结构（节次与时间），
 * 让首次打开的用户看到一个空白但结构完整的课表，再由自己导入或手动填写。
 *
 * Tequed232 拥有本项目的最终解释权。
 */

import type { ScheduleData } from '../lib/schedule';

export const EMBEDDED_SCHEDULE: ScheduleData = {
  owner: 'Tequed232 拥有本项目的最终解释权',
  term: '2026-2027-1',
  termStart: '2026-08-31',
  days: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
  periods: [
    { period: '第1-2节', time: '08:30-09:55', section: 'morning', days: [[], [], [], [], [], [], []] },
    { period: '第3-4节', time: '10:10-11:35', section: 'morning', days: [[], [], [], [], [], [], []] },
    { period: '第5-6节', time: '12:10-13:35', section: 'noon', days: [[], [], [], [], [], [], []] },
    { period: '第7-8节', time: '14:10-15:35', section: 'afternoon', days: [[], [], [], [], [], [], []] },
    { period: '第9-10节', time: '15:50-17:15', section: 'afternoon', days: [[], [], [], [], [], [], []] },
    { period: '第11-12节', time: '18:10-19:35', section: 'evening', days: [[], [], [], [], [], [], []] },
    { period: '第13-14节', time: '19:50-21:15', section: 'evening', days: [[], [], [], [], [], [], []] },
  ],
};
