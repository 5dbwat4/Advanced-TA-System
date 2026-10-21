import { Button, Spinner } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import RecordRTC from 'recordrtc'
import { toast } from 'sonner'

import Mic from '~icons/lucide/mic'
import RotateCcw from '~icons/lucide/rotate-ccw'
import Sparkles from '~icons/lucide/sparkles'
import Square from '~icons/lucide/square'
import type { CheckoffQuestion } from '@/lib/api'
import { useAiConfig } from '@/lib/ai-config'
import { runAiAudioGrade, type AiAudioGradeResult } from '@/lib/ai-audio-grade'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export function AiAudioGrade({
  questions,
  disabled,
  onResult,
}: {
  questions: Pick<CheckoffQuestion, 'question' | 'answer'>[]
  disabled?: boolean
  onResult: (result: AiAudioGradeResult) => void
}) {
  const { user } = useAuth()
  const aiConfig = useAiConfig(user?.id)
  const [recording, setRecording] = useState(false)
  const [grading, setGrading] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const recorderRef = useRef<RecordRTC | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  useEffect(() => {
    return () => {
      clearTimer()
      if (recorderRef.current) {
        recorderRef.current.stopRecording()
        recorderRef.current.destroy()
        recorderRef.current = null
      }
      stopTracks()
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grade = async (blob: Blob) => {
    setGrading(true)
    try {
      const audio = new Uint8Array(await blob.arrayBuffer())
      const result = await runAiAudioGrade({
        audio,
        mediaType: 'audio/wav',
        questions,
        config: aiConfig,
      })
      onResult(result)
      toast.success(
        aiConfig.demoMode ? '演示模式：已生成示例听答评分，请人工复核' : 'AI 已完成听答评分，请人工复核',
      )
    } catch (error) {
      toast.error(getErrorMessage(error, 'AI 听答评分失败'))
    } finally {
      setGrading(false)
    }
  }

  const start = async () => {
    if (questions.length === 0) {
      toast.error('请先抽题')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new RecordRTC(stream, {
        type: 'audio',
        recorderType: RecordRTC.StereoAudioRecorder,
        mimeType: 'audio/wav',
        numberOfAudioChannels: 1,
        desiredSampRate: 16000,
        disableLogs: true,
      })
      recorder.startRecording()
      recorderRef.current = recorder
      setSeconds(0)
      setRecording(true)
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    } catch (error) {
      toast.error(getErrorMessage(error, '无法访问麦克风'))
    }
  }

  const stop = () => {
    const recorder = recorderRef.current
    if (!recorder) return
    clearTimer()
    setRecording(false)
    recorder.stopRecording(() => {
      const blob = recorder.getBlob()
      setAudioUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return URL.createObjectURL(blob)
      })
      recorder.destroy()
      recorderRef.current = null
      stopTracks()
      void grade(blob)
    })
  }

  return (
    <div className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Sparkles width={15} height={15} className="shrink-0 text-brand-600 dark:text-brand-300" />
        AI 听答评分
        {aiConfig.demoMode && (
          <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300">
            演示模式
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-fg-subtle">
        录制学生本轮口头回答，发送给支持音频的多模态模型，自动给出「口头问答」分数和评语。评语会写入备注。
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!recording ? (
          <Button
            size="sm"
            variant="secondary"
            isDisabled={disabled || grading || questions.length === 0}
            onPress={() => void start()}
          >
            <Mic width={15} height={15} className="shrink-0" />
            {audioUrl ? '重新录音' : '开始录音'}
          </Button>
        ) : (
          <Button size="sm" variant="danger" onPress={stop}>
            <Square width={14} height={14} className="shrink-0" />
            停止并评分
          </Button>
        )}

        {recording && (
          <span className="tabular flex items-center gap-1.5 text-xs font-semibold text-danger">
            <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
            {formatDuration(seconds)}
          </span>
        )}

        {grading && (
          <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <Spinner size="sm" />
            正在分析录音…
          </span>
        )}

        {audioUrl && !recording && (
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label="清除录音"
            isDisabled={grading}
            onPress={() => {
              URL.revokeObjectURL(audioUrl)
              setAudioUrl(null)
            }}
          >
            <RotateCcw width={14} height={14} className="shrink-0" />
          </Button>
        )}
      </div>

      {audioUrl && <audio controls src={audioUrl} className="mt-3 w-full" />}
    </div>
  )
}
