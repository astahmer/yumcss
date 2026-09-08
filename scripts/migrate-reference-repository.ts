import { MIGRATION_PROOF_SCENARIO } from "./migration-proof-catalog.ts";
import { runMigrationProofCompat } from "./run-migration-proof.ts";

await runMigrationProofCompat(MIGRATION_PROOF_SCENARIO.ReferenceRepository, process.argv.slice(2));
