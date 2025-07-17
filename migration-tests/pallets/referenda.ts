import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { Codec } from '@polkadot/types/types';
import type { StorageKey, u32 } from '@polkadot/types';
import { ApiDecoration } from '@polkadot/api/types';
import { ReferendumInfo } from '@polkadot/types/interfaces/democracy/types.js';

export const referendaTests: MigrationTest = {
    name: 'referenda_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        // Check pre-AH is empty
        const ah_referendumCount = await ah_api_before.query.referenda.referendumCount();
        assert.equal(
            (ah_referendumCount as any).toNumber(),
            0,
            'Referendum count should be 0 on AH before the migration'
        );

        const ah_decidingCount = await ah_api_before.query.referenda.decidingCount.entries();
        assert(
            ah_decidingCount.length === 0,
            'Deciding count map should be empty on AH before the migration'
        );

        const ah_trackQueue = await ah_api_before.query.referenda.trackQueue.entries();
        assert(
            ah_trackQueue.length === 0,
            'Track queue map should be empty on AH before the migration'
        );

        const ah_metadata = await ah_api_before.query.referenda.metadataOf.entries();
        assert(
            ah_metadata.length === 0,
            'MetadataOf map should be empty on AH before the migration'
        );

        const ah_referendumInfo = await ah_api_before.query.referenda.referendumInfoFor.entries();
        assert(
            ah_referendumInfo.length === 0,
            'Referendum info for map should be empty on AH before the migration'
        );

        // Collect RC data
        const referendumCount = await rc_api_before.query.referenda.referendumCount();
        const decidingCount = await rc_api_before.query.referenda.decidingCount.entries();
        const trackQueue = await rc_api_before.query.referenda.trackQueue.entries();
        const metadata = await rc_api_before.query.referenda.metadataOf.entries();
        const referendumInfo = await rc_api_before.query.referenda.referendumInfoFor.entries();

        return {
            rc_pre_payload: {
                referendumCount,
                decidingCount,
                trackQueue,
                metadata,
                referendumInfo
            },
            ah_pre_payload: undefined
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;
        const { 
            referendumCount: rc_referendumCount,
            decidingCount: rc_decidingCount,
            trackQueue: rc_trackQueue,
            metadata: rc_metadata,
            referendumInfo: rc_referendumInfo 
        } = pre_payload.rc_pre_payload;

        // Verify RC storage is empty after migration
        await verifyRcStorageEmpty(rc_api_after);

        // Verify AH storage matches RC pre-migration data
        await verifyAhStorageMatchesRcPreMigrationData(
            ah_api_after,
            rc_referendumCount,
            rc_decidingCount,
            rc_trackQueue,
            rc_metadata,
            rc_referendumInfo
        );
    }
};

async function verifyRcStorageEmpty(rc_api_after: ApiDecoration<'promise'>): Promise<void> {
    // Check RC is empty after migration
    assert.equal(
        ((await rc_api_after.query.referenda.referendumCount()) as any).toNumber(),
        0,
        'Referendum count should be 0 after migration'
    );

    assert(
        (await rc_api_after.query.referenda.decidingCount.entries()).length === 0,
        'Deciding count should be empty after migration'
    );

    assert(
        (await rc_api_after.query.referenda.trackQueue.entries()).length === 0,
        'Track queue should be empty after migration'
    );

    assert(
        (await rc_api_after.query.referenda.metadataOf.entries()).length === 0,
        'Metadata should be empty after migration'
    );

    assert(
        (await rc_api_after.query.referenda.referendumInfoFor.entries()).length === 0,
        'Referendum info should be empty after migration'
    );
}

async function verifyAhStorageMatchesRcPreMigrationData(
    ah_api_after: ApiDecoration<'promise'>,
    rc_referendumCount: u32,
    rc_decidingCount: [StorageKey, u32][],
    rc_trackQueue: [StorageKey, Codec][],
    rc_metadata: [StorageKey, Codec][],
    rc_referendumInfo: [StorageKey, ReferendumInfo][]
): Promise<void> {
    // Check referendum count matches RC pre-migration value
    const ah_referendumCount = await ah_api_after.query.referenda.referendumCount();
    assert.equal(
        (ah_referendumCount as any).toNumber(),
        (rc_referendumCount as any).toNumber(),
        'ReferendumCount on AH post migration should match the pre migration RC value'
    );

    // Check deciding count
    const ah_after_decidingCount = await ah_api_after.query.referenda.decidingCount.entries();
    verifyDecidingCount(rc_decidingCount, ah_after_decidingCount as unknown as [StorageKey, Codec][]);

    // Check track queue
    const ah_after_trackQueue = await ah_api_after.query.referenda.trackQueue.entries();
    verifyTrackQueue(rc_trackQueue, ah_after_trackQueue as unknown as [StorageKey, Codec][]);

    // Check metadata
    const ah_after_metadata = await ah_api_after.query.referenda.metadataOf.entries();
    verifyMetadata(rc_metadata, ah_after_metadata as unknown as [StorageKey, Codec][]);

    // Check referendum info
    const ah_after_referendumInfo = await ah_api_after.query.referenda.referendumInfoFor.entries();
    await verifyReferendumInfo(ah_api_after, rc_referendumInfo, ah_after_referendumInfo as unknown as [StorageKey, Codec][]);
}

