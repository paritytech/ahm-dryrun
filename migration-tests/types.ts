import { ApiDecoration } from '@polkadot/api/types';

export interface PreCheckContext {
    rc_api_before: ApiDecoration<'promise'>;
    ah_api_before: ApiDecoration<'promise'>;
}

export interface PostCheckContext extends PreCheckContext {
    rc_api_after: ApiDecoration<'promise'>;
    ah_api_after: ApiDecoration<'promise'>;
}

export interface TestContext {
    pre: PreCheckContext;
    post: PostCheckContext;
}

export interface PalletTest {
    pallet_name: string;
    pre_check: (context: PreCheckContext) => Promise<void>;
    post_check: (context: PostCheckContext) => Promise<void>;
} 