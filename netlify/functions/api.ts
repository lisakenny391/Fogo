import serverless from 'serverless-http';
import { createApp, setupRoutes } from '../../server/app';

let cachedHandler: any;

const createHandler = async () => {
  if (!cachedHandler) {
    const app = createApp();
    await setupRoutes(app);
    cachedHandler = serverless(app);
  }
  return cachedHandler;
};

export const handler = async (event: any, context: any) => {
  const serverlessHandler = await createHandler();
  return serverlessHandler(event, context);
};