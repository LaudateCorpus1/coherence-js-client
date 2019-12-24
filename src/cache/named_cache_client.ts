// @ts-check
/*
* Copyright (c) 2019 Oracle and/or its affiliates. All rights reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

import * as grpc from 'grpc';

import { NamedCacheServiceClient, NamedCacheServiceService } from './proto/services_grpc_pb';
import {
    EntryResult,
    IsEmptyRequest,
    SizeRequest,
    Entry
} from './proto/messages_pb';

import { RequestFactory, Comparator } from './request_factory';
import { IMap } from './i_map';
import { BytesValue, BoolValue } from 'google-protobuf/google/protobuf/wrappers_pb';
import { KeySet, EntrySet, NamedCacheEntry, IRemoteSet, ValueSet } from './streamed_collection';
import { resolvePtr } from 'dns';
import { Filter } from '../filter/filter';
import { ValueExtractor } from '../extractor/value_extractor';
import { Serializer } from '../util/serializer';

/**
 * Class NamedCacheClient is a client to a NamedCache which is a Map that
 * holds resources shared among members of a cluster.
 *
 * All methods in this class return a Promise that eventually either
 * resolves to a value (as described in the NamedCache) or an error
 * if any exception occurs during the method invocation.
 */
export class NamedCacheClient<K, V>
    implements IMap<K, V> {

    /**
     * The name of the coherence NamedCache.
     */
    cacheName: string;

    /**
     * The gRPC service client.
     */
    client: NamedCacheServiceClient;

    /**
     * The optional NamedCacheOptions to use.
     */
    options?: NamedCacheOptions;

    /**
     * Request feactory. Used for internal purpose only.
     */
    reqFactory: RequestFactory<K, V>;

    /**
     * Create a new NamedCacheClient with the specified address and cache name.
     * The optional NamedCacheOptions can be used to specify additional 
     * properties.
     * 
     * @param address The gRPC server address to connect to.
     * @param cacheName The name of the coherence NamedCache.
     * @param options The optional NamedCacheOptions can be used to specify 
     *                additional properties.
     */
    constructor(cacheName: string, address?: string, options?: NamedCacheOptions) {
        this.cacheName = cacheName;
        this.options = options;
        this.client = new NamedCacheServiceClient(address || 'localhost:1408',
            grpc.credentials.createInsecure());
        this.reqFactory = new RequestFactory(this.cacheName);
    }

    /**
     * Internal method to return RequestFactory.
     * 
     * @return An instance of RequestFactory.
     */
    getRequestFactory(): RequestFactory<K, V> {
        return this.reqFactory;
    }

    getNamedCacheServiceClient(): NamedCacheServiceClient {
        return this.client;
    }

    addIndex(extractor: ValueExtractor<any, any>, ordered?: boolean, comparator?: Comparator): Promise<void> {
        const self = this;
        const request = this.reqFactory.addIndex(extractor, ordered, comparator);
        return new Promise((resolve, reject) => {
            self.client.addIndex(request, (err: grpc.ServiceError | null) => {
                self.resolveValue(resolve, reject, err);
            });
        });
    }

    /**
     * Clears all the mappings in the cache.
     *
     * @return A Promise that eventually resolves (with an undefined value).
     */

    clear(): Promise<void> {
        const self = this;
        return new Promise((resolve, reject) => {
            self.client.clear(self.reqFactory.clear(), (err: grpc.ServiceError | null) => {
                self.resolveValue(resolve, reject, err);
            });
        });
    }

    private resolveValue<T>(resolve: (value?: T | PromiseLike<T>) => void,
        reject: (reason?: any) => void,
        err?: grpc.ServiceError | null,
        fn?: () => T | undefined) {

        if (err) {
            reject(err);
        } else {
            if (fn) {
                resolve(fn());
            } else {
                resolve();
            }
        }
    }

    /**
     * Returns true if this cache contains a mapping for the specified key.
     *
     * @param key The key whose presence in this cache is to be tested.
     * @param key The value expected to be associated with the specified key.
     *
     * @return A Promise that eventually resolves to true if the mapping
     *         exists or false otherwise.
     */
    containsEntry(key: K, value: V): Promise<boolean> {
        const self = this;
        return new Promise((resolve, reject) => {
            const request = self.reqFactory.containsEntry(key, value);
            self.client.containsEntry(request, (err, resp) => {
                self.resolveValue(resolve, reject, err, () => resp ? resp.getValue() : resp);
            });
        });
    }

    /**
     * Returns true if the specified key is mapped to some value in the cache.
     *
     * @param key The key whose presence in this cache is to be tested.
     *
     * @return A Promise that eventually resolves to true if the key is mapped
     *         to some value or false otherwise.
     */
    containsKey(key: K): Promise<boolean> {
        const self = this;
        const request = self.reqFactory.containsKey(key);
        return new Promise((resolve, reject) => {
            self.client.containsKey(request, (err, resp) => {
                self.resolveValue(resolve, reject, err, () => resp ? resp.getValue() : resp);
            });
        });
    }

    /**
     * Returns true if the specified value is mapped to some key.
     *
     * @param value The value expected to be associated with some key.
     *
     * @return A Promise that eventually resolves to true if a mapping
     *         exists or false otherwise.
     */
    containsValue(value: V): Promise<boolean> {
        const self = this;
        const request = this.reqFactory.containsValue(value);
        return new Promise((resolve, reject) => {
            self.client.containsValue(request, (err, resp) => {
                self.resolveValue(resolve, reject, err, () => resp ? resp.getValue() : resp);
            });
        });
    }


    /**
     * Returns a Set view of the keys contained in this map.
     *
     * @return a set view of the keys contained in this map
     */
    entrySet(): Promise<IRemoteSet<NamedCacheEntry<K, V>>>;
    entrySet(filter: Filter<any>): Set<Promise<NamedCacheEntry<K, V>>>;
    entrySet(arg?: any): any {
        const self = this;
        if (!arg) {
            return new Promise((resolve, reject) => resolve(new EntrySet(this)));
        }

        const set = new Set<Promise<NamedCacheEntry<K, V>>>();
        const request = this.reqFactory.entrySet(arg);
        const call = self.client.entrySet(request);

        return new Promise((resolve, reject) => {
            call.on('data', function (e: Entry) {
                const entry = new NamedCacheEntry<K, V>(e.getKey_asU8(), e.getValue_asU8());
                set.add(new Promise((resolve, reject) => resolve(entry)));
            });
            call.on('end', () => resolve(set) );
            call.on('error', (e) => {
                console.log("*** ERROR: " + e)
                reject(e)
            });
        });
    }


    /**
     * Returns the value to which this cache maps the specified key.
     *
     * @param key The key whose associated value is to be returned.
     *
     * @return A Promise that will eventually resolve to the value that
     *         is associated with the specified key.
     */
    get(key: K): Promise<V | null> {
        return this.getOrDefault(key, null);    
    }

    /**
     * Returns the value to which the specified key is mapped, or
     * the specified defaultValue if this map contains no mapping for the key.
     */
    async getOrDefault(key: K, defaultValue: V | null): Promise<V | null> {
        const self = this;
        return new Promise((resolve, reject) => {
            self.client.get(self.reqFactory.get(key), (err, resp) => {
                if (resp && resp.getPresent()) {
                    self.resolveValue(resolve, reject, err, () => resp ? NamedCacheClient.toValue(resp.getValue_asU8()) : resp);
                } else {
                    resolve(defaultValue);
                }
            });
        });
    }

    /**
     * Checks if this cache is empty or not.
     *
     * @return A Promise that eventually resolves to true if the cache is empty;
     *         false otherwise.
     */
    isEmpty(): Promise<boolean> {
        const self = this;
        return new Promise((resolve, reject) => {
            const request = new IsEmptyRequest();
            request.setCache(this.cacheName);
            self.client.isEmpty(request, (err, resp) => {
                self.resolveValue(resolve, reject, err, () => resp ? resp.getValue() : resp);
            });
        });
    }

    /**
     * Returns a Set view of the keys contained in this map.
     *
     * @return a set view of the keys contained in this map
     */
    keySet(): Promise<IRemoteSet<K>>;
    keySet(filter: Filter<any>): Set<Promise<K>>;
    keySet(arg?: any): any {
        const self = this;
        if (!arg) {
            return new Promise((resolve, reject) => resolve(new KeySet(this)));
        }

        const set = new Set<Promise<K>>();
        const request = this.reqFactory.keySet(arg);
        const call = self.client.keySet(request);

        return new Promise((resolve, reject) => {
            call.on('data', function (r: BytesValue) {
                const k = Serializer.deserialize(r.getValue_asU8());
                if (k) {
                    set.add(new Promise((resolve, reject) => resolve(k)));
                }
            });
            call.on('end', () => resolve(set) );
            call.on('error', (e) => {
                console.log("*** ERROR: " + e)
                reject(e)
            });
        });
    }

    /**
     * Associates the specified value with the specified key in this map. If the
     * map previously contained a mapping for this key, the old value is replaced.
     *
     * @param key The key with which the specified value is to be associated.
     * @param value The value to be associated with the specified key.
     * @param ttl The expiry time in millis.
     *
     * @return A Promise that will eventually resolve to the previous value that
     *         was associated with the specified key.
     */
    put(key: K, value: V, ttl?: number): Promise<V> {
        const self = this;
        return new Promise((resolve, reject) => {
            self.client.put(self.reqFactory.put(key, value, ttl), (err, resp) => {
                self.resolveValue(resolve, reject, err, () => resp ? NamedCacheClient.toValue(resp.getValue_asU8()) : resp);
            });
        });
    }

    /**
     * Associates the specified value with the specified key in this map only if the
     * cache doe not contain any mapping for the specified key.
     *
     * @param key the key with which the specified value is to be associated
     * @param value the value to be associated with the specified key
     * @param ttl  the expiry time in millis
     *
     * @return a Promise that will eventually resolve to the previous value that
     * was associated with the specified key.
     */
    putIfAbsent(key: K, value: V, ttl?: number): Promise<V> {
        const self = this;
        const request = self.reqFactory.putIfAbsent(key, value, ttl);
        return new Promise((resolve, reject) => {
            self.client.putIfAbsent(request, (err, resp) => {
                self.resolveValue(resolve, reject, err, () => resp ? NamedCacheClient.toValue(resp.getValue_asU8()) : resp);
            });
        });
    }

    /**
     * Remove the value to which this cache maps the specified key.
     *
     * @param key the key whose associated value is to be removed
     *
     * @return a Promise that will eventually resolve to the value that
     * is associated with the specified key.
     */
    remove(key: K): Promise<V> {
        const self = this;
        return new Promise((resolve, reject) => {
            self.client.remove(this.reqFactory.remove(key), (err, resp) => {
                self.resolveValue(resolve, reject, err, () => resp ? NamedCacheClient.toValue(resp.getValue_asU8()) : resp);
            });
        });
    }


    /**
     * Remove the mapping only if the cache contains the specified mapping.
     *
     * @param key the key whose associated value is to be removed
     * @param value the value that must be associated with the specified key
     *
     * @return a Promise that will eventually resolve to true if the specifiedf
     *         mapping exists in the cache; false otherwise
     */
    removeMapping(key: K, value: V): Promise<boolean> {
        const self = this;
        const request = this.reqFactory.removeMapping(key, value);
        return new Promise((resolve, reject) => {
            self.client.removeMapping(request, (err, resp) => {
                self.resolveValue(resolve, reject, err, () => resp ? resp.getValue() : resp);
            });
        });
    }


    /**
     * Replace the entry for the specified key only if it is currently
     * mapped to some value.
     *
     * @param key the key whose associated value is to be removed
     * @param value the value to be replaced.
     * 
     * @return a Promise that will eventually resolve to the value that
     * is associated with the specified key.
     */
    replace(key: K, value: V): Promise<V> {
        const self = this;
        const request = this.reqFactory.replace(key, value);
        return new Promise((resolve, reject) => {
            self.client.replace(request, (err, resp) => {
                self.resolveValue(resolve, reject, err, () => resp ? NamedCacheClient.toValue(resp.getValue_asU8()) : resp);
            });
        });
    }

    /**
     * Replace the mapping for the specified key with the newValue but only if 
     * currently mapped to the specified value.
     *
     * @param key the key whose associated value is to be removed
     * @param value the current value that must be associated with the specified key
     * @param newValue the new value that to be associated with the specified key
     *
     * @return a Promise that will eventually resolve to true if the specifiedf
     *         mapping exists in the cache; false otherwise
     */
    replaceMapping(key: K, value: V, newValue: V): Promise<Boolean> {
        const self = this;
        const request = this.reqFactory.replaceMapping(key, value, newValue);

        return new Promise((resolve, reject) => {
            self.client.replaceMapping(request, (err, resp) => {
                self.resolveValue(resolve, reject, err, () => resp ? resp.getValue() : resp);
            });
        });
    }
    /**
     * Returns a Set view of the values contained in this cache.
     *
     * @return a set view of the values contained in this cache
     */
    values(): Promise<IRemoteSet<V>>;
    values(filter: Filter<any>): Set<Promise<V>>;
    values(arg?: any): any {
        const self = this;
        if (!arg) {
            return new Promise((resolve, reject) => resolve(new ValueSet(this)));
        }

        const set = new Set<Promise<V>>();
        const request = this.reqFactory.values(arg);
        const call = self.client.values(request);

        return new Promise((resolve, reject) => {
            call.on('data', function (b: BytesValue) {
                set.add(new Promise((resolve, reject) => resolve(Serializer.deserialize(b.getValue_asU8()))));
            });
            call.on('end', () => resolve(set) );
            call.on('error', (e) => {
                console.log("*** ERROR: " + e)
                reject(e)
            });
        });
    }

    nextEntrySetPage(cookie: Uint8Array | string | undefined): grpc.ClientReadableStream<EntryResult> {
        return this.client.nextEntrySetPage(this.reqFactory.pageRequest(cookie));
    }

    nextKeySetPage(cookie: Uint8Array | string | undefined): grpc.ClientReadableStream<BytesValue> {
        return this.client.nextKeySetPage(this.reqFactory.pageRequest(cookie));
    }


    /**
     * Returns the number of key-value mappings in this NAmedCache.
     *
     * @return A Promise that will eventually resolve to the number of key-value
     *         mappings in this cache.
     */
    size(): Promise<number> {
        return new Promise((resolve, reject) => {

            const request = new SizeRequest();
            request.setCache(this.cacheName);
            this.client.size(request, (err, resp) => {
                if (err || !resp) {
                    reject(err);
                } else {
                    resolve(resp.getValue());
                }
            });
        });
    }

    static toValue<V>(value: Uint8Array): V {
        return (value && value.length > 0)
            ? Serializer.deserialize(value)
            : null;
    }

}

/**
 * NamedCacheOptions contains the options that can be specified during
 * NamedCacheClient creation.
 */
export interface NamedCacheOptions {
    /**
     * The channel that must be used. This allows sharing gRPC Channels
     * among multiple NamedCacheClients.
     */
    channel?: grpc.Channel;

}