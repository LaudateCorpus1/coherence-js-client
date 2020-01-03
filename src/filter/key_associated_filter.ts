import { Filter } from "./filter";

/**
 * Filter which limits the scope of another filter according to the key
 * association information.
 *
 * @remarks
 * *Note 1:* This filter must be the outermost filter and cannot be used
 * as a part of any composite filter (AndFilter, OrFilter, etc.)
 * *Note 2:* This filter is intended to be processed only on the client
 * side of the partitioned cache service.
 * 
 * Example:
 * ```ts
 * var filter = Filter.less('age', 40).associatedWith(10);
 * map.values(filter).then(values => {
 *   for (const entry of values) {
 *     console.log(JSON.stringify(entry, null, 4));
 *   }
 * });
 * ```
 */
export class KeyAssociatedFilter<T>
    extends Filter<T>  {

    filter: Filter<T>;

    hostKey: any;

    /**
     * Filter which limits the scope of another filter according to the key
     * association information.
     * 
     * @param {Filter} filter the other filter whose scope to limit
     *
     * @param {Object} hostKey the `filter` argument will only be applied to
     * cache service nodes that contain this key.
     */
    constructor(filter: Filter, hostKey: any) {
        super('KeyAssociatedFilter');
        this.filter = filter;
        this.hostKey = hostKey;
    }

}