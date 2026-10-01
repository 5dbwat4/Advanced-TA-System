import { SearchField } from '@heroui/react'

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel: string
  className?: string
  autoFocus?: boolean
}) {
  return (
    <SearchField
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      autoFocus={autoFocus}
      className={className}
    >
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={placeholder} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  )
}
