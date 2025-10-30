import { runCrowdloanContributionTests } from './crowdloan_contribution.js';
import { logger } from '../../shared/logger.js';

// Handle unhandled promise rejections globally
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
    if (reason instanceof Error) {
        logger.error('Error message:', reason.message);
        logger.error('Error stack:', reason.stack);
    } else if (typeof reason === 'object' && reason !== null) {
        logger.error('Rejection details:', JSON.stringify(reason, null, 2));
    }
    // Don't exit immediately - let the main function handle cleanup
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', error);
    logger.error('Error message:', error.message);
    logger.error('Error stack:', error.stack);
    process.exit(1);
});

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

main().catch((error: any) => {
    logger.error('Unexpected error:', error);
    if (error?.message) {
        logger.error('Error message:', error.message);
    }
    if (error?.stack) {
        logger.error('Error stack:', error.stack);
    }
    process.exit(1);
});

