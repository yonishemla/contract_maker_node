import OpenAI from 'openai';
import { env } from '../config';

const client = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export class OpenAIConfigurationError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not configured');
    this.name = 'OpenAIConfigurationError';
  }
}

type GenerateInput = {
  prompt: string;
  language: 'he' | 'en';
  signers: { name: string }[];
};

export const generateContractText = async (input: GenerateInput) => {
  if (!client) {
    throw new OpenAIConfigurationError();
  }

  const signerInstructions = input.signers
    .map((s, i) => `${i + 1}. ${s.name} => {{SIGNER_${i + 1}_NAME}}, {{SIGNER_${i + 1}_SIGNATURE}}, {{SIGNER_${i + 1}_DATE}}`)
    .join('\n');

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: `Create a ${input.language === 'he' ? 'Hebrew' : 'English'} contract draft from this request:\n${input.prompt}\n\nReturn in this exact format:\nTITLE: <title>\nTEXT:\n<contract body>\n\nRules:\n- Include this exact section at the end:\n--- SIGNERS ---\n${signerInstructions}\n- Add a final line: Not legal advice`
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error('OpenAI returned an empty response');
  }

  const titleMatch = text.match(/TITLE:\s*(.+)/);
  const textIndex = text.indexOf('TEXT:');

  if (!titleMatch || textIndex === -1) {
    return {
      title: input.language === 'he' ? 'הסכם שירותים' : 'Services Agreement',
      contractText: text
    };
  }

  return {
    title: titleMatch[1].trim(),
    contractText: text.slice(textIndex + 5).trim()
  };
};
