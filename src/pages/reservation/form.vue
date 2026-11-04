<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useDialog, useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { DiningTableService, DishService, ReservationService } from '@/service/ordering'
import type {
  DiningTableItem,
  DiningTableType,
  OrderingMenuCategory,
  OrderingMenuDish,
  PreOrderItemInput,
} from '@/service/ordering'
import { ServiceError } from '@/service/shared'

defineOptions({
  name: 'ReservationForm',
})
definePage({
  style: {
    navigationBarTitleText: '%reservation.form.title%',
  },
})

const toast = useToast()
const dialog = useDialog()

/** 桌号类型单选（FR-RSV-01：房间可指定，大厅/外摆随机分配） */
const TABLE_TYPES: Array<{ value: DiningTableType, labelKey: string }> = [
  { value: 'hall', labelKey: 'home.type.hall' },
  { value: 'outdoor', labelKey: 'home.type.outdoor' },
  { value: 'room', labelKey: 'home.type.room' },
]

const editId = ref<number | null>(null)
const loading = ref(false)
const submitting = ref(false)

const form = ref({
  tableType: 'hall' as DiningTableType,
  tableId: null as number | null,
  guestName: '',
  phone: '',
  /** 到店时间（时间戳），必须晚于当前时间 */
  arrivalTime: Date.now() + 60 * 60 * 1000,
  partySize: 2,
  prepMeal: false,
  note: '',
})

/** 房间类型可选桌位（非停用，FR-RSV-01） */
const roomTables = ref<DiningTableItem[]>([])
/** 预点菜单（分类组织、仅在售菜品，FR-RSV-07） */
const categories = ref<OrderingMenuCategory[]>([])
/** 到店时间选择器开关 */
const datetimeVisible = ref(false)
/** 预点菜单选择弹层开关 */
const preOrderPickerVisible = ref(false)
/** 预点菜搜索关键词 */
const searchKeyword = ref('')

/** 搜索过滤后的菜单分类（按菜品名称匹配） */
const filteredCategories = computed<OrderingMenuCategory[]>(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return categories.value
  }
  return categories.value
    .map(category => ({
      ...category,
      dishes: category.dishes.filter(dish => dish.name.toLowerCase().includes(keyword)),
    }))
    .filter(category => category.dishes.length > 0)
})

watch(preOrderPickerVisible, (visible) => {
  // 关闭弹层时清空搜索，下次进入保持全量菜单
  if (!visible) {
    searchKeyword.value = ''
  }
})

/** 预点菜选择态：dishId → { qty, note, name } */
interface PreOrderSelection {
  qty: number
  note: string
  /** 编辑预填时菜品可能已停售（菜单中查不到），用预填名称兜底展示 */
  name?: string
}
const preOrderSelections = ref<Record<number, PreOrderSelection>>({})

/** 到店时间必须晚于当前时间（FR-RSV-01） */
const minDate = computed(() => Date.now())

/** 在售菜品索引（id → 菜品） */
const dishById = computed(() => {
  const map = new Map<number, OrderingMenuDish>()
  categories.value.forEach(category =>
    category.dishes.forEach(dish => map.set(dish.id, dish)),
  )
  return map
})

/** 预点菜提交条目：仅保留在售菜品（FR-RSV-07） */
const preOrderInputs = computed<PreOrderItemInput[]>(() => {
  const inputs: PreOrderItemInput[] = []
  Object.entries(preOrderSelections.value).forEach(([idStr, sel]) => {
    const dishId = Number(idStr)
    if (sel.qty > 0 && dishById.value.has(dishId)) {
      inputs.push({ dishId, quantity: sel.qty, note: sel.note || null })
    }
  })
  return inputs
})

/** 已停售的预点菜（编辑预填时菜单中已不存在），提交时将被移除并提示 */
const offSalePreOrders = computed(() => {
  const names: string[] = []
  Object.entries(preOrderSelections.value).forEach(([idStr, sel]) => {
    const dishId = Number(idStr)
    if (sel.qty > 0 && !dishById.value.has(dishId)) {
      names.push(sel.name ?? `#${dishId}`)
    }
  })
  return names
})

