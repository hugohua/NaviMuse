
import { metadataQueue } from '../src/services/queue/metadataQueue';
import { metadataRepo } from '../src/db'; // Ensure connection is established if needed, though queue is standalone

async function clean() {
    console.log("Flushing 'metadata-generation' queue...");

    // Obscure BullMQ API, but 'obliterate' is the nuclear option.
    // Or 'drain'
    await metadataQueue.obliterate({ force: true });

    console.log("Queue obliterated.");
    process.exit(0);
}

clean().catch(e => {
    console.error(e);
    process.exit(1);
});
