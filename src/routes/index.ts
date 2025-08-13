import { Router } from 'express';

const router = Router();

import internalRoutes from './internal';

router.use('/internal', internalRoutes);

export default router;
