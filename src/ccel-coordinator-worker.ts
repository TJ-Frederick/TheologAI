/** Non-public owner entrypoint for the one global CCEL origin coordinator. */
export { CcelGlobalCoordinator } from './http/worker/CcelGlobalCoordinator.js';

// workers_dev is false and no route is configured. This handler is defense in
// depth if the script is ever accidentally attached to a route.
export default {
  fetch(): Response {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  },
} satisfies ExportedHandler;
