import { Router } from 'express';
import { ZodError } from 'zod';
import { OpenAIConfigurationError, generateContractText } from '../services/openaiService';
import { aiGenerateLegacySchema, aiGenerateSchema } from '../validators/contractValidators';

export const aiRouter = Router();

const detectLanguage = (text: string): 'he' | 'en' => {
  return /[\u0590-\u05FF]/.test(text) ? 'he' : 'en';
};

aiRouter.post('/generate', async (req, res) => {
  try {
    const modernPayload = aiGenerateSchema.safeParse(req.body);

    const payload = modernPayload.success
      ? modernPayload.data
      : (() => {
          const legacy = aiGenerateLegacySchema.parse(req.body);
          return {
            prompt: legacy.contractText,
            language: detectLanguage(legacy.contractText),
            signers: [{ name: 'Signer 1' }]
          };
        })();

    const generated = await generateContractText(payload);
    return res.json(generated);
  } catch (error) {
    if (error instanceof OpenAIConfigurationError) {
      return res.status(503).json({
        error: 'AI generation is unavailable: OPENAI_API_KEY is missing. Add a valid OpenAI API key in the server environment.'
      });
    }
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.flatten() });
    }
    console.error(error);
    return res.status(500).json({ error: 'Failed to generate contract' });
  }
});
