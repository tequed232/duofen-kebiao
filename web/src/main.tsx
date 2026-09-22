import { installMotionScheme } from './theme/motion';
import { installPerfTelemetry } from './lib/perf-telemetry';
import { applyRoles, buildThemes, detectSeed } from './theme/palette';

/* --------------------------------------------------------------------------
 * Material Web components. Every component the library ships is used as-is -
 * nothing here is a hand written replacement.
 * ------------------------------------------------------------------------ */
import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/button/elevated-button.js';
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/iconbutton/filled-icon-button.js';
import '@material/web/iconbutton/filled-tonal-icon-button.js';
import '@material/web/iconbutton/outlined-icon-button.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/textfield/filled-text-field.js';
import '@material/web/switch/switch.js';
import '@material/web/slider/slider.js';
import '@material/web/dialog/dialog.js';
import '@material/web/divider/divider.js';
import '@material/web/menu/menu.js';
import '@material/web/menu/menu-item.js';
import '@material/web/list/list.js';
import '@material/web/list/list-item.js';
import '@material/web/fab/fab.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/labs/navigationbar/navigation-bar.js';
import '@material/web/labs/navigationtab/navigation-tab.js';
import '@material/web/labs/card/filled-card.js';
import '@material/web/labs/card/elevated-card.js';
import '@material/web/labs/card/outlined-card.js';

/* Roboto (M3 typeface) and the subset Material Symbols Rounded icon font. */
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './theme/icon-font.css';

import './theme/tokens.css';
import './theme/base.css';
import './theme/components.css';
import './theme/schedule.css';

/* MotionScheme.expressive(): solve the springs once and publish them as CSS vars. */
installMotionScheme();

/* 真机可观测：把「主线程被顶住」的长任务报到 console（APK 宿主再转发进 logcat） */
installPerfTelemetry();

/* Apply the dynamic (or fallback) color roles before the first paint. */
const seed = detectSeed();
applyRoles(buildThemes(seed).light, false);

void import('./bootstrap');
