import { createWaitlistService } from "./waitlist.js";

export default {
  async fetch(request, runtime) {
    const service = createWaitlistService({
      db: runtime.DB,
      logger: console,
      clock: () => new Date(),
    });

    return service.handleRequest(request);
  },
};
