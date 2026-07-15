declare global {
  namespace Cloudflare {
    interface Env {
      THEOLOGAI_CCEL_COORDINATOR: DurableObjectNamespace<
        import('../../src/http/worker/CcelGlobalCoordinator.js').CcelGlobalCoordinator
      >;
    }
  }
}

export {};
