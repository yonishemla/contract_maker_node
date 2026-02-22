import { z } from 'zod';

export const languageSchema = z.enum(['he', 'en']);

export const aiGenerateSchema = z.object({
  prompt: z.string().min(10),
  language: languageSchema,
  signers: z.array(z.object({ name: z.string().min(1) })).min(1)
});

export const aiGenerateLegacySchema = z.object({
  title: z.string().min(1),
  contractText: z.string().min(10)
});

export const createContractSchema = z.object({
  title: z.string().min(1),
  contractText: z.string().min(1),
  language: languageSchema,
  creatorEmail: z.string().email().optional(),
  signers: z.array(
    z.object({
      name: z.string().min(1),
      email: z.string().email()
    })
  ).min(1)
});

export const signContractSchema = z.object({
  signatureDataUrl: z.string().startsWith('data:image/png;base64,')
});
