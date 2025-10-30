import { runCrowdloanContributionTests } from './crowdloan_contribution.js';
import { logger } from '../../shared/logger.js';

const main = async () => {
    try {
        await runCrowdloanContributionTests();
        process.exit(0);
    } catch (error: any) {
        logger.error('❌ Tests failed:', error);
        if (error?.message) {
            logger.error('Error message:', error.message);
        }
        if (error?.stack) {
            logger.error('Error stack:', error.stack);
        }
        process.exit(1);
    }
};

main();

