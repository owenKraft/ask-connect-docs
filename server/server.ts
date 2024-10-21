import express, { Request, Response, NextFunction } from 'express';
import { answerQuestion } from '../scripts/questionAnswering';

const app = express();
const port = 3001;

app.use(express.json());

const handleAnswer = async (req: Request, res: Response, next: NextFunction) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const answer = await answerQuestion(question);
    res.json({ answer });
  } catch (error) {
    next(error);
  }
};

app.post('/api/answer', (req: Request, res: Response, next: NextFunction) => {
  handleAnswer(req, res, next).catch(next);
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error processing question:', err);
  res.status(500).json({ error: 'An error occurred while processing your question' });
});

app.listen(port, () => {
  console.log(`API Server running at http://localhost:${port}`);
});
