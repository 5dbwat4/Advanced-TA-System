import {
  QueryClient,
  useInfiniteQuery,
  useQuery,
  type QueryClient as QueryClientType,
} from '@tanstack/react-query'
import { useMemo } from 'react'

import { listQuestions, listTags, type Question } from '@/lib/api'

const ID_CHUNK_SIZE = 100
const TAG_STALE_TIME = 5 * 60_000
const BY_TAG_PAGE_SIZE = 100

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const queryKeys = {
  tags: ['tags'] as const,
  questionLists: ['questions'] as const,
  question: (id: string) => ['question', id] as const,
  questionsByIds: (ids: string[]) => ['questions', 'ids', [...ids].sort()] as const,
  infiniteQuestions: (q: string) => ['questions', 'infinite', q] as const,
  byTagPage: (tagId: string, limit: number, offset: number) =>
    ['questions', 'byTag', tagId, limit, offset] as const,
}

/** 共享标签列表；多处使用时只请求一次。 */
export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: listTags,
    select: (data) => data.tags,
    staleTime: TAG_STALE_TIME,
  })
}

/** 题目选择器的关键词 + 无限分页。 */
export function useInfiniteQuestions({
  q,
  pageSize = 20,
}: {
  q?: string
  pageSize?: number
}) {
  const keyword = q?.trim() ?? ''
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.infiniteQuestions(keyword), pageSize],
    queryFn: ({ pageParam }) =>
      listQuestions({ q: keyword || undefined, limit: pageSize, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.questions.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
  })

  const questions = useMemo(
    () => query.data?.pages.flatMap((page) => page.questions) ?? [],
    [query.data],
  )
  const total = query.data?.pages[0]?.total ?? 0

  return { ...query, questions, total }
}

/** 按 id 批量取题目；超过 100 条自动分片。 */
export function useQuestionsByIds(ids: string[]) {
  const unique = useMemo(() => [...new Set(ids)].sort(), [ids])
  return useQuery({
    queryKey: queryKeys.questionsByIds(unique),
    queryFn: () => fetchQuestionsByIds(unique),
    enabled: unique.length > 0,
    staleTime: 60_000,
  })
}

export async function fetchQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (ids.length === 0) return []
  const chunks: string[][] = []
  for (let index = 0; index < ids.length; index += ID_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + ID_CHUNK_SIZE))
  }
  const pages = await Promise.all(
    chunks.map((chunk) => listQuestions({ ids: chunk, limit: chunk.length })),
  )
  const byId = new Map<string, Question>()
  for (const page of pages) {
    for (const question of page.questions) byId.set(question.id, question)
  }
  return ids.map((id) => byId.get(id)).filter((question): question is Question => Boolean(question))
}

/** 取某个标签下的全部题目；按页走 query cache，重复点击不会重复请求。 */
export async function fetchAllQuestionsByTag(tagId: string): Promise<Question[]> {
  const all: Question[] = []
  let offset = 0
  for (;;) {
    const data = await queryClient.fetchQuery({
      queryKey: queryKeys.byTagPage(tagId, BY_TAG_PAGE_SIZE, offset),
      queryFn: () => listQuestions({ tagId, limit: BY_TAG_PAGE_SIZE, offset }),
    })
    all.push(...data.questions)
    offset += data.questions.length
    if (data.questions.length === 0 || offset >= data.total) break
  }
  return all
}

export function invalidateQuestions(client: QueryClientType = queryClient) {
  void client.invalidateQueries({ queryKey: queryKeys.questionLists })
}

export function invalidateTags(client: QueryClientType = queryClient) {
  void client.invalidateQueries({ queryKey: queryKeys.tags })
}
