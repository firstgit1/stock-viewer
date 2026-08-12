import { reactive } from 'vue'

const state = reactive({
  items: [],
})

let seq = 0

function push(type, message, duration = 2200) {
  const id = ++seq
  state.items.push({ id, type, message })
  window.setTimeout(() => {
    remove(id)
  }, duration)
  return id
}

function remove(id) {
  const i = state.items.findIndex((x) => x.id === id)
  if (i >= 0) state.items.splice(i, 1)
}

export function useToastState() {
  return state
}

export const toast = {
  success(message, duration) {
    return push('success', message, duration)
  },
  error(message, duration) {
    return push('error', message, duration ?? 2800)
  },
  info(message, duration) {
    return push('info', message, duration)
  },
  remove,
}
