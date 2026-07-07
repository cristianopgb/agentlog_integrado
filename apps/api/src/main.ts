declare const process: {
  env: { API_PORT?: string };
};

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureCors } from './cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.API_PORT ?? 3001);

  configureCors(app);

  await app.listen(port);
}

void bootstrap();
