import { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      isMockMode?: boolean;
      log: Logger;
    }
  }
}
