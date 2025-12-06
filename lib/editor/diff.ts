import { diff_match_patch } from 'diff-match-patch'
import {
  Fragment,
  Mark,
  Node as ProsemirrorNode,
  Schema,
  NodeType
} from 'prosemirror-model'

export const DiffType = {
  Unchanged: 0,
  Deleted: -1,
  Inserted: 1
} as const

export type DiffTypeValue = (typeof DiffType)[keyof typeof DiffType]

export type ProsemirrorNodeLike = ProsemirrorNode | ProsemirrorNode[]

export type NormalizedNodeContent = (ProsemirrorNode | ProsemirrorNode[])[]

export type MatchResult = {
  oldStartIndex: number
  newStartIndex: number
  oldEndIndex: number
  newEndIndex: number
  count: number
}

export type ProsemirrorJSON = {
  type: string
  attrs?: Record<string, unknown>
  content?: ProsemirrorJSON[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}

export const patchDocumentNode = (
  schema: Schema,
  oldNode: ProsemirrorNode,
  newNode: ProsemirrorNode
): ProsemirrorNode => {
  assertNodeTypeEqual(oldNode, newNode)

  const finalLeftChildren: ProsemirrorNode[] = []
  const finalRightChildren: ProsemirrorNode[] = []

  const oldChildren = normalizeNodeContent(oldNode)
  const newChildren = normalizeNodeContent(newNode)
  const oldChildLen = oldChildren.length
  const newChildLen = newChildren.length
  const minChildLen = Math.min(oldChildLen, newChildLen)

  let left = 0
  let right = 0

  for (; left < minChildLen; left++) {
    const oldChild = oldChildren[left]
    const newChild = newChildren[left]
    if (!isNodeEqual(oldChild, newChild)) {
      break
    }
    finalLeftChildren.push(...ensureArray(oldChild))
  }

  for (; right + left + 1 < minChildLen; right++) {
    const oldChild = oldChildren[oldChildLen - right - 1]
    const newChild = newChildren[newChildLen - right - 1]
    if (!isNodeEqual(oldChild, newChild)) {
      break
    }
    finalRightChildren.unshift(...ensureArray(oldChild))
  }

  const diffOldChildren = oldChildren.slice(left, oldChildLen - right)
  const diffNewChildren = newChildren.slice(left, newChildLen - right)

  if (diffOldChildren.length && diffNewChildren.length) {
    const matchedNodes = matchNodes(
      schema,
      diffOldChildren,
      diffNewChildren
    ).sort((a, b) => b.count - a.count)
    const bestMatch = matchedNodes[0]
    if (bestMatch) {
      const { oldStartIndex, newStartIndex, oldEndIndex, newEndIndex } =
        bestMatch
      const oldBeforeMatchChildren = diffOldChildren.slice(0, oldStartIndex)
      const newBeforeMatchChildren = diffNewChildren.slice(0, newStartIndex)

      finalLeftChildren.push(
        ...patchRemainNodes(
          schema,
          oldBeforeMatchChildren,
          newBeforeMatchChildren
        )
      )
      finalLeftChildren.push(
        ...diffOldChildren.slice(oldStartIndex, oldEndIndex).flat()
      )

      const oldAfterMatchChildren = diffOldChildren.slice(oldEndIndex)
      const newAfterMatchChildren = diffNewChildren.slice(newEndIndex)

      finalRightChildren.unshift(
        ...patchRemainNodes(
          schema,
          oldAfterMatchChildren,
          newAfterMatchChildren
        )
      )
    } else {
      finalLeftChildren.push(
        ...patchRemainNodes(schema, diffOldChildren, diffNewChildren)
      )
    }
  } else {
    finalLeftChildren.push(
      ...patchRemainNodes(schema, diffOldChildren, diffNewChildren)
    )
  }

  return createNewNode(oldNode, [...finalLeftChildren, ...finalRightChildren])
}

const matchNodes = (
  _schema: Schema,
  oldChildren: NormalizedNodeContent,
  newChildren: NormalizedNodeContent
): MatchResult[] => {
  const matches: MatchResult[] = []
  for (
    let oldStartIndex = 0;
    oldStartIndex < oldChildren.length;
    oldStartIndex++
  ) {
    const oldStartNode = oldChildren[oldStartIndex]
    const newStartIndex = findMatchNode(newChildren, oldStartNode)

    if (newStartIndex !== -1) {
      let oldEndIndex = oldStartIndex + 1
      let newEndIndex = newStartIndex + 1
      for (
        ;
        oldEndIndex < oldChildren.length && newEndIndex < newChildren.length;
        oldEndIndex++, newEndIndex++
      ) {
        const oldEndNode = oldChildren[oldEndIndex]
        if (!isNodeEqual(newChildren[newEndIndex], oldEndNode)) {
          break
        }
      }
      matches.push({
        oldStartIndex,
        newStartIndex,
        oldEndIndex,
        newEndIndex,
        count: newEndIndex - newStartIndex
      })
    }
  }
  return matches
}

const findMatchNode = (
  children: NormalizedNodeContent,
  node: ProsemirrorNodeLike,
  startIndex = 0
): number => {
  for (let i = startIndex; i < children.length; i++) {
    if (isNodeEqual(children[i], node)) {
      return i
    }
  }
  return -1
}

const patchRemainNodes = (
  schema: Schema,
  oldChildren: NormalizedNodeContent,
  newChildren: NormalizedNodeContent
): ProsemirrorNode[] => {
  const finalLeftChildren: ProsemirrorNode[] = []
  const finalRightChildren: ProsemirrorNode[] = []
  const oldChildLen = oldChildren.length
  const newChildLen = newChildren.length
  let left = 0
  let right = 0

  while (oldChildLen - left - right > 0 && newChildLen - left - right > 0) {
    const leftOldNode = oldChildren[left]
    const leftNewNode = newChildren[left]
    const rightOldNode = oldChildren[oldChildLen - right - 1]
    const rightNewNode = newChildren[newChildLen - right - 1]

    let updateLeft =
      !isTextNode(leftOldNode) && matchNodeType(leftOldNode, leftNewNode)
    let updateRight =
      !isTextNode(rightOldNode) && matchNodeType(rightOldNode, rightNewNode)

    if (Array.isArray(leftOldNode) && Array.isArray(leftNewNode)) {
      finalLeftChildren.push(
        ...patchTextNodes(schema, leftOldNode, leftNewNode)
      )
      left += 1
      continue
    }

    if (updateLeft && updateRight) {
      const equalityLeft = computeChildEqualityFactor(leftOldNode, leftNewNode)
      const equalityRight = computeChildEqualityFactor(
        rightOldNode,
        rightNewNode
      )
      if (equalityLeft < equalityRight) {
        updateLeft = false
      } else {
        updateRight = false
      }
    }

    if (updateLeft) {
      if (
        leftOldNode instanceof ProsemirrorNode &&
        leftNewNode instanceof ProsemirrorNode
      ) {
        finalLeftChildren.push(
          patchDocumentNode(schema, leftOldNode, leftNewNode)
        )
      }
      left += 1
    } else if (updateRight) {
      if (
        rightOldNode instanceof ProsemirrorNode &&
        rightNewNode instanceof ProsemirrorNode
      ) {
        finalRightChildren.unshift(
          patchDocumentNode(schema, rightOldNode, rightNewNode)
        )
      }
      right += 1
    } else {
      // Delete and insert
      if (leftOldNode instanceof ProsemirrorNode) {
        finalLeftChildren.push(
          createDiffNode(schema, leftOldNode, DiffType.Deleted)
        )
      }
      if (leftNewNode instanceof ProsemirrorNode) {
        finalLeftChildren.push(
          createDiffNode(schema, leftNewNode, DiffType.Inserted)
        )
      }
      left += 1
    }
  }

  const deleteNodeLen = oldChildLen - left - right
  const insertNodeLen = newChildLen - left - right

  if (deleteNodeLen) {
    finalLeftChildren.push(
      ...oldChildren
        .slice(left, left + deleteNodeLen)
        .flat()
        .map((node) => {
          if (node instanceof ProsemirrorNode) {
            return createDiffNode(schema, node, DiffType.Deleted)
          }
          return null
        })
        .filter((node): node is ProsemirrorNode => node !== null)
    )
  }

  if (insertNodeLen) {
    finalRightChildren.unshift(
      ...newChildren
        .slice(left, left + insertNodeLen)
        .flat()
        .map((node) => {
          if (node instanceof ProsemirrorNode) {
            return createDiffNode(schema, node, DiffType.Inserted)
          }
          return null
        })
        .filter((node): node is ProsemirrorNode => node !== null)
    )
  }

  return [...finalLeftChildren, ...finalRightChildren]
}

// Updated function to perform sentence-level diffs
export const patchTextNodes = (
  schema: Schema,
  oldNode: ProsemirrorNode[],
  newNode: ProsemirrorNode[]
): ProsemirrorNode[] => {
  const dmp = new diff_match_patch()

  // Concatenate the text from the text nodes
  const oldText = oldNode.map((n) => getNodeText(n)).join('')
  const newText = newNode.map((n) => getNodeText(n)).join('')

  // Tokenize the text into sentences
  const oldSentences = tokenizeSentences(oldText)
  const newSentences = tokenizeSentences(newText)

  // Map sentences to unique characters
  const { chars1, chars2, lineArray } = sentencesToChars(
    oldSentences,
    newSentences
  )

  // Perform the diff
  const rawDiffs = dmp.diff_main(chars1, chars2, false)

  // Convert back to sentences
  const diffs: [number, string[]][] = rawDiffs.map(([type, text]) => {
    const sentences = text
      .split('')
      .map((char) => lineArray[char.charCodeAt(0)] || '')
      .filter(Boolean)
    return [type, sentences]
  })

  // Map diffs to nodes
  const res = diffs.flatMap(([type, sentences]) => {
    return sentences.map((sentence) => {
      const node = createTextNode(
        schema,
        sentence,
        type !== DiffType.Unchanged
          ? [createDiffMark(schema, type as DiffTypeValue)]
          : []
      )
      return node
    })
  })

  return res
}

// Function to tokenize text into sentences
const tokenizeSentences = (text: string): string[] => {
  const matches = text.match(/[^.!?]+[.!?]*\s*/g)
  return matches ? matches.filter(Boolean) : []
}

// Function to map sentences to unique characters
const sentencesToChars = (oldSentences: string[], newSentences: string[]) => {
  const lineArray: string[] = []
  const lineHash: Record<string, number> = {}
  let lineStart = 0

  const chars1 = oldSentences
    .map((sentence) => {
      const line = sentence
      if (line in lineHash) {
        return String.fromCharCode(lineHash[line])
      }
      lineHash[line] = lineStart
      lineArray[lineStart] = line
      lineStart++
      return String.fromCharCode(lineHash[line])
    })
    .join('')

  const chars2 = newSentences
    .map((sentence) => {
      const line = sentence
      if (line in lineHash) {
        return String.fromCharCode(lineHash[line])
      }
      lineHash[line] = lineStart
      lineArray[lineStart] = line
      lineStart++
      return String.fromCharCode(lineHash[line])
    })
    .join('')

  return { chars1, chars2, lineArray }
}

export const computeChildEqualityFactor = (
  _node1: ProsemirrorNodeLike,
  _node2: ProsemirrorNodeLike
): number => {
  console.warn(
    'computeChildEqualityFactor is not implemented yet',
    _node1,
    _node2
  )
  return 0
}

export const assertNodeTypeEqual = (
  node1: ProsemirrorNode,
  node2: ProsemirrorNode
): void => {
  if (getNodeProperty(node1, 'type') !== getNodeProperty(node2, 'type')) {
    throw new Error(
      `node type not equal: ${node1.type.name} !== ${node2.type.name}`
    )
  }
}

export const ensureArray = (value: ProsemirrorNodeLike): ProsemirrorNode[] => {
  return Array.isArray(value) ? value : [value]
}

export const isNodeEqual = (
  node1: ProsemirrorNodeLike | Mark,
  node2: ProsemirrorNodeLike | Mark
): boolean => {
  if (node1 instanceof Mark && node2 instanceof Mark) {
    return (
      node1.type.name === node2.type.name &&
      JSON.stringify(node1.attrs || {}) === JSON.stringify(node2.attrs || {})
    )
  }

  const isNode1Array = Array.isArray(node1)
  const isNode2Array = Array.isArray(node2)

  if (isNode1Array !== isNode2Array) {
    return false
  }

  if (isNode1Array && isNode2Array) {
    return (
      node1.length === node2.length &&
      node1.every((node, index) => isNodeEqual(node, node2[index]))
    )
  }

  const pnode1 = node1 as ProsemirrorNode
  const pnode2 = node2 as ProsemirrorNode

  const type1 = pnode1.type.name
  const type2 = pnode2.type.name

  if (type1 !== type2) {
    return false
  }

  if (isTextNode(pnode1)) {
    const text1 = getNodeText(pnode1)
    const text2 = getNodeText(pnode2)
    if (text1 !== text2) {
      return false
    }
  }

  const attrs1 = getNodeAttributes(pnode1)
  const attrs2 = getNodeAttributes(pnode2)
  const attrs = [...new Set([...Object.keys(attrs1), ...Object.keys(attrs2)])]

  for (const attr of attrs) {
    if (attrs1[attr] !== attrs2[attr]) {
      return false
    }
  }

  const marks1 = [...getNodeMarks(pnode1)]
  const marks2 = [...getNodeMarks(pnode2)]

  if (marks1.length !== marks2.length) {
    return false
  }

  for (let i = 0; i < marks1.length; i++) {
    if (!isNodeEqual(marks1[i], marks2[i])) {
      return false
    }
  }

  const children1 = [...getNodeChildren(pnode1)]
  const children2 = [...getNodeChildren(pnode2)]

  if (children1.length !== children2.length) {
    return false
  }

  for (let i = 0; i < children1.length; i++) {
    if (!isNodeEqual(children1[i], children2[i])) {
      return false
    }
  }

  return true
}

export const normalizeNodeContent = (
  node: ProsemirrorNode
): NormalizedNodeContent => {
  const content = getNodeChildren(node) ?? []
  const res: NormalizedNodeContent = []

  for (let i = 0; i < content.length; i++) {
    const child = content[i]
    if (isTextNode(child)) {
      const textNodes: ProsemirrorNode[] = []
      for (
        let textNode = content[i];
        i < content.length && isTextNode(textNode);
        textNode = content[++i]
      ) {
        textNodes.push(textNode)
      }
      i--
      res.push(textNodes)
    } else {
      res.push(child)
    }
  }

  return res
}

export const getNodeProperty = (
  node: ProsemirrorNode,
  property: 'type' | keyof ProsemirrorNode
): NodeType | unknown => {
  if (property === 'type') {
    return node.type
  }
  return node[property]
}

export const getNodeAttribute = (
  node: ProsemirrorNode,
  attribute: string
): unknown => (node.attrs ? node.attrs[attribute] : undefined)

export const getNodeAttributes = (
  node: ProsemirrorNode
): Record<string, unknown> => (node.attrs ? { ...node.attrs } : {})

export const getNodeMarks = (node: ProsemirrorNode): readonly Mark[] =>
  node.marks ?? []

export const getNodeChildren = (
  node: ProsemirrorNode
): readonly ProsemirrorNode[] => node.content?.content ?? []

export const getNodeText = (node: ProsemirrorNode): string => node.text ?? ''

export const isTextNode = (node: ProsemirrorNodeLike): boolean => {
  if (Array.isArray(node)) {
    return false
  }
  return node.type?.name === 'text'
}

export const matchNodeType = (
  node1: ProsemirrorNodeLike,
  node2: ProsemirrorNodeLike
): boolean => {
  if (Array.isArray(node1) && Array.isArray(node2)) {
    return true
  }
  if (Array.isArray(node1) || Array.isArray(node2)) {
    return false
  }
  return (
    (node1 as ProsemirrorNode).type?.name ===
    (node2 as ProsemirrorNode).type?.name
  )
}

export const createNewNode = (
  oldNode: ProsemirrorNode,
  children: ProsemirrorNode[]
): ProsemirrorNode => {
  if (!oldNode.type) {
    throw new Error('oldNode.type is undefined')
  }
  return oldNode.type.create(
    oldNode.attrs,
    Fragment.fromArray(children),
    oldNode.marks
  )
}

export const createDiffNode = (
  schema: Schema,
  node: ProsemirrorNode,
  type: DiffTypeValue
): ProsemirrorNode => {
  return mapDocumentNode(node, (currentNode) => {
    if (isTextNode(currentNode)) {
      return createTextNode(schema, getNodeText(currentNode), [
        ...(currentNode.marks || []),
        createDiffMark(schema, type)
      ])
    }
    return currentNode
  })
}

function mapDocumentNode(
  node: ProsemirrorNode,
  mapper: (node: ProsemirrorNode) => ProsemirrorNode | null | undefined
): ProsemirrorNode {
  const copy = node.copy(
    Fragment.from(
      node.content.content
        .map((currentNode) => {
          if (currentNode instanceof ProsemirrorNode) {
            return mapDocumentNode(currentNode, mapper)
          }
          return null
        })
        .filter((n): n is ProsemirrorNode => n !== null && n !== undefined)
    )
  )
  return mapper(copy) || copy
}

export const createDiffMark = (schema: Schema, type: DiffTypeValue): Mark => {
  if (type === DiffType.Inserted) {
    return schema.mark('diffMark', { type })
  }
  if (type === DiffType.Deleted) {
    return schema.mark('diffMark', { type })
  }
  throw new Error('type is not valid')
}

export const createTextNode = (
  schema: Schema,
  content: string,
  marks: Mark[] = []
): ProsemirrorNode => {
  return schema.text(content, marks)
}

export const diffEditor = (
  schema: Schema,
  oldDoc: ProsemirrorJSON,
  newDoc: ProsemirrorJSON
): ProsemirrorNode => {
  const oldNode = ProsemirrorNode.fromJSON(schema, oldDoc)
  const newNode = ProsemirrorNode.fromJSON(schema, newDoc)
  return patchDocumentNode(schema, oldNode, newNode)
}
