import type { UseChatHelpers } from '@ai-sdk/react'
import type { ChatMessage } from '@/lib/types'
import { useScrollToBottom } from './use-scroll-to-bottom'
import { useMemo } from 'react'

export function useMessages({
  status
}: {
  status: UseChatHelpers<ChatMessage>['status']
}) {
  const {
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    onViewportEnter,
    onViewportLeave
  } = useScrollToBottom()

  const hasSentMessage = useMemo(() => {
    return status === 'submitted'
  }, [status])

  return {
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    onViewportEnter,
    onViewportLeave,
    hasSentMessage
  }
}
