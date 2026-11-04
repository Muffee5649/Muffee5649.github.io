<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { DiningTableService } from '@/service/ordering'
import type { WorkbenchTable } from '@/service/ordering'

defineOptions({
  name: 'Dashboard',
})
definePage({
  style: {
    navigationBarTitleText: '%dashboard.title%',
    enablePullDownRefresh: true,
  },
})

const toast = useToast()

const loading = ref(false)
const tables = ref<WorkbenchTable[]>([])

/** 分组顺序：房间靠前，其余桌型靠后（用户要求） */
const GROUP_ORDER = ['room', 'hall', 'outdoor', 'uncategorized'] as const
type GroupKey = typeof GROUP_ORDER[number]

/** 按桌型分组，组内按桌号自然排序 */
const groups = computed(() => {
  const buckets = new Map<GroupKey, WorkbenchTable[]>()
  tables.value.forEach((table) => {
    const key: GroupKey = table.tableType ?? 'uncategorized'
    const list = buckets.get(key) ?? []
    list.push(table)
    buckets.set(key, list)
  })
  return GROUP_ORDER
    .filter(key => buckets.has(key))
    .map((key) => {
      const list = buckets.get(key)!
      list.sort((a, b) => a.tableNo.localeCompare(b.tableNo, 'zh-Hans-CN', { numeric: true }))
      return { key, title: t(`home.type.${key}`), tables: list }
    })
})

/** 状态计数 */
const counts = computed(() => {
  const result = { idle: 0, reserved: 0, occupied: 0, disabled: 0 }
  tables.value.forEach((table) => {
    result[table.status] += 1
  })
  return result
})

/** 状态圆点颜色（类名字符串供 UnoCSS 静态提取） */
const STATUS_DOT: Record<WorkbenchTable['status'], string> = {
  idle: 'bg-emerald-500',
  reserved: 'bg-amber-500',
  occupied: 'bg-primary',
  disabled: 'bg-gray-300',
}

/** 状态文案颜色 */
const STATUS_TEXT: Record<WorkbenchTable['status'], string> = {
  idle: 'text-emerald-600',
  reserved: 'text-amber-600',
  occupied: 'text-primary',
  disabled: 'text-gray-400',
}

/** 卡片底色 / 边框 */
const STATUS_CARD: Record<WorkbenchTable['status'], string> = {
  idle: 'border-emerald-200 bg-white',
  reserved: 'border-amber-200 bg-amber-50',
  occupied: 'border-primary/30 bg-primary/5',
  disabled: 'border-gray-200 bg-gray-100 opacity-70',
}

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

