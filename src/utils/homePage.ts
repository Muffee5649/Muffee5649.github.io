import type { PageMetaDatum } from '@uni-helper/vite-plugin-uni-pages'
import { pages } from '@/pages.json'

/**
 * 首页路径，通过 page.json 里面的 type 为 home 的页面获取，如果没有，则默认是第一个页面
 * 通常为 /pages/index/index
 *
 * 单独抽成 leaf 模块，避免 tabbar/store 与 utils 之间产生循环依赖
 */
export const HOME_PAGE = `/${(pages as PageMetaDatum[]).find(page => page.type === 'home')?.path || (pages as PageMetaDatum[])[0].path}`
