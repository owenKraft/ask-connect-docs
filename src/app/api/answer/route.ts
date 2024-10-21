import { NextRequest, NextResponse } from 'next/server';
import { answerQuestion } from '../../../../scripts/questionAnswering';

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    console.log("Received question:", question);
    
    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const answer = await answerQuestion(question);
    console.log("Answer:", answer);
    
    return NextResponse.json({ answer });
  } catch (error) {
    console.error("Error in POST route:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