function verifyDecidingCount(rc_before_decidingCount: [StorageKey, Codec][], ah_after_decidingCount: [StorageKey, Codec][]): void {
    // Check deciding count length and values
    assert.equal(
        ah_after_decidingCount.length,
        rc_before_decidingCount.length,
        'DecidingCount length on AH post migration should match the pre migration RC length'
    );

    // Compare deciding count entries
    const ah_decidingCount_sorted = ah_after_decidingCount.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
        a[0].args[0].toString().localeCompare(b[0].args[0].toString())
    );
    const rc_decidingCount_sorted = rc_before_decidingCount.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
        a[0].args[0].toString().localeCompare(b[0].args[0].toString())
    );

    assert.deepStrictEqual(
        ah_decidingCount_sorted.map(([_key, value]: [StorageKey, Codec]) => value.toJSON()),
        rc_decidingCount_sorted.map(([_key, value]: [StorageKey, Codec]) => value.toJSON()),
        'DecidingCount on AH post migration should match the pre migration RC value'
    );
}

function verifyTrackQueue(rc_before_trackQueue: [StorageKey, Codec][], ah_after_trackQueue: [StorageKey, Codec][]): void {
    // Check track queue length and values
    assert.equal(
        ah_after_trackQueue.length,
        rc_before_trackQueue.length,
        'TrackQueue length on AH post migration should match the pre migration RC length'
    );

    // Compare track queue entries
    const ah_trackQueue_sorted = ah_after_trackQueue.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
        a[0].args[0].toString().localeCompare(b[0].args[0].toString())
    );
    const rc_trackQueue_sorted = rc_before_trackQueue.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
        a[0].args[0].toString().localeCompare(b[0].args[0].toString())
    );

    assert.deepStrictEqual(
        ah_trackQueue_sorted.map(([_key, value]: [StorageKey, Codec]) => value.toJSON()),
        rc_trackQueue_sorted.map(([_key, value]: [StorageKey, Codec]) => value.toJSON()),
        'TrackQueue on AH post migration should match the pre migration RC value'
    );
}

function verifyMetadata(rc_before_metadata: [StorageKey, Codec][], ah_after_metadata: [StorageKey, Codec][]): void {
    // Check metadata length and values
    assert.equal(
        ah_after_metadata.length,
        rc_before_metadata.length,
        'MetadataOf length on AH post migration should match the pre migration RC length'
    );

    // Compare metadata entries
    const ah_metadata_sorted = ah_after_metadata.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
        a[0].args[0].toString().localeCompare(b[0].args[0].toString())
    );
    const rc_metadata_sorted = rc_before_metadata.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
        a[0].args[0].toString().localeCompare(b[0].args[0].toString())
    );

    assert.deepStrictEqual(
        ah_metadata_sorted.map(([_key, value]: [StorageKey, Codec]) => value.toJSON()),
        rc_metadata_sorted.map(([_key, value]: [StorageKey, Codec]) => value.toJSON()),
        'MetadataOf on AH post migration should match the pre migration RC value'
    );
}

// reference implementation from Rust code: 
// https://github.com/polkadot-fellows/runtimes/blob/6048e1c18f36a9e00ea396d39b456f5e92ba1552/pallets/ah-migrator/src/referenda.rs#L371C3-L491C4
async function verifyReferendumInfo(ah_api_after: ApiDecoration<'promise'>, rc_before_referendumInfo: [StorageKey, Codec][], ah_after_referendumInfo: [StorageKey, Codec][]): Promise<void> {
    // Convert RC referenda to expected AH format
    const expectedAhReferenda = await Promise.all(rc_before_referendumInfo.map(async ([key, rcInfo]) => {
        const refIndex = key.args[0].toString();
        const convertedInfo = await convert_rc_to_ah_referendum(ah_api_after, rcInfo);
        return [refIndex, convertedInfo] as [string, Codec];
    }));

    // Get current AH referenda
    const currentAhReferenda = ah_after_referendumInfo.map(([key, info]) => {
        const refIndex = key.args[0].toString();
        return [refIndex, info] as [string, Codec];
    });

    // Check length matches
    assert.equal(currentAhReferenda.length, expectedAhReferenda.length,
        'ReferendumInfoFor length on AH post migration should match the RC length post conversion');

    // Sort by referendum index to ensure consistent ordering
    currentAhReferenda.sort((a, b) => a[0].localeCompare(b[0]));
    expectedAhReferenda.sort((a, b) => a[0].localeCompare(b[0]));

    // Check each referendum matches
    for (let i = 0; i < currentAhReferenda.length; i++) {
        const [currentIndex, currentInfo] = currentAhReferenda[i];
        const [expectedIndex, expectedInfo] = expectedAhReferenda[i];
        
        assert(
            referendumsEqual(currentInfo, expectedInfo),
            `ReferendumInfoFor mismatch for ref ${currentIndex}`
        );
    }
}

