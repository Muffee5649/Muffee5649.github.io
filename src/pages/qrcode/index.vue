<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useDialog, useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { buildTableQrPayload, DiningTableService } from '@/service/ordering'
import type { DiningTableQrItem } from '@/service/ordering'
import { ServiceError } from '@/service/shared'

defineOptions({
  name: 'Qrcode',
})

definePage({
  style: {
    navigationBarTitleText: '%qrcode.title%',
    enablePullDownRefresh: true,
  },
})

const toast = useToast()
const dialog = useDialog()

const loading = ref(false)
const tables = ref<DiningTableQrItem[]>([])
/** 正在重新生成令牌的餐桌 id */
const rotatingId = ref<number | null>(null)

/** 二维码放大预览 */
const previewVisible = ref(false)
const previewTable = ref<DiningTableQrItem | null>(null)
const previewQrRef = ref<{ exportImage: () => Promise<string> } | null>(null)
const saving = ref(false)

/** 餐桌 id → 二维码 JSON 内容 */
const qrTexts = computed(() => new Map(tables.value.map(table => [table.id, buildTableQrPayload(table)])))

/** 二维码尺寸：按两列卡片宽度自适应，避免小屏溢出 */
const qrSize = computed(() => {
  const cardWidth = (uni.getSystemInfoSync().windowWidth - 24 - 12) / 2
  return Math.floor(Math.min(160, Math.max(104, cardWidth - 32)))
})

/** 放大预览尺寸 */
const previewQrSize = computed(() => {
  return Math.floor(Math.min(uni.getSystemInfoSync().windowWidth - 120, 260))
})

/** 放大预览的二维码内容 */
const previewQrText = computed(() => previewTable.value ? buildTableQrPayload(previewTable.value) : '')

/** 打开放大预览 */
function openPreview(table: DiningTableQrItem) {
  previewTable.value = table
  previewVisible.value = true
}

/** 保存二维码图片：H5 下载，App / 小程序写入相册 */
async function savePreviewQr() {
  if (!previewQrRef.value || saving.value) {
    return
  }
  saving.value = true
  try {
    const filePath = await previewQrRef.value.exportImage()

    // #ifdef H5
    const link = document.createElement('a')
    link.href = filePath
    link.download = `table-${previewTable.value?.tableNo ?? ''}.png`
    link.click()
    // #endif

    // #ifndef H5
    await new Promise<void>((resolve, reject) => {
      uni.saveImageToPhotosAlbum({
        filePath,
        success: () => resolve(),
        fail: reject,
      })
    })
    // #endif

    toast.success(t('qrcode.saveSuccess'))
  }
  catch (error) {
    console.log('二维码保存失败', error)
    toast.error(t('qrcode.saveFailed'))
  }
  finally {
    saving.value = false
  }
}

/** 状态圆点颜色（类名字符串供 UnoCSS 静态提取） */
const STATUS_DOT: Record<DiningTableQrItem['status'], string> = {
  idle: 'bg-emerald-500',
  reserved: 'bg-amber-500',
  occupied: 'bg-primary',
  disabled: 'bg-gray-300',
}

function tableTypeLabel(table: DiningTableQrItem): string {
  return table.tableType ? t(`home.type.${table.tableType}`) : t('home.type.uncategorized')
}

