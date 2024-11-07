'use client'

import { useState, FormEvent } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import ReactMarkdown from 'react-markdown'
import Image from 'next/image'

const USE_STREAMING = process.env.NEXT_PUBLIC_USE_STREAMING === 'true';

export default function ChatInterface() {
  const [input, setInput] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [isThinking, setIsThinking] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    if (USE_STREAMING) {
      return handleStreamingSubmit(e);
    }
    e.preventDefault()
    console.log('Submitted:', input)
    
    const currentQuestion = input
    setInput('')
    setQuestion(currentQuestion)
    setIsThinking(true)

    try {
      const response = await fetch('/api/answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: currentQuestion }),
      })

      if (!response.ok) {
        throw new Error('Network response was not ok')
      }

      const data = await response.json()
      console.log('Answer:', data.answer)
      setAnswer(data.answer)
    } catch (error) {
      console.error('Error:', error)
      setAnswer('An error occurred while fetching the answer.')
    } finally {
      setIsThinking(false)
    }
  }

  const handleStreamingSubmit = async (e: FormEvent) => {
    e.preventDefault()
    console.log('Submitted (streaming):', input)
    
    const currentQuestion = input
    setInput('')
    setQuestion(currentQuestion)
    setAnswer('')
    setIsThinking(true)

    try {
      const response = await fetch('/api/answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          question: currentQuestion,
          streaming: true 
        }),
      })

      if (!response.ok) throw new Error('Network response was not ok')
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value, { stream: true })
        setAnswer(prev => prev + chunk)
      }
    } catch (error) {
      console.error('Error:', error)
      setAnswer('An error occurred while fetching the answer.')
    } finally {
      setIsThinking(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen">
      <Card className="w-full max-w-xl shadow-none bg-transparent border-none">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Image 
              src="/PDQ_Connect_icon_nav.svg"
              alt="PDQ Connect Icon"
              width={20}
              height={20}
            />
            <CardTitle className="text-2xl font-bold">Ask Connect docs</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              type="text"
              placeholder="Type your question here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-grow"
            />
            <Button type="submit">Submit</Button>
          </form>
          {question && (
            <Card className="shadow-none bg-transparent border-none">
              <CardContent className="text-right p-4">
                <p className="font-semibold">You:</p>
                <p>{question}</p>
              </CardContent>
            </Card>
          )}
          {answer && (
            <Card className="bg-gray-100">
              <CardContent>
                <div className="prose prose-sm">
                  <ReactMarkdown
                    components={{
                      a: ({ ...props }) => (
                        <a target="_blank" rel="noopener noreferrer" {...props} />
                      ),
                    }}
                  >
                    {answer}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}
          {isThinking && !answer && (
            <Card className="bg-gray-100">
              <CardContent>
                <p className="text-gray-400 italic">Thinking...</p>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
