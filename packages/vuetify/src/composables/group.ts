import type { Ref, InjectionKey, SetupContext } from 'vue'
import { ref, provide, inject, computed, onBeforeUnmount } from 'vue'
import { wrapInArray } from '../util/helpers'
import { useProxiedModel } from './proxiedModel'
import { v4 as uuid } from 'uuid'

export interface GroupItem {
  id: string
  value: Ref<any>
}

export interface GroupProvide {
  register: (item: GroupItem) => void
  unregister: (id: string) => void
  toggle: (id: string) => void
  selected: Ref<any[]>
  isSelected: (id: string) => boolean
  prev: () => void
  next: () => void
  items: Ref<GroupItem[]>
}

export function useItem (
  props: { value?: any, disabled?: boolean, active?: boolean },
  injectKey: InjectionKey<GroupProvide>
) {
  console.log('useItem')
  const group = inject(injectKey, null)
  const value = computed(() => props.value)
  const id = uuid()

  if (group) {
    group.register({
      id,
      value,
    })

    onBeforeUnmount(() => {
      group.unregister(id)
    })
  }

  const isSelected = computed(() => {
    if (!group) return props.active

    return group.isSelected(id)
  })

  return {
    isSelected,
    toggle: () => group && group.toggle(id),
  }
}

export function useGroup (
  props: { modelValue?: any, multiple?: boolean, mandatory?: boolean, max?: number, returnValues?: boolean },
  context: SetupContext<any>,
  injectKey: InjectionKey<GroupProvide>
) {
  console.log('useGroup')
  const items = ref([]) as Ref<GroupItem[]>
  const selected = useProxiedModel(
    props,
    context,
    'modelValue',
    [],
    v => {
      if (v == null) return []

      const arr = wrapInArray(v)

      if (props.returnValues) {
        return arr.map(a => getIdFromValue(items.value, a)) as string[]
      }

      return arr /*.map(a => items.value[a]?.id).filter(v => v != null)*/
    },
    v => {
      console.log('out', v)
      let arr: any[] = v
      if (props.returnValues) arr = v.map(id => getValueFromId(items.value, id))
      else arr = v /*.map(id => items.value.findIndex(i => i.id === id))*/

      return props.multiple ? arr : arr.length ? arr[0] : null
    })

  function register (item: GroupItem) {
    if (props.returnValues && item.value == null) {
      throw new Error('item must have value prop when using return-values')
    }

    items.value.push(item)

    // If no value provided and mandatory,
    // assign first registered item
    if (props.mandatory && !selected.value.length) {
      selected.value = [item.id]
    }
  }

  function unregister (id: string) {
    console.log('unregistering', id)

    selected.value = selected.value.filter(v => v !== id)

    if (props.mandatory && !selected.value.length) {
      selected.value = [items.value[items.value.length - 1].id]
    }

    items.value = items.value.filter(item => item.id !== id)
  }

  function updateValue (id: string) {
    console.log('update', id)
    if (props.multiple) {
      const internalValue = selected.value.slice()
      const index = internalValue.findIndex(v => v === id)

      // We can't remove value if group is
      // mandatory, value already exists,
      // and it is the only value
      if (
        props.mandatory &&
        index > -1 &&
        internalValue.length - 1 < 1
      ) return

      // We can't add value if it would
      // cause max limit to be exceeded
      if (
        props.max != null &&
        index < 0 &&
        internalValue.length + 1 > props.max
      ) return

      if (index > -1) internalValue.splice(index, 1)
      else internalValue.push(id)

      selected.value = internalValue
    } else {
      const isSame = selected.value.includes(id)

      if (props.mandatory && isSame) return

      selected.value = isSame ? [] : [id]
    }
  }

  function getOffsetId (offset: number) {
    // getting an offset from selected value obviously won't work with multiple values
    if (props.multiple) throw new Error('!!!')

    // If there is nothing selected, then next value is first item
    if (!selected.value.length) return items.value[0].id

    const currentId = selected.value[0]
    const currentIndex = items.value.findIndex(i => i.id === currentId)
    const newIndex = (currentIndex + offset) % items.value.length

    return items.value[newIndex].id
  }

  const state = {
    register,
    unregister,
    selected,
    items,
    toggle: updateValue,
    prev: () => selected.value = [getOffsetId(items.value.length - 1)],
    next: () => selected.value = [getOffsetId(1)],
    step: (steps: number) => selected.value = [getOffsetId(steps)],
    isSelected: (id: string) => selected.value.includes(id),
  }

  provide(injectKey, state)

  return state
}

export function getIdFromValue (items: GroupItem[], val: any) {
  for (const item of items) {
    if (item.value === val) {
      return item.id
    }
  }

  return null
}

export function getValueFromId (items: GroupItem[], id: string) {
  for (const item of items) {
    if (item.id === id) {
      return item.value
    }
  }

  return null
}
