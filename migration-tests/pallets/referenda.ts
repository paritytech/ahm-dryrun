import '@polkadot/api-augment';
import assert from 'assert';
import { PreCheckContext, PostCheckContext, MigrationTest, PreCheckResult } from '../types.js';
import type { Codec } from '@polkadot/types/types';
import type { StorageKey } from '@polkadot/types';

export const referendaTests: MigrationTest = {
    name: 'referenda_pallet',
    pre_check: async (context: PreCheckContext): Promise<PreCheckResult> => {
        const { rc_api_before, ah_api_before } = context;

        // AH pre-check assertions
        const ah_referendumCount = await ah_api_before.query.referenda.referendumCount();
        assert.equal(
            ah_referendumCount.toNumber(),
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
        const rc_referendumCount = await rc_api_before.query.referenda.referendumCount();
        const rc_decidingCount = await rc_api_before.query.referenda.decidingCount.entries();
        const rc_trackQueue = await rc_api_before.query.referenda.trackQueue.entries();
        const rc_metadata = await rc_api_before.query.referenda.metadataOf.entries();
        const rc_referendumInfo = await rc_api_before.query.referenda.referendumInfoFor.entries();

        return {
            rc_pre_payload: {
                referendumCount: rc_referendumCount,
                decidingCount: rc_decidingCount,
                trackQueue: rc_trackQueue,
                metadata: rc_metadata,
                referendumInfo: rc_referendumInfo
            },
            ah_pre_payload: undefined
        };
    },

    post_check: async (
        context: PostCheckContext,
        pre_payload: PreCheckResult
    ): Promise<void> => {
        const { rc_api_after, ah_api_after } = context;

        // Check RC is empty after migration
        const rc_referendumCount_after = await rc_api_after.query.referenda.referendumCount();
        assert.equal(
            rc_referendumCount_after.toNumber(),
            0,
            'Referendum count should be 0 after migration'
        );

        const rc_decidingCount_after = await rc_api_after.query.referenda.decidingCount.entries();
        assert(
            rc_decidingCount_after.length === 0,
            'Deciding count should be empty after migration'
        );

        const rc_trackQueue_after = await rc_api_after.query.referenda.trackQueue.entries();
        assert(
            rc_trackQueue_after.length === 0,
            'Track queue should be empty after migration'
        );

        const rc_metadata_after = await rc_api_after.query.referenda.metadataOf.entries();
        assert(
            rc_metadata_after.length === 0,
            'Metadata should be empty after migration'
        );

        const rc_referendumInfo_after = await rc_api_after.query.referenda.referendumInfoFor.entries();
        assert(
            rc_referendumInfo_after.length === 0,
            'Referendum info should be empty after migration'
        );

        // Check AH consistency with RC pre-migration state

        const { 
            referendumCount: rc_referendumCount,
            decidingCount: rc_decidingCount,
            trackQueue: rc_trackQueue,
            metadata: rc_metadata,
            referendumInfo: rc_referendumInfo 
        } = pre_payload.rc_pre_payload;
        
        // Check referendum count matches RC pre-migration value
        const ah_referendumCount = await ah_api_after.query.referenda.referendumCount();
        console.log('ah_referendumCount: ', ah_referendumCount.toNumber());
        console.log('rc_referendumCount: ', rc_referendumCount.toNumber());
        // assert.equal(
        //     ah_referendumCount.toNumber(),
        //     rc_referendumCount.toNumber(),
        //     'ReferendumCount on AH post migration should match the pre migration RC value'
        // );

        // Check deciding count length and values
        const ah_decidingCount = await ah_api_after.query.referenda.decidingCount.entries();
        // assert.equal(
        //     ah_decidingCount.length,
        //     rc_decidingCount.length,
        //     'DecidingCount length on AH post migration should match the pre migration RC length'
        // );

        // Compare deciding count entries
        const ah_decidingCount_sorted = ah_decidingCount.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
            a[0].args[0].toString().localeCompare(b[0].args[0].toString())
        );
        const rc_decidingCount_sorted = rc_decidingCount.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
            a[0].args[0].toString().localeCompare(b[0].args[0].toString())
        );
        
        // assert.deepStrictEqual(
        //     ah_decidingCount_sorted.map(([_key, value]: [StorageKey, Codec]) => value.toJSON()),
        //     rc_decidingCount_sorted.map(([_key, value]: [StorageKey, Codec]) => value.toJSON()),
        //     'DecidingCount on AH post migration should match the pre migration RC value'
        // );

        // Check track queue length and values
        const ah_trackQueue = await ah_api_after.query.referenda.trackQueue.entries();
        assert.equal(
            ah_trackQueue.length,
            rc_trackQueue.length,
            'TrackQueue length on AH post migration should match the pre migration RC length'
        );

        // Compare track queue entries
        const ah_trackQueue_sorted = ah_trackQueue.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
            a[0].args[0].toString().localeCompare(b[0].args[0].toString())
        );
        const rc_trackQueue_sorted = rc_trackQueue.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
            a[0].args[0].toString().localeCompare(b[0].args[0].toString())
        );
        assert.deepStrictEqual(
            ah_trackQueue_sorted.map(([_key, value]: [StorageKey, Codec]) => value.toJSON()),
            rc_trackQueue_sorted.map(([_key, value]: [StorageKey, Codec]) => value.toJSON()),
            'TrackQueue on AH post migration should match the pre migration RC value'
        );

        // Check metadata length and values
        const ah_metadata = await ah_api_after.query.referenda.metadataOf.entries();
        assert.equal(
            ah_metadata.length,
            rc_metadata.length,
            'MetadataOf length on AH post migration should match the pre migration RC length'
        );

        // Compare metadata entries
        const ah_metadata_sorted = ah_metadata.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
            a[0].args[0].toString().localeCompare(b[0].args[0].toString())
        );
        const rc_metadata_sorted = rc_metadata.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
            a[0].args[0].toString().localeCompare(b[0].args[0].toString())
        );
        assert.deepStrictEqual(
            ah_metadata_sorted.map(([_key, value]: [StorageKey, Codec]) => value.toJSON()),
            rc_metadata_sorted.map(([_key, value]: [StorageKey, Codec]) => value.toJSON()),
            'MetadataOf on AH post migration should match the pre migration RC value'
        );

        // Check referendum info length and values
        const ah_referendumInfo = await ah_api_after.query.referenda.referendumInfoFor.entries();
        assert.equal(
            ah_referendumInfo.length,
            rc_referendumInfo.length,
            'ReferendumInfoFor length on AH post migration should match the RC length post conversion'
        );

        // Sort referendum info entries by index for comparison
        const ah_referendumInfo_sorted = ah_referendumInfo.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
            a[0].args[0].toString().localeCompare(b[0].args[0].toString())
        );
        const rc_referendumInfo_sorted = rc_referendumInfo.sort((a: [StorageKey, Codec], b: [StorageKey, Codec]) => 
            a[0].args[0].toString().localeCompare(b[0].args[0].toString())
        );

        // // Compare referendum info entries, with special handling for Cancelled variants
        // for (let i = 0; i < ah_referendumInfo_sorted.length; i++) {
        //     const ah_info = ah_referendumInfo_sorted[i][1].toJSON();
        //     const rc_info = rc_referendumInfo_sorted[i][1].toJSON();

        //     // Special handling for Cancelled variants - compare only deposits
        //     if (ah_info?.Cancelled && rc_info?.Cancelled) {
        //         assert.deepStrictEqual(
        //             [ah_info.Cancelled[1], ah_info.Cancelled[2]],
        //             [rc_info.Cancelled[1], rc_info.Cancelled[2]],
        //             `ReferendumInfoFor deposits mismatch for ref ${ah_referendumInfo_sorted[i][0].args[0].toString()}`
        //         );
        //     } else {
        //         // For other variants, compare the entire object
        //         assert.deepStrictEqual(
        //             ah_info,
        //             rc_info,
        //             `ReferendumInfoFor mismatch for ref ${ah_referendumInfo_sorted[i][0].args[0].toString()}`
        //         );
        //     }
        // }
    }
};
