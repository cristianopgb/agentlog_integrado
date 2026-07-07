declare const process: {
  env: { API_PORT?: string; CORS_ORIGIN?: string; NODE_ENV?: string };
};

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.API_PORT ?? 3001);
  const corsOrigin = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (corsOrigin?.length) {
    app.enableCors({ origin: corsOrigin, credentials: true });
  } else if (process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin: 'http://localhost:3000', credentials: true });
  }

  await app.listen(port);
}

void bootstrap();
