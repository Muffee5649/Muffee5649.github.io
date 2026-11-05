<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useDialog, useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { DishCategoryService, DishService } from '@/service/ordering'
import type { DishCategoryItem, DishItem } from '@/service/ordering'
import { ServiceError } from '@/service/shared'

defineOptions({
  name: 'MenusEdit',
})
definePage({
  style: {
    navigationBarTitleText: '%menus.edit.title%',
  },
})

const toast = useToast()
const dialog = useDialog()

const loading = ref(false)
/** 全部分类（管理视角，含停用分类） */
const categories = ref<DishCategoryItem[]>([])
/** 全部菜品（含停售菜品，便于编辑与删除） */
const dishes = ref<DishItem[]>([])
/** 当前选中分类（左侧栏） */
const activeCategory = ref<number | string>('')
/** 右侧列表滚动锚点（分类 id → cat-{id}） */
const anchor = ref('')
/** 右侧列表当前滚动距离 */
const scrollTop = ref(0)
/** 各分类区块相对滚动内容顶部的偏移 */
const sectionTops = ref<Array<{ id: number | string, top: number }>>([])
let scrollLinkLocked = false
let scrollLinkTimer: ReturnType<typeof setTimeout> | undefined

/** 分类 + 其下菜品（页面展示结构） */
interface MenuEditSection {
  id: number
  name: string
  sort: number
  enabled: boolean
  dishCount: number
  dishes: DishItem[]
}

const sections = computed<MenuEditSection[]>(() =>
  categories.value.map(category => ({
    id: category.id,
    name: category.name,
    sort: category.sort,
    enabled: category.enabled,
    dishCount: category.dishCount,
    dishes: dishes.value.filter(dish => dish.categoryIds.includes(category.id)),
  })),
)

/** 启用分类（新增菜品只能归属启用分类，FR-DISH-01 / FR-DISH-02） */
const enabledCategories = computed(() => categories.value.filter(category => category.enabled))

/** 分类表单 */
const categoryPopupVisible = ref(false)
const categoryEditingId = ref<number | null>(null)
const categorySubmitting = ref(false)
const categoryForm = ref({
  name: '',
  sort: 0,
})

/** 菜品表单 */
const dishPopupVisible = ref(false)
const dishEditingId = ref<number | null>(null)
/** 编辑时保留菜品未在表单中维护的字段（图片 / 标签 / 库存等） */
const dishEditing = ref<DishItem | null>(null)
const dishSubmitting = ref(false)
const dishForm = ref({
  name: '',
  priceText: '',
  unit: '份',
  categoryIds: [] as number[],
  sort: 0,
  description: '',
})

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

/** 测量各分类区块偏移（分类渲染完成后调用） */
async function measureSectionTops() {
  await nextTick()
  uni.createSelectorQuery()
    .select('.menu-list')
    .boundingClientRect()
    .selectAll('.menu-section')
    .boundingClientRect()
    .exec((res) => {
      const container = res[0] as { top: number } | null
      const blocks = res[1] as Array<{ top: number }> | null
      if (!container || !blocks?.length) {
        return
      }
      sectionTops.value = sections.value.map((section, index) => ({
        id: section.id,
        top: blocks[index].top - container.top + scrollTop.value,
      }))
    })
}

/** 列表滚动时同步侧栏选中项 */
function onListScroll(event: { detail: { scrollTop: number } }) {
  const top = event.detail.scrollTop
  scrollTop.value = top
  if (scrollLinkLocked) {
    return
  }
  let current = sectionTops.value[0]?.id
  sectionTops.value.forEach((section) => {
    if (top + 1 >= section.top) {
      current = section.id
    }
  })
  if (current !== undefined && current !== activeCategory.value) {
    activeCategory.value = current
  }
}

/** 滚到底部时兜底高亮最后一项 */
function onListReachBottom() {
  if (scrollLinkLocked) {
    return
  }
  const last = sectionTops.value[sectionTops.value.length - 1]
  if (last && last.id !== activeCategory.value) {
    activeCategory.value = last.id
  }
}

/** 点击左侧分类 → 右侧滚动到对应区块 */
async function onCategoryChange(id: number) {
  scrollLinkLocked = true
  if (scrollLinkTimer) {
    clearTimeout(scrollLinkTimer)
  }
  scrollLinkTimer = setTimeout(() => {
    scrollLinkLocked = false
  }, 300)
  anchor.value = ''
  await nextTick()
  anchor.value = `cat-${id}`
}

