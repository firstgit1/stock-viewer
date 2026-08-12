<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { fetchAnnouncement } from '../api/announcement'

const props = defineProps({
  active: { type: Boolean, default: true },
})

const enabled = ref(false)
const text = ref('')
const durationSec = ref(22)

const visible = computed(() => props.active && enabled.value && Boolean(text.value.trim()))

async function load() {
  if (!props.active) {
    enabled.value = false
    text.value = ''
    return
  }
  try {
    const data = await fetchAnnouncement({ force: true })
    enabled.value = Boolean(data.enabled)
    text.value = String(data.text || '').trim()
  } catch {
    enabled.value = false
    text.value = ''
  }
}

function tuneSpeed() {
  const len = text.value.length
  const mobile = typeof window !== 'undefined' && window.innerWidth <= 768
  // 单条从右侧进、左侧出，路程更长，略放慢
  const base = mobile ? 16 : 20
  durationSec.value = Math.min(60, Math.max(16, base + len * 0.22))
}

watch(text, tuneSpeed)
watch(
  () => props.active,
  (on) => {
    if (on) load()
    else {
      enabled.value = false
      text.value = ''
    }
  },
)

onMounted(load)

defineExpose({ reload: load })
</script>

<template>
  <div v-if="visible" class="announce" role="status" aria-live="polite">
    <span class="horn" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path
          d="M3 10v4a1 1 0 0 0 1 1h2.2l3.4 2.7a1 1 0 0 0 1.6-.8V7.1a1 1 0 0 0-1.6-.8L6.2 9H4a1 1 0 0 0-1 1Zm14.1-2.3a1 1 0 0 0-1.4 1.4 4 4 0 0 1 0 5.8 1 1 0 1 0 1.4 1.4 6 6 0 0 0 0-8.6Zm2.5-2.6a1 1 0 1 0-1.5 1.3 8 8 0 0 1 0 11.2 1 1 0 1 0 1.5 1.3 10 10 0 0 0 0-13.8Z"
        />
      </svg>
    </span>
    <div class="viewport">
      <p class="track" :style="{ animationDuration: `${durationSec}s` }">
        <span class="msg">{{ text }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.announce {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 7px 14px;
  border-bottom: 1px solid rgba(212, 162, 76, 0.28);
  background: #161d27;
  color: #f0d59a;
  box-sizing: border-box;
}

.horn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--warn);
  opacity: 0.95;
}

.viewport {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.track {
  display: inline-block;
  margin: 0;
  max-width: none;
  white-space: nowrap;
  /* 先空出一整屏，文字从右侧进入；滚完一整段后再循环 */
  padding-left: 100%;
  animation-name: marquee-once;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}

.msg {
  font-size: 0.9rem;
  letter-spacing: 0.02em;
  color: #f3e0b0;
}

@keyframes marquee-once {
  0% {
    transform: translateX(0);
  }
  /* 滚出后稍停，避免立刻又从右边贴上来 */
  92% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(-100%);
  }
}

@media (max-width: 768px) {
  .announce {
    gap: 8px;
    min-height: 34px;
    padding: 6px 10px;
  }

  .msg {
    font-size: 0.84rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .track {
    animation: none;
    transform: none;
    padding-left: 0;
  }

  .viewport {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
