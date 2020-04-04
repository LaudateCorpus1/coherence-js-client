// Reference mocha-typescript's global definitions:
/// <reference path='../node_modules/mocha-typescript/globals.d.ts' />

import { expect } from 'chai';
import { suite, test, slow, timeout } from "mocha-typescript";

import { Extractors } from '../src/extractor/extractors';
import { Filters } from '../src/filter/filters';
import { Processors } from '../src/processor/processors';
import { Util } from '../src/util/util';
import { NamedCacheClient } from "../src/cache/named_cache_client";
import { SessionBuilder } from '../src/cache/session';

export const session = new SessionBuilder().build();
import {
    TestUtil,
    val123, val234, val345, val456,
    toObj, tscObj, trieObj, jadeObj, javascriptObj
} from './abstract_named_cache_tests';

describe("Processors IT Test Suite", () => {

    const versioned123 = { '@version': 1, id: 123, str: '123', ival: 123, fval: 12.3, iarr: [1, 2, 3] };
    const versioned234 = { '@version': 2, id: 234, str: '234', ival: 234, fval: 23.4, iarr: [2, 3, 4], nullIfOdd: 'non-null' };
    const versioned345 = { '@version': 3, id: 345, str: '345', ival: 345, fval: 34.5, iarr: [3, 4, 5] };
    const versioned456 = { '@version': 4, id: 456, str: '456', ival: 456, fval: 45.6, iarr: [4, 5, 6], nullIfOdd: 'non-null' };

    let cache: NamedCacheClient;
    let nested: NamedCacheClient;
    let versioned: NamedCacheClient;

    class ExtractorProcessorTestsSuiteBase {

        public static async before() {
            cache = session.getCache('client-cache');
            nested = session.getCache('nested-cache');
            versioned = session.getCache('versioned-cache');
        }

        public async before() {
            await cache.clear();
            await TestUtil.populateCache(cache);
            await ExtractorProcessorTestsSuiteBase.populateNestedCache(cache);
        }

        public static async after() {
            await cache.release();
            await nested.release();
            await versioned.release();
        }

        protected static async populateNestedCache(cache: NamedCacheClient) {
            await nested.clear();
            await nested.put('To', toObj);
            await nested.put('TypeScript', tscObj);
            await nested.put('Trie', trieObj);
            await nested.put('Jade', jadeObj);
            await nested.put('JavaScript', javascriptObj);

            await versioned.put("123", versioned123)
            await versioned.put("234", versioned234)
            await versioned.put("345", versioned345)
            await versioned.put("456", versioned456)
        }
    }

    class ExtractorProcessorTestsSuite
        extends ExtractorProcessorTestsSuiteBase {

        // ExtractorProcessor
        @test
        testTypeNameOfExtractorProcessor() {
            const processor = Processors.extract('str');
            expect(processor['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'ExtractorProcessor');
        }
        @test
        async testInvoke() {
            const processor = Processors.extract('id').andThen(Processors.extract('str'));
            const value = await cache.invoke('123', processor);

            expect(value.length).to.equal(2)
            expect(value).to.have.deep.members([123, '123']);
        }
        @test
        async testInvokeAllWithKeys() {
            const processor = Processors.extract('id').andThen(Processors.extract('str'));
            const result = await cache.invokeAll(new Set(['123', '234']), processor);

            expect(result.size).to.equal(2)
            expect(Array.from(result.keys())).to.have.deep.members(['123', '234']);
            expect(Array.from(result.values())).to.have.deep.members([[123, '123'], [234, '234']]);
        }
        @test
        async testInvokeAllWithFilter() {
            const processor = Processors.extract('id').andThen(Processors.extract('str'));
            const result = await cache.invokeAll(Filters.always(), processor);

            expect(result.size).to.equal(4)
            expect(Array.from(result.keys())).to.have.deep.members(['123', '234', '345', '456']);
            expect(Array.from(result.values())).to.have.deep.members([
                [123, '123'], [234, '234'], [345, '345'], [456, '456']
            ]);
        }
        @test
        async testInvokeAllWithExtractorFilter() {
            const processor = Processors.extract();
            const f1 = Filters.equal(Extractors.chained('j.a.v.word'), "JavaScript")
                .or(Filters.equal(Extractors.chained('j.a.d.word'), "Jade"));

            const result = await nested.invokeAll(f1, processor);
            expect(Array.from(result.keys()).length).to.equal(2);
            expect(Array.from(result.values()).length).to.equal(2);
            expect(Array.from(result.keys())).to.have.deep.members(['JavaScript', 'Jade']);
            expect(Array.from(result.values())).to.have.deep.members([javascriptObj, jadeObj]);
        }
    }

    // CompositeProcessor
    @suite(timeout(3000))
    class CompositeProcessorTestsSuite
        extends ExtractorProcessorTestsSuiteBase {

        @test
        testTypeName() {
            const ep = Processors.extract('id');
            expect(ep['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'ExtractorProcessor');

            const cp = ep.andThen(Processors.extract('str'))
                .andThen(Processors.extract('iVal'));
            expect(cp['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'CompositeProcessor');
        }
        @test
        async testInvoke() {
            const processor = Processors.extract('id').andThen(Processors.extract('str'));
            const value = await cache.invoke('123', processor);

            expect(value.length).to.equal(2)
            expect(value).to.have.deep.members([123, '123']);
        }
        @test
        async testInvokeAllWithContainsAnyFilter() {
            const filter = Filters.arrayContainsAny(Extractors.extract('iarr'), [1, 2])
            const processor = Processors.extract('id').andThen(Processors.extract('str'));

            const result = await cache.invokeAll(filter, processor);
            //        expect(Array.from(result.keys())).to.have.deep.members(['123', '234', '345', '456']);       

            expect(Array.from(result).length).to.equal(2);
            expect(Array.from(result.keys())).to.have.deep.members(['123', '234']);
            expect(Array.from(result.values())).to.have.deep.members([[123, '123'], [234, '234']]);
        }
        @test
        async testInvokeAllWithContainsAllFilter() {
            const filter = Filters.arrayContainsAll(Extractors.extract('iarr'), [2, 4])
            const processor = Processors.extract('id').andThen(Processors.extract('str'));

            const result = await cache.invokeAll(filter, processor);
            expect(Array.from(result).length).to.equal(1);
            expect(Array.from(result.keys())).to.have.deep.members(['234']);
            expect(Array.from(result.values())).to.have.deep.members([[234, '234']]);
        }
    }

    // ConditionalProcessor
    @suite(timeout(3000))
    class ConditionalProcessorTestsSuite
        extends ExtractorProcessorTestsSuiteBase {

        @test
        testTypeName() {
            const ep = Processors.extract('str')
                .when(Filters.arrayContainsAll(Extractors.extract('iarr'), [1, 2]));

            expect(ep['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'ConditionalProcessor');
        }
        @test
        async testInvokeWithKey() {
            const ep = Processors.extract('str')
                .when(Filters.arrayContainsAll(Extractors.extract('iarr'), [1, 2]));

            const value = await cache.invoke('123', ep);
            expect(value).to.equal('123');
        }
        @test
        async testInvokeAllWithMultipleKeys() {
            const ep = Processors.extract('str')
                .when(Filters.arrayContainsAny(Extractors.extract('iarr'), [2, 3]));

            const value = await cache.invokeAll(new Set(['234', '345', '456']), ep);
            expect(Array.from(value.keys())).to.have.deep.members(['234', '345']);
            expect(Array.from(value.values())).to.have.deep.members(['234', '345']);
        }
    }

    // ConditionalPutProcessor
    @suite(timeout(3000))
    class ConditionalPutProcessorTestsSuite
        extends ExtractorProcessorTestsSuiteBase {

        @test
        testTypeName() {
            const ep = Processors.conditionalPut(Filters.always(), 'someValue');
            expect(ep['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'ConditionalPut');
            expect(ep.doesReturnValue()).to.equal(true);
            expect(ep.getValue()).to.equal('someValue');
        }
        @test
        async testInvoke() {
            const f1 = Filters.arrayContainsAll(Extractors.extract('iarr'), [1, 2]);
            const ep = Processors.conditionalPut(f1, val234).returnCurrent();
            const value = await cache.invoke('123', ep);

            expect(await cache.get('123')).to.eql(val234);
            expect(await cache.get('234')).to.eql(val234);
            expect(await cache.get('345')).to.eql(val345);
            expect(await cache.get('456')).to.eql(val456);
        }
        @test
        async testInvokeAllWithFilter() {
            const f1 = Filters.arrayContainsAny(Extractors.extract('iarr'), [1, 2]);
            const ep = Processors.conditionalPut(Filters.always(), val234).returnCurrent();

            await cache.invokeAll(f1, ep);

            expect(await cache.get('123')).to.eql(val234);
            expect(await cache.get('234')).to.eql(val234);
            expect(await cache.get('345')).to.eql(val345);
            expect(await cache.get('456')).to.eql(val456);
        }
    }

    // ConditionalPutAllProcessor
    @suite(timeout(3000))
    class ConditionalPutAllProcessorTestsSuite
        extends ExtractorProcessorTestsSuiteBase {

        @test
        testTypeNameOf() {
            const ep = Processors.conditionalPutAll(Filters.always(), new Map());
            expect(ep['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'ConditionalPutAll');
        }
        @test
        async testInvokeAllWithJustProcessor() {
            const values = new Map();
            values.set('123', val234);
            values.set('345', val456);
            const ep = Processors.conditionalPutAll(Filters.always(), values);

            await cache.invokeAll(ep);

            expect(await cache.get('123')).to.eql(val234);
            expect(await cache.get('234')).to.eql(val234);
            expect(await cache.get('345')).to.eql(val456);
            expect(await cache.get('456')).to.eql(val456);
        }
        @test
        async testInvokeAllWithFilter() {
            const values = new Map();
            values.set('123', val234);
            values.set('345', val456);
            const ep = Processors.conditionalPutAll(Filters.arrayContainsAny(Extractors.extract('iarr'), [1, 2]), values);

            await cache.invokeAll(Filters.always(), ep);

            expect(await cache.get('123')).to.eql(val234);
            expect(await cache.get('234')).to.eql(val234);
            expect(await cache.get('345')).to.eql(val345);
            expect(await cache.get('456')).to.eql(val456);
        }
        @test
        async testInvokeAllWithKeys() {
            const values = new Map();
            values.set('123', val234);
            values.set('345', val456);
            const filter = Filters.arrayContainsAny(Extractors.extract('iarr'), [1, 2])
            const ep = Processors.conditionalPutAll(filter, values);

            await cache.invokeAll(['123', '234', '345', '456'], ep);

            expect(await cache.get('123')).to.eql(val234);
            expect(await cache.get('234')).to.eql(val234);
            expect(await cache.get('345')).to.eql(val345);
            expect(await cache.get('456')).to.eql(val456);
        }
        @test
        async testIfExistingEntriesCanBeUpdated() {
            const newVal1 = { id: 123456, str: '123456', ival: 123456, fval: 123.456, iarr: [1, 2, 3, 4, 5, 6] };
            const newVal2 = { id: 234567, str: '234567', ival: 234567, fval: 234.567, iarr: [2, 3, 4, 5, 6, 7] };

            const values = new Map();
            values.set('123', newVal1);
            values.set('234', newVal2);
            values.set('2-123', newVal1);
            values.set('2-234', newVal2);
            const ep = Processors.conditionalPutAll(Filters.present(), values);

            await cache.invokeAll(ep);

            expect(await cache.get('123')).to.eql(newVal1);
            expect(await cache.get('234')).to.eql(newVal2);
            expect(await cache.get('345')).to.eql(val345);
            expect(await cache.get('456')).to.eql(val456);
            expect(await cache.get('2-123')).to.equal(null);
            expect(await cache.get('2-234')).to.equal(null);
        }
        @test
        async testIfMissingEntriesCanBeInserted() {
            const newVal1 = { id: 123456, str: '123456', ival: 123456, fval: 123.456, iarr: [1, 2, 3, 4, 5, 6] };
            const newVal2 = { id: 234567, str: '234567', ival: 234567, fval: 234.567, iarr: [2, 3, 4, 5, 6, 7] };

            const values = new Map();
            values.set('123', newVal1);
            values.set('234', newVal2);
            values.set('123456', newVal1);
            values.set('234567', newVal2);

            const ep = Processors.conditionalPutAll(Filters.not(Filters.present()), values);
            const keys = ['123', '234', '345', '456', '123456', '234567'];
            await cache.invokeAll(keys, ep);

            await TestUtil.validate(cache, keys, [val123, val234, val345, val456, newVal1, newVal2]);
        }
    }

    // ConditionalRemoveProcessor
    @suite(timeout(3000))
    class ConditionalRemoveProcessorTestsSuite
        extends ExtractorProcessorTestsSuiteBase {

        @test
        testTypeNameOf() {
            const ep = Processors.conditionalRemove(Filters.always());
            expect(ep['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'ConditionalRemove');
        }
        @test
        async testRemovalOfOneExistingKey() {
            expect(await cache.size()).to.equal(4);
            expect(await cache.get('123')).to.eql(val123);

            const ep = Processors.conditionalRemove(Filters.present());
            const removedValue = await cache.invoke('123', ep);
            expect(removedValue).to.equal(null);

            expect(await cache.size()).to.equal(3);
            expect(await cache.get('123')).to.equal(null);
        }
        @test
        async testRemovalWithNeverFilter() {
            expect(await cache.size()).to.equal(4);
            expect(await cache.get('123')).to.eql(val123);

            const ep = Processors.conditionalRemove(Filters.never()).returnCurrent();
            const removedValue = await cache.invoke('123', ep);
            expect(removedValue).to.eql(val123);

            expect(await cache.size()).to.equal(4);
            expect(await cache.get('123')).to.eql(val123);
        }
    }

    // VersionedPutProcessor
    @suite(timeout(3000))
    class VersionedPutProcessorTestsSuite
        extends ExtractorProcessorTestsSuiteBase {

        @test
        testTypeNameOf() {
            const ep = Processors.versionedPut(versioned123);
            expect(ep['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'VersionedPut');
        }
        @test
        async testForExistingEntry() {
            const ep = Processors.versionedPut(versioned123);
            await versioned.invoke('123', ep);

            const expected = { '@version': 2, id: 123, str: '123', ival: 123, fval: 12.3, iarr: [1, 2, 3] };
            expect(await versioned.get('123')).to.eql(expected);
        }
        @test
        async testForNonExistentMatch() {
            const ep = Processors.versionedPut(versioned123);
            await versioned.invoke('456', ep);

            expect(await versioned.get('456')).to.eql(versioned456);
        }
        @test
        async testForMultipleUpdates() {
            const ep = Processors.versionedPut(versioned123);
            await versioned.invoke('456', ep);

            expect(await versioned.get('456')).to.eql(versioned456);
        }
    }

    // VersionedPutAllProcessor
    @suite(timeout(3000))
    class VersionedPutAllProcessorTestsSuite
        extends ExtractorProcessorTestsSuiteBase {

        @test
        testTypeNameOf() {
            const ep = Processors.versionedPutAll(new Map());
            expect(ep['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'VersionedPutAll');
            expect(ep.insert).to.equal(false);
            expect(ep['return']).to.equal(false);
        }
        @test
        async testForExistingEntry() {
            const entries = new Map();
            entries.set('123', versioned123);
            entries.set('456', versioned456);
            const ep = Processors.versionedPutAll(entries, true);

            const result = await versioned.invokeAll(['123', '456'], ep);

            const expected123 = { '@version': 2, id: 123, str: '123', ival: 123, fval: 12.3, iarr: [1, 2, 3] };
            const expected456 = { '@version': 5, id: 456, str: '456', ival: 456, fval: 45.6, iarr: [4, 5, 6], nullIfOdd: 'non-null' };

            TestUtil.validate(versioned, ['123', '234', '345', '456'],
                [expected123, versioned234, versioned345, expected456])
        }
    }

    // UpdaterProcessor
    @suite(timeout(3000))
    class UpdaterProcessorTestsSuite
        extends ExtractorProcessorTestsSuiteBase {

        @test
        testTypeNameOf() {
            const ep = Processors.update('a.b.ival', 12300);
            expect(ep['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'UpdaterProcessor');
        }
        @test
        async testUpdateForAgainstSingleKey() {
            const ep1 = Processors.update('str', "123000")
                .andThen(Processors.update('ival', 123000));

            await cache.invoke('123', ep1);

            const processor = Processors.extract('ival').andThen(Processors.extract('str'));
            const value = await cache.invoke('123', processor);
            expect(value.length).to.equal(2)
            expect(value).to.have.deep.members([123000, "123000"]);
        }
        @test
        async testUpdateForAgainstMultipleKeys() {
            const ep1 = Processors.update('str', "123000")
                .andThen(Processors.update('ival', 123000));

            const keys = ['123', '234', '345'];
            await cache.invokeAll(keys, ep1);

            const processor = Processors.extract('ival').andThen(Processors.extract('str'));
            const value = await cache.invokeAll(keys, processor);

            expect(Array.from(value.keys())).to.have.deep.members(keys);
            const val = [123000, '123000'];
            expect(Array.from(value.values())).to.have.deep.members([val, val, val]);
        }
        @test
        async testUpdateWithFilter() {
            const ep1 = Processors.update('str', "123000")
                .andThen(Processors.update('ival', 123000));

            const keys = ['123', '234', '345', '456'];
            await cache.invokeAll(Filters.arrayContainsAll(Extractors.extract('iarr'), [3, 4]), ep1);

            const processor = Processors.extract('ival').andThen(Processors.extract('str'));
            const value = await cache.invokeAll(keys, processor);

            expect(Array.from(value.keys())).to.have.deep.members(keys);
            const expectedValues = [[123, '123'], [123000, '123000'], [123000, '123000'], [456, '456']];
            expect(Array.from(value.values())).to.have.deep.members(expectedValues);
        }
    }

    // UpdaterProcessor
    @suite(timeout(3000))
    class MethodInvocationProcessorTestsSuite
        extends ExtractorProcessorTestsSuiteBase {

        @test
        testTypeNameOf() {
            const ep = Processors.invokeAccessor('ival');
            expect(ep['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'MethodInvocationProcessor');
        }
        @test
        async testAgainstSingleKey() {
            const ep = Processors.invokeAccessor('get', 'ival');

            const value = await cache.invoke('123', ep);
            expect(value).to.equal(123)
        }
        @test
        async testMutatorAgainstSingleKey() {
            const ep = Processors.invokeMutator('remove', 'ival')
                .andThen(Processors.invokeMutator('remove', 'iarr'));

            const status = await cache.invoke('123', ep);
            const value = await cache.get('123');

            //Check removed values
            expect(status).to.have.deep.members([123, [1, 2, 3]]);

            // Ensure that remaining attributes are still intact.
            expect(value).to.eql({ "id": 123, "str": "123", "fval": 12.3, group: 1 })
        }
    }

    // NumberMultiplier
    @suite(timeout(3000))
    class NumberMultiplierTestsSuite
        extends ExtractorProcessorTestsSuiteBase {

        @test
        testTypeNameOf() {
            const ep: any = Processors.multiply('ival', 2);

            expect(ep['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'NumberMultiplier');
            expect(ep['manipulator']['@class']).to.equal(Util.EXTRACTOR_PACKAGE + 'CompositeUpdater');
            expect(ep['manipulator']['extractor']['@class']).to.equal(Util.EXTRACTOR_PACKAGE + 'UniversalExtractor');
            expect(ep['manipulator']['updater']['@class']).to.equal(Util.EXTRACTOR_PACKAGE + 'UniversalUpdater');
        }
        @test
        async testAgainstSingleKey() {
            expect(await cache.get('123')).to.eql(val123);
            const value1 = await cache.invoke('123', Processors.multiply('ival', 2).returnNewValue());
            expect(value1).to.equal(246);
            let current = await cache.get('123');
            expect(current['ival']).to.equal(246);
            const value2 = await cache.invoke('123', Processors.multiply('ival', 0.5).returnNewValue());
            expect(value2).to.equal(123);
            current = await cache.get('123');
            expect(current['ival']).to.equal(123);
        }
    }

    // NumberIncrementor
    @suite(timeout(3000))
    class NumberIncrementorTestsSuite
        extends ExtractorProcessorTestsSuiteBase {

        @test
        testTypeNameOf() {
            const ep: any = Processors.increment('ival', 2);

            expect(ep['@class']).to.equal(Util.PROCESSOR_PACKAGE + 'NumberIncrementor');
            expect(ep['manipulator']['@class']).to.equal(Util.EXTRACTOR_PACKAGE + 'CompositeUpdater');
            expect(ep['manipulator']['extractor']['@class']).to.equal(Util.EXTRACTOR_PACKAGE + 'UniversalExtractor');
            expect(ep['manipulator']['updater']['@class']).to.equal(Util.EXTRACTOR_PACKAGE + 'UniversalUpdater');
        }
        @test
        async testAgainstSingleKey() {
            expect(await cache.get('123')).to.eql(val123);
            const value1 = await cache.invoke('123', Processors.increment('ival', 2).returnNewValue());
            expect(value1).to.equal(125);
            let current = await cache.get('123');
            expect(current['ival']).to.equal(125);
            const value2 = await cache.invoke('123', Processors.increment('ival', -25).returnNewValue());
            expect(value2).to.equal(100);
            current = await cache.get('123');
            expect(current['ival']).to.equal(100);
        }
    }
});