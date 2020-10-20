import type { Ref, InjectionKey, SetupContext } from 'vue'
import { ref, provide, inject, computed, onBeforeUnmount } from 'vue'
import { uuidv4 } from '../utils/helpers'

export interface GroupItem {
  id: string
  value: Ref<any>
  disabled: Ref<boolean | undefined>
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

interface GroupItemProps {
  value: any
  disabled: boolean
  activeClass: string
}

export function makeItemProps (defaults: Partial<GroupItemProps> = {}) {
  return {
    value: {
      required: true,
      default: defaults.value,
    },
    disabled: {
      type: Boolean,
      default: defaults.disabled,
    },
    activeClass: {
      type: String,
      default: defaults.activeClass,
    },
  }
}

export function useItem (
  props: { value?: any, name?: string, disabled?: boolean, active?: boolean, activeClass: string },
  context: SetupContext<any>,
  injectKey: InjectionKey<GroupProvide>
) {
  const internal = useProxiedModel(props, context, 'value')
  const disabled = computed(() => props.disabled)
  const group = inject(injectKey, null)

  const id = props.name || uuidv4()

  if (group) {
    group.register({
      id,
      value: internal,
      disabled,
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

interface GroupProps {
  multiple?: boolean
  mandatory?: boolean
}

export function makeGroupProps (defaults: Partial<GroupProps>) {
  return {
    multiple: {
      type: Boolean,
      default: defaults.multiple,
    },
    mandatory: {
      type: Boolean,
      default: defaults.mandatory,
    },
  }
}

export function useGroup (
  props: { returnValues?: boolean, multiple?: boolean, mandatory?: boolean, max?: number },
  context: SetupContext<any>,
  injectKey: InjectionKey<GroupProvide>
) {
  const items = ref([]) as Ref<GroupItem[]>
  const selected = useProxiedModel<string[], string>(
    props,
    context,
    'value',
    [],
    v => {
      if (v == null) return []

      const arr = Array.isArray(v) ? v : [v]

      if (props.returnValues) {
        // TODO: filter does not automagically remove undefined from type
        return arr.map(a => getIdFromValue(items.value, a)) as string[]
      }

      return arr.map(a => items.value[a].id)
    },
    v => {
      let arr: any[] = v
      if (props.returnValues) arr = v.map(id => getValueFromId(items.value, id))
      else arr = v.map(id => items.value.findIndex(i => i.id === id))

      return props.multiple ? arr : arr.length ? arr[0] : null
    })

  function register (item: GroupItem) {
    if (props.returnValues && item.value.value == null) {
      throw new Error('item must have value prop when using return-values')
    }

    items.value.push(item)

    // If no value provided and mandatory,
    // assign first registered item
    if (props.mandatory && !selected.value.length) {
      updateMandatory()
    }
  }

  function unregister (id: string) {
    const index = items.value.findIndex(i => i.id === id)
    const val = getValue(id)

    items.value.splice(index, 1)

    const valueIndex = selected.value.indexOf(val)

    // Item is not selected, don't need to do anything
    if (valueIndex < 0) return

    // If not mandatory, try to toggle value off
    if (!props.mandatory) {
      return updateValue(val)
    }

    // Remove the value
    if (props.multiple) {
      selected.value = selected.value.filter(v => v !== val)
    } else {
      selected.value = []
    }

    // If mandatory and we have no selection
    // add the last item as value
    if (!selected.value.length) {
      updateMandatory(true)
    }
  }

  function updateValue (id: string) {
    if (props.multiple) {
      const internalValue = selected.slice()
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

  function updateMandatory (last?: boolean) {
    if (!items.value.length) return

    const copy = items.value.slice()

    if (last) copy.reverse()

    const item = copy.find(c => !c.disabled.value)

    if (!item) return

    updateValue(item.id)
  }

  function getValue (id: string) {
    for (let i = 0; i < items.value.length; i++) {
      const item = items.value[i]
      if (item.id === id) {
        const val = item.value.value
        return props.returnValues ? val : i
      }
    }

    return null
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
    if (item.value.value === val) {
      return item.id
    }
  }

  return null
}

export function getValueFromId (items: GroupItem[], id: string) {
  for (const item of items) {
    if (item.id === id) {
      return item.value.value
    }
  }

  return null
}

export function getIndexFromId (items: GroupItem[], id: string) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.id === id) {
      return i
    }
  }

  return -1
}