async function loadTables() {
  loading.value = true
  try {
    const result = await DiningTableService.getQrList()
    tables.value = result.records
  }
  catch (error) {
    console.log('桌号二维码加载失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('qrcode.loadFailed'))
  }
  finally {
    loading.value = false
  }
}

/** 重新生成令牌：旧二维码立即失效，需重新打印 */
async function rotateToken(table: DiningTableQrItem) {
  if (rotatingId.value !== null) {
    return
  }

  const result = await dialog.confirm({
    title: t('qrcode.rotateConfirmTitle'),
    msg: t('qrcode.rotateConfirmMsg'),
  })
  if (result.action !== 'confirm') {
    return
  }

  rotatingId.value = table.id
  try {
    const token = await DiningTableService.rotateQrToken(table.id)
    table.qrToken = token
    toast.success(t('qrcode.rotateSuccess'))
  }
  catch (error) {
    console.log('二维码重新生成失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('qrcode.rotateFailed'))
  }
  finally {
    rotatingId.value = null
  }
}

onShow(() => {
  loadTables()
})

onPullDownRefresh(() => {
  loadTables().finally(() => uni.stopPullDownRefresh())
})
</script>

<template>
  <view class="min-h-screen bg-gray-100 pb-6">
    <!-- 说明 -->
    <view class="bg-primary px-4 pb-4 pt-3">
      <view class="text-base text-white font-bold">
        {{ $t('qrcode.title') }}
      </view>
      <view class="mt-1 text-2xs text-white/80">
        {{ $t('qrcode.desc') }}
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="loading && !tables.length" class="flex justify-center py-16">
      <wd-loading color="var(--wot-color-theme, #5D87FF)" />
    </view>

    <wd-empty v-else-if="!tables.length" :tip="$t('qrcode.empty')" custom-class="!py-16" />

    <!-- 桌号二维码卡片 -->
    <view v-else class="grid grid-cols-2 gap-3 px-3 pt-3 lg:grid-cols-4 sm:grid-cols-3">
      <view
        v-for="table in tables"
        :key="table.id"
        class="flex flex-col items-center rounded-3 bg-white p-3"
        :class="table.status === 'disabled' ? 'opacity-60' : ''"
      >
        <view class="w-full flex items-center justify-between gap-1">
          <text class="truncate text-sm text-gray-800 font-bold">
            {{ table.tableNo }}
          </text>
          <view class="flex shrink-0 items-center gap-1 text-3xs text-gray-400">
            <view class="h-1.5 w-1.5 rounded-full" :class="STATUS_DOT[table.status]" />
            {{ $t(`home.status.${table.status}`) }}
          </view>
        </view>
        <view class="mt-0.5 w-full truncate text-3xs text-gray-400">
          {{ table.capacity ? t('ordering.table.capacity', { count: table.capacity }) : tableTypeLabel(table) }}
        </view>

        <view class="mt-2 rounded-2 bg-white p-1 active:opacity-70" @tap="openPreview(table)">
          <wd-qr-code :text="qrTexts.get(table.id) || ''" :size="qrSize" correct-level="M" />
        </view>

        <view class="mt-2 w-full truncate text-center text-3xs text-gray-300">
          {{ $t('qrcode.previewHint') }}
        </view>

        <view
          class="mt-2 flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-2xs text-gray-500 active:opacity-70"
          @tap="rotateToken(table)"
        >
          <view class="i-ri-refresh-line text-12px" />
          {{ rotatingId === table.id ? $t('qrcode.rotating') : $t('qrcode.rotate') }}
        </view>
      </view>
    </view>

    <!-- 放大预览：二维码保留白色边距，可保存到相册 -->
    <wd-popup v-model="previewVisible" position="center">
      <view class="max-w-320px w-[86vw] flex flex-col items-center rounded-4 bg-white px-5 pb-5 pt-4">
        <view class="text-base text-gray-800 font-bold">
          {{ previewTable?.tableNo }}
        </view>
        <view class="mt-1 text-2xs text-gray-400">
          {{ $t('qrcode.previewTip') }}
        </view>
        <view class="mt-3 rounded-2 bg-white p-2">
          <wd-qr-code
            ref="previewQrRef"
            :text="previewQrText"
            :size="previewQrSize"
            :margin="24"
            correct-level="M"
          />
        </view>
        <wd-button
          type="primary"
          :loading="saving"
          custom-class="!mt-4 !w-full"
          @click="savePreviewQr"
        >
          {{ saving ? $t('qrcode.saving') : $t('qrcode.save') }}
        </wd-button>
      </view>
    </wd-popup>

    <wd-toast />
    <wd-dialog />
  </view>
</template>
