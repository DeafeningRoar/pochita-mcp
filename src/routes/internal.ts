import type { Fact } from '../services/database';

import { Router } from 'express';
import { Supabase, TablesEnum } from '../services/database';
import { decrypt } from '../utils/encription';

const router = Router();

router.get('/facts/:targetId', async (req, res) => {
  const { targetId } = req.params;

  try {
    const dbClient = new Supabase();

    const currentFacts = await dbClient.select<Fact>(TablesEnum.FACTS, {
      filters: [{ field: 'target_id', operator: 'eq', value: targetId }],
    });

    if (!currentFacts?.length) {
      res.send();
      return;
    }

    const { name } = currentFacts[0];

    const template = `[ID:${targetId}] [Name:${name || 'unknown'}]: `;

    const facts = currentFacts
      .reduce((acc, { id, fact }, index) => {
        acc += ` [ID:${id}] ${decrypt(fact)}`;

        if (index !== currentFacts.length - 1) {
          acc += ',';
        }

        return acc;
      }, template)
      .trim();

    res.send(facts);
  } catch (error: unknown) {
    console.error('Error getting facts', { targetId }, error);

    res.status(500).send(error);
  }
});

export default router;
