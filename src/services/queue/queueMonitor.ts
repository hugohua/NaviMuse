import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { metadataQueue } from './metadataQueue';

export const initQueueDashboard = () => {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
        queues: [
            new BullMQAdapter(metadataQueue)
        ],
        serverAdapter: serverAdapter,
    });

    return serverAdapter.getRouter();
};
