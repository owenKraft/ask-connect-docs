import { NextRequest } from 'next/server';
import { answerQuestion } from '../../../../scripts/questionAnswering';

export async function POST(req: NextRequest) {
  try {
    const { question, streaming } = await req.json();
    console.log("Received question:", question, "Streaming:", streaming);
    
    if (!question) {
      return new Response('Question is required', { status: 400 });
    }

    const response = await answerQuestion(question, streaming);
    
    if (streaming) {
      return new Response(response, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    return new Response(JSON.stringify({ answer: response }), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error("Error in POST route:", error);
    return new Response(
      JSON.stringify({ 
        error: "An error occurred while processing your question",
        details: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
