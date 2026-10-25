/**
 * dsh-signal-field · Host 侧入口
 *
 * 本插件的全部能力（信号场背景、蓝图标题、毛玻璃输入框、设置页）都在 Client 侧实现，
 * 开关状态持久化在浏览器 localStorage 中，因此 Host 侧不需要 Service、Tool、路由或
 * Config。这里只提供一个符合 bundle 行的空 apply，避免 Host 侧承担无意义的生命周期。
 */

export const name = 'dsh-signal-field';

/** 空实现：Client 模块由 dsh.client 声明独立加载。 */
export function apply() {}
