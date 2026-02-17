import { Router } from 'express';
import { ZodError } from 'zod';
import { generateContractText } from '../services/openaiService';
import { aiGenerateSchema } from '../validators/contractValidators';

export const aiRouter = Router();

aiRouter.post('/generate', async (req, res) => {
  try {
    const payload = aiGenerateSchema.parse(req.body);
    const generated = await generateContractText(payload);
    return res.json(generated);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.flatten() });
    }
    console.error(error);
    return res.status(500).json({ error: 'Failed to generate contract' });
  }
});
