'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import StepIndicator from './StepIndicator'
import Step1NovelInput from './steps/Step1NovelInput'
import Step2ScriptEditor from './steps/Step2ScriptEditor'
import Step3StoryboardEditor from './steps/Step3StoryboardEditor'
import Step4FinalScript from './steps/Step4FinalScript'
import type { HistoryEntry } from './HistoryPanel'

type Step = 1 | 2 | 3 | 4

interface StepInstructions {
  step1: string
  step2: string
  step3: string
}

export default function LxtScriptWizard() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push({ pathname: '/auth/signin' })
    }
  }, [session, status, router])

  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [novelText, setNovelText] = useState('')
  const [scriptText, setScriptText] = useState('')
  const [storyboardText, setStoryboardText] = useState('')
  const [finalScriptText, setFinalScriptText] = useState('')
  const [instructions, setInstructions] = useState<StepInstructions>({
    step1: '',
    step2: '',
    step3: '',
  })
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const addHistory = useCallback((step: number, label: string, content: string) => {
    if (!content.trim()) return
    setHistory((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        step,
        label,
        content,
        createdAt: Date.now(),
      },
    ])
  }, [])

  const handleNext = useCallback(
    (fromStep: Step) => {
      // Save current state to history before advancing
      if (fromStep === 1 && novelText.trim()) {
        addHistory(1, `小说原文 ${new Date().toLocaleTimeString()}`, novelText)
      }
      if (fromStep === 2 && scriptText.trim()) {
        addHistory(2, `剧本 ${new Date().toLocaleTimeString()}`, scriptText)
      }
      if (fromStep === 3 && storyboardText.trim()) {
        addHistory(3, `分镜 ${new Date().toLocaleTimeString()}`, storyboardText)
      }
      setCurrentStep((prev) => Math.min(4, prev + 1) as Step)
    },
    [novelText, scriptText, storyboardText, addHistory]
  )

  const handlePrev = useCallback(() => {
    setCurrentStep((prev) => Math.max(1, prev - 1) as Step)
  }, [])

  const handleNewTask = useCallback(() => {
    setCurrentStep(1)
    setNovelText('')
    setScriptText('')
    setStoryboardText('')
    setFinalScriptText('')
    setInstructions({ step1: '', step2: '', step3: '' })
    setHistory([])
  }, [])

  const handleRestoreHistory = useCallback((entry: HistoryEntry) => {
    if (entry.step === 1) setNovelText(entry.content)
    else if (entry.step === 2) setScriptText(entry.content)
    else if (entry.step === 3) setStoryboardText(entry.content)
    else if (entry.step === 4) setFinalScriptText(entry.content)
  }, [])

  if (status === 'loading' || !session) {
    return (
      <div className="glass-page min-h-screen flex items-center justify-center">
        <div className="text-[var(--glass-text-secondary)]">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full flex flex-col glass-page">
      <Navbar />
      {/* Step progress bar */}
      <div className="sticky top-0 z-10 glass-nav border-b border-[var(--glass-stroke-base)]">
        <div className="max-w-6xl mx-auto w-full">
          <StepIndicator currentStep={currentStep} />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-6">
        <div
          key={currentStep}
          className="animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          {currentStep === 1 && (
            <Step1NovelInput
              novelText={novelText}
              onNovelTextChange={setNovelText}
              instruction={instructions.step1}
              onInstructionChange={(v) =>
                setInstructions((prev) => ({ ...prev, step1: v }))
              }
              onNext={() => handleNext(1)}
              history={history}
              onRestoreHistory={handleRestoreHistory}
            />
          )}

          {currentStep === 2 && (
            <Step2ScriptEditor
              novelText={novelText}
              scriptText={scriptText}
              onScriptTextChange={setScriptText}
              instruction={instructions.step2}
              onInstructionChange={(v) =>
                setInstructions((prev) => ({ ...prev, step2: v }))
              }
              onPrev={handlePrev}
              onNext={() => handleNext(2)}
              history={history}
              onRestoreHistory={handleRestoreHistory}
            />
          )}

          {currentStep === 3 && (
            <Step3StoryboardEditor
              scriptText={scriptText}
              storyboardText={storyboardText}
              onStoryboardTextChange={setStoryboardText}
              instruction={instructions.step3}
              onInstructionChange={(v) =>
                setInstructions((prev) => ({ ...prev, step3: v }))
              }
              onPrev={handlePrev}
              onNext={() => handleNext(3)}
              history={history}
              onRestoreHistory={handleRestoreHistory}
            />
          )}

          {currentStep === 4 && (
            <Step4FinalScript
              storyboardText={storyboardText}
              finalScriptText={finalScriptText}
              onFinalScriptTextChange={setFinalScriptText}
              onPrev={handlePrev}
              onNewTask={handleNewTask}
              history={history}
              onRestoreHistory={handleRestoreHistory}
            />
          )}
        </div>
      </main>
    </div>
  )
}
