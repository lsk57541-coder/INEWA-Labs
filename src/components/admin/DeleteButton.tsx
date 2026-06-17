'use client'

import { useTransition } from 'react'

interface DeleteButtonProps {
  action: () => Promise<void>
  confirm?: string
  label?: string
}

export default function DeleteButton({
  action,
  confirm: confirmMsg = '삭제할까요?',
  label = '삭제',
}: DeleteButtonProps) {
  const [pending, startTransition] = useTransition()

  const handleClick = () => {
    if (!window.confirm(confirmMsg)) return
    startTransition(() => action())
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-xs text-red-500 hover:text-red-700 px-2 py-1.5 disabled:opacity-40"
    >
      {pending ? '삭제 중…' : label}
    </button>
  )
}
