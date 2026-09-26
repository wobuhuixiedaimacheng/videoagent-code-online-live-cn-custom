import type { CanvasCamera } from './types';

/**
 * 状态分层里属于**会话**的那一半：相机。
 *
 * 换个人打开同一个项目，不该被别人的视口带着走，也不该因为「我刚才拖到了右下角」
 * 而进入项目的版本历史——所以相机走 sessionStorage，并且按 projectId 分键，
 * 这是「切项目之后视口不能串」那条验收的落点。
 *
 * 属于**文档**的另一半（画布、便签、节点布局）不在这里：它住在工作区的
 * .aigc/canvas-boards.json 里，跟着项目一起归档，见 lib/canvasBoards.ts。
 */

const CAMERA_PREFIX = 'videoagent-canvas-camera:';
const ACTIVE_BOARD_PREFIX = 'videoagent-canvas-board:';

/**
 * 相机按「项目 + 画布」分键。
 * 只按项目分的话，在规划画布上拖到某处，切回生产画布会跳到同一个坐标——
 * 两张画布的世界根本不是同一个，那个位置在这边毫无意义。
 */
const cameraKey = (projectId: string, boardId: string) => `${CAMERA_PREFIX}${projectId}:${boardId}`;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function readCamera(projectId: string, boardId: string): CanvasCamera | null {
  if (typeof window === 'undefined' || !projectId) return null;
  const parsed = safeParse<Partial<CanvasCamera>>(
    window.sessionStorage.getItem(cameraKey(projectId, boardId)),
    {}
  );
  if (!isFiniteNumber(parsed.x) || !isFiniteNumber(parsed.y) || !isFiniteNumber(parsed.zoom)) return null;
  // 存坏了的 zoom（0 或负数）会让整块画布消失，宁可回落到 fitView。
  if (parsed.zoom <= 0) return null;
  return { x: parsed.x, y: parsed.y, zoom: parsed.zoom };
}

export function writeCamera(projectId: string, boardId: string, camera: CanvasCamera) {
  if (typeof window === 'undefined' || !projectId) return;
  // NaN / Infinity 存进去，下次打开这个项目就是一块空白画布，而且看不出是谁写坏的。
  if (!isFiniteNumber(camera.x) || !isFiniteNumber(camera.y) || !isFiniteNumber(camera.zoom)) return;
  if (camera.zoom <= 0) return;
  try {
    window.sessionStorage.setItem(cameraKey(projectId, boardId), JSON.stringify(camera));
  } catch {
    /* 隐私模式下写不进去。视口丢了不影响生产，不值得为它报错。 */
  }
}

/**
 * 「我上次在看哪张画布」也是会话状态。
 * 把它写进工作区的话，一个人切到自己的规划画布，另一个人打开这个项目会莫名其妙
 * 也落在那张画布上——那是别人的视角，不是这个项目的属性。
 */
export function readActiveBoardId(projectId: string): string {
  if (typeof window === 'undefined' || !projectId) return '';
  return window.sessionStorage.getItem(ACTIVE_BOARD_PREFIX + projectId) || '';
}

export function writeActiveBoardId(projectId: string, boardId: string) {
  if (typeof window === 'undefined' || !projectId) return;
  try {
    window.sessionStorage.setItem(ACTIVE_BOARD_PREFIX + projectId, boardId);
  } catch {
    /* 同上：记不住当前画布不影响生产。 */
  }
}
