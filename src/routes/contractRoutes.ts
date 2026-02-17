import crypto from 'crypto';
import { Router } from 'express';
import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { ZodError } from 'zod';
import { pool } from '../db';
import { sendFinalContractEmail, sendSigningLinkEmail } from '../services/mailService';
import { generateFinalContractPdfBase64 } from '../services/pdfService';
import { createContractSchema, signContractSchema } from '../validators/contractValidators';

type ContractRow = RowDataPacket & {
  id: string;
  title: string;
  contract_text: string;
  creator_email: string | null;
  status: 'draft' | 'sent' | 'completed';
  final_pdf_data: string | null;
};

type SignerRow = RowDataPacket & {
  id: string;
  contract_id: string;
  signer_index: number;
  name: string;
  email: string;
  token: string;
  signed_at: string | null;
  signature_data_url: string | null;
  signature_hash: string | null;
};

export const contractRouter = Router();

contractRouter.post('/', async (req, res) => {
  try {
    const payload = createContractSchema.parse(req.body);
    const contractId = uuidv4();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO contracts (id, creator_email, language, title, contract_text, status)
         VALUES (?, ?, ?, ?, ?, 'draft')`,
        [contractId, payload.creatorEmail ?? null, payload.language, payload.title, payload.contractText]
      );

      for (const [index, signer] of payload.signers.entries()) {
        await conn.execute(
          `INSERT INTO signers (id, contract_id, signer_index, name, email, token)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), contractId, index + 1, signer.name, signer.email, crypto.randomBytes(32).toString('hex')]
        );
      }

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    return res.status(201).json({ contractId });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.flatten() });
    }
    console.error(error);
    return res.status(500).json({ error: 'Failed to create contract' });
  }
});

contractRouter.post('/:id/send', async (req, res) => {
  try {
    const { id } = req.params;
    const [signers] = await pool.query<SignerRow[]>('SELECT * FROM signers WHERE contract_id = ? ORDER BY signer_index ASC', [id]);

    if (!signers.length) {
      return res.status(404).json({ error: 'Contract not found or has no signers' });
    }

    await pool.execute('UPDATE contracts SET status = ? WHERE id = ?', ['sent', id]);

    for (const signer of signers) {
      await sendSigningLinkEmail({ email: signer.email, name: signer.name }, id, signer.token);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to send contract links' });
  }
});

contractRouter.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const [[contract]] = await pool.query<ContractRow[]>('SELECT * FROM contracts WHERE id = ?', [id]);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const [signers] = await pool.query<SignerRow[]>(
      'SELECT signer_index, name, email, signed_at FROM signers WHERE contract_id = ? ORDER BY signer_index ASC',
      [id]
    );

    return res.json({
      id: contract.id,
      title: contract.title,
      creatorEmail: contract.creator_email,
      status: contract.status,
      finalPdfAvailable: Boolean(contract.final_pdf_data),
      signers: signers.map((s) => ({ index: s.signer_index, name: s.name, email: s.email, signed_at: s.signed_at }))
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch status' });
  }
});


contractRouter.get('/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const [[contract]] = await pool.query<ContractRow[]>('SELECT id, title, final_pdf_data FROM contracts WHERE id = ?', [id]);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (!contract.final_pdf_data) {
      return res.status(404).json({ error: 'Final PDF not available yet' });
    }

    return res.json({
      contractId: contract.id,
      title: contract.title,
      pdfBase64: contract.final_pdf_data
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch contract PDF' });
  }
});

contractRouter.get('/:id/public/:token', async (req, res) => {
  try {
    const { id, token } = req.params;
    const [[signer]] = await pool.query<SignerRow[]>('SELECT * FROM signers WHERE contract_id = ? AND token = ?', [id, token]);

    if (!signer) {
      return res.status(404).json({ error: 'Invalid token or contract ID' });
    }

    const [[contract]] = await pool.query<ContractRow[]>('SELECT id, title, contract_text, status FROM contracts WHERE id = ?', [id]);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    return res.json({
      title: contract.title,
      contractText: contract.contract_text,
      signer: {
        index: signer.signer_index,
        name: signer.name,
        email: signer.email,
        signed_at: signer.signed_at
      },
      status: contract.status
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch contract view' });
  }
});

contractRouter.post('/:id/sign/:token', async (req, res) => {
  try {
    const payload = signContractSchema.parse(req.body);
    const { id, token } = req.params;

    const conn = await pool.getConnection();
    let completed = false;
    try {
      await conn.beginTransaction();

      const [[signer]] = await conn.query<SignerRow[]>(
        'SELECT * FROM signers WHERE contract_id = ? AND token = ? FOR UPDATE',
        [id, token]
      );
      if (!signer) {
        await conn.rollback();
        return res.status(404).json({ error: 'Invalid token or contract ID' });
      }

      const signatureHash = crypto.createHash('sha256').update(payload.signatureDataUrl).digest('hex');
      await conn.execute(
        'UPDATE signers SET signature_data_url = ?, signature_hash = ?, signed_at = NOW() WHERE id = ?',
        [payload.signatureDataUrl, signatureHash, signer.id]
      );

      const [signers] = await conn.query<SignerRow[]>(
        'SELECT * FROM signers WHERE contract_id = ? ORDER BY signer_index ASC FOR UPDATE',
        [id]
      );
      const everyoneSigned = signers.every((s) => Boolean(s.signed_at));

      if (everyoneSigned) {
        const [[contract]] = await conn.query<ContractRow[]>('SELECT * FROM contracts WHERE id = ? FOR UPDATE', [id]);

        const finalizedSigners = signers.map((s) =>
          s.id === signer.id
            ? { ...s, signed_at: new Date().toISOString().slice(0, 19).replace('T', ' '), signature_data_url: payload.signatureDataUrl }
            : s
        );

        const finalPdfBase64 = await generateFinalContractPdfBase64({
          title: contract.title,
          contractText: contract.contract_text,
          signers: finalizedSigners.map((s) => ({
            signerIndex: s.signer_index,
            name: s.name,
            email: s.email,
            signedAt: s.signed_at,
            signatureDataUrl: s.signature_data_url
          }))
        });

        await conn.execute('UPDATE contracts SET status = ?, final_pdf_data = ? WHERE id = ?', ['completed', finalPdfBase64, id]);
        completed = true;

        const recipients = finalizedSigners.map((s) => ({ email: s.email, name: s.name }));
        if (contract.creator_email) {
          recipients.push({ email: contract.creator_email });
        }
        await sendFinalContractEmail(recipients, contract.title, finalPdfBase64, id);
      }

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    return res.json({ ok: true, completed });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.flatten() });
    }
    console.error(error);
    return res.status(500).json({ error: 'Failed to sign contract' });
  }
});