/** MM-DD HH:mm（预定到店时间） */
function formatArrival(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function capacityLabel(table: WorkbenchTable): string {
  return table.capacity
    ? t('dashboard.capacity', { count: table.capacity })
    : t(`home.type.${table.tableType ?? 'uncategorized'}`)
}

async function loadDashboard() {
  loading.value = true
  try {
    tables.value = await DiningTableService.getWorkbenchTables()
  }
  catch (error) {
    console.log('店内情况加载失败', error)
    toast.error(t('dashboard.loadFailed'))
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  loadDashboard()
})

onPullDownRefresh(() => {
  loadDashboard().finally(() => uni.stopPullDownRefresh())
})
</script>

<template>
  <view class="min-h-screen bg-gray-100 pb-6">
    <!-- 状态总览 -->
    <view class="bg-primary px-4 pb-4 pt-3">
      <view class="flex items-center justify-between">
        <view class="text-base text-white font-bold">
          {{ $t('dashboard.title') }}
        </view>
        <view class="text-2xs text-white/80">
          {{ t('dashboard.total', { count: tables.length }) }}
        </view>
      </view>
      <view class="mt-3 flex gap-2">
        <view class="flex flex-1 flex-col items-center rounded-2 bg-white/15 py-1.5">
          <view class="text-sm text-white font-bold">
            {{ counts.idle }}
          </view>
          <view class="text-3xs text-white/80">
            {{ $t('home.status.idle') }}
          </view>
        </view>
        <view class="flex flex-1 flex-col items-center rounded-2 bg-white/15 py-1.5">
          <view class="text-sm text-white font-bold">
            {{ counts.reserved }}
          </view>
          <view class="text-3xs text-white/80">
            {{ $t('home.status.reserved') }}
          </view>
        </view>
        <view class="flex flex-1 flex-col items-center rounded-2 bg-white/15 py-1.5">
          <view class="text-sm text-white font-bold">
            {{ counts.occupied }}
          </view>
          <view class="text-3xs text-white/80">
            {{ $t('home.status.occupied') }}
          </view>
        </view>
        <view class="flex flex-1 flex-col items-center rounded-2 bg-white/15 py-1.5">
          <view class="text-sm text-white/60 font-bold">
            {{ counts.disabled }}
          </view>
          <view class="text-3xs text-white/80">
            {{ $t('home.status.disabled') }}
          </view>
        </view>
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="loading && !tables.length" class="flex justify-center py-16">
      <wd-loading color="var(--wot-color-theme, #5D87FF)" />
    </view>

    <!-- 分组桌台网格：房间 → 大厅 → 外摆 → 未分类 -->
    <view v-else-if="groups.length" class="flex flex-col gap-4 px-3 pt-3">
      <view v-for="group in groups" :key="group.key">
        <view class="flex items-center justify-between px-1 pb-2">
          <view class="flex items-center gap-1.5 text-sm text-gray-800 font-bold">
            <view class="i-ri-layout-grid-line text-primary" />
            {{ group.title }}
          </view>
          <view class="text-2xs text-gray-400">
            {{ group.tables.length }}
          </view>
        </view>

        <view class="grid grid-cols-3 gap-2">
          <view
            v-for="table in group.tables"
            :key="table.id"
            class="border rounded-2 border-solid p-2.5"
            :class="STATUS_CARD[table.status]"
          >
            <view class="flex items-center justify-between gap-1">
              <text class="truncate text-sm text-gray-800 font-bold">
                {{ table.tableNo }}
              </text>
              <view class="flex shrink-0 items-center gap-0.5 text-3xs" :class="STATUS_TEXT[table.status]">
                <view class="h-1.5 w-1.5 rounded-full" :class="STATUS_DOT[table.status]" />
                {{ $t(`home.status.${table.status}`) }}
              </view>
            </view>

            <view class="mt-0.5 truncate text-3xs text-gray-400">
              {{ capacityLabel(table) }}
            </view>

            <!-- 已约定：预定人到店信息 -->
            <view v-if="table.status === 'reserved' && table.upcomingReservation" class="mt-1.5">
              <view class="truncate text-2xs text-gray-700">
                {{ table.upcomingReservation.guestName }} · {{ t('home.partySize', { count: table.upcomingReservation.partySize }) }}
              </view>
              <view class="text-3xs text-amber-600">
                {{ formatArrival(table.upcomingReservation.arrivalTime) }}
              </view>
            </view>

            <!-- 占用中：当前开台金额 / 单量 -->
            <view v-else-if="table.status === 'occupied' && table.activeSession" class="mt-1.5">
              <view class="text-2xs text-primary font-bold">
                {{ formatMoney(table.activeSession.totalAmountCents) }}
              </view>
              <view class="text-3xs text-gray-400">
                {{ t('dashboard.orders', { count: table.activeSession.orderCount }) }}
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 空态 -->
    <view v-else class="flex flex-col items-center gap-2 py-20">
      <view class="i-ri-store-2-line text-12 text-gray-200" />
      <view class="text-sm text-gray-400">
        {{ $t('dashboard.empty') }}
      </view>
    </view>

    <wd-toast />
  </view>
</template>
