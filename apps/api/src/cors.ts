declare const process: {
  env: { CORS_ORIGIN?: string; NODE_ENV?: string };
};

import { INestApplication } from '@nestjs/common';

export function configureCors(app: INestApplication): void {
  const corsOrigin = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (corsOrigin?.length) {
    app.enableCors({ origin: corsOrigin, credentials: true });
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin: 'http://localhost:3000', credentials: true });
  }
}
