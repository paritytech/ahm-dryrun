import { ApiDecoration } from '@polkadot/api/types';

export type PreCheckResult = {
    rc_pre_payload?: any;
    ah_pre_payload?: any;
};

export interface PreCheckContext {
    rc_api_before: ApiDecoration<'promise'>;
    ah_api_before: ApiDecoration<'promise'>;
}

export interface PostCheckContext {
    rc_api_after: ApiDecoration<'promise'>;
    ah_api_after: ApiDecoration<'promise'>;
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