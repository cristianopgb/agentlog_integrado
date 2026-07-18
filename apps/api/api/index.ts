import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureCors } from '../src/cors';

type ExpressServer = (req: unknown, res: unknown) => unknown;

let cachedServer: ExpressServer | undefined;

async function createServer(): Promise<ExpressServer> {
  if (cachedServer) {
    return cachedServer;
  }

  try {
    const adapter = new ExpressAdapter();
    const app = await NestFactory.create(AppModule, adapter);

    configureCors(app);

    await app.init();
    cachedServer = adapter.getInstance() as ExpressServer;

    return cachedServer;
  } catch (error) {
    console.error('Failed to bootstrap API server.', error);
    throw error;
  }
}

export default async function handler(req: unknown, res: unknown) {
  const server = await createServer();

  return server(req, res);
}