/** 加载分类与菜品（管理视角，含停用 / 停售数据） */
async function loadMenu() {
  loading.value = true
  try {
    const [categoryResult, dishResult] = await Promise.all([
      DishCategoryService.getList({ size: 999 }),
      DishService.getList({ size: 999 }),
    ])
    categories.value = categoryResult.records
    dishes.value = dishResult.records
    if (categories.value.length && !categories.value.some(item => item.id === activeCategory.value)) {
      activeCategory.value = categories.value[0].id
    }
    if (!categories.value.length) {
      activeCategory.value = ''
    }
    measureSectionTops()
  }
  catch (error) {
    console.log('菜单管理数据加载失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('menus.edit.loadFailed'))
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  loadMenu()
})

/** 打开分类表单（不传分类为新增，FR-CAT-01 / FR-CAT-02） */
function openCategoryForm(category?: Pick<DishCategoryItem, 'id' | 'name' | 'sort'>) {
  categoryEditingId.value = category?.id ?? null
  categoryForm.value = {
    name: category?.name ?? '',
    sort: category?.sort ?? 0,
  }
  categoryPopupVisible.value = true
}

/** 保存分类 */
async function submitCategory() {
  if (categorySubmitting.value) {
    return
  }
  const name = categoryForm.value.name.trim()
  if (!name || name.length > 20) {
    toast.show(t('menus.edit.category.nameInvalid'))
    return
  }
  categorySubmitting.value = true
  try {
    if (categoryEditingId.value) {
      await DishCategoryService.update(categoryEditingId.value, {
        name,
        sort: categoryForm.value.sort,
      })
      toast.show(t('menus.edit.category.updateSuccess'))
    }
    else {
      const id = await DishCategoryService.create({
        name,
        sort: categoryForm.value.sort,
      })
      toast.show(t('menus.edit.category.createSuccess'))
      categoryPopupVisible.value = false
      await loadMenu()
      activeCategory.value = id
      onCategoryChange(id)
      return
    }
    categoryPopupVisible.value = false
    await loadMenu()
  }
  catch (error) {
    console.log('分类保存失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('menus.edit.category.saveFailed'))
  }
  finally {
    categorySubmitting.value = false
  }
}

/** 删除分类（FR-CAT-04：分类下有菜品时阻断） */
async function confirmDeleteCategory(category: MenuEditSection) {
  if (category.dishCount > 0) {
    toast.show(t('menus.edit.category.hasDishes'))
    return
  }
  const result = await dialog.confirm({
    title: t('menus.edit.category.deleteTitle'),
    msg: t('menus.edit.category.deleteConfirm', { name: category.name }),
  })
  if (result.action !== 'confirm') {
    return
  }
  try {
    await DishCategoryService.remove(category.id)
    toast.show(t('menus.edit.category.deleteSuccess'))
    await loadMenu()
  }
  catch (error) {
    console.log('删除分类失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('menus.edit.category.deleteFailed'))
  }
}

/** 打开菜品表单（不传菜品为新增，FR-DISH-01 / FR-DISH-02） */
function openDishForm(category: MenuEditSection, dish?: DishItem) {
  dishEditingId.value = dish?.id ?? null
  dishEditing.value = dish ?? null
  if (dish) {
    dishForm.value = {
      name: dish.name,
      priceText: (dish.priceCents / 100).toFixed(2),
      unit: dish.unit,
      categoryIds: dish.categoryIds.filter(id =>
        enabledCategories.value.some(categoryItem => categoryItem.id === id),
      ),
      sort: dish.sort,
      description: dish.description ?? '',
    }
  }
  else {
    dishForm.value = {
      name: '',
      priceText: '',
      unit: '份',
      categoryIds: category.enabled ? [category.id] : [],
      sort: 0,
      description: '',
    }
  }
  dishPopupVisible.value = true
}

/** 切换菜品所属分类（多选） */
function toggleDishCategory(categoryId: number) {
  const ids = dishForm.value.categoryIds
  const index = ids.indexOf(categoryId)
  if (index === -1) {
    ids.push(categoryId)
  }
  else {
    ids.splice(index, 1)
  }
}

/** 保存菜品 */
async function submitDish() {
  if (dishSubmitting.value) {
    return
  }
  const name = dishForm.value.name.trim()
  if (!name || name.length > 50) {
    toast.show(t('menus.edit.dish.nameInvalid'))
    return
  }
  const priceText = dishForm.value.priceText.trim()
  const price = Number(priceText)
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(priceText) || !Number.isFinite(price) || price <= 0) {
    toast.show(t('menus.edit.dish.priceInvalid'))
    return
  }
  if (!dishForm.value.categoryIds.length) {
    toast.show(t('menus.edit.dish.categoryRequired'))
    return
  }
  dishSubmitting.value = true
  try {
    const base = dishEditing.value
    const input = {
      categoryIds: dishForm.value.categoryIds,
      name,
      priceCents: Math.round(price * 100),
      unit: dishForm.value.unit.trim() || '份',
      description: dishForm.value.description.trim() || null,
      sort: dishForm.value.sort,
      // 编辑时保留未在表单中维护的字段，避免保存后被清空
      imageUrls: base?.imageUrls ?? [],
      detailImageUrls: base?.detailImageUrls ?? [],
      tags: base?.tags ?? [],
      stockEnabled: base?.stockEnabled ?? false,
      stock: base?.stock ?? 0,
      autoReplenish: base?.autoReplenish ?? false,
      replenishTime: base?.replenishTime ?? '02:00:00',
      replenishStock: base?.replenishStock ?? 0,
    }
    if (dishEditingId.value) {
      await DishService.update(dishEditingId.value, input)
      toast.show(t('menus.edit.dish.updateSuccess'))
    }
    else {
      await DishService.create(input)
      toast.show(t('menus.edit.dish.createSuccess'))
    }
    dishPopupVisible.value = false
    await loadMenu()
  }
  catch (error) {
    console.log('菜品保存失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('menus.edit.dish.saveFailed'))
  }
  finally {
    dishSubmitting.value = false
  }
}

/** 删除菜品（FR-DISH-04：被订单或预点菜单引用时仅可停售） */
async function confirmDeleteDish(dish: DishItem) {
  const result = await dialog.confirm({
    title: t('menus.edit.dish.deleteTitle'),
    msg: t('menus.edit.dish.deleteConfirm', { name: dish.name }),
  })
  if (result.action !== 'confirm') {
    return
  }
  try {
    await DishService.remove(dish.id)
    toast.show(t('menus.edit.dish.deleteSuccess'))
    await loadMenu()
  }
  catch (error) {
    console.log('删除菜品失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('menus.edit.dish.deleteFailed'))
  }
}
</script>

<template>
  <view class="menus-edit flex flex-col bg-gray-100">
    <view v-if="loading && !sections.length" class="flex flex-1 items-center justify-center">
      <wd-loading color="var(--wot-color-theme, #5D87FF)" />
    </view>

    <!-- 主体：左侧分类栏 + 右侧菜品列表 -->
    <view v-else class="min-h-0 flex flex-1">
      <scroll-view class="h-full w-25 shrink-0 bg-white" scroll-y :show-scrollbar="false">
        <view
          v-for="section in sections"
          :key="section.id"
          class="border-b border-gray-100 px-2 py-2.5 active:opacity-70"
          :class="activeCategory === section.id ? 'bg-primary/5' : ''"
          @tap="activeCategory = section.id; onCategoryChange(section.id)"
        >
          <view class="flex items-center gap-1">
            <text
              class="min-w-0 flex-1 truncate text-xs"
              :class="activeCategory === section.id ? 'text-primary font-bold' : 'text-gray-700 font-bold'"
            >
              {{ section.name }}
            </text>
            <text class="shrink-0 text-3xs text-gray-400">
              {{ section.dishCount }}
            </text>
          </view>
          <view class="mt-1 flex items-center gap-1">
            <view
              class="h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 text-primary active:opacity-70"
              @tap.stop="openCategoryForm(section)"
            >
              <view class="i-ri-edit-line text-2xs" />
            </view>
            <view
              class="h-5 w-5 flex items-center justify-center rounded-full bg-red-50 text-red-500 active:opacity-70"
              @tap.stop="confirmDeleteCategory(section)"
            >
              <view class="i-ri-close-line text-2xs" />
            </view>
            <text v-if="!section.enabled" class="ml-auto text-3xs text-gray-300">
              {{ $t('menus.edit.disabled') }}
            </text>
          </view>
        </view>

        <!-- 新增分类（PRD 6.1 FR-CAT-01） -->
        <view
          class="mx-2 my-2 flex items-center justify-center gap-1 border border-gray-300 rounded-2 border-dashed py-2 text-2xs text-primary active:opacity-70"
          @tap="openCategoryForm()"
        >
          <view class="i-ri-add-line" />
          {{ $t('menus.edit.addCategory') }}
        </view>
      </scroll-view>

      <scroll-view
        class="menu-list h-full min-w-0 flex-1"
        scroll-y
        :show-scrollbar="false"
        :scroll-into-view="anchor"
        scroll-with-animation
        @scroll="onListScroll"
        @scrolltolower="onListReachBottom"
      >
        <view v-if="!sections.length" class="flex flex-1 items-center justify-center px-4 py-16">
          <wd-empty :tip="$t('menus.edit.empty.categories')" />
        </view>

        <view
          v-for="section in sections"
          :id="`cat-${section.id}`"
          :key="section.id"
          class="menu-section pb-2"
        >
          <!-- 分类标题 + 新增菜品 -->
          <view class="flex items-center justify-between gap-2 px-3 pb-1 pt-3">
            <view class="min-w-0 flex items-center gap-1.5">
              <text class="truncate text-sm text-gray-800 font-bold">
                {{ section.name }}
              </text>
              <wd-tag
                v-if="!section.enabled"
                type="default"
                variant="light"
                size="small"
                round
              >
                {{ $t('menus.edit.disabled') }}
              </wd-tag>
            </view>
            <view
              v-if="section.enabled"
              class="flex shrink-0 items-center gap-0.5 text-xs text-primary active:opacity-70"
              @tap="openDishForm(section)"
            >
              <view class="i-ri-add-line" />
              {{ $t('menus.edit.addDish') }}
            </view>
          </view>

          <view class="flex flex-col gap-2 px-2">
            <view
              v-for="dish in section.dishes"
              :key="dish.id"
              class="flex items-stretch gap-2 rounded-3 bg-white p-2.5"
              :class="dish.status === 'off_sale' ? 'opacity-60' : ''"
            >
              <view class="h-21 w-21 shrink-0 overflow-hidden rounded-2">
                <image
                  v-if="dish.imageUrls.length"
                  :src="dish.imageUrls[0]"
                  mode="aspectFill"
                  class="block h-full w-full"
                />
                <view
                  v-else
                  class="h-full w-full flex items-center justify-center bg-primary/10 text-primary/40"
                >
                  <view class="i-carbon-restaurant text-xl" />
                </view>
              </view>
              <view class="min-w-0 flex flex-1 flex-col justify-between py-0.5">
                <view class="flex items-center gap-1">
                  <text class="min-w-0 truncate text-sm text-gray-800 font-bold">
                    {{ dish.name }}
                  </text>
                  <wd-tag
                    v-if="dish.status === 'off_sale'"
                    type="warning"
                    variant="light"
                    size="small"
                    round
                  >
                    {{ $t('menus.edit.offSale') }}
                  </wd-tag>
                </view>
                <text v-if="dish.description" class="truncate text-2xs text-gray-400">
                  {{ dish.description }}
                </text>
                <view class="truncate text-sm text-primary font-bold">
                  {{ formatMoney(dish.priceCents) }}<text class="text-2xs text-gray-400 font-normal">/{{ dish.unit }}</text>
                </view>
              </view>
              <!-- 菜品操作：编辑 / 删除 -->
              <view class="flex shrink-0 flex-col items-center justify-center gap-2">
                <view
                  class="h-6 w-6 flex items-center justify-center rounded-full bg-primary/10 text-primary active:opacity-70"
                  @tap="openDishForm(section, dish)"
                >
                  <view class="i-ri-edit-line text-xs" />
                </view>
                <view
                  class="h-6 w-6 flex items-center justify-center rounded-full bg-red-50 text-red-500 active:opacity-70"
                  @tap="confirmDeleteDish(dish)"
                >
                  <view class="i-ri-delete-bin-line text-xs" />
                </view>
              </view>
            </view>
          </view>

          <wd-empty
            v-if="!section.dishes.length"
            :tip="$t('menus.edit.empty.dishes')"
            custom-class="!py-4"
          />
        </view>
      </scroll-view>
    </view>

    <!-- 分类新增 / 编辑弹层 -->
    <wd-popup
      v-model="categoryPopupVisible"
      position="bottom"
      round
      :z-index="1001"
      safe-area-inset-bottom
      custom-class="!rounded-t-3"
    >
      <view class="p-4">
        <view class="text-center text-base text-gray-800 font-bold">
          {{ categoryEditingId ? $t('menus.edit.category.editTitle') : $t('menus.edit.category.createTitle') }}
        </view>
        <wd-input
          v-model="categoryForm.name"
          :maxlength="20"
          :placeholder="$t('menus.edit.category.namePlaceholder')"
          clearable
          custom-class="mt-4"
        />
        <view class="mt-3 flex items-center justify-between gap-3">
          <text class="shrink-0 text-sm text-gray-600">
            {{ $t('menus.edit.category.sort') }}
          </text>
          <wd-input-number v-model="categoryForm.sort" :min="0" input-width="40px" />
        </view>
        <view class="mt-6 flex gap-3">
          <wd-button block :disabled="categorySubmitting" @click="categoryPopupVisible = false">
            {{ $t('menus.edit.cancel') }}
          </wd-button>
          <wd-button block type="primary" :loading="categorySubmitting" @click="submitCategory">
            {{ $t('menus.edit.save') }}
          </wd-button>
        </view>
      </view>
    </wd-popup>

    <!-- 菜品新增 / 编辑弹层 -->
    <wd-popup
      v-model="dishPopupVisible"
      position="bottom"
      round
      :z-index="1001"
      safe-area-inset-bottom
      custom-class="!rounded-t-3"
    >
      <view class="max-h-[80vh] flex flex-col">
        <view class="shrink-0 px-4 pt-4 text-center text-base text-gray-800 font-bold">
          {{ dishEditingId ? $t('menus.edit.dish.editTitle') : $t('menus.edit.dish.createTitle') }}
        </view>
        <scroll-view class="min-h-0 flex-1" scroll-y :show-scrollbar="false">
          <view class="flex flex-col gap-3 px-4 py-4">
            <wd-input
              v-model="dishForm.name"
              :maxlength="50"
              :placeholder="$t('menus.edit.dish.namePlaceholder')"
              clearable
            />
            <wd-input
              v-model="dishForm.priceText"
              type="digit"
              :placeholder="$t('menus.edit.dish.pricePlaceholder')"
              clearable
            />
            <wd-input
              v-model="dishForm.unit"
              :maxlength="10"
              :placeholder="$t('menus.edit.dish.unitPlaceholder')"
              clearable
            />

            <!-- 所属分类（仅启用分类可选，FR-DISH-01） -->
            <view>
              <view class="pb-2 text-xs text-gray-600">
                {{ $t('menus.edit.dish.category') }}
              </view>
              <view v-if="enabledCategories.length" class="flex flex-wrap gap-2">
                <view
                  v-for="category in enabledCategories"
                  :key="category.id"
                  class="border rounded-2 border-solid px-3 py-1.5 text-xs active:opacity-70"
                  :class="dishForm.categoryIds.includes(category.id)
                    ? 'border-primary bg-primary/5 text-primary font-bold'
                    : 'border-gray-200 text-gray-600'"
                  @tap="toggleDishCategory(category.id)"
                >
                  {{ category.name }}
                </view>
              </view>
              <view v-else class="text-2xs text-red">
                {{ $t('menus.edit.dish.noEnabledCategories') }}
              </view>
            </view>

            <view class="flex items-center justify-between gap-3">
              <text class="shrink-0 text-sm text-gray-600">
                {{ $t('menus.edit.dish.sort') }}
              </text>
              <wd-input-number v-model="dishForm.sort" :min="0" input-width="40px" />
            </view>

            <wd-textarea
              v-model="dishForm.description"
              :maxlength="200"
              show-word-limit
              clearable
              :placeholder="$t('menus.edit.dish.descriptionPlaceholder')"
            />
          </view>
        </scroll-view>
        <view class="flex shrink-0 gap-3 border-t border-gray-100 px-4 py-3">
          <wd-button block :disabled="dishSubmitting" @click="dishPopupVisible = false">
            {{ $t('menus.edit.cancel') }}
          </wd-button>
          <wd-button block type="primary" :loading="dishSubmitting" @click="submitDish">
            {{ $t('menus.edit.save') }}
          </wd-button>
        </view>
      </view>
    </wd-popup>

    <wd-toast />
    <wd-dialog />
  </view>
</template>

<style lang="scss" scoped>
.menus-edit {
  /* 非 tab 页：视口高度减去 H5 导航栏（--window-top，小程序端无此变量取 0） */
  height: calc(100vh - var(--window-top, 0px));
}
</style>