/** 预点菜摘要（表单卡片展示） */
const preOrderSummary = computed(() => {
  const list: Array<{ dishId: number, name: string, qty: number, note: string, offSale: boolean }> = []
  const seen = new Set<number>()
  // 菜单内（在售）条目，按分类顺序稳定展示
  categories.value.forEach((category) => {
    category.dishes.forEach((dish) => {
      const sel = preOrderSelections.value[dish.id]
      if (seen.has(dish.id) || !sel || sel.qty <= 0) {
        return
      }
      seen.add(dish.id)
      list.push({ dishId: dish.id, name: dish.name, qty: sel.qty, note: sel.note, offSale: false })
    })
  })
  // 预填时已停售的条目：仅展示提示，提交时跳过
  Object.entries(preOrderSelections.value).forEach(([idStr, sel]) => {
    const dishId = Number(idStr)
    if (!seen.has(dishId) && sel.qty > 0 && !dishById.value.has(dishId)) {
      list.push({ dishId, name: sel.name ?? `#${dishId}`, qty: sel.qty, note: sel.note, offSale: true })
    }
  })
  return list
})

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

/** 到店时间展示：YYYY-MM-DD HH:mm */
const arrivalLabel = computed(() => {
  const date = new Date(form.value.arrivalTime)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
})

watch(() => form.value.tableType, (type) => {
  // 切换非房间类型时清除指定桌位（随机分配类型由系统分配，FR-RSV-01）
  if (type !== 'room') {
    form.value.tableId = null
  }
})

/** 预点菜数量变化：0 视为移除 */
function setPreOrderQty(dish: OrderingMenuDish, qty: number) {
  if (qty <= 0) {
    delete preOrderSelections.value[dish.id]
    return
  }
  preOrderSelections.value[dish.id] = {
    qty,
    note: preOrderSelections.value[dish.id]?.note ?? '',
    name: dish.name,
  }
}

