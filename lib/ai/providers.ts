import { gateway } from '@ai-sdk/gateway'
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel
} from 'ai'
import { isTestEnvironment } from '../constants'

export const myProvider = isTestEnvironment
  ? (() => {
      const loadMockModels = async () => {
        const { chatModel, reasoningModel, titleModel, artifactModel } =
          await import('./models.mock')

        return customProvider({
          languageModels: {
            'chat-model': chatModel as unknown as any,
            'chat-model-reasoning': reasoningModel as unknown as any,
            'title-model': titleModel as unknown as any,
            'artifact-model': artifactModel as unknown as any
          }
        })
      }

      // 注意：这里返回一个 Promise
      return loadMockModels()
    })()
  : customProvider({
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
