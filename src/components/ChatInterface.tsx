'use client'

import { useState, FormEvent } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ChatInterface() {
  const [input, setInput] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [isThinking, setIsThinking] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen">
      <Card className="w-full max-w-md shadow-none bg-transparent border-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl font-bold text-center">Ask Connect docs</CardTitle>
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
          {isThinking && (
            <Card className="bg-gray-100">
              <CardContent>
                <p className="text-gray-400 italic">Thinking...</p>
              </CardContent>
            </Card>
          )}
          {!isThinking && answer && (
            <Card className="bg-gray-100">
              <CardContent>
                <p className="font-semibold">Connect docs:</p>
                <p>{answer}</p>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
