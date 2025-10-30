import { ApiDecoration } from '@polkadot/api/types';
import { ApiPromise } from '@polkadot/api';

export type PreCheckResult = {
    rc_pre_payload?: any;
    ah_pre_payload?: any;
};

export interface PreCheckContext {
    rc_api_before: ApiDecoration<'promise'>;
    ah_api_before: ApiDecoration<'promise'>;
    rc_api_full: ApiPromise;
    ah_api_full: ApiPromise;
}

export interface PostCheckContext {
    rc_api_after: ApiDecoration<'promise'>;
    ah_api_after: ApiDecoration<'promise'>;
    rc_api_full: ApiPromise;
    ah_api_full: ApiPromise;
    network?: string;
}

export interface TestContext {
    pre: PreCheckContext;
    post: PostCheckContext;
}

export interface MigrationTest {
    name: string;
    pre_check: (
        context: PreCheckContext
    ) => Promise<PreCheckResult>;
    
    post_check: (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ) => Promise<void>;
} 