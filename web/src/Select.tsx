import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

export type SelectOption<T extends string> = { value: T; label: string }

export function Select<T extends string>({ value, options, onChange, label, align = 'start' }: {
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  label: string
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value))
  const current = options[selectedIndex]

  const openMenu = () => { setActive(selectedIndex); setOpen(true) }
  const close = (refocus = true) => { setOpen(false); if (refocus) trigger.current?.focus() }
  const choose = (index: number) => {
    const option = options[index]
    if (option) onChange(option.value)
    close()
  }

  useEffect(() => { if (open) list.current?.focus() }, [open])
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu()
    }
  }

  const onListKeyDown = (event: KeyboardEvent) => {
    const last = options.length - 1
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); setActive(index => Math.min(last, index + 1)); break
      case 'ArrowUp': event.preventDefault(); setActive(index => Math.max(0, index - 1)); break
      case 'Home': event.preventDefault(); setActive(0); break
      case 'End': event.preventDefault(); setActive(last); break
      case 'Enter':
      case ' ': event.preventDefault(); choose(active); break
      case 'Escape': event.preventDefault(); close(); break
      case 'Tab': setOpen(false); break
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const key = event.key.toLowerCase()
          const ordered = [...options.keys()].map(offset => (active + 1 + offset) % options.length)
          const match = ordered.find(index => options[index]?.label.toLowerCase().startsWith(key))
          if (match !== undefined) setActive(match)
        }
    }
  }

  return <div className="select-root" ref={root}>
    <button
      ref={trigger}
      type="button"
      className="select"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`${label}: ${current?.label ?? ''}`}
      onClick={() => open ? close(false) : openMenu()}
      onKeyDown={onTriggerKeyDown}
    >
      <span>{current?.label}</span>
      <svg className="chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && <ul
      ref={list}
      className="menu"
      data-align={align}
      role="listbox"
      tabIndex={-1}
      aria-label={label}
      aria-activedescendant={`${id}-${active}`}
      onKeyDown={onListKeyDown}
    >
      {options.map((option, index) => <li
        key={option.value}
        id={`${id}-${index}`}
        className="option"
        role="option"
        aria-selected={option.value === value}
        data-active={index === active}
        onMouseEnter={() => setActive(index)}
        onClick={() => choose(index)}
      >
        <span>{option.label}</span>
        {option.value === value && <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>}
      </li>)}
    </ul>}
  </div>
}
