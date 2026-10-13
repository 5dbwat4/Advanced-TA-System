import { SearchField, Spinner } from '@heroui/react'
import type { Ref } from 'react'

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  autoFocus,
  inputRef,
  isLoading,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel: string
  className?: string
  autoFocus?: boolean
  inputRef?: Ref<HTMLInputElement>
  isLoading?: boolean
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
        <SearchField.Input ref={inputRef} placeholder={placeholder} />
        {isLoading && <Spinner size="sm" className="me-1 shrink-0" />}
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  )
}
