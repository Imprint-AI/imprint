import { gateway } from '@ai-sdk/gateway'
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel
} from 'ai'
import type { ProviderV2 } from '@ai-sdk/provider'
import { isTestEnvironment } from '../constants'

let providerInstance: ProviderV2 | null = null

export const getMyProvider = async (): Promise<ProviderV2> => {
  if (providerInstance) {
    return providerInstance
  }

  if (isTestEnvironment) {
    const { artifactModel, chatModel, reasoningModel, titleModel } =
      await import('./models.mock')

    providerInstance = customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel
      }
    })
  } else {
    providerInstance = customProvider({
      languageModels: {
        'chat-model': gateway.languageModel('xai/grok-2-vision-1212'),
        'chat-model-reasoning': wrapLanguageModel({
          model: gateway.languageModel('xai/grok-3-mini'),
          middleware: extractReasoningMiddleware({ tagName: 'think' })
        }),
        'title-model': gateway.languageModel('xai/grok-2-1212'),
        'artifact-model': gateway.languageModel('xai/grok-2-1212')
      }
    })
  }

  return providerInstance
}
