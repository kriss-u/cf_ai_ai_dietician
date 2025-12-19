/* eslint-disable */
declare namespace Cloudflare {
	interface Env {
		Chat: DurableObjectNamespace<import("./src/server").Chat>;
		AI: Ai;
		DB: D1Database;
		VECTORIZE: VectorizeIndex;
		WORKFLOW: Workflow;
	}
}
interface Env extends Cloudflare.Env {}
