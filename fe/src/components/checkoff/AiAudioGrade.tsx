import { Button, Spinner } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import RecordRTC from 'recordrtc'
import { toast } from 'sonner'

import Mic from '~icons/lucide/mic'
import Pause from '~icons/lucide/pause'
import Play from '~icons/lucide/play'
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
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
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
      toast.success('AI 已完成听答评分，请人工复核')
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
      setPlaying(false)
      setCurrentTime(0)
      setDuration(0)
      recorder.destroy()
      recorderRef.current = null
      stopTracks()
      void grade(blob)
    })
  }

  const playbackDuration = Number.isFinite(duration) ? duration : 0

  return (
    <div className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Sparkles width={15} height={15} className="shrink-0 text-brand-600 dark:text-brand-300" />
        AI 听答评分
      </div>
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
          <>
            <div className="flex items-center gap-1.5 rounded-xl border border-line bg-elevated px-1.5 py-1">
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                aria-label={playing ? '暂停录音' : '播放录音'}
                onPress={() => {
                  const audio = audioRef.current
                  if (!audio) return
                  if (audio.paused) {
                    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
                  } else {
                    audio.pause()
                    setPlaying(false)
                  }
                }}
              >
                {playing ? (
                  <Pause width={14} height={14} className="shrink-0" />
                ) : (
                  <Play width={14} height={14} className="shrink-0" />
                )}
              </Button>
              <input
                type="range"
                aria-label="录音进度"
                min={0}
                max={playbackDuration}
                step={0.1}
                value={Math.min(currentTime, playbackDuration)}
                onChange={(event) => {
                  const audio = audioRef.current
                  const next = Number(event.target.value)
                  if (!audio) return
                  audio.currentTime = next
                  setCurrentTime(next)
                }}
                className="h-1 w-20 accent-brand-600"
              />
              <span className="tabular text-[11px] text-fg-subtle">
                {formatDuration(Math.floor(currentTime))} /{' '}
                {formatDuration(Math.floor(playbackDuration))}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label="清除录音"
              isDisabled={grading}
              onPress={() => {
                audioRef.current?.pause()
                setPlaying(false)
                setCurrentTime(0)
                setDuration(0)
                URL.revokeObjectURL(audioUrl)
                setAudioUrl(null)
              }}
            >
              <RotateCcw width={14} height={14} className="shrink-0" />
            </Button>
          </>
        )}
      </div>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          className="hidden"
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  )
}
