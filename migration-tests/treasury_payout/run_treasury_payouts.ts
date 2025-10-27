import { runTreasuryPayoutTests } from './treasury_payouts.js';
import { logger } from '../../shared/logger.js';

const main = async () => {
    const network = process.argv[2] || 'kusama';
    
    if (network !== 'kusama' && network !== 'polkadot') {
        logger.error('Invalid network. Please specify "kusama" or "polkadot"');
        process.exit(1);
    }
    
    try {
        await runTreasuryPayoutTests(network as 'kusama' | 'polkadot');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Tests failed:', error);
        process.exit(1);
    }
};

main().catch((error) => {
    logger.error('Unexpected error:', error);
    process.exit(1);
});