async function convert_rc_to_ah_referendum(ah_api_after: ApiDecoration<'promise'>, rcInfo: Codec): Promise<Codec> {
    const rcInfoJson = rcInfo.toJSON() as any;
    
    // Handle different referendum states
    if (rcInfoJson.Ongoing) {
        const rcStatus = rcInfoJson.Ongoing;

        // Try to convert RC proposal/call
        const ah_proposal = await map_rc_ah_call(ah_api_after, rcStatus);
        if (!ah_proposal) {
            // Call conversion failed, return cancelled
            const now = get_current_block_number();
            return create_cancelled_referendum(now, rcStatus.submission_deposit, rcStatus.decision_deposit);
        }

        // Construct the AH status using converted parts
        const ah_status = {
            track: rcStatus.track,
            // unlike Rust, there is no need to convert origin here; json are mapped 1:1
            origin: rcStatus.origin,
            proposal: ah_proposal,
            enactment: rcStatus.enactment,
            submitted: rcStatus.submitted,
            submission_deposit: rcStatus.submission_deposit,
            decision_deposit: rcStatus.decision_deposit,
            deciding: rcStatus.deciding,
            tally: rcStatus.tally,
            in_queue: rcStatus.in_queue,
            alarm: rcStatus.alarm,
        };

        return create_ongoing_referendum(ah_status);
    } else if (rcInfoJson.Approved) {
        return rcInfo; // No conversion needed
    } else if (rcInfoJson.Rejected) {
        return rcInfo; // No conversion needed
    } else if (rcInfoJson.Cancelled) {
        return rcInfo; // No conversion needed
    } else if (rcInfoJson.TimedOut) {
        return rcInfo; // No conversion needed
    } else if (rcInfoJson.Killed) {
        return rcInfo; // No conversion needed
    }

    return rcInfo;
}

// Helper function to convert RC call to AH call
async function map_rc_ah_call(ah_api_after: ApiDecoration<'promise'>, rcStatus: any): Promise<any | null> {
    const encodedCall = await fetch_preimage(ah_api_after, rcStatus);
    if (!encodedCall) {
        return null;
    }

    return convert_rc_to_ah_call(ah_api_after, encodedCall)
}

async function convert_rc_to_ah_call(ah_api_after: ApiDecoration<'promise'>, encodedCall: any): Promise<any | null> {
    // TODO: implement decode(encodedCall) then map(decodedCall)
    //  https://github.com/polkadot-fellows/runtimes/blob/6048e1c18f36a9e00ea396d39b456f5e92ba1552/system-parachains/asset-hubs/asset-hub-polkadot/src/ah_migration/mod.rs#L238-L360
    return encodedCall;
}

async function fetch_preimage(ah_api_after: ApiDecoration<'promise'>, rcStatus: any): Promise<any> {
    if (rcStatus.proposal.inline) {
        return rcStatus.proposal.inline;
    } else if (rcStatus.proposal.lookup) {
        return await ah_api_after.query.preimage.preimageFor(rcStatus.proposal.lookup.hash, rcStatus.proposal.lookup.len);
    } else if (rcStatus.proposal.legacy) {
        return await ah_api_after.query.preimage.preimageFor(rcStatus.proposal.legacy.hash, null);
    } else {
        return null;
    }
}

// Helper function to create a cancelled referendum
function create_cancelled_referendum(now: number, submission_deposit: any, decision_deposit: any): any {
    return {
        Cancelled: [now, submission_deposit, decision_deposit]
    };
}

// Helper function to create an ongoing referendum
function create_ongoing_referendum(status: any): any {
    return {
        Ongoing: status
    };
}

// Helper function to get current block number
function get_current_block_number(): number {
    // TODO: this requires implementation later on too
    // For now, return a placeholder value
    return 1;
}

function referendumsEqual(ref1: Codec, ref2: Codec): boolean {
    const ref1Json = ref1.toJSON() as any;
    const ref2Json = ref2.toJSON() as any;
    
    // Special case: Cancelled vs Cancelled - ignore moment field
    if (ref1Json.Cancelled && ref2Json.Cancelled) {
        const cancelled1 = ref1Json.Cancelled;
        const cancelled2 = ref2Json.Cancelled;
        
        // Compare only the deposits, ignore the moment (block number)
        return cancelled1[1] === cancelled2[1] && cancelled1[2] === cancelled2[2];
    }
    
    // For other variants, compare the entire structure
    return JSON.stringify(ref1Json) === JSON.stringify(ref2Json);
}
