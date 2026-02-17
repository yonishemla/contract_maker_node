import OpenAI from 'openai';
import { env } from '../config';

const client = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

type GenerateInput = {
  prompt: string;
  language: 'he' | 'en';
  signers: { name: string }[];
};

const buildFallback = (input: GenerateInput) => {
  const signerRows = input.signers
    .map(
      (signer, index) =>
        `(${index + 1}) ${signer.name} / {{SIGNER_${index + 1}_NAME}}  Signature: {{SIGNER_${index + 1}_SIGNATURE}}  Date: {{SIGNER_${index + 1}_DATE}}`
    )
    .join('\n');

  return {
    title: input.language === 'he' ? 'הסכם שירותים' : 'Services Agreement',
    contractText: `${input.prompt}\n\n--- SIGNERS ---\n${signerRows}\n\nNot legal advice`
  };
};

export const generateContractText = async (input: GenerateInput) => {
  if (!client) {
    return buildFallback(input);
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
    return buildFallback(input);
  }

  const titleMatch = text.match(/TITLE:\s*(.+)/);
  const textIndex = text.indexOf('TEXT:');

  if (!titleMatch || textIndex === -1) {
    return buildFallback(input);
  }

  return {
    title: titleMatch[1].trim(),
    contractText: text.slice(textIndex + 5).trim()
  };
};
