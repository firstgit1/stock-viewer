<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  calcMA,
  fetchDailyKline,
  MINUTE_TOTAL_SLOTS,
  minuteTimeToSlot,
  parseMinuteTrends,
  prevTradeEndDate,
} from '../api/stock'

const VIEW_COUNT = 60

const props = defineProps({
  stock: { type: Object, required: true },
  realtime: { type: Object, default: null },
  minute: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['close'])

const svgRef = ref(null)
const hoverIndex = ref(-1)
const chartMode = ref('minute') // minute | daily
const klines = ref([]) // 全部已加载，旧→新
const klineLoading = ref(false)
const klineError = ref('')
const viewOffset = ref(0) // 相对最新端回看的根数
const dragging = ref(false)
const pointerDown = ref(false)
const panArmed = ref(false) // 按住一段时间后才允许拖动，避免点按误触
const dragMoved = ref(false)
const dragStartX = ref(0)
const dragStartOffset = ref(0)
const panPx = ref(0) // 拖动时亚像素位移，让日K跟手更顺
const hoverSvgX = ref(null) // 十字线连续 X，避免一格一格跳
const loadingMore = ref(false)
const noMoreHistory = ref(false)
const HOLD_BEFORE_PAN_MS = 700 // 按住多久后才允许进入拖动
const PAN_THRESHOLD = 40 // 普通拖动位移阈值
const FAST_PAN_THRESHOLD = 72 // 快速横滑可立刻拖动
let moveRaf = 0
let pendingMoveEvent = null
let panArmTimer = 0

const quote = computed(() => props.realtime)
const points = computed(() => parseMinuteTrends(props.minute?.trends || []))
const pre = computed(() =>
  Number(props.minute?.prePrice ?? quote.value?.yclose ?? points.value[0]?.close ?? 0),
)

const maxOffset = computed(() => Math.max(0, klines.value.length - VIEW_COUNT))

const visibleKlines = computed(() => {
  const list = klines.value
  if (!list.length) return []
  const end = list.length - viewOffset.value
  const start = Math.max(0, end - VIEW_COUNT)
  return list.slice(start, end)
})

const visibleRange = computed(() => {
  const list = klines.value
  const end = list.length - viewOffset.value
  const start = Math.max(0, end - VIEW_COUNT)
  return { start, end }
})

watch(
  () => props.stock?.ts_code || props.stock?.symbol,
  () => {
    chartMode.value = 'minute'
    klines.value = []
    klineError.value = ''
    hoverIndex.value = -1
    viewOffset.value = 0
    noMoreHistory.value = false
    dragging.value = false
    panPx.value = 0
    hoverSvgX.value = null
  },
)

async function switchMode(mode) {
  chartMode.value = mode
  hoverIndex.value = -1
  if (mode === 'daily' && !klines.value.length && !klineLoading.value) {
    await loadKline()
  }
}

async function loadKline() {
  const code = props.stock?.ts_code || props.stock?.symbol
  if (!code) return
  klineLoading.value = true
  klineError.value = ''
  viewOffset.value = 0
  noMoreHistory.value = false
  try {
    klines.value = await fetchDailyKline(code, { limit: VIEW_COUNT })
  } catch (e) {
    klineError.value = e.message || '日K加载失败'
    klines.value = []
  } finally {
    klineLoading.value = false
  }
}

async function loadOlderKlines() {
  if (loadingMore.value || noMoreHistory.value || !klines.value.length) return
  const code = props.stock?.ts_code || props.stock?.symbol
  const oldest = klines.value[0]?.date
  const end = prevTradeEndDate(oldest)
  if (!code || !end) return

  loadingMore.value = true
  try {
    const older = await fetchDailyKline(code, { limit: VIEW_COUNT, end })
    const exist = new Set(klines.value.map((k) => k.date))
    const add = older.filter((k) => !exist.has(k.date))
    if (!add.length) {
      noMoreHistory.value = true
      return
    }
    // viewOffset 相对最新端，前置历史数据无需偏移补偿
    klines.value = [...add, ...klines.value]
  } catch {
    // 拉取失败时不打断拖动
  } finally {
    loadingMore.value = false
  }
}

const minuteChart = computed(() => {
  const list = points.value
  if (!list.length) return null

  const width = 760
  const priceH = 280
  const volH = 78
  const gap = 10
  const height = priceH + gap + volH
  const pad = { top: 12, right: 48, bottom: 22, left: 16 }
  const innerW = width - pad.left - pad.right
  const innerPriceH = priceH - pad.top - pad.bottom
  const prePrice = pre.value
  const closes = list.map((p) => p.close)
  const avgs = list.map((p) => p.avg)
  let min = Math.min(prePrice, ...closes, ...avgs)
  let max = Math.max(prePrice, ...closes, ...avgs)
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min
  const maxVol = Math.max(...list.map((p) => p.vol), 1)
  // 按完整交易日 242 分钟定位，未到的时段留白，避免把已有数据拉满到 15:00
  const totalSlots = Math.max(MINUTE_TOTAL_SLOTS, 2)
  const xAtSlot = (slot) => pad.left + (slot / (totalSlots - 1)) * innerW
  const yAt = (price) => pad.top + ((max - price) / span) * innerPriceH

  const nodes = list
    .map((p, i) => {
      let slot = minuteTimeToSlot(p.time)
      if (slot < 0) slot = Math.min(i, totalSlots - 1)
      return {
        ...p,
        i,
        slot,
        x: xAtSlot(slot),
        yClose: yAt(p.close),
        yAvg: yAt(p.avg),
      }
    })
    .sort((a, b) => a.slot - b.slot)

  return {
    width,
    height,
    priceH,
    pad,
    innerW,
    totalSlots,
    priceLine: nodes.map((p) => `${p.x},${p.yClose}`).join(' '),
    avgLine: nodes.map((p) => `${p.x},${p.yAvg}`).join(' '),
    baseY: yAt(prePrice),
    min,
    max,
    pre: prePrice,
    bars: nodes.map((p) => {
      const h = (p.vol / maxVol) * (volH - 18)
      return {
        x: p.x,
        y: priceH + gap + (volH - 18 - h),
        h,
        up: p.close >= prePrice,
        w: Math.max(innerW / totalSlots - 0.4, 0.8),
      }
    }),
    nodes,
    labels: ['09:30', '11:30/13:00', '15:00'],
  }
})

const dailyChart = computed(() => {
  const all = klines.value
  const list = visibleKlines.value
  if (!list.length) return null

  const { start } = visibleRange.value
  const width = 760
  const priceH = 280
  const volH = 78
  const gap = 10
  const height = priceH + gap + volH
  const pad = { top: 18, right: 48, bottom: 22, left: 16 }
  const innerW = width - pad.left - pad.right
  const innerPriceH = priceH - pad.top - pad.bottom

  // 用全量序列算均线，再切到可视窗口，避免回看时 MA 失真
  const ma5All = calcMA(all, 5)
  const ma10All = calcMA(all, 10)
  const ma20All = calcMA(all, 20)
  const ma5 = ma5All.slice(start, start + list.length)
  const ma10 = ma10All.slice(start, start + list.length)
  const ma20 = ma20All.slice(start, start + list.length)

  const highs = list.map((p) => p.high)
  const lows = list.map((p) => p.low)
  let min = Math.min(...lows)
  let max = Math.max(...highs)
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min
  const maxVol = Math.max(...list.map((p) => p.vol), 1)
  const slot = innerW / list.length
  const bodyW = Math.max(slot * 0.55, 2)
  const xAt = (i) => pad.left + i * slot + slot / 2
  const yAt = (price) => pad.top + ((max - price) / span) * innerPriceH

  const candles = list.map((p, i) => {
    const up = p.close >= p.open
    const yOpen = yAt(p.open)
    const yClose = yAt(p.close)
    const yHigh = yAt(p.high)
    const yLow = yAt(p.low)
    const bodyTop = Math.min(yOpen, yClose)
    const bodyH = Math.max(Math.abs(yClose - yOpen), 1)
    return {
      ...p,
      i,
      x: xAt(i),
      up,
      yOpen,
      yClose,
      yHigh,
      yLow,
      bodyTop,
      bodyH,
      bodyW,
      ma5: ma5[i],
      ma10: ma10[i],
      ma20: ma20[i],
    }
  })

  const lineOf = (arr) =>
    arr
      .map((v, i) => (v == null ? null : `${xAt(i)},${yAt(v)}`))
      .filter(Boolean)
      .join(' ')

  return {
    width,
    height,
    priceH,
    pad,
    innerW,
    min,
    max,
    slot,
    candles,
    ma5Line: lineOf(ma5),
    ma10Line: lineOf(ma10),
    ma20Line: lineOf(ma20),
    bars: candles.map((p) => {
      const h = (p.vol / maxVol) * (volH - 18)
      return {
        x: p.x,
        y: priceH + gap + (volH - 18 - h),
        h,
        up: p.up,
        w: bodyW,
      }
    }),
    labels: [
      list[0]?.date?.slice(5),
      list[Math.floor(list.length / 2)]?.date?.slice(5),
      list[list.length - 1]?.date?.slice(5),
    ],
  }
})

const activeChart = computed(() =>
  chartMode.value === 'daily' ? dailyChart.value : minuteChart.value,
)

const hoverPoint = computed(() => {
  const i = hoverIndex.value
  if (i < 0) return null
  if (chartMode.value === 'minute') {
    const p = points.value[i]
    if (!p) return null
    return {
      title: (p.time || '').slice(11, 16),
      price: p.close,
      changeRate: pre.value ? ((p.close - pre.value) / pre.value) * 100 : 0,
      amountText: formatAmount(p.amount),
      extra: `均价 ${p.avg.toFixed(2)}`,
    }
  }
  const p = visibleKlines.value[i]
  if (!p) return null
  return {
    title: p.date,
    price: p.close,
    changeRate: p.changePct,
    amountText: formatAmount(p.amount),
    extra: `开 ${p.open.toFixed(2)} 高 ${p.high.toFixed(2)} 低 ${p.low.toFixed(2)}`,
  }
})

const displayQuote = computed(() => {
  if (hoverPoint.value) {
    return {
      price: hoverPoint.value.price,
      changeRate: hoverPoint.value.changeRate,
      amountText: hoverPoint.value.amountText,
      extra: `${hoverPoint.value.title} · ${hoverPoint.value.extra}`,
      hovering: true,
    }
  }
  return {
    price: quote.value?.priceValue,
    changeRate: quote.value?.changeValue,
    amountText: quote.value?.tradeAmount || '-',
    extra: '',
    hovering: false,
  }
})

const tip = computed(() => {
  const chart = activeChart.value
  const i = hoverIndex.value
  if (!chart || i < 0 || dragging.value) return null

  const minX = chart.pad.left
  const maxX = chart.width - chart.pad.right
  const smoothX =
    hoverSvgX.value == null
      ? null
      : Math.min(maxX, Math.max(minX, hoverSvgX.value))

  if (chartMode.value === 'minute') {
    const node = chart.nodes[i]
    if (!node) return null
    return {
      x: smoothX ?? node.x,
      snapX: node.x,
      y: node.yClose,
      yAvg: node.yAvg,
      price: node.close,
      label: (node.time || '').slice(11, 16),
      showAvg: true,
    }
  }
  const c = chart.candles[i]
  if (!c) return null
  return {
    x: smoothX ?? c.x,
    snapX: c.x,
    y: c.yClose,
    price: c.close,
    label: c.date.slice(5),
    showAvg: false,
  }
})

const chartPanStyle = computed(() => {
  if (chartMode.value !== 'daily' || !panPx.value) return undefined
  return { transform: `translate3d(${panPx.value}px,0,0)` }
})

function formatAmount(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '-'
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)}万`
  return `${v}`
}

function clientToSvgX(e) {
  const svg = svgRef.value
  if (!svg) return null
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  return pt.matrixTransform(ctm.inverse()).x
}

function updateHover(e) {
  const chart = activeChart.value
  if (!chart || !svgRef.value || dragging.value) return
  const x = clientToSvgX(e)
  if (x == null) return

  const { pad, innerW } = chart
  if (x < pad.left || x > pad.left + innerW) {
    hoverIndex.value = -1
    hoverSvgX.value = null
    return
  }

  hoverSvgX.value = x
  const count =
    chartMode.value === 'daily' ? chart.candles.length : chart.nodes.length
  if (count <= 1) {
    hoverIndex.value = 0
    return
  }

  if (chartMode.value === 'daily') {
    const slot = innerW / count
    const idx = Math.floor((x - pad.left) / slot)
    hoverIndex.value = Math.min(count - 1, Math.max(0, idx))
  } else {
    // 分时按实际点位就近吸附（右侧未开盘区域会落到最后一个已有点）
    const nodes = chart.nodes || []
    if (!nodes.length) {
      hoverIndex.value = -1
      return
    }
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.abs(nodes[i].x - x)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    hoverIndex.value = best
  }
}

function applyDailyPan(e) {
  const chart = dailyChart.value
  if (!chart || !svgRef.value) return
  const rect = svgRef.value.getBoundingClientRect()
  const scale = chart.width / Math.max(rect.width, 1)
  const dxSvg = (e.clientX - dragStartX.value) * scale
  const slot = Math.max(chart.slot || chart.innerW / Math.max(visibleKlines.value.length, 1), 1)
  const raw = dragStartOffset.value + dxSvg / slot
  const clamped = Math.min(maxOffset.value, Math.max(0, raw))
  const base = Math.floor(clamped)
  viewOffset.value = base
  // 残余小数段做跟手位移（向右拖看更早 → 内容右移）
  panPx.value = (clamped - base) * slot

  if (clamped > maxOffset.value - 0.2 || visibleRange.value.start < 12) {
    loadOlderKlines()
  }
}

function clearPanArmTimer() {
  if (panArmTimer) {
    clearTimeout(panArmTimer)
    panArmTimer = 0
  }
}

function tryStartPan(dx) {
  if (dragging.value || chartMode.value !== 'daily') return false
  const absDx = Math.abs(dx)
  // 按住够久且移动一定距离，或快速大幅横滑
  const canPan =
    (panArmed.value && absDx >= PAN_THRESHOLD) || absDx >= FAST_PAN_THRESHOLD
  if (!canPan) return false
  dragging.value = true
  dragMoved.value = true
  hoverIndex.value = -1
  hoverSvgX.value = null
  clearPanArmTimer()
  return true
}

function handlePointerMove(e) {
  if (chartMode.value === 'daily' && pointerDown.value) {
    const dx = e.clientX - dragStartX.value
    tryStartPan(dx)
    if (dragging.value) {
      applyDailyPan(e)
      return
    }
  }
  updateHover(e)
}

function onPointerDown(e) {
  pointerDown.value = true
  panArmed.value = false
  dragMoved.value = false
  dragging.value = false
  panPx.value = 0
  dragStartX.value = e.clientX
  dragStartOffset.value = viewOffset.value
  clearPanArmTimer()
  // 仅日K需要“按住一会儿才能拖”，避免点按查看被误判成拖动
  if (chartMode.value === 'daily') {
    panArmTimer = window.setTimeout(() => {
      panArmed.value = true
      panArmTimer = 0
    }, HOLD_BEFORE_PAN_MS)
  }
  updateHover(e)
  svgRef.value?.setPointerCapture?.(e.pointerId)
}

function onPointerMove(e) {
  pendingMoveEvent = e
  if (moveRaf) return
  moveRaf = requestAnimationFrame(() => {
    moveRaf = 0
    if (pendingMoveEvent) handlePointerMove(pendingMoveEvent)
  })
}

function onPointerUp() {
  if (dragging.value) {
    // 松手吸附到整数根 K 线
    panPx.value = 0
  }
  pointerDown.value = false
  panArmed.value = false
  dragging.value = false
  pendingMoveEvent = null
  clearPanArmTimer()
  if (moveRaf) {
    cancelAnimationFrame(moveRaf)
    moveRaf = 0
  }
}

function onLeave() {
  if (!pointerDown.value && !dragging.value) {
    hoverIndex.value = -1
    hoverSvgX.value = null
  }
}

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
  clearPanArmTimer()
  if (moveRaf) cancelAnimationFrame(moveRaf)
})
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="modal" role="dialog" aria-modal="true">
      <header class="head">
        <div>
          <h2>
            {{ quote?.name || stock.name }}
            <small>{{ stock.ts_code || stock.symbol }}</small>
          </h2>
          <div class="metrics">
            <span>成交额 {{ quote?.tradeAmount || '-' }}</span>
            <span>流通市值 {{ quote?.circulatingMarketCap || '-' }}</span>
            <span>换手率 {{ quote?.turnoverRate != null ? quote.turnoverRate + '%' : '-' }}</span>
          </div>
        </div>
        <div class="head-right">
          <div class="mode-switch">
            <button
              type="button"
              :class="{ active: chartMode === 'minute' }"
              @click="switchMode('minute')"
            >
              分时图
            </button>
            <button
              type="button"
              :class="{ active: chartMode === 'daily' }"
              @click="switchMode('daily')"
            >
              日K线
            </button>
          </div>
          <button class="close" type="button" @click="emit('close')">×</button>
        </div>
      </header>

      <div v-if="loading" class="state">加载中…</div>
      <div v-else-if="error" class="state err">{{ error }}</div>
      <template v-else>
        <div
          class="price-row"
          :class="Number(displayQuote.changeRate) >= 0 ? 'up' : 'down'"
        >
          <strong>
            {{
              displayQuote.price != null
                ? Number(displayQuote.price).toFixed(2)
                : '-'
            }}
          </strong>
          <span>
            {{ Number(displayQuote.changeRate) >= 0 ? '+' : ''
            }}{{
              displayQuote.changeRate != null
                ? Number(displayQuote.changeRate).toFixed(2) + '%'
                : '-'
            }}
          </span>
          <span class="amount">
            <template v-if="displayQuote.hovering">
              {{ displayQuote.extra }} · 成交额 {{ displayQuote.amountText }}
            </template>
            <template v-else>成交额 {{ displayQuote.amountText }}</template>
          </span>
        </div>

        <div v-if="chartMode === 'daily' && klineLoading" class="state">日K加载中…</div>
        <div v-else-if="chartMode === 'daily' && klineError" class="state err">
          {{ klineError }}
        </div>
        <div v-else-if="activeChart" class="chart-wrap" :class="{ panning: dragging }">
          <svg
            ref="svgRef"
            :class="{ dragging: dragging && chartMode === 'daily', daily: chartMode === 'daily' }"
            :viewBox="`0 0 ${activeChart.width} ${activeChart.height}`"
            preserveAspectRatio="none"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @mouseleave="onLeave"
          >
            <g class="chart-layer" :style="chartPanStyle">
              <!-- 分时 -->
              <template v-if="chartMode === 'minute'">
                <line
                  class="base"
                  :x1="activeChart.pad.left"
                  :x2="activeChart.width - activeChart.pad.right"
                  :y1="activeChart.baseY"
                  :y2="activeChart.baseY"
                />
                <polyline
                  class="avg"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  :points="activeChart.avgLine"
                />
                <polyline
                  class="price"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  :points="activeChart.priceLine"
                />
              </template>

              <!-- 日K -->
              <template v-else>
                <polyline
                  class="ma5"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  :points="activeChart.ma5Line"
                />
                <polyline
                  class="ma10"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  :points="activeChart.ma10Line"
                />
                <polyline
                  class="ma20"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  :points="activeChart.ma20Line"
                />
                <g v-for="c in activeChart.candles" :key="c.date">
                  <line
                    :x1="c.x"
                    :x2="c.x"
                    :y1="c.yHigh"
                    :y2="c.yLow"
                    :class="c.up ? 'candle-up' : 'candle-down'"
                  />
                  <rect
                    :x="c.x - c.bodyW / 2"
                    :y="c.bodyTop"
                    :width="c.bodyW"
                    :height="c.bodyH"
                    :class="c.up ? 'candle-up-fill' : 'candle-down-fill'"
                  />
                </g>
              </template>

              <g v-for="(b, i) in activeChart.bars" :key="'v' + i">
                <rect
                  :x="b.x - b.w / 2"
                  :y="b.y"
                  :width="b.w"
                  :height="Math.max(b.h, 0.5)"
                  :class="b.up ? 'vol-up' : 'vol-down'"
                />
              </g>
            </g>

            <g v-if="tip" class="tip-layer">
              <line
                class="cross"
                :x1="tip.x"
                :x2="tip.x"
                :y1="activeChart.pad.top"
                :y2="activeChart.height - 18"
              />
              <circle class="dot-price" :cx="tip.snapX" :cy="tip.y" r="4" />
              <circle
                v-if="tip.showAvg"
                class="dot-avg"
                :cx="tip.snapX"
                :cy="tip.yAvg"
                r="3.5"
              />
              <rect
                class="badge"
                :x="activeChart.width - activeChart.pad.right + 2"
                :y="tip.y - 10"
                width="44"
                height="18"
                rx="3"
              />
              <text
                class="badge-text"
                :x="activeChart.width - activeChart.pad.right + 24"
                :y="tip.y + 3"
                text-anchor="middle"
              >
                {{ tip.price.toFixed(2) }}
              </text>
              <rect
                class="badge"
                :x="tip.x - 24"
                :y="activeChart.height - 18"
                width="48"
                height="16"
                rx="3"
              />
              <text
                class="badge-text"
                :x="tip.x"
                :y="activeChart.height - 6"
                text-anchor="middle"
              >
                {{ tip.label }}
              </text>
            </g>

            <text
              class="axis"
              :x="activeChart.width - 8"
              :y="activeChart.pad.top + 8"
              text-anchor="end"
            >
              {{ activeChart.max.toFixed(2) }}
            </text>
            <text
              v-if="chartMode === 'minute'"
              class="axis"
              :x="activeChart.width - 8"
              :y="activeChart.baseY + 4"
              text-anchor="end"
            >
              昨收 {{ activeChart.pre.toFixed(2) }}
            </text>
            <text
              class="axis"
              :x="activeChart.width - 8"
              :y="activeChart.priceH - 8"
              text-anchor="end"
            >
              {{ activeChart.min.toFixed(2) }}
            </text>

            <text class="axis" :x="activeChart.pad.left" :y="activeChart.height - 4">
              {{ activeChart.labels[0] }}
            </text>
            <text
              class="axis"
              :x="activeChart.width / 2"
              :y="activeChart.height - 4"
              text-anchor="middle"
            >
              {{ activeChart.labels[1] }}
            </text>
            <text
              class="axis"
              :x="activeChart.width - activeChart.pad.right"
              :y="activeChart.height - 4"
              text-anchor="end"
            >
              {{ activeChart.labels[2] }}
            </text>
          </svg>

          <div class="legend">
            <template v-if="chartMode === 'minute'">
              <span class="l-price">分时</span>
              <span class="l-avg">均价</span>
            </template>
            <template v-else>
              <span class="l-ma5">MA5</span>
              <span class="l-ma10">MA10</span>
              <span class="l-ma20">MA20</span>
              <span class="drag-hint">
                {{
                  loadingMore
                    ? '加载更早数据…'
                    : '点按查看每日，按住后横滑回看历史'
                }}
              </span>
            </template>
          </div>
        </div>
        <div v-else class="state">
          {{ chartMode === 'daily' ? '暂无日K数据' : '暂无分时数据' }}
        </div>

        <div class="extra">
          <span>开盘价 {{ quote?.open ?? '-' }}</span>
          <span>最高价 {{ quote?.high ?? '-' }}</span>
          <span>最低价 {{ quote?.low ?? '-' }}</span>
          <span>收盘价 {{ quote?.priceValue ?? '-' }}</span>
          <span v-if="stock.industry">行业 {{ stock.industry }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(8, 12, 18, 0.62);
  backdrop-filter: blur(4px);
}

.modal {
  width: min(860px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  border-radius: 14px;
  background: #fff;
  color: #1f2937;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 8px;
}

.head h2 {
  margin: 0;
  font-size: 1.25rem;
}

.head small {
  margin-left: 8px;
  color: #6b7280;
  font-size: 0.85rem;
  font-weight: 500;
}

.metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  color: #6b7280;
  font-size: 0.86rem;
}

.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-switch {
  display: inline-flex;
  padding: 3px;
  border-radius: 10px;
  background: #f3f4f6;
}

.mode-switch button {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  background: transparent;
  color: #6b7280;
  font-size: 0.84rem;
  font-weight: 600;
}

.mode-switch button.active {
  background: #fff;
  color: #2563eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.mode-switch button:hover {
  color: #111827;
  background: transparent;
}

.mode-switch button.active:hover {
  background: #fff;
  color: #2563eb;
}

.close {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: #f3f4f6;
  color: #374151;
  font-size: 1.3rem;
  line-height: 1;
}

.close:hover {
  background: #e5e7eb;
}

.price-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 12px;
  padding: 4px 18px 10px;
}

.price-row strong {
  font-size: 2rem;
  font-weight: 750;
}

.price-row.up {
  color: #ef4444;
}

.price-row.down {
  color: #16a34a;
}

.amount {
  color: #6b7280;
  font-size: 0.9rem;
  font-weight: 500;
}

.chart-wrap {
  position: relative;
  padding: 0 12px 8px;
  contain: layout paint;
}

.chart-wrap.panning .chart-layer {
  will-change: transform;
}

.chart-layer {
  transform: translate3d(0, 0, 0);
}

svg {
  width: 100%;
  height: 360px;
  display: block;
  background: #fafafa;
  border-radius: 10px;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}

svg.daily {
  cursor: grab;
}

svg.dragging {
  cursor: grabbing;
}

.base,
.cross {
  stroke: #9ca3af;
  stroke-dasharray: 4 4;
  stroke-width: 1;
}

.cross {
  stroke: #6b7280;
  stroke-dasharray: 3 3;
}

.tip-layer {
  pointer-events: none;
}

.tip-layer .badge,
.tip-layer .badge-text,
.tip-layer .dot-price,
.tip-layer .dot-avg {
  transition: x 40ms linear, y 40ms linear, cx 40ms linear, cy 40ms linear;
}

.price {
  stroke: #2563eb;
  stroke-width: 2;
}

.avg {
  stroke: #f59e0b;
  stroke-width: 1.5;
}

.ma5 {
  stroke: #3b82f6;
  stroke-width: 1.4;
}

.ma10 {
  stroke: #f59e0b;
  stroke-width: 1.4;
}

.ma20 {
  stroke: #a855f7;
  stroke-width: 1.4;
}

.price,
.avg,
.ma5,
.ma10,
.ma20 {
  vector-effect: non-scaling-stroke;
}

.candle-up,
.candle-up-fill {
  stroke: #ef4444;
  fill: #ef4444;
  stroke-width: 1;
}

.candle-down,
.candle-down-fill {
  stroke: #22c55e;
  fill: #22c55e;
  stroke-width: 1;
}

.dot-price {
  fill: #2563eb;
  stroke: #fff;
  stroke-width: 1.5;
}

.dot-avg {
  fill: #f59e0b;
  stroke: #fff;
  stroke-width: 1.5;
}

.badge {
  fill: #111827;
}

.badge-text {
  fill: #fff;
  font-size: 11px;
  font-weight: 600;
}

.vol-up {
  fill: #f87171;
}

.vol-down {
  fill: #4ade80;
}

.axis {
  fill: #9ca3af;
  font-size: 11px;
}

.legend {
  position: absolute;
  left: 24px;
  bottom: 92px;
  display: flex;
  gap: 12px;
  font-size: 0.8rem;
  color: #6b7280;
  pointer-events: none;
}

.l-price::before,
.l-avg::before,
.l-ma5::before,
.l-ma10::before,
.l-ma20::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 3px;
  margin-right: 6px;
  vertical-align: middle;
  border-radius: 2px;
}

.l-price::before,
.l-ma5::before {
  background: #3b82f6;
}

.l-avg::before,
.l-ma10::before {
  background: #f59e0b;
}

.l-ma20::before {
  background: #a855f7;
}

.drag-hint {
  margin-left: 4px;
  color: #9ca3af;
}

.extra {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  padding: 8px 18px 18px;
  color: #6b7280;
  font-size: 0.86rem;
}

.state {
  padding: 48px 16px;
  text-align: center;
  color: #6b7280;
}

.state.err {
  color: #dc2626;
}

@media (max-width: 768px) {
  .mask {
    padding: 0;
    align-items: stretch;
  }

  .modal {
    width: 100%;
    max-height: 100vh;
    max-height: 100dvh;
    border-radius: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .head {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 14px 12px 8px;
    position: relative;
  }

  .head h2 {
    font-size: 1.1rem;
    padding-right: 42px;
  }

  .head small {
    display: inline-block;
    margin-left: 0;
    margin-top: 2px;
  }

  .metrics {
    gap: 8px 10px;
    font-size: 0.8rem;
  }

  .head-right {
    justify-content: stretch;
  }

  .close {
    position: absolute;
    top: 10px;
    right: 10px;
  }

  .mode-switch {
    width: 100%;
  }

  .mode-switch button {
    flex: 1;
    height: 36px;
  }

  .price-row {
    padding: 4px 12px 8px;
    gap: 8px;
  }

  .price-row strong {
    font-size: 1.65rem;
  }

  .amount {
    width: 100%;
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .chart-wrap {
    padding: 0 8px 6px;
  }

  svg {
    height: min(52vh, 320px);
    border-radius: 8px;
  }

  .legend {
    position: static;
    margin: 8px 12px 0;
    left: auto;
    bottom: auto;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 0.74rem;
    max-width: none;
  }

  .extra {
    gap: 8px 12px;
    padding: 8px 12px 18px;
    font-size: 0.8rem;
  }

  .drag-hint {
    width: 100%;
    margin-left: 0;
  }
}
</style>