/** 基础数据：在售菜单 + 房间类型可选桌位 */
async function loadBase() {
  loading.value = true
  try {
    const [menu, tables] = await Promise.all([
      DishService.getOrderingMenu(),
      DiningTableService.getList({ tableType: 'room', size: 999 }),
    ])
    categories.value = menu
    roomTables.value = tables.records.filter(table => table.status !== 'disabled')
  }
  catch (error) {
    console.log('预定表单基础数据加载失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('reservation.form.loadFailed'))
  }
  finally {
    loading.value = false
  }
}

/** 编辑预填（FR-RSV-06）：类型/人数变更时保存将重新分配桌位 */
async function loadEdit(id: number) {
  try {
    const [detail, preOrders] = await Promise.all([
      ReservationService.getDetail(id),
      ReservationService.getPreOrders(id),
    ])
    form.value.tableType = detail.tableType
    form.value.tableId = detail.tableId
    form.value.guestName = detail.guestName
    form.value.phone = detail.phone
    form.value.arrivalTime = new Date(detail.arrivalTime).getTime()
    form.value.partySize = detail.partySize
    form.value.prepMeal = detail.prepMeal
    form.value.note = detail.note ?? ''
    const selections: Record<number, PreOrderSelection> = {}
    preOrders.forEach((item) => {
      selections[item.dishId] = { qty: item.quantity, note: item.note ?? '', name: item.dishName }
    })
    preOrderSelections.value = selections
  }
  catch (error) {
    console.log('预定详情加载失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('reservation.form.loadFailed'))
  }
}

onLoad((options) => {
  const id = Number(options?.id)
  if (Number.isFinite(id) && id > 0) {
    editId.value = id
    uni.setNavigationBarTitle({ title: t('reservation.form.editTitle') })
    loadEdit(id)
  }
  else {
    uni.setNavigationBarTitle({ title: t('reservation.form.createTitle') })
  }
  loadBase()
})

/** 表单校验（FR-RSV-01 基本项） */
function validate(): string | null {
  const name = form.value.guestName.trim()
  if (!name || name.length > 20) {
    return t('reservation.form.nameInvalid')
  }
  if (!/^\d{5,20}$/.test(form.value.phone.trim())) {
    return t('reservation.form.phoneInvalid')
  }
  if (form.value.arrivalTime <= Date.now()) {
    return t('reservation.form.arrivalPast')
  }
  if (form.value.partySize < 1) {
    return t('reservation.form.partySizeInvalid')
  }
  if (form.value.tableType === 'room' && !form.value.tableId) {
    return t('reservation.form.tableRequired')
  }
  return null
}

/** 提交（FR-RSV-01 / FR-RSV-06） */
async function submit() {
  if (submitting.value) {
    return
  }
  const error = validate()
  if (error) {
    toast.show(error)
    return
  }
  // 编辑时原有预点菜可能已停售：移除前需确认（FR-RSV-07）
  if (offSalePreOrders.value.length) {
    const result = await dialog.confirm({
      title: t('reservation.form.preOrderOffSale'),
      msg: t('reservation.form.preOrderOffSale.confirm', { dishes: offSalePreOrders.value.join('、') }),
    })
    if (result.action !== 'confirm') {
      return
    }
  }
  submitting.value = true
  try {
    const input = {
      tableType: form.value.tableType,
      tableId: form.value.tableType === 'room' ? form.value.tableId : null,
      guestName: form.value.guestName,
      phone: form.value.phone,
      arrivalTime: new Date(form.value.arrivalTime).toISOString(),
      partySize: form.value.partySize,
      prepMeal: form.value.prepMeal,
      note: form.value.note || null,
      // 传空数组表示清空预点菜单（null 会保留原预点菜单，编辑时需整体替换）
      preOrders: preOrderInputs.value,
    }
    if (editId.value) {
      await ReservationService.update(editId.value, input)
      toast.show(t('reservation.update.success'))
    }
    else {
      const result = await ReservationService.create(input)
      // 创建结果展示分配桌号（FR-RSV-01）
      toast.show(t('reservation.create.success', { no: result.tableNo }))
    }
    setTimeout(() => {
      if (getCurrentPages().length > 1) {
        uni.navigateBack()
      }
      else {
        uni.navigateTo({ url: '/pages/reservation/index' })
      }
    }, 600)
  }
  catch (e) {
    console.log('预定保存失败', e)
    toast.error(e instanceof ServiceError ? e.message : t('reservation.form.failed'))
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <view class="rsv-form flex flex-col bg-gray-100">
    <!-- 加载中 -->
    <view v-if="loading" class="flex flex-1 items-center justify-center">
      <wd-loading color="var(--wot-color-theme, #5D87FF)" />
    </view>

    <scroll-view v-else class="min-h-0 flex-1" scroll-y :show-scrollbar="false">
      <view class="flex flex-col gap-2.5 px-3 py-3">
        <!-- 桌位（FR-RSV-01：房间可指定具体桌，其余类型系统随机分配） -->
        <view class="rounded-3 bg-white p-3.5">
          <view class="flex items-center gap-1.5 text-sm text-gray-800 font-bold">
            <view class="i-ri-restaurant-line text-base text-primary" />
            {{ $t('reservation.form.tableSection') }}
          </view>

          <view class="grid grid-cols-3 mt-3 gap-2">
            <view
              v-for="opt in TABLE_TYPES"
              :key="opt.value"
              class="flex items-center justify-center border rounded-2 border-solid py-2 text-sm active:opacity-70"
              :class="form.tableType === opt.value
                ? 'border-primary bg-primary/5 text-primary font-bold'
                : 'border-gray-200 text-gray-600'"
              @tap="form.tableType = opt.value"
            >
              {{ $t(opt.labelKey) }}
            </view>
          </view>

          <!-- 房间：指定具体桌位 -->
          <template v-if="form.tableType === 'room'">
            <view v-if="roomTables.length" class="grid grid-cols-3 mt-2.5 gap-2">
              <view
                v-for="table in roomTables"
                :key="table.id"
                class="flex flex-col items-center border rounded-2 border-solid py-2 active:opacity-70"
                :class="form.tableId === table.id
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200'"
                @tap="form.tableId = table.id"
              >
                <view class="text-sm" :class="form.tableId === table.id ? 'text-primary font-bold' : 'text-gray-700'">
                  {{ table.tableNo }}
                </view>
                <view v-if="table.capacity" class="mt-0.5 text-2xs text-gray-400">
                  {{ t('ordering.table.capacity', { count: table.capacity }) }}
                </view>
              </view>
            </view>
            <view v-else class="mt-2.5 text-2xs text-gray-400">
              {{ $t('reservation.form.noRoomTables') }}
            </view>
          </template>

          <!-- 大厅 / 外摆：系统随机分配 -->
          <view v-else class="mt-2.5 flex items-center gap-1 text-2xs text-gray-400">
            <view class="i-ri-magic-line" />
            {{ $t('reservation.form.autoAssign') }}
          </view>
        </view>

        <!-- 到店信息 -->
        <view class="rounded-3 bg-white p-3.5">
          <view class="flex items-center gap-1.5 text-sm text-gray-800 font-bold">
            <view class="i-ri-time-line text-base text-primary" />
            {{ $t('reservation.form.arrivalSection') }}
          </view>

          <view class="mt-3 flex items-center justify-between gap-3">
            <view class="shrink-0 text-sm text-gray-600">
              {{ $t('reservation.form.arrivalTime') }}
            </view>
            <view
              class="flex items-center gap-1 text-sm text-primary active:opacity-70"
              @tap="datetimeVisible = true"
            >
              {{ arrivalLabel }}
              <view class="i-ri-arrow-right-s-line" />
            </view>
          </view>

          <!-- 预约间隔说明（系统设置的预约间隔 120 分钟） -->
          <view class="mt-1.5 text-2xs text-red">
            {{ t('reservation.form.intervalHint', { minutes: 120 }) }}
          </view>

          <view class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
            <view class="shrink-0 text-sm text-gray-600">
              {{ $t('reservation.form.partySize') }}
            </view>
            <wd-input-number v-model="form.partySize" :min="1" />
          </view>
        </view>

        <!-- 预定人 -->
        <view class="rounded-3 bg-white p-3.5">
          <view class="flex items-center gap-1.5 text-sm text-gray-800 font-bold">
            <view class="i-ri-user-line text-base text-primary" />
            {{ $t('reservation.form.guestSection') }}
          </view>

          <view class="mt-3 flex items-center justify-between gap-3">
            <view class="shrink-0 text-sm text-gray-600">
              {{ $t('reservation.form.guestName') }}
            </view>
            <input
              v-model="form.guestName"
              class="min-w-0 flex-1 text-right text-sm text-gray-800"
              :maxlength="20"
              :placeholder="$t('reservation.form.namePlaceholder')"
              placeholder-class="text-gray-300"
            >
          </view>

          <view class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
            <view class="shrink-0 text-sm text-gray-600">
              {{ $t('reservation.form.phone') }}
            </view>
            <input
              v-model="form.phone"
              type="number"
              class="min-w-0 flex-1 text-right text-sm text-gray-800"
              :maxlength="20"
              :placeholder="$t('reservation.form.phonePlaceholder')"
              placeholder-class="text-gray-300"
            >
          </view>
        </view>

        <!-- 其他 -->
        <view class="rounded-3 bg-white p-3.5">
          <view class="flex items-center justify-between">
            <view class="shrink-0 text-sm text-gray-600">
              {{ $t('reservation.form.prepMeal') }}
            </view>
            <wd-switch v-model="form.prepMeal" size="20px" />
          </view>
          <wd-textarea
            v-model="form.note"
            custom-class="!mt-3"
            :maxlength="50"
            show-word-limit
            clearable
            :placeholder="$t('reservation.form.notePlaceholder')"
          />
        </view>

        <!-- 预点菜单（FR-RSV-07：可选，仅在售菜品，核销时转首笔订单） -->
        <view class="rounded-3 bg-white p-3.5">
          <view class="flex items-center justify-between">
            <view class="flex items-center gap-1.5 text-sm text-gray-800 font-bold">
              <view class="i-ri-file-list-3-line text-base text-primary" />
              {{ $t('reservation.form.preOrders') }}
            </view>
            <view
              class="flex items-center gap-0.5 text-xs text-primary active:opacity-70"
              @tap="preOrderPickerVisible = true"
            >
              <view class="i-ri-add-line" />
              {{ preOrderSummary.length ? $t('reservation.form.editPreOrders') : $t('reservation.form.addPreOrders') }}
            </view>
          </view>

          <view v-if="preOrderSummary.length" class="mt-2.5 flex flex-wrap gap-1.5">
            <view
              v-for="item in preOrderSummary"
              :key="item.dishId"
              class="rounded-1 px-2 py-1 text-2xs"
              :class="item.offSale ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-600'"
            >
              {{ item.name }} ×{{ item.qty }}<template v-if="item.note">
                （{{ item.note }}）
              </template>
            </view>
          </view>
          <view v-else class="mt-2.5 text-2xs text-gray-400">
            {{ $t('reservation.form.preOrdersHint') }}
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 底部提交 -->
    <view class="border-t border-gray-200 bg-white px-4 py-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
      <wd-button type="primary" size="large" block :loading="submitting" @click="submit">
        <text class="font-bold">
          {{ editId ? $t('reservation.form.save') : $t('reservation.form.submit') }}
        </text>
      </wd-button>
    </view>

    <!-- 到店时间选择器 -->
    <wd-datetime-picker
      v-model="form.arrivalTime"
      v-model:visible="datetimeVisible"
      type="datetime"
      :min-date="minDate"
      :title="$t('reservation.form.arrivalTime')"
    />

    <!-- 预点菜单选择弹层 -->
    <wd-popup v-model="preOrderPickerVisible" position="bottom" custom-class="!rounded-t-3">
      <view class="h-[65vh] flex flex-col">
        <view class="flex items-center justify-between px-4 pb-2 pt-4">
          <text class="text-base text-gray-800 font-bold">
            {{ $t('reservation.form.preOrders') }}
          </text>
          <wd-button size="small" custom-class="!px-4" @click="preOrderPickerVisible = false">
            {{ $t('reservation.form.done') }}
          </wd-button>
        </view>
        <!-- 菜品搜索 -->
        <wd-search
          v-model="searchKeyword"
          :placeholder="$t('reservation.form.searchPlaceholder')"
        />
        <scroll-view class="min-h-0 flex-1" scroll-y :show-scrollbar="false">
          <template v-if="filteredCategories.length">
            <view v-for="category in filteredCategories" :key="category.id" class="px-4">
              <view class="pb-0.5 pt-3 text-xs text-gray-400">
                {{ category.name }}
              </view>
              <view
                v-for="dish in category.dishes"
                :key="dish.id"
                class="flex items-center gap-3 border-b border-gray-100 py-2.5"
              >
                <view class="min-w-0 flex-1">
                  <view class="truncate text-sm text-gray-800">
                    {{ dish.name }}
                  </view>
                  <view class="text-2xs text-primary">
                    {{ formatMoney(dish.priceCents) }}/{{ dish.unit }}
                  </view>
                  <view v-if="preOrderSelections[dish.id]" class="mt-1.5">
                    <input
                      v-model="preOrderSelections[dish.id].note"
                      class="w-full rounded-1 bg-gray-100 px-2 py-1 text-2xs text-gray-700"
                      :maxlength="50"
                      :placeholder="$t('reservation.form.preOrderNotePlaceholder')"
                      placeholder-class="text-gray-300"
                    >
                  </view>
                </view>
                <wd-input-number
                  :model-value="preOrderSelections[dish.id]?.qty ?? 0"
                  :min="0"
                  custom-class="!w-24"
                  @update:model-value="(value: number) => setPreOrderQty(dish, value)"
                />
              </view>
            </view>
          </template>
          <!-- 搜索无结果 / 菜单为空 -->
          <view v-else class="flex flex-col items-center justify-center gap-2 py-16 text-2xs text-gray-300">
            <view class="i-ri-search-eye-line text-3xl" />
            {{ $t('reservation.form.searchEmpty') }}
          </view>
          <view class="pb-[calc(env(safe-area-inset-bottom,0px)+16px)]" />
        </scroll-view>
      </view>
    </wd-popup>

    <wd-toast />
    <wd-dialog />
  </view>
</template>

<style lang="scss" scoped>
.rsv-form {
  /* 非 tab 页：视口高度减去 H5 导航栏（--window-top，小程序端无此变量取 0） */
  height: calc(100vh - var(--window-top, 0px));
}
</style>
